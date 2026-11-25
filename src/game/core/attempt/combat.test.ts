// SIM-02 — 전투(발사·타깃·투사체·둔화) 테스트. 수치는 TEST_ONLY 묶음이며, 기대값은 제품 helper 가 아니라 손 계산한 리터럴이다.
// 공통 기하(스테이지 2): 적 출발 칸 (0,1) 중심 (500,1500), 경로는 행 1 을 따라 x = 500 + pathProgress (pathProgress ≤ 14000).
//   타워 (0,0) 중심 (500,500), (0,2) 중심 (500,2500), (c,r) 중심 (c×1000+500, r×1000+500).
// TEST_ONLY 기본값(fixtures): archer damage 10·주기 1000ms(20틱)·사거리 5000·투사체 10000mt/s(500/틱)·TTL 2000ms(40틱), 강화 증분 damage +5·사거리 +500.
//   mage damage 20·사거리 4000·반경 1500·증분 반경 +100, frost damage 4·사거리 3000·slowBp 3000·지속 2000ms(40틱)·증분 slowBp +500.
//   normal hp 100·baseDamage 1 (속도는 아래 bundle 에서 1000mt/s = 50mt/틱 으로 낮춘다).
import { describe, expect, it } from "vitest";
import { createAttempt, ATTEMPT_CODE_VERSION, type AttemptCore } from "./attempt";
import { pickTarget, type TargetCandidate } from "./combat";
import { killAt } from "./testing/inject";
import { InvariantChecker } from "./testing/invariants";
import { seg, STAGE2_ID, uniformStage2, withValues } from "./testing/bundles";
import { firstMismatch, initialStateHashOf, runReplay, type ReplayRecord } from "../sim/replay";
import type { TargetingMode } from "../sim/commands";

type Ev = Record<string, unknown>;
type Patch = readonly [string, unknown];

const ARCHER = 0;
const MAGE = 2;
const FROST = 3;
const base = (tower: number, field: string, value: number): Patch => [`towers[${tower}].levels.base.${field}`, value];
const inc = (tower: number, upgrade: 0 | 1 | 2, field: string, value: number): Patch => [`towers[${tower}].levels.increments[${upgrade}].${field}`, value];
const enemy = (index: number, field: string, value: number): Patch => [`enemies[${index}].${field}`, value];
const SLOW_NORMAL: Patch = enemy(0, "speedMtPerSec", 1000); // 50mt/틱
/** 검증기가 요구하는 사거리 순서(ballista > archer > mage > frost, 레벨마다)를 지키며 archer 사거리를 낮춘다. */
const shortRanges = (archer: number): Patch[] => [base(ARCHER, "rangeMt", archer), base(MAGE, "rangeMt", 900), base(FROST, "rangeMt", 800)];

function bundle(segments: readonly unknown[], patches: readonly Patch[] = [SLOW_NORMAL], prepMs = 150): unknown {
  return withValues(patches, uniformStage2({ prepMs, clearReward: 20, segments }));
}

interface Snap {
  gold: number;
  baseHp: number;
  phase: string;
  counters: Record<string, number>;
  consumedEconomyEvents: string[];
  towers: { towerId: number; level: number; nextFireTick: number; targetingMode: string }[];
  enemies: { id: number; hp: number; pathProgress: number; slows: { sourceTowerId: number; slowBp: number; expireTick: number }[] }[];
  projectiles: Ev[];
}

/** 틱별 이벤트 로그를 모으며 코어를 진행한다. log[t] = 틱 t 의 이벤트. */
class Sim {
  readonly log: Ev[][] = [[]];
  constructor(readonly core: AttemptCore) {}
  to(tick: number): this {
    while (this.core.completedTick < tick) this.log.push(this.core.step() as unknown as Ev[]);
    return this;
  }
  ev(tick: number, type?: string): Ev[] {
    return this.log[tick].filter((e) => type === undefined || e.type === type);
  }
  all(type: string): Ev[] {
    return this.log.flat().filter((e) => e.type === type);
  }
  types(tick: number): unknown[] {
    return this.log[tick].map((e) => e.type);
  }
  get s(): Snap {
    return this.core.snapshot() as unknown as Snap;
  }
  submit(kind: string, payload: unknown): this {
    this.core.submit(kind, payload);
    return this;
  }
}

type Build = readonly [towerType: string, col: number, row: number];
/** 틱 1 에 타워를 설치하고 조기 시작한다(같은 틱 명령 순서 = build… → startWave). */
function start(b: unknown, builds: readonly Build[], hooks = {}): Sim {
  const core = createAttempt(b, STAGE2_ID, 1, hooks);
  const sim = new Sim(core);
  for (const [towerType, col, row] of builds) sim.submit("build", { towerType, tile: { col, row } });
  sim.submit("startWave", {});
  return sim;
}

const ONE = [seg(0, 0, 1)];

