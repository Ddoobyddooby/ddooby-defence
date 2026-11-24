// SIM-01 — 시도 상태 머신·8단계 틱 (SIM-CONTRACT 12절). 순수 코어: 벽시계·난수 없음, 안전 정수만 상태에 둔다.
// 실제 발사·명중·둔화(SIM-02), 설치·강화·판매(ECON-01)는 12.4 확장 지점(AttemptHooks)으로 연결한다.
import { compileStageMap } from "../map/stageMap";
import { expandWave, type ExpandedSpawn } from "../content/expandWave";
import type { ContentError, EnemyDef, StageContent, TraitDef } from "../content/types";
import { validateStageForEntry } from "../content/validate";
import { cloneCanonical, sortByNumber, sortCodeUnit } from "../sim/canonical";
import { drainCommands, submitCommand, type Command, type SubmitResult } from "../sim/commands";
import { SimStateError } from "../sim/errors";
import { EVENT_TYPE, REJECT_REASON, type EventType, type RejectReason } from "../sim/events";
import { baseSpeedPerTick, boostedMaxHp, boostedSpeedPerTick } from "../sim/formulas";
import { createIdCounters, takeId, type IdCounters } from "../sim/ids";
import { addSafe, assertSafeInteger } from "../sim/intmath";
import type {
  AttemptEvent,
  AttemptHooks,
  AttemptOutcome,
  AttemptPhase,
  CommandHookContext,
  EnemyView,
  LedgerEntry,
} from "./types";

export const ATTEMPT_CODE_VERSION = "attempt-v1";

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
}

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
  queue: Command[];
  consumed: string[];
  ledger: LedgerEntry[];
}

interface Work {
  readonly w: State;
  readonly T: number;
  readonly out: AttemptEvent[];
}

function view(e: EnemyState): EnemyView {
  return Object.freeze({ ...e });
}

export class AttemptCore {
  private s: State;
  private stepping = false;
  private readonly stage: StageContent;
  private readonly pathLengthMt: number;
  private readonly hooks: AttemptHooks;
  readonly contentHash: string;

  constructor(stage: StageContent, contentHash: string, attemptId: number, hooks: AttemptHooks = {}) {
    assertSafeInteger(attemptId, "attemptId");
    if (attemptId < 1) throw new RangeError(`attemptId: 1 이상이어야 함 (${attemptId})`);
    this.stage = stage;
    this.contentHash = contentHash;
    this.hooks = hooks;
    this.pathLengthMt = compileStageMap(stage.stage.map).pathLengthMt;
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
    if (this.isResult()) throw new SimStateError("결과 단계에서는 pause() 불가");
    this.s.paused = true;
  }
  resume(): void {
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
        enemies: sortByNumber(s.enemies, (e) => e.id).map((e) => ({ ...e })),
        gold: s.gold,
        outcome: s.outcome,
        paused: s.paused,
        phase: s.phase,
        prepTicksRemaining: s.prepTicksRemaining,
        queue: sortByNumber(s.queue, (c) => c.seq).map((c) => ({
          applyTick: c.applyTick,
          kind: c.kind,
          payload: c.payload,
          seq: c.seq,
        })),
        stageId: s.stageId,
        tick: s.tick,
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
      this.stage4Fire(work);
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
    // build·upgrade·sell·setTargeting: ECON-01/SIM-02 처리기. 없으면 unsupportedKind.
    const handler = this.hooks.handleCommand;
    if (handler === undefined) return reject(REJECT_REASON.unsupportedKind);
    const ctx: CommandHookContext = {
      tick: k.T,
      phase: w.phase,
      gold: w.gold,
      stage: this.stage,
      emit: (type, fields) => {
        this.emit(k, type, fields);
      },
      settle: (localKey, delta, type, fields) => this.settle(k, type, localKey, delta, fields),
    };
    const reason = handler(ctx, c);
    if (reason === null) return;
    if (!(Object.values(REJECT_REASON) as string[]).includes(reason)) {
      throw new SimStateError(`handleCommand 가 알 수 없는 거부 사유를 돌려줌 (${String(reason)})`);
    }
    reject(reason);
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

  /** 2단계: 둔화 만료 확장 지점(SIM-02). SIM-01 은 바꿀 상태가 없다. */
  private stage2Slows(k: Work): void {
    this.hooks.expireSlows?.({ tick: k.T, enemies: Object.freeze(sortByNumber(k.w.enemies, (e) => e.id).map(view)) });
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

  /** 4단계: 발사·충돌 확장 지점(SIM-02). HP 감소만 허용하고 제거는 5단계가 한다. */
  private stage4Fire(k: Work): void {
    const fire = this.hooks.fire;
    if (fire === undefined) return;
    const { w } = k;
    fire({
      tick: k.T,
      enemies: Object.freeze(sortByNumber(w.enemies, (e) => e.id).map(view)),
      damage: (enemyId, amount) => {
        assertSafeInteger(amount, "damage.amount");
        if (amount < 0) throw new RangeError(`damage.amount: 음수 불가 (${amount})`);
        const enemy = w.enemies.find((e) => e.id === enemyId);
        if (enemy === undefined) throw new RangeError(`damage: 살아 있는 적이 아님 (enemyId ${enemyId})`);
        enemy.hp = Math.max(0, enemy.hp - amount);
      },
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
      const speed = this.hooks.enemySpeed ? this.hooks.enemySpeed(view(e)) : e.speedPerTick;
      assertSafeInteger(speed, "enemySpeed");
      if (speed < 1) throw new RangeError(`enemySpeed: 1 이상이어야 함 (${speed})`);
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
  return new AttemptCore(entry.content, entry.contentHash, attemptId, hooks);
}
