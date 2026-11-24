// SIM-01 — 시도 상태 머신·8단계 틱 (SIM-CONTRACT 12절). 순수 코어: 벽시계·난수 없음, 안전 정수만 상태에 둔다.
// 설치·강화·판매·타깃 설정(ECON-01, 13절)과 발사·투사체·둔화(SIM-02, 14절)는 코어가 직접 처리한다. 남은 훅은 TEST_ONLY `fire` 하나.
import { isInsideGrid } from "../grid";
import { compileStageMap, isBuildable, progressToPosition, type CompiledStageMap, type PointMt } from "../map/stageMap";
import { expandWave, type ExpandedSpawn } from "../content/expandWave";
import type { ContentError, EnemyDef, StageContent, TowerDef, TowerType, TraitDef } from "../content/types";
import { validateStageForEntry } from "../content/validate";
import { towerLevelStats } from "../content/levelStats";
import { cloneCanonical, sortByNumber, sortCodeUnit } from "../sim/canonical";
import { drainCommands, submitCommand, type Command, type SubmitResult, type TargetingMode } from "../sim/commands";
import { SimStateError } from "../sim/errors";
import { EVENT_TYPE, REJECT_REASON, type EventType, type RejectReason } from "../sim/events";
import { baseSpeedPerTick, boostedMaxHp, boostedSpeedPerTick, effectiveSlowBp, refundFor, slowedSpeedPerTick } from "../sim/formulas";
import { createIdCounters, takeId, type IdCounters } from "../sim/ids";
import { addSafe, assertSafeInteger, isqrt, mulSafe, roundDiv } from "../sim/intmath";
import { durationMsToTicks } from "../sim/time";
import { pickTarget, type TargetCandidate } from "./combat";
import type {
  AttemptEvent,
  AttemptHooks,
  AttemptOutcome,
  AttemptPhase,
  EnemyView,
  LedgerEntry,
  SlowView,
} from "./types";

export const ATTEMPT_CODE_VERSION = "attempt-v3";

/** 생성 경로를 createAttempt 하나로 강제하는 모듈 비공개 토큰. */
const CREATE_TOKEN: unique symbol = Symbol("AttemptCore.create");

/** 진입 재검증(11.4)이 실패해 시도를 만들 수 없다. */
export class AttemptCreateError extends Error {
  readonly errors: readonly ContentError[];
  constructor(errors: readonly ContentError[]) {
    super(`시도를 만들 수 없음: ${errors.map((e) => `${e.path}: ${e.message}`).join("; ")}`);
    this.name = "AttemptCreateError";
    this.errors = errors;
  }
}

interface EnemyState {
  id: number;
  enemyType: EnemyView["enemyType"];
  trait: EnemyView["trait"];
  hp: number;
  maxHp: number;
  speedPerTick: number;
  pathProgress: number;
  baseDamage: number;
  killReward: number;
  /** 활성 둔화, sourceTowerId 오름차순(14.2). */
  slows: SlowView[];
}

interface ProjectileState {
  projectileId: number;
  towerId: number;
  kind: "single" | "aoe";
  targetEnemyId: number | null;
  pos: PointMt;
  impact: PointMt | null;
  speedPerTick: number;
  damage: number;
  expireTick: number;
  aoeRadiusMt: number | null;
  slowBp: number | null;
  slowDurationTicks: number | null;
}

interface TowerState {
  towerId: number;
  type: TowerType;
  cell: { col: number; row: number };
  level: number;
  targetingMode: TargetingMode;
  /** 설치 비용 + 성공한 강화 가격의 합(환급 기준, SPEC 8절). */
  actuallyPaid: number;
  /** T >= nextFireTick 이면 발사 가능. 설치 틱으로 시작, 강화는 바꾸지 않는다(14.2). */
  nextFireTick: number;
}

const NO_OCCUPIED: ReadonlySet<number> = new Set();
const MAX_LEVEL = 4;

interface State {
  attemptId: number;
  stageId: string;
  tick: number;
  phase: AttemptPhase;
  paused: boolean;
  outcome: AttemptOutcome | null;
  waveIndex: number;
  prepTicksRemaining: number;
  waveStartTick: number | null;
  /** 이번 웨이브 전개 일정 중 이미 생성한 항목 수. 일정 자체(plan)는 콘텐츠·waveStartTick 에서 결정되므로 스냅샷에 넣지 않는다. */
  waveSpawnCursor: number;
  plan: ExpandedSpawn[];
  gold: number;
  baseHp: number;
  counters: IdCounters;
  enemies: EnemyState[];
  towers: TowerState[];
  projectiles: ProjectileState[];
  queue: Command[];
  consumed: string[];
  ledger: LedgerEntry[];
}