describe("순수 타깃 선택 pickTarget (14.6)", () => {
  const c = (id: number, pathProgress: number, hp: number, d2: number): TargetCandidate => ({ id, pathProgress, hp, d2 });
  const permutations = <T>(xs: readonly T[]): T[][] =>
    xs.length <= 1 ? [[...xs]] : xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
  const ids = (mode: TargetingMode, list: readonly TargetCandidate[]): number[] => permutations(list).map((p) => pickTarget(mode, p)?.id ?? -1);

  it("후보 없음 → undefined", () => {
    expect(pickTarget("first", [])).toBeUndefined();
  });
  it("1차 기준: first=진행도 최대, last=최소, close=거리² 최소, strong=hp 최대 (모든 저장 순서에서 같은 결과)", () => {
    const list = [c(1, 3000, 100, 5e6), c(2, 2000, 400, 2e6), c(3, 1000, 100, 1e6), c(4, 0, 100, 2e6)];
    expect(new Set(ids("first", list))).toEqual(new Set([1]));
    expect(new Set(ids("last", list))).toEqual(new Set([4]));
    expect(new Set(ids("close", list))).toEqual(new Set([3]));
    expect(new Set(ids("strong", list))).toEqual(new Set([2]));
  });
  it("동률: first·last 는 id 작은 쪽", () => {
    const list = [c(7, 500, 10, 1), c(3, 500, 10, 1), c(5, 500, 10, 1)];
    expect(new Set(ids("first", list))).toEqual(new Set([3]));
    expect(new Set(ids("last", list))).toEqual(new Set([3]));
  });
  it("동률: close 는 거리² 같으면 진행도 큰 쪽 → id 작은 쪽, strong 은 hp 같으면 진행도 큰 쪽 → id 작은 쪽", () => {
    const close = [c(1, 1500, 100, 9), c(2, 2500, 100, 9), c(3, 2500, 100, 9), c(4, 3000, 100, 10)];
    expect(new Set(ids("close", close))).toEqual(new Set([2]));
    const strong = [c(1, 1500, 100, 1), c(2, 2500, 100, 1), c(3, 2500, 100, 1), c(4, 9000, 99, 1)];
    expect(new Set(ids("strong", strong))).toEqual(new Set([2]));
  });
});

describe("발사 시점·주기·강화 (14.2·14.4)", () => {
  it("설치한 틱 4단계에 발사: 이벤트·투사체 상태·nextFireTick = T + 주기(20틱)·projectileId 소비", () => {
    const sim = start(bundle(ONE), [["archer", 0, 0]]).to(1);
    expect(sim.types(1)).toEqual(["towerBuilt", "economySettled", "waveStarted", "enemySpawned", "projectileFired"]);
    expect(sim.ev(1, "projectileFired")[0]).toEqual({ eventSeq: 5, tick: 1, type: "projectileFired", projectileId: 1, towerId: 1, kind: "single", targetEnemyId: 1, impact: null });
    expect(sim.s.towers[0]).toMatchObject({ towerId: 1, nextFireTick: 21 });
    expect(sim.s.projectiles).toEqual([
      {
        projectileId: 1,
        towerId: 1,
        kind: "single",
        targetEnemyId: 1,
        pos: { x: 500, y: 500 },
        impact: null,
        speedPerTick: 500,
        damage: 10,
        expireTick: 41,
        aoeRadiusMt: null,
        slowBp: null,
        slowDurationTicks: null,
      },
    ]);
    expect(sim.s.counters.nextProjectileId).toBe(2);
    expect(sim.s.enemies[0].hp).toBe(100); // 발사 틱에는 명중 없음
  });

  it("투사체 이동(손 계산)·명중: 틱 2 (525,1000), 틱 3 (599,1495), 틱 4 명중 hp 100→90", () => {
    const sim = start(bundle(ONE), [["archer", 0, 0]]);
    sim.to(2);
    expect(sim.s.projectiles[0].pos).toEqual({ x: 525, y: 1000 });
    sim.to(3);
    expect(sim.s.projectiles[0].pos).toEqual({ x: 599, y: 1495 });
    sim.to(4);
    expect(sim.ev(4)).toEqual([{ eventSeq: 6, tick: 4, type: "enemyDamaged", damage: 10, enemyId: 1, hpAfter: 90, projectileId: 1, towerId: 1 }]);
    expect(sim.s.projectiles).toEqual([]);
    expect(sim.s.enemies[0].hp).toBe(90);
  });

  it("강화는 nextFireTick 을 바꾸지 않는다: Lv2 업그레이드(틱 5) 뒤에도 21, 틱 21 발사는 Lv2(damage 15)이고 다음은 Lv2 주기(10틱) → 31", () => {
    const b = bundle(ONE, [SLOW_NORMAL, inc(ARCHER, 0, "attackPeriodMs", -500)]);
    const sim = start(b, [["archer", 0, 0]]).to(4);
    sim.submit("upgrade", { towerId: 1 }).to(5);
    expect(sim.s.towers[0]).toMatchObject({ level: 2, nextFireTick: 21 });
    sim.to(20);
    expect(sim.s.towers[0].nextFireTick).toBe(21);
    expect(sim.ev(20, "projectileFired")).toHaveLength(0);
    sim.to(21);
    expect(sim.ev(21, "projectileFired")).toHaveLength(1);
    expect(sim.s.towers[0].nextFireTick).toBe(31);
    expect(sim.s.projectiles).toMatchObject([{ projectileId: 2, damage: 15, expireTick: 61 }]);
  });

  it("후보가 없으면 nextFireTick 을 유지(준비된 채 대기)하고, 틱 41 에 생성된 적을 같은 틱에 쏜다", () => {
    const sim = start(bundle([seg(2000, 0, 1)]), [["archer", 0, 0]]).to(40);
    expect(sim.s.towers[0].nextFireTick).toBe(1);
    expect(sim.all("projectileFired")).toHaveLength(0);
    sim.to(41);
    expect(sim.types(41)).toEqual(["enemySpawned", "projectileFired"]);
    expect(sim.s.towers[0].nextFireTick).toBe(61);
  });

  it("한 틱에 타워마다 최대 1발, towerId 순으로 발사하고 projectileId 도 그 순서", () => {
    const sim = start(bundle(ONE), [["archer", 0, 0], ["archer", 0, 2]]).to(1);
    expect(sim.ev(1, "projectileFired").map((e) => [e.projectileId, e.towerId])).toEqual([[1, 1], [2, 2]]);
  });
});