interface Work {
  readonly w: State;
  readonly T: number;
  readonly out: AttemptEvent[];
}

/** 훅 호출 하나 동안만 유효한 쓰기 권한. 호출이 끝나면(정상·예외 모두) 폐기된다. */
interface Lease {
  active: boolean;
}

function guard<A extends unknown[], R>(lease: Lease, name: string, fn: (...args: A) => R): (...args: A) => R {
  return (...args: A): R => {
    if (!lease.active) throw new SimStateError(`${name}: 훅 호출이 끝난 뒤(또는 다른 단계·틱·결과 이후)에는 쓸 수 없음`);
    return fn(...args);
  };
}

/** 훅은 동기 함수다. Promise(thenable)를 반환하면 프로토콜 오류(미처리 거부는 삼킨다). */
function assertSync(name: string, result: unknown): void {
  if ((typeof result === "object" || typeof result === "function") && result !== null && typeof (result as { then?: unknown }).then === "function") {
    try {
      (result as PromiseLike<unknown>).then(undefined, () => undefined);
    } catch {
      /* 무시: 어차피 오류로 끝난다 */
    }
    throw new SimStateError(`${name}: 훅은 동기 함수여야 함(Promise 반환 금지)`);
  }
}

/** lease 를 만들어 fn 을 실행하고 finally 에서 폐기한다. */
function withLease<R>(fn: (lease: Lease) => R): R {
  const lease: Lease = { active: true };
  try {
    return fn(lease);
  } finally {
    lease.active = false;
  }
}

function view(e: EnemyState): EnemyView {
  return Object.freeze({ ...e, slows: Object.freeze(e.slows.map((x) => Object.freeze({ ...x }))) });
}

const dist2 = (a: PointMt, b: PointMt): number => addSafe(mulSafe(a.x - b.x, a.x - b.x), mulSafe(a.y - b.y, a.y - b.y));

export class AttemptCore {
  private s: State;
  private stepping = false;
  private readonly stage: StageContent;
  private readonly map: CompiledStageMap;
  private readonly pathLengthMt: number;
  private readonly hooks: AttemptHooks;
  readonly contentHash: string;

  /** 외부에서 직접 만들 수 없다(검증·복사·동결 경계 우회 방지). `createAttempt` 를 쓴다. */
  constructor(token: symbol, stage: StageContent, contentHash: string, attemptId: number, hooks: AttemptHooks = {}) {
    if (token !== CREATE_TOKEN) throw new SimStateError("AttemptCore 는 createAttempt 로만 만들 수 있음");
    assertSafeInteger(attemptId, "attemptId");
    if (attemptId < 1) throw new RangeError(`attemptId: 1 이상이어야 함 (${attemptId})`);
    this.stage = stage;
    this.contentHash = contentHash;
    this.hooks = hooks;
    this.map = compileStageMap(stage.stage.map);
    this.pathLengthMt = this.map.pathLengthMt;
    this.s = {
      attemptId,
      stageId: stage.stage.stageId,
      tick: 0,
      phase: "preparation",
      paused: false,
      outcome: null,
      waveIndex: 1,
      prepTicksRemaining: this.prepTicksOf(1),
      waveStartTick: null,
      waveSpawnCursor: 0,
      plan: [],
      gold: stage.stage.initialGold,
      baseHp: stage.stage.baseHp,
      counters: createIdCounters(),
      enemies: [],
      towers: [],
      projectiles: [],
      queue: [],
      consumed: [],
      ledger: [],
    };
  }

  get completedTick(): number {
    return this.s.tick;
  }
  get phase(): AttemptPhase {
    return this.s.phase;
  }
  get paused(): boolean {
    return this.s.paused;
  }
  get attemptId(): number {
    return this.s.attemptId;
  }
  get stageContent(): StageContent {
    return this.stage;
  }
  isResult(): boolean {
    return this.s.phase === "victory" || this.s.phase === "defeat";
  }
  /** 경제 원장(추가 전용). 상태 해시에는 들어가지 않고 각 틱 이벤트로 비교한다. */
  ledger(): readonly LedgerEntry[] {
    return this.s.ledger.map((e) => ({ ...e }));
  }

  /** 일시정지는 틱 밖 조작이다. 결과 단계에서는 오류. */
  pause(): void {
    if (this.stepping) throw new SimStateError("step() 실행 중에는 pause() 불가");
    if (this.isResult()) throw new SimStateError("결과 단계에서는 pause() 불가");
    this.s.paused = true;
  }
  resume(): void {
    if (this.stepping) throw new SimStateError("step() 실행 중에는 resume() 불가");
    this.s.paused = false;
  }

  submit(kind: unknown, payload: unknown): SubmitResult {
    return submitCommand(this.s.queue, this.s.counters, kind, payload, {
      completedTick: this.s.tick,
      phase: this.isResult() ? "result" : this.s.phase,
      paused: this.s.paused,
      stepping: this.stepping,
    });
  }

  /** 스냅샷 `tick`(=completedTick) 시점의 정규 검증을 거친 상태 사본(7.1절). */
  snapshot(): Record<string, unknown> {
    const s = this.s;
    return cloneCanonical(
      {
        attemptId: s.attemptId,
        baseHp: s.baseHp,
        consumedEconomyEvents: sortCodeUnit(s.consumed),
        counters: { ...s.counters },
        enemies: sortByNumber(s.enemies, (e) => e.id).map((e) => ({ ...e, slows: sortByNumber(e.slows, (x) => x.sourceTowerId).map((x) => ({ ...x })) })),
        gold: s.gold,
        outcome: s.outcome,
        paused: s.paused,
        phase: s.phase,
        prepTicksRemaining: s.prepTicksRemaining,
        projectiles: sortByNumber(s.projectiles, (p) => p.projectileId).map((p) => ({
          ...p,
          impact: p.impact === null ? null : { x: p.impact.x, y: p.impact.y },
          pos: { x: p.pos.x, y: p.pos.y },
        })),
        queue: sortByNumber(s.queue, (c) => c.seq).map((c) => ({
          applyTick: c.applyTick,
          kind: c.kind,
          payload: c.payload,
          seq: c.seq,
        })),
        stageId: s.stageId,
        tick: s.tick,
        towers: sortByNumber(s.towers, (t) => t.towerId).map((t) => ({
          actuallyPaid: t.actuallyPaid,
          cell: { col: t.cell.col, row: t.cell.row },
          level: t.level,
          nextFireTick: t.nextFireTick,
          targetingMode: t.targetingMode,
          towerId: t.towerId,
          type: t.type,
        })),
        waveIndex: s.waveIndex,
        waveSpawnCursor: s.waveSpawnCursor,
        waveStartTick: s.waveStartTick,
      },
      "state",
    );
  }

  /** 틱 T = completedTick + 1 을 실행하고 그 틱의 이벤트를 돌려준다. 오류(훅 포함) 시 상태는 변하지 않는다. */
  step(): AttemptEvent[] {
    if (this.stepping) throw new SimStateError("step()은 재진입할 수 없음");
    if (this.isResult()) throw new SimStateError("결과 단계에서는 step() 불가");
    if (this.s.paused) throw new SimStateError("일시정지 중에는 step() 불가");
    this.stepping = true;
    try {
      const w = structuredClone(this.s);
      const T = addSafe(w.tick, 1);
      const work: Work = { w, T, out: [] };

      this.stage1Commands(work);
      this.stage2Slows(work);
      this.stage3Spawn(work);
      this.stage4Combat(work);
      this.stage5Deaths(work);
      this.stage6Move(work);
      const pending = this.stage7Result(work);
      this.stage8Cleanup(work, pending);

      w.tick = T;
      const events = cloneCanonical(work.out, "events");
      this.s = w;
      return events;
    } finally {
      this.stepping = false;
    }
  }

  // ───────── 단계 ─────────

  /** 1단계: (준비 타이머 만료 → 전투 시작 기록) 후 명령을 seq 순으로 순차 재검증·적용(4절). */
  private stage1Commands(k: Work): void {
    const { w, T } = k;
    if (w.phase === "preparation" && w.prepTicksRemaining === 0) {
      this.beginWave(k, "timer", null);
    }
    for (const c of drainCommands(w.queue, T)) this.applyCommand(k, c);
  }

  private applyCommand(k: Work, c: Command): void {
    const { w } = k;
    const reject = (reason: RejectReason): void => {
      this.emit(k, EVENT_TYPE.commandRejected, { kind: c.kind, reason, seq: c.seq });
    };
    if (c.kind === "startWave") {
      if (w.phase !== "preparation") return reject(REJECT_REASON.wrongPhase);
      this.beginWave(k, "command", c.seq);
      return;
    }
    // build·upgrade·sell·setTargeting: ECON-01(13절). 모든 검사는 변경 전에 끝내므로 거부된 명령은 상태를 바꾸지 않는다.
    switch (c.kind) {
      case "build":
        return this.applyBuild(k, c, reject);
      case "upgrade":
        return this.applyUpgrade(k, c, reject);
      case "sell":
        return this.applySell(k, c, reject);
      case "setTargeting":
        return this.applySetTargeting(k, c, reject);
    }
  }