describe("사거리 경계 (거리² ≤ range², 경계 포함)", () => {
  // 틱 1 에 적 (500,1500), 타워 (500,500): 거리² = 1_000_000.
  it("range 1000(거리² == range²) → 발사. 이후 적이 사거리 밖으로 나가도 투사체는 추적해 틱 4 에 명중(single 추적)", () => {
    const sim = start(bundle(ONE, [SLOW_NORMAL, ...shortRanges(1000)]), [["archer", 0, 0]]).to(1);
    expect(sim.ev(1, "projectileFired")).toHaveLength(1);
    sim.to(4);
    expect(sim.ev(4, "enemyDamaged")).toHaveLength(1);
    expect(sim.s.enemies[0].hp).toBe(90);
    // 틱 4 의 적 위치 (650,1500)은 이미 사거리 1000 밖: 거리² = 150² + 1000²
  });
  it("range 999(거리² > range²) → 발사 안 함, nextFireTick 유지", () => {
    const sim = start(bundle(ONE, [SLOW_NORMAL, ...shortRanges(999)]), [["archer", 0, 0]]).to(10);
    expect(sim.all("projectileFired")).toHaveLength(0);
    expect(sim.s.towers[0].nextFireTick).toBe(1);
  });
});

describe("타깃 모드 4종 (14.6) — 틱 61 에 적 4명: 진행도 3000/2000/1000/0, hp 100/400/100/100, 타워 (1,2) 중심 (1500,2500)", () => {
  // 적 x 좌표 3500/2500/1500/500 → 타워까지 거리² 5e6 / 2e6 / 1e6 / 2e6.
  const segments = [seg(0, 0, 1, "normal"), seg(1000, 0, 1, "heavy"), seg(2000, 0, 1, "normal"), seg(3000, 0, 1, "normal")];
  const patches = [SLOW_NORMAL, enemy(2, "speedMtPerSec", 1000)];
  const expected: Record<TargetingMode, number> = { first: 1, last: 4, close: 3, strong: 2 };
  for (const mode of ["first", "last", "close", "strong"] as const) {
    it(`${mode} → 적 ${expected[mode]}`, () => {
      const sim = start(bundle(segments, patches), []).to(60);
      sim.submit("build", { towerType: "archer", tile: { col: 1, row: 2 } }).submit("setTargeting", { towerId: 1, mode }).to(61);
      expect(sim.ev(61, "projectileFired")).toMatchObject([{ targetEnemyId: expected[mode] }]);
      expect(sim.s.enemies.map((e) => e.pathProgress)).toEqual([3050, 2050, 1050, 50]); // 6단계 이동 후
    });
  }

  it("동률(같은 틱·같은 진행도·같은 hp·같은 위치의 적 2명) → 모든 모드에서 id 작은 쪽", () => {
    for (const mode of ["first", "last", "close", "strong"] as const) {
      const sim = start(bundle([seg(0, 0, 1), seg(0, 0, 1)]), []).to(10);
      sim.submit("build", { towerType: "archer", tile: { col: 0, row: 2 } }).submit("setTargeting", { towerId: 1, mode }).to(11);
      expect(sim.ev(11, "projectileFired"), mode).toMatchObject([{ targetEnemyId: 1 }]);
    }
  });

  it("동률(거리²·hp 같고 진행도만 다름): close·strong 은 진행도 큰 쪽(id 2), first 도 id 2, last 는 id 1", () => {
    // heavy(hp 100, 30mt/틱) id1, normal(hp 100, 50mt/틱) id2. 틱 51: 진행도 1500/2500 → x 2000/3000, 타워 (2,2) 중심 (2500,2500) 에서 거리² 둘 다 1_250_000.
    const heavyHp100 = [SLOW_NORMAL, enemy(2, "hp", 100)];
    const want: Record<TargetingMode, number> = { first: 2, last: 1, close: 2, strong: 2 };
    for (const mode of ["first", "last", "close", "strong"] as const) {
      const sim = start(bundle([seg(0, 0, 1, "heavy"), seg(0, 0, 1, "normal")], heavyHp100), []).to(50);
      sim.submit("build", { towerType: "archer", tile: { col: 2, row: 2 } }).submit("setTargeting", { towerId: 1, mode }).to(51);
      expect(sim.ev(51, "projectileFired"), mode).toMatchObject([{ targetEnemyId: want[mode] }]);
    }
  });
});