  private towerDef(type: TowerType): TowerDef {
    const def = this.stage.global.towers.find((t) => t.type === type);
    if (def === undefined) throw new SimStateError(`콘텐츠에 없는 타워 종류 (${type})`);
    return def;
  }

  /** 검사 순서(13.2): 격자 밖 → 설치 불가 칸 → 타워 있음 → 골드 부족. 골드는 앞 명령까지 반영된 현재 값. */
  private applyBuild(k: Work, c: Extract<Command, { kind: "build" }>, reject: (r: RejectReason) => void): void {
    const { w } = k;
    const { towerType, tile } = c.payload;
    if (!isInsideGrid(tile)) return reject(REJECT_REASON.outOfGrid);
    if (!isBuildable(this.map, tile, NO_OCCUPIED)) return reject(REJECT_REASON.notBuildable);
    if (w.towers.some((t) => t.cell.col === tile.col && t.cell.row === tile.row)) return reject(REJECT_REASON.occupied);
    const cost = this.towerDef(towerType).buildCost;
    if (w.gold < cost) return reject(REJECT_REASON.insufficientGold);
    const towerId = takeId(w.counters, "tower");
    w.towers.push({ towerId, type: towerType, cell: { col: tile.col, row: tile.row }, level: 1, targetingMode: "first", actuallyPaid: cost, nextFireTick: k.T });
    this.emit(k, EVENT_TYPE.towerBuilt, { cell: { col: tile.col, row: tile.row }, cost, towerId, towerType });
    this.mustSettle(k, `build:c${c.seq}`, -cost, { seq: c.seq, towerId });
  }

  /** 검사 순서: 타워 없음 → 이미 Lv4 → 골드 부족. 가격은 `upgradeCosts[현재 레벨 − 1]`(Lv1→2 는 [0]). */
  private applyUpgrade(k: Work, c: Extract<Command, { kind: "upgrade" }>, reject: (r: RejectReason) => void): void {
    const tower = k.w.towers.find((t) => t.towerId === c.payload.towerId);
    if (tower === undefined) return reject(REJECT_REASON.towerNotFound);
    if (tower.level >= MAX_LEVEL) return reject(REJECT_REASON.maxLevel);
    const cost = this.towerDef(tower.type).upgradeCosts[tower.level - 1];
    if (k.w.gold < cost) return reject(REJECT_REASON.insufficientGold);
    tower.level = addSafe(tower.level, 1);
    tower.actuallyPaid = addSafe(tower.actuallyPaid, cost);
    this.emit(k, EVENT_TYPE.towerUpgraded, { cost, level: tower.level, towerId: tower.towerId });
    this.mustSettle(k, `upgrade:c${c.seq}`, -cost, { seq: c.seq, towerId: tower.towerId });
  }

  /** 준비 단계에서만. 환급 = floor(actuallyPaid × refundRateBp / 10000) 한 번(3.3절), 0 이어도 정산 기록. */
  private applySell(k: Work, c: Extract<Command, { kind: "sell" }>, reject: (r: RejectReason) => void): void {
    const { w } = k;
    if (w.phase !== "preparation") return reject(REJECT_REASON.wrongPhase);
    const index = w.towers.findIndex((t) => t.towerId === c.payload.towerId);
    if (index < 0) return reject(REJECT_REASON.towerNotFound);
    const tower = w.towers[index];
    const refund = refundFor(tower.actuallyPaid, this.stage.global.economy.refundRateBp);
    w.towers.splice(index, 1);
    this.emit(k, EVENT_TYPE.towerSold, { refund, towerId: tower.towerId });
    this.mustSettle(k, `sell:t${tower.towerId}`, refund, { seq: c.seq, towerId: tower.towerId });
  }

  private applySetTargeting(k: Work, c: Extract<Command, { kind: "setTargeting" }>, reject: (r: RejectReason) => void): void {
    const tower = k.w.towers.find((t) => t.towerId === c.payload.towerId);
    if (tower === undefined) return reject(REJECT_REASON.towerNotFound);
    tower.targetingMode = c.payload.mode;
    this.emit(k, EVENT_TYPE.targetingChanged, { mode: c.payload.mode, towerId: tower.towerId });
  }

  /** 정산 키는 거래마다 고유하다(seq·towerId 는 재사용되지 않음). 이미 소비된 키면 불변식 위반. */
  private mustSettle(k: Work, localKey: string, delta: number, fields: Readonly<Record<string, unknown>>): void {
    if (!this.settle(k, EVENT_TYPE.economySettled, localKey, delta, fields)) {
      throw new SimStateError(`경제 키 중복 정산(불변식 위반): ${localKey}`);
    }
  }