describe("발사 후 타깃 변경 (REQ-TOWER-09, 15.5)", () => {
  // e1 은 틱 1, e2 는 틱 21 생성. 타워는 틱 1 에 first 로 e1 을 쏜다. 틱 2 에 setTargeting last 가 적용된다.
  const segments = [seg(0, 0, 1), seg(1000, 0, 1)];
  const run = (changeToLast: boolean): Sim => {
    const sim = start(bundle(segments), [["archer", 0, 0]]).to(1);
    if (changeToLast) sim.submit("setTargeting", { towerId: 1, mode: "last" });
    return sim;
  };
  it("비행 중 투사체의 대상·스탯은 불변, nextFireTick 도 불변", () => {
    const sim = run(true);
    const before = sim.s.projectiles[0];
    expect(before).toMatchObject({ projectileId: 1, targetEnemyId: 1, damage: 10, expireTick: 41, speedPerTick: 500 });
    sim.to(2);
    expect(sim.ev(2, "targetingChanged")).toMatchObject([{ towerId: 1, mode: "last" }]);
    expect(sim.s.towers[0]).toMatchObject({ targetingMode: "last", nextFireTick: 21 });
    const after = sim.s.projectiles[0];
    expect(after).toMatchObject({ projectileId: 1, targetEnemyId: 1, damage: 10, expireTick: 41, speedPerTick: 500, kind: "single", impact: null });
    sim.to(4);
    expect(sim.ev(4, "enemyDamaged")).toMatchObject([{ projectileId: 1, enemyId: 1, damage: 10 }]); // 여전히 e1 에 명중
  });
  it("다음 발사(틱 21)는 새 모드로 선택한다: last → 방금 생성된 e2, 변경 없으면(first) e1", () => {
    expect(run(true).to(21).ev(21, "projectileFired")).toMatchObject([{ targetEnemyId: 2 }]);
    expect(run(false).to(21).ev(21, "projectileFired")).toMatchObject([{ targetEnemyId: 1 }]);
  });
});

describe("취소·만료·명중 우선 (14.4 (a)·14.7)", () => {
  it("fire 훅은 코어 (b) 뒤에 실행된다: 같은 틱 발사 뒤 훅이 적을 죽이면 투사체는 그 틱 8단계에 취소", () => {
    const sim = start(bundle(ONE), [["archer", 0, 0]], killAt({ tick: 1, enemyId: 1 })).to(1);
    expect(sim.types(1)).toEqual([
      "towerBuilt", "economySettled", "waveStarted", "enemySpawned", "projectileFired", // 코어 (b) 가 먼저 발사
      "enemyKilled", "economySettled", "economySettled", "waveCleared", "projectileCancelled", "prepEntered",
    ]);
    expect(sim.s.projectiles).toEqual([]);
  });

  it("대상 사망: 틱 2 (훅 처치) → 같은 틱 8단계에 projectileCancelled{targetGone}, 상태에서 제거", () => {
    const sim = start(bundle(ONE), [["archer", 0, 0]], killAt({ tick: 2, enemyId: 1 })).to(2);
    expect(sim.types(2)).toEqual(["enemyKilled", "economySettled", "economySettled", "waveCleared", "projectileCancelled", "prepEntered"]);
    expect(sim.ev(2, "projectileCancelled")[0]).toMatchObject({ projectileId: 1, reason: "targetGone" });
    expect(sim.s.projectiles).toEqual([]);
  });

  it("대상이 기지에 도달(틱 8, 5000mt/틱): 같은 틱 8단계에 취소, 그 전(틱 7)에는 비행 중", () => {
    const sim = start(uniformStage2({ prepMs: 150, clearReward: 20, segments: ONE }), [["archer", 0, 0]]).to(7);
    expect(sim.s.projectiles).toHaveLength(1);
    expect(sim.all("projectileCancelled")).toHaveLength(0);
    sim.to(8);
    expect(sim.ev(8, "enemyReachedBase")).toHaveLength(1);
    expect(sim.ev(8, "projectileCancelled")).toMatchObject([{ projectileId: 1, reason: "targetGone" }]);
    expect(sim.s.projectiles).toEqual([]);
    expect(sim.s.baseHp).toBe(24);
  });

  it("같은 틱 명중 == 만료 → 명중 우선: TTL 150ms(3틱) → expireTick 4 == 명중 틱 4", () => {
    const sim = start(bundle(ONE, [SLOW_NORMAL, base(ARCHER, "projectileTtlMs", 150)]), [["archer", 0, 0]]).to(4);
    expect(sim.s.projectiles[0]).toBeUndefined();
    expect(sim.ev(4, "enemyDamaged")).toHaveLength(1);
    expect(sim.all("projectileExpired")).toHaveLength(0);
  });
  it("TTL 100ms(2틱) → expireTick 3: 틱 3 에 만료, 피해 없음", () => {
    const sim = start(bundle(ONE, [SLOW_NORMAL, base(ARCHER, "projectileTtlMs", 100)]), [["archer", 0, 0]]).to(10);
    expect(sim.ev(3, "projectileExpired")).toEqual([{ eventSeq: sim.ev(3)[0].eventSeq, tick: 3, type: "projectileExpired", projectileId: 1 }]);
    expect(sim.all("enemyDamaged")).toHaveLength(0);
    expect(sim.s.enemies[0].hp).toBe(100);
    expect(sim.s.projectiles).toEqual([]);
  });
});

describe("4단계에서 hp 0 이 된 적은 즉시 비대상", () => {
  // 적 hp 10(archer 한 방). 타워 1(0,0)·2(0,2) 가 틱 1 에 e1 을 쏜다(P1,P2 모두 틱 4 도달, 대칭 기하). e2 는 틱 3 생성.
  const b = bundle([seg(0, 0, 1), seg(100, 0, 1)], [SLOW_NORMAL, enemy(0, "hp", 10)]);
  it("P1 이 e1 을 죽이면(hpAfter 0) 같은 틱 P2 는 취소, 뒤 타워(틱 4 설치)는 e1 이 아니라 e2 를 쏜다, 처치 골드는 한 번", () => {
    const sim = start(b, [["archer", 0, 0], ["archer", 0, 2]]).to(3);
    sim.submit("build", { towerType: "archer", tile: { col: 1, row: 0 } }).to(4);
    expect(sim.types(4)).toEqual(["towerBuilt", "economySettled", "enemyDamaged", "projectileCancelled", "projectileFired", "enemyKilled", "economySettled"]);
    expect(sim.ev(4, "enemyDamaged")).toMatchObject([{ enemyId: 1, hpAfter: 0, projectileId: 1 }]);
    expect(sim.ev(4, "projectileCancelled")).toMatchObject([{ projectileId: 2, reason: "targetGone" }]);
    expect(sim.ev(4, "projectileFired")).toMatchObject([{ projectileId: 3, towerId: 3, targetEnemyId: 2 }]);
    expect(sim.s.consumedEconomyEvents.filter((k) => k === "kill:e1")).toHaveLength(1);
    expect(sim.all("enemyKilled")).toHaveLength(1);
  });
});

describe("같은 틱 앞선 투사체가 죽인 적은 aoe 피해 대상도 아니다 (14.4 (a), 14.8)", () => {
  it("틱 4: P1(archer)이 hp 10 의 e1 을 죽이고(hpAfter 0), 뒤 id 의 aoe P2(반경 안, 8000mt/s = 400mt/틱 → 틱 4 폭발)는 e1 에 피해를 주지 않는다", () => {
    const b = bundle(ONE, [SLOW_NORMAL, enemy(0, "hp", 10), base(MAGE, "projectileSpeedMtPerSec", 8000)]);
    const sim = start(b, [["archer", 0, 0], ["mage", 0, 2]]).to(4);
    expect(sim.types(4)).toEqual(["enemyDamaged", "projectileExploded", "enemyKilled", "economySettled", "economySettled", "waveCleared", "prepEntered"]);
    expect(sim.ev(4, "enemyDamaged")).toMatchObject([{ enemyId: 1, hpAfter: 0, projectileId: 1 }]);
    expect(sim.ev(4, "projectileExploded")).toMatchObject([{ projectileId: 2 }]);
  });
});