  /** 준비 → 전투. waveStartTick = 이 틱 T(조기 시작 또는 타이머 만료 다음 틱), 전개 일정을 만든다. */
  private beginWave(k: Work, trigger: "timer" | "command", seq: number | null): void {
    const { w, T } = k;
    w.phase = "combat";
    w.prepTicksRemaining = 0;
    w.waveStartTick = T;
    w.waveSpawnCursor = 0;
    w.plan = expandWave(this.stage.stage.waves[w.waveIndex - 1], T);
    const fields: Record<string, unknown> = { trigger, waveIndex: w.waveIndex, waveStartTick: T };
    if (seq !== null) fields.seq = seq;
    this.emit(k, EVENT_TYPE.waveStarted, fields);
  }

  /** 2단계: `T ≥ expireTick` 인 둔화를 모든 적에서 제거한다(14.3). 이벤트 없음. */
  private stage2Slows(k: Work): void {
    for (const e of k.w.enemies) e.slows = e.slows.filter((x) => x.expireTick > k.T);
  }

  /** 3단계: 이번 틱 일정 항목을 (틱, Segment 원본 순서, 순번) 순서대로 생성. 같은 틱 적은 4단계 대상이 된다. */
  private stage3Spawn(k: Work): void {
    const { w, T } = k;
    if (w.phase !== "combat") return;
    for (;;) {
      const item = w.plan[w.waveSpawnCursor];
      if (item === undefined || item.tick > T) break;
      if (item.tick < T) throw new SimStateError(`생성 일정 불변식 위반: 틱 ${item.tick}의 항목이 ${T}에 남음`);
      w.waveSpawnCursor += 1;
      this.spawn(k, item);
    }
  }

  private spawn(k: Work, item: ExpandedSpawn): void {
    const { w } = k;
    const g = this.stage.global;
    const def = g.enemies.find((e): e is EnemyDef => e.type === item.enemyType);
    if (def === undefined) throw new SimStateError(`콘텐츠에 없는 적 유형 (${item.enemyType})`);
    const trait: TraitDef | undefined = item.trait === null ? undefined : g.traits.find((t) => t.type === item.trait);
    if (item.trait !== null && trait === undefined) throw new SimStateError(`콘텐츠에 없는 특성 (${item.trait})`);
    const maxHp = trait?.hpBoostBp !== undefined ? boostedMaxHp(def.hp, trait.hpBoostBp) : def.hp;
    const baseSpeed = baseSpeedPerTick(def.speedMtPerSec);
    const speedPerTick = trait?.speedBoostBp !== undefined ? boostedSpeedPerTick(baseSpeed, trait.speedBoostBp) : baseSpeed;
    const killReward = addSafe(def.killReward, trait?.killRewardBonus ?? 0);
    const id = takeId(w.counters, "enemy");
    w.enemies.push({
      id,
      enemyType: item.enemyType,
      trait: item.trait,
      hp: maxHp,
      maxHp,
      speedPerTick,
      pathProgress: 0,
      baseDamage: def.baseDamage,
      killReward,
      slows: [],
    });
    this.emit(k, EVENT_TYPE.enemySpawned, {
      enemyId: id,
      enemyType: item.enemyType,
      maxHp,
      segmentIndex: item.segmentIndex,
      speedPerTick,
      trait: item.trait,
    });
  }

  /** 4단계(14.4): (a) 기존 투사체 → (b) 타워 발사 → TEST_ONLY `fire` 훅. HP 만 줄이고 제거는 5단계가 한다. */
  private stage4Combat(k: Work): void {
    this.advanceProjectiles(k);
    this.fireTowers(k);
    this.runFireHook(k);
  }

  private enemyPos(e: EnemyState): PointMt {
    return progressToPosition(this.map, e.pathProgress);
  }

  /** (a) projectileId 오름차순. 취소 → 이동 → 명중/폭발 → 만료(명중 우선). */
  private advanceProjectiles(k: Work): void {
    const { w, T } = k;
    for (const p of sortByNumber(w.projectiles, (x) => x.projectileId)) {
      const target = p.kind === "single" ? w.enemies.find((e) => e.id === p.targetEnemyId && e.hp > 0) : undefined;
      if (p.kind === "single" && target === undefined) {
        this.removeProjectile(w, p);
        this.emit(k, EVENT_TYPE.projectileCancelled, { projectileId: p.projectileId, reason: "targetGone" });
        continue;
      }
      const goal: PointMt = target !== undefined ? this.enemyPos(target) : (p.impact as PointMt);
      const dx = goal.x - p.pos.x;
      const dy = goal.y - p.pos.y;
      const rest2 = addSafe(mulSafe(dx, dx), mulSafe(dy, dy));
      if (rest2 <= mulSafe(p.speedPerTick, p.speedPerTick)) {
        p.pos = { x: goal.x, y: goal.y };
        this.removeProjectile(w, p);
        if (target !== undefined) this.hitSingle(k, p, target);
        else this.explode(k, p);
        continue;
      }
      const d = isqrt(rest2); // d > speedPerTick 이므로 목표를 지나치지 않는다
      p.pos = { x: p.pos.x + roundDiv(mulSafe(dx, p.speedPerTick), d), y: p.pos.y + roundDiv(mulSafe(dy, p.speedPerTick), d) };
      if (T >= p.expireTick) {
        this.removeProjectile(w, p);
        this.emit(k, EVENT_TYPE.projectileExpired, { projectileId: p.projectileId });
      }
    }
  }

  private removeProjectile(w: State, p: ProjectileState): void {
    w.projectiles.splice(w.projectiles.indexOf(p), 1);
  }

  private damageEnemy(k: Work, e: EnemyState, p: ProjectileState): void {
    e.hp = Math.max(0, e.hp - p.damage);
    this.emit(k, EVENT_TYPE.enemyDamaged, { damage: p.damage, enemyId: e.id, hpAfter: e.hp, projectileId: p.projectileId, towerId: p.towerId });
  }

  private hitSingle(k: Work, p: ProjectileState, target: EnemyState): void {
    this.damageEnemy(k, target, p);
    if (p.slowBp !== null && p.slowDurationTicks !== null) this.applySlow(k, p, target, p.slowBp, p.slowDurationTicks);
  }

  /** 14.5: 같은 출처는 새 효과로 교체(약해져도), 다른 출처는 공존. 저항은 실효 bp 에 반영. */
  private applySlow(k: Work, p: ProjectileState, e: EnemyState, baseSlowBp: number, durationTicks: number): void {
    const traitDef = e.trait === null ? undefined : this.stage.global.traits.find((t) => t.type === e.trait);
    const resist = e.trait === "controlResistance" ? (traitDef?.resistBp ?? 0) : 0;
    const slowBp = effectiveSlowBp(baseSlowBp, resist);
    const expireTick = addSafe(k.T, durationTicks);
    const entry: SlowView = { sourceTowerId: p.towerId, slowBp, expireTick };
    const i = e.slows.findIndex((x) => x.sourceTowerId === p.towerId);
    if (i >= 0) e.slows[i] = entry;
    else e.slows = sortByNumber([...e.slows, entry], (x) => x.sourceTowerId);
    this.emit(k, EVENT_TYPE.slowApplied, { enemyId: e.id, expireTick, slowBp, sourceTowerId: p.towerId });
  }

  /** aoe: 폭발 이벤트 후 그 순간 살아 있는 적 중 충돌점과 거리² ≤ 반경² 인 적에게 enemyId 순 피해. */
  private explode(k: Work, p: ProjectileState): void {
    const impact = p.impact as PointMt;
    const radius = p.aoeRadiusMt as number;
    this.emit(k, EVENT_TYPE.projectileExploded, { projectileId: p.projectileId, x: impact.x, y: impact.y });
    const r2 = mulSafe(radius, radius);
    for (const e of sortByNumber(k.w.enemies, (x) => x.id)) {
      if (e.hp > 0 && dist2(this.enemyPos(e), impact) <= r2) this.damageEnemy(k, e, p);
    }
  }