describe("aoe (mage, 14.4)", () => {
  it("충돌점은 발사 시 대상 위치로 고정: 투사체 상태 aoe(targetEnemyId null), 틱 3 폭발(500,1500), 그 사이 움직인 적(600,1500)도 반경 안이라 피해", () => {
    const sim = start(bundle(ONE), [["mage", 0, 0]]).to(1);
    expect(sim.ev(1, "projectileFired")[0]).toMatchObject({ kind: "aoe", targetEnemyId: 1, impact: { x: 500, y: 1500 } });
    expect(sim.s.projectiles[0]).toMatchObject({
      kind: "aoe", targetEnemyId: null, impact: { x: 500, y: 1500 }, pos: { x: 500, y: 500 }, damage: 20, aoeRadiusMt: 1500, slowBp: null, slowDurationTicks: null, expireTick: 41,
    });
    sim.to(2);
    expect(sim.s.projectiles[0].pos).toEqual({ x: 500, y: 1000 });
    sim.to(3);
    expect(sim.ev(3).map((e) => e.type)).toEqual(["projectileExploded", "enemyDamaged"]);
    expect(sim.ev(3, "projectileExploded")[0]).toMatchObject({ projectileId: 1, x: 500, y: 1500 });
    expect(sim.ev(3, "enemyDamaged")[0]).toMatchObject({ enemyId: 1, hpAfter: 80, damage: 20, projectileId: 1, towerId: 1 });
  });

  // 틱 21: id1(진행도 1000, (1500,1500))은 타워 (0,2) 사거리 1200 밖(거리² 2e6 > 1.44e6), id2(방금 생성, (500,1500))는 안(1e6).
  // 틱 23 폭발 시 id1 은 진행도 1100(충돌점까지 거리² 1_210_000), id2 는 100.
  const radiusCase = (radius: number): Sim => {
    const b = bundle([seg(0, 0, 1), seg(1000, 0, 1)], [SLOW_NORMAL, base(FROST, "rangeMt", 1000), base(MAGE, "rangeMt", 1200), base(MAGE, "aoeRadiusMt", radius)]);
    const sim = start(b, []).to(20);
    return sim.submit("build", { towerType: "mage", tile: { col: 0, row: 2 } }).to(23);
  };
  it("사거리 밖 적도 반경 안이면 피해, 거리² == 반경²(경계 포함, 반경 1100)이면 피해 — enemyId 순", () => {
    const sim = radiusCase(1100);
    expect(sim.ev(21, "projectileFired")).toMatchObject([{ targetEnemyId: 2, impact: { x: 500, y: 1500 } }]);
    expect(sim.ev(23).map((e) => [e.type, e.enemyId ?? null])).toEqual([["projectileExploded", null], ["enemyDamaged", 1], ["enemyDamaged", 2]]);
  });
  it("반경 1099(경계 밖 1) → id1 제외", () => {
    const sim = radiusCase(1099);
    expect(sim.ev(23).map((e) => [e.type, e.enemyId ?? null])).toEqual([["projectileExploded", null], ["enemyDamaged", 2]]);
  });

  it("노린 적이 사라져도 폭발하고, 반경 안에 적이 0명이어도 폭발 이벤트가 남는다(피해 없음)", () => {
    const sim = start(bundle(ONE), [["mage", 0, 0]], killAt({ tick: 2, enemyId: 1 })).to(3);
    expect(sim.types(2)).toEqual(["enemyKilled", "economySettled", "economySettled", "waveCleared", "prepEntered"]); // aoe 는 취소되지 않고 웨이브 완료를 막지 않는다
    expect(sim.s.projectiles).toEqual([]);
    expect(sim.ev(3)).toEqual([{ eventSeq: sim.ev(3)[0].eventSeq, tick: 3, type: "projectileExploded", projectileId: 1, x: 500, y: 1500 }]);
  });

  it("수명 만료 시 폭발 없음: TTL 50ms → expireTick 2, 틱 2 에 projectileExpired 만", () => {
    const sim = start(bundle(ONE, [SLOW_NORMAL, base(MAGE, "projectileTtlMs", 50)]), [["mage", 0, 0]]).to(5);
    expect(sim.types(2)).toEqual(["projectileExpired"]);
    expect(sim.all("projectileExploded")).toHaveLength(0);
    expect(sim.s.enemies[0].hp).toBe(100);
  });

  it("판매된 타워의 투사체는 계속 진행해 폭발한다(준비 단계 판매), 환급 126 = floor(180×7000/10000)", () => {
    // 투사체 10mt/틱(200mt/s), TTL 400틱. 틱 2 처치 → 웨이브 완료·준비(prepMs 5000 = 100틱). 틱 3 판매. 거리 1000 → 99번 이동 후 틱 101 명중.
    const b = bundle(ONE, [SLOW_NORMAL, base(MAGE, "projectileSpeedMtPerSec", 200), base(MAGE, "projectileTtlMs", 20000)], 5000);
    const sim = start(b, [["mage", 0, 0]], killAt({ tick: 2, enemyId: 1 })).to(2);
    sim.submit("sell", { towerId: 1 }).to(3);
    expect(sim.types(3)).toEqual(["towerSold", "economySettled"]);
    expect(sim.ev(3, "towerSold")[0]).toMatchObject({ refund: 126 });
    expect(sim.s.towers).toEqual([]);
    expect(sim.s.projectiles).toMatchObject([{ projectileId: 1, towerId: 1 }]);
    sim.to(100);
    expect(sim.s.projectiles[0].pos).toEqual({ x: 500, y: 1490 });
    sim.to(101);
    expect(sim.ev(101)).toMatchObject([{ type: "projectileExploded", projectileId: 1, x: 500, y: 1500 }]);
    expect(sim.s.projectiles).toEqual([]);
  });
});

describe("둔화 (frost, 14.3·14.5)", () => {
  // frost 투사체를 5000mt/틱(100000mt/s)으로 빠르게 해 명중이 발사 다음 틱(T+1)에 일어나게 하고, 주기를 길게 해 한 번만 쏘게 한다.
  const FAST_ONCE = [base(FROST, "projectileSpeedMtPerSec", 100000), base(FROST, "attackPeriodMs", 100000)];
  const slowBundle = (segments: readonly unknown[] = ONE, extra: readonly Patch[] = []): unknown => bundle(segments, [SLOW_NORMAL, ...FAST_ONCE, ...extra]);

  it("적용·속도·만료 경계: 틱 2 명중 → expireTick 42, 속도 35(=applyBp(50,7000)), 틱 41 까지 적용, 틱 42 2단계에 제거", () => {
    const sim = start(slowBundle(), [["frost", 0, 0]]).to(2);
    expect(sim.types(2)).toEqual(["enemyDamaged", "slowApplied"]);
    expect(sim.ev(2, "enemyDamaged")[0]).toMatchObject({ damage: 4, hpAfter: 96 });
    expect(sim.ev(2, "slowApplied")[0]).toMatchObject({ enemyId: 1, sourceTowerId: 1, slowBp: 3000, expireTick: 42 });
    expect(sim.s.enemies[0]).toMatchObject({ pathProgress: 85, slows: [{ sourceTowerId: 1, slowBp: 3000, expireTick: 42 }] }); // 50 + 35
    sim.to(41);
    expect(sim.s.enemies[0]).toMatchObject({ pathProgress: 1450, slows: [{ sourceTowerId: 1, slowBp: 3000, expireTick: 42 }] }); // 50 + 40×35
    sim.to(42);
    expect(sim.s.enemies[0]).toMatchObject({ pathProgress: 1500, slows: [] }); // 50 으로 복귀
  });

  it("저항 반영: controlResistance(5000bp) → 실효 slowBp = applyBp(3000, 5000) = 1500, 속도 43 → 진행도 50+43", () => {
    const sim = start(slowBundle([seg(0, 0, 1, "normal", "controlResistance")]), [["frost", 0, 0]]).to(2);
    expect(sim.ev(2, "slowApplied")[0]).toMatchObject({ slowBp: 1500, expireTick: 42 });
    expect(sim.s.enemies[0]).toMatchObject({ pathProgress: 93, slows: [{ slowBp: 1500 }] });
  });

  it("최소 속도 1: 속도 2mt/틱 적에 slowBp 9999 → applyBp(2, 1) = 0 → 1 (진행도 2, 3, 4)", () => {
    const patches = [enemy(0, "speedMtPerSec", 40), base(FROST, "slowBp", 9999), inc(FROST, 0, "slowBp", 0), inc(FROST, 1, "slowBp", 0), inc(FROST, 2, "slowBp", 0)];
    const sim = start(bundle(ONE, [...patches, ...FAST_ONCE]), [["frost", 0, 0]]);
    const progress: number[] = [];
    for (let t = 1; t <= 3; t++) progress.push(sim.to(t).s.enemies[0].pathProgress);
    expect(progress).toEqual([2, 3, 4]);
  });

  it("같은 출처 교체: 약해져도(3000 → Lv2 1500) 새 값·새 만료로 교체되고 항목은 하나", () => {
    const b = bundle(ONE, [SLOW_NORMAL, base(FROST, "projectileSpeedMtPerSec", 100000), inc(FROST, 0, "slowBp", -1500)]);
    const sim = start(b, [["frost", 0, 0]]).to(2);
    expect(sim.s.enemies[0].slows).toEqual([{ sourceTowerId: 1, slowBp: 3000, expireTick: 42 }]);
    sim.submit("upgrade", { towerId: 1 }).to(22);
    expect(sim.ev(21, "projectileFired")).toHaveLength(1);
    expect(sim.ev(22, "slowApplied")[0]).toMatchObject({ sourceTowerId: 1, slowBp: 1500, expireTick: 62 });
    expect(sim.s.enemies[0].slows).toEqual([{ sourceTowerId: 1, slowBp: 1500, expireTick: 62 }]);
  });

  it("다른 출처 공존·가장 강한 것만 적용·만료 후 다음 것: 3500(틱 42 만료) + 3000(틱 52 만료)", () => {
    // 타워 1: Lv2 로 설치 틱에 강화 → 틱 1 발사(slowBp 3500) → 틱 2 명중. 타워 2: 틱 11 설치 Lv1 → 틱 12 명중(slowBp 3000, 만료 52).
    const sim = start(slowBundle(ONE, [["stages[1].initialGold", 1000]]), []).to(0);
    sim.core.submit("build", { towerType: "frost", tile: { col: 0, row: 0 } });
    sim.core.submit("upgrade", { towerId: 1 });
    sim.to(10).submit("build", { towerType: "frost", tile: { col: 0, row: 2 } }).to(12);
    expect(sim.ev(2, "slowApplied")[0]).toMatchObject({ sourceTowerId: 1, slowBp: 3500, expireTick: 42 });
    expect(sim.ev(12, "slowApplied")[0]).toMatchObject({ sourceTowerId: 2, slowBp: 3000, expireTick: 52 });
    expect(sim.s.enemies[0].slows).toEqual([{ sourceTowerId: 1, slowBp: 3500, expireTick: 42 }, { sourceTowerId: 2, slowBp: 3000, expireTick: 52 }]);
    // 속도 = 가장 큰 3500 → applyBp(50, 6500) = 33. 50 + 40×33 = 1370 (틱 41)
    sim.to(41);
    expect(sim.s.enemies[0].pathProgress).toBe(1370);
    sim.to(42); // 3500 만료 → 3000 → 35
    expect(sim.s.enemies[0]).toMatchObject({ pathProgress: 1405, slows: [{ sourceTowerId: 2, slowBp: 3000, expireTick: 52 }] });
    sim.to(51);
    expect(sim.s.enemies[0].pathProgress).toBe(1720);
    sim.to(52);
    expect(sim.s.enemies[0]).toMatchObject({ pathProgress: 1770, slows: [] });
  });
});

// ───────── 불변식·리플레이 ─────────

function lcg(seed: number): () => number {
  let x = seed;
  return () => {
    x = (x * 48271) % 2147483647;
    return x;
  };
}