  /** (b) towerId 오름차순. 후보가 없으면 nextFireTick 을 유지한다(준비된 채 대기). */
  private fireTowers(k: Work): void {
    const { w, T } = k;
    for (const tower of sortByNumber(w.towers, (t) => t.towerId)) {
      if (T < tower.nextFireTick) continue;
      const stats = towerLevelStats(this.towerDef(tower.type), tower.level);
      const center: PointMt = { x: tower.cell.col * 1000 + 500, y: tower.cell.row * 1000 + 500 };
      const range2 = mulSafe(stats.rangeMt, stats.rangeMt);
      const candidates: TargetCandidate[] = [];
      for (const e of w.enemies) {
        if (e.hp <= 0) continue;
        const d2 = dist2(center, this.enemyPos(e));
        if (d2 <= range2) candidates.push({ id: e.id, pathProgress: e.pathProgress, hp: e.hp, d2 });
      }
      const chosen = pickTarget(tower.targetingMode, candidates);
      if (chosen === undefined) continue;
      const target = w.enemies.find((e) => e.id === chosen.id) as EnemyState;
      const aoe = tower.type === "mage";
      const impact = aoe ? this.enemyPos(target) : null;
      const projectileId = takeId(w.counters, "projectile");
      const ttlTicks = durationMsToTicks(stats.projectileTtlMs, "projectileTtlMs");
      w.projectiles.push({
        projectileId,
        towerId: tower.towerId,
        kind: aoe ? "aoe" : "single",
        targetEnemyId: aoe ? null : target.id,
        pos: { x: center.x, y: center.y },
        impact: impact === null ? null : { x: impact.x, y: impact.y },
        speedPerTick: baseSpeedPerTick(stats.projectileSpeedMtPerSec),
        damage: stats.damage,
        expireTick: addSafe(T, ttlTicks),
        aoeRadiusMt: aoe ? (stats.aoeRadiusMt as number) : null,
        slowBp: tower.type === "frost" ? (stats.slowBp as number) : null,
        slowDurationTicks: tower.type === "frost" ? durationMsToTicks(stats.slowDurationMs, "slowDurationMs") : null,
      });
      tower.nextFireTick = addSafe(T, durationMsToTicks(stats.attackPeriodMs, "attackPeriodMs"));
      this.emit(k, EVENT_TYPE.projectileFired, {
        impact: impact === null ? null : { x: impact.x, y: impact.y },
        kind: aoe ? "aoe" : "single",
        projectileId,
        targetEnemyId: target.id,
        towerId: tower.towerId,
      });
    }
  }

  /** TEST_ONLY 주입 훅. 코어 4단계 (b) 뒤에 실행된다(14.7). */
  private runFireHook(k: Work): void {
    const fire = this.hooks.fire;
    if (fire === undefined) return;
    const { w } = k;
    withLease((lease) => {
      assertSync(
        "fire",
        fire({
          tick: k.T,
          enemies: Object.freeze(sortByNumber(w.enemies, (e) => e.id).map(view)),
          damage: guard(lease, "damage", (enemyId: number, amount: number) => {
            assertSafeInteger(amount, "damage.amount");
            if (amount < 0) throw new RangeError(`damage.amount: 음수 불가 (${amount})`);
            const enemy = w.enemies.find((e) => e.id === enemyId);
            if (enemy === undefined) throw new RangeError(`damage: 살아 있는 적이 아님 (enemyId ${enemyId})`);
            enemy.hp = Math.max(0, enemy.hp - amount);
          }),
        }),
      );
    });
  }

  /** 5단계: hp ≤ 0 적을 enemyId 순으로 제거하고 `kill:e{id}` 보상을 정확히 한 번 지급. */
  private stage5Deaths(k: Work): void {
    const { w } = k;
    const dead = sortByNumber(
      w.enemies.filter((e) => e.hp <= 0),
      (e) => e.id,
    );
    for (const e of dead) {
      w.enemies.splice(w.enemies.indexOf(e), 1);
      this.emit(k, EVENT_TYPE.enemyKilled, { enemyId: e.id, reward: e.killReward });
      this.settle(k, EVENT_TYPE.economySettled, `kill:e${e.id}`, e.killReward, { enemyId: e.id });
    }
  }

  /** 6단계: 남은 적을 enemyId 순으로 이동. pathProgress ≥ 경로 길이면 기지 도달(제거, 기지 피해, 처치 골드 없음). */
  private stage6Move(k: Work): void {
    const { w } = k;
    for (const e of sortByNumber(w.enemies, (x) => x.id)) {
      // 14.5: 가장 큰 실효 둔화 하나만 적용(나머지는 유지되어 만료 후 드러남). 최소 속도 1.
      const speed = e.slows.length === 0 ? e.speedPerTick : slowedSpeedPerTick(e.speedPerTick, Math.max(...e.slows.map((x) => x.slowBp)));
      e.pathProgress = addSafe(e.pathProgress, speed);
      if (e.pathProgress >= this.pathLengthMt) {
        w.enemies.splice(w.enemies.indexOf(e), 1);
        w.baseHp = Math.max(0, w.baseHp - e.baseDamage);
        this.emit(k, EVENT_TYPE.enemyReachedBase, { baseDamage: e.baseDamage, baseHpAfter: w.baseHp, enemyId: e.id });
      }
    }
  }