/** 혼합 시나리오 콘텐츠: 모든 타워 종류·특성 적·여러 세그먼트. 수치는 TEST_ONLY. */
const MIXED = (): unknown =>
  bundle(
    [seg(0, 600, 5, "normal"), seg(200, 800, 3, "heavy", "hpBoost"), seg(400, 300, 4, "fast", "controlResistance"), seg(0, 500, 3, "swarm")],
    [SLOW_NORMAL, enemy(2, "speedMtPerSec", 1000), enemy(1, "speedMtPerSec", 1000), enemy(3, "speedMtPerSec", 1000), ["stages[1].initialGold", 3000]],
    150,
  );

describe("14.8 불변식 — 무작위 명령(시드 고정, 시도 코어 입력만 사용)", () => {
  const types = ["archer", "ballista", "mage", "frost"] as const;
  const modes = ["first", "last", "close", "strong"] as const;
  for (const seed of [1, 7, 12345]) {
    it(`시드 ${seed}: 골드·투사체·둔화 불변식, 투사체는 정확히 하나로 끝남`, () => {
      const rnd = lcg(seed);
      const sim = new Sim(createAttempt(MIXED(), STAGE2_ID, 1));
      const checker = new InvariantChecker(sim.core.stageContent);
      for (let tick = 1; tick <= 160; tick++) {
        const n = rnd() % 3;
        for (let i = 0; i < n; i++) {
          const pick = rnd() % 6;
          const towerId = (rnd() % 6) + 1;
          if (pick <= 1) sim.submit("build", { towerType: types[rnd() % 4], tile: { col: rnd() % 18, row: rnd() % 10 } });
          else if (pick === 2) sim.submit("upgrade", { towerId });
          else if (pick === 3) sim.submit("sell", { towerId });
          else if (pick === 4) sim.submit("setTargeting", { towerId, mode: modes[rnd() % 4] });
          else if (tick === 3) sim.submit("startWave", {});
        }
        sim.to(tick);
        checker.check(tick, sim.s, sim.log[tick]);
        if (sim.core.isResult()) break;
      }
      expect(checker.firedCount).toBeGreaterThan(0);
      checker.finish(sim.core.completedTick, sim.s); // 비행 중이 아닌 투사체는 명중·폭발·취소·만료 중 정확히 하나로 끝났다
    });
  }
});

describe("전투 포함 리플레이 (7.3·7.4)", () => {
  const ATTEMPT_ID = 4;
  const END_TICK = 120;
  const commands = (towerIdForUpgrade = 1): ReplayRecord["commands"] => [
    { applyTick: 1, seq: 1, kind: "build", payload: { towerType: "archer", tile: { col: 0, row: 0 } } },
    { applyTick: 1, seq: 2, kind: "build", payload: { towerType: "mage", tile: { col: 3, row: 2 } } },
    { applyTick: 1, seq: 3, kind: "build", payload: { towerType: "frost", tile: { col: 2, row: 0 } } },
    { applyTick: 1, seq: 4, kind: "startWave", payload: {} },
    { applyTick: 10, seq: 5, kind: "upgrade", payload: { towerId: towerIdForUpgrade } },
    { applyTick: 30, seq: 6, kind: "setTargeting", payload: { towerId: 1, mode: "last" } },
    { applyTick: 50, seq: 7, kind: "build", payload: { towerType: "ballista", tile: { col: 5, row: 2 } } },
  ];
  const bundleForReplay = MIXED();
  const core0 = createAttempt(bundleForReplay, STAGE2_ID, ATTEMPT_ID);
  const record = (cmds: ReplayRecord["commands"]): ReplayRecord => ({
    formatVersion: 1,
    codeVersion: ATTEMPT_CODE_VERSION,
    contentHash: core0.contentHash,
    stageId: STAGE2_ID,
    attemptId: ATTEMPT_ID,
    initialStateHash: initialStateHashOf(core0.snapshot()),
    endTick: END_TICK,
    commands: cmds,
  });
  const expectation = { formatVersion: 1, codeVersion: ATTEMPT_CODE_VERSION, contentHash: core0.contentHash };
  const run = (cmds: ReplayRecord["commands"]) => runReplay(record(cmds), expectation, (r) => createAttempt(bundleForReplay, r.stageId, r.attemptId));

  it("새 코어 2회 실행: 틱 0..endTick 의 상태·이벤트·해시가 모두 같고 전투 이벤트·둔화·투사체가 실제로 나온다", () => {
    const a = run(commands());
    const b = run(commands());
    expect(a.ticks).toHaveLength(END_TICK + 1);
    expect(a.ticks.map((t) => t.hash)).toEqual(b.ticks.map((t) => t.hash));
    expect(firstMismatch(a, b)).toBeNull();
    const types = new Set(a.ticks.flatMap((t) => t.events.map((e) => (e as { type: string }).type)));
    for (const type of ["projectileFired", "enemyDamaged", "projectileExploded", "slowApplied"]) expect(types.has(type), type).toBe(true);
  });
  it("명령 하나를 바꾸면(틱 10 의 강화 대상 1 → 2) 첫 불일치 틱은 10", () => {
    const base = run(commands());
    expect(firstMismatch(base, run(commands(2)))?.tick).toBe(10);
  });
  it("ATTEMPT_CODE_VERSION 은 attempt-v3", () => {
    expect(ATTEMPT_CODE_VERSION).toBe("attempt-v3");
  });
});