  /** 7단계: 패배 우선. 기지 HP 0 이면 패배(이번 틱 웨이브 완료 보상 없음). 아니면 웨이브 완료 보상, 마지막 웨이브면 승리. */
  private stage7Result(k: Work): { outcome: AttemptOutcome | null; nextPrep: boolean } {
    const { w } = k;
    if (w.baseHp === 0) return { outcome: "defeat", nextPrep: false };
    if (w.phase !== "combat" || w.waveSpawnCursor < w.plan.length || w.enemies.length > 0) return { outcome: null, nextPrep: false };
    const wave = this.stage.stage.waves[w.waveIndex - 1];
    this.settle(k, EVENT_TYPE.economySettled, `waveClear:w${w.waveIndex}`, wave.clearReward, { waveIndex: w.waveIndex });
    this.emit(k, EVENT_TYPE.waveCleared, { reward: wave.clearReward, waveIndex: w.waveIndex });
    return w.waveIndex === this.stage.stage.waves.length ? { outcome: "victory", nextPrep: false } : { outcome: null, nextPrep: true };
  }

  /** 8단계: 결과 전환, 다음 웨이브 준비 진입(진입 틱은 타이머를 소비하지 않음), 준비 타이머 감소. */
  private stage8Cleanup(k: Work, pending: { outcome: AttemptOutcome | null; nextPrep: boolean }): void {
    const { w } = k;
    // 14.7: 대상 적이 상태에 없는 single 투사체 정리(5단계 사망·6단계 기지 도달). 결과 틱에도 수행한다.
    for (const p of sortByNumber(w.projectiles, (x) => x.projectileId)) {
      if (p.kind === "single" && !w.enemies.some((e) => e.id === p.targetEnemyId)) {
        this.removeProjectile(w, p);
        this.emit(k, EVENT_TYPE.projectileCancelled, { projectileId: p.projectileId, reason: "targetGone" });
      }
    }
    if (pending.outcome !== null) {
      w.phase = pending.outcome;
      w.outcome = pending.outcome;
      this.emit(k, EVENT_TYPE.resultReached, { outcome: pending.outcome });
      return;
    }
    if (pending.nextPrep) {
      w.waveIndex = addSafe(w.waveIndex, 1);
      w.phase = "preparation";
      w.prepTicksRemaining = this.prepTicksOf(w.waveIndex);
      w.waveStartTick = null;
      w.waveSpawnCursor = 0;
      w.plan = [];
      this.emit(k, EVENT_TYPE.prepEntered, { prepTicks: w.prepTicksRemaining, waveIndex: w.waveIndex });
      return;
    }
    if (w.phase === "preparation") w.prepTicksRemaining = addSafe(w.prepTicksRemaining, -1);
  }

  // ───────── 공통 ─────────

  private prepTicksOf(waveIndex: number): number {
    return this.stage.stage.waves[waveIndex - 1].prepMs / 50;
  }

  private emit(k: Work, type: EventType, fields: Readonly<Record<string, unknown>>): number {
    const eventSeq = takeId(k.w.counters, "event");
    k.out.push({ ...fields, eventSeq, tick: k.T, type });
    return eventSeq;
  }

  /** 경제 정산: 키가 이미 소비됐으면 아무것도 하지 않는다(정확히 한 번). 출력 키에는 `a{attemptId}:` 접두어. */
  private settle(k: Work, type: EventType, localKey: string, delta: number, fields: Readonly<Record<string, unknown>>): boolean {
    const { w } = k;
    if (w.consumed.includes(localKey)) return false;
    const goldAfter = addSafe(w.gold, assertSafeInteger(delta, "delta"));
    if (goldAfter < 0) throw new RangeError(`정산 후 골드가 음수 (${goldAfter})`);
    const key = `a${w.attemptId}:${localKey}`;
    const eventSeq = this.emit(k, type, { ...fields, delta, goldAfter, key });
    w.gold = goldAfter;
    w.consumed.push(localKey);
    w.ledger.push({ tick: k.T, eventSeq, key, delta, goldAfter });
    return true;
  }
}

/**
 * 시도 생성(12.1절). 콘텐츠 묶음에 대해 진입 재검증(11.4)을 다시 실행하고, 실패하면 만들지 않는다(AttemptCreateError).
 * 통과하면 깊은 복사·동결된 그 스테이지 콘텐츠만 읽는다. 재도전 = 같은 인자로 새 attemptId 를 줘서 새로 만든다.
 */
export function createAttempt(bundle: unknown, stageId: string, attemptId: number, hooks: AttemptHooks = {}): AttemptCore {
  const entry = validateStageForEntry(bundle, stageId);
  if (!entry.ok) throw new AttemptCreateError(entry.errors);
  return new AttemptCore(CREATE_TOKEN, entry.content, entry.contentHash, attemptId, hooks);
}
