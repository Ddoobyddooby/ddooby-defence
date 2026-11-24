// SIM-01 — 기대값은 손 계산한 틱 추적 리터럴이다(제품 함수로 기대값을 만들지 않는다).
// 공통 시나리오(스테이지 2, pathLengthMt 36000, initialGold 350, baseHp 25):
//   normal: 100000mt/s = 5000mt/틱 → 생성 틱 s 에 첫 이동, 8번째 이동(틱 s+7)에서 40000 ≥ 36000 으로 기지 도달.
//   fast: 2000mt/s = 100mt/틱, hp 60, killReward 6 / hpBoost 특성(+5000bp): maxHp 90, killRewardBonus 2.
//   prepMs 150 = 3틱, 100ms = 2틱.
import { describe, expect, it } from "vitest";
import { createAttempt, AttemptCreateError, ATTEMPT_CODE_VERSION } from "./attempt";
import { killAt } from "./testing/inject";
import { STAGE1_ID, STAGE2_ID, seg, stage2Bundle, uniformStage2, validBundle, withValue } from "./testing/bundles";
import { SimStateError } from "../sim/errors";

const ONE_NORMAL = { prepMs: 150, clearReward: 20, segments: [seg(0, 0, 1)] };
const types = (events: readonly Record<string, unknown>[]): unknown[] => events.map((e) => e.type);

describe("초기 상태·생성(12.1)", () => {
  it("스냅샷 0 리터럴", () => {
    const core = createAttempt(uniformStage2(ONE_NORMAL), STAGE2_ID, 7);
    expect(core.completedTick).toBe(0);
    expect(core.snapshot()).toEqual({
      attemptId: 7,
      baseHp: 25,
      consumedEconomyEvents: [],
      counters: { nextCommandSeq: 1, nextEnemyId: 1, nextEventSeq: 1, nextProjectileId: 1, nextTowerId: 1 },
      enemies: [],
      gold: 350,
      outcome: null,
      paused: false,
      phase: "preparation",
      prepTicksRemaining: 3,
      queue: [],
      stageId: "stage-2-snowfall-pass",
      tick: 0,
      towers: [],
      waveIndex: 1,
      waveSpawnCursor: 0,
      waveStartTick: null,
    });
    expect(core.isResult()).toBe(false);
    expect(core.contentHash).toMatch(/^[0-9a-f]{16}$/);
  });
  it("진입 재검증 실패 시 생성 불가(전역 오류·그 스테이지 오류·없는 stageId), 다른 정상 스테이지는 생성 가능", () => {
    const badStage2 = withValue("stages[1].baseHp", 0);
    expect(() => createAttempt(badStage2, STAGE2_ID, 1)).toThrow(AttemptCreateError);
    expect(createAttempt(badStage2, STAGE1_ID, 1).snapshot().stageId).toBe(STAGE1_ID);
    const badGlobal = withValue("economy.refundRateBp", 10001);
    for (const id of [STAGE1_ID, STAGE2_ID]) expect(() => createAttempt(badGlobal, id, 1)).toThrow(AttemptCreateError);
    expect(() => createAttempt(validBundle(), "nope", 1)).toThrow(AttemptCreateError);
    try {
      createAttempt(badStage2, STAGE2_ID, 1);
    } catch (e) {
      expect((e as AttemptCreateError).errors.map((x) => x.path)).toEqual(["stages[1].baseHp"]);
    }
  });
  it("attemptId 는 1 이상 안전 정수", () => {
    for (const id of [0, -1]) expect(() => createAttempt(validBundle(), STAGE1_ID, id)).toThrow(RangeError);
    for (const id of [1.5, Number.NaN, "1"]) expect(() => createAttempt(validBundle(), STAGE1_ID, id as number)).toThrow(TypeError);
  });
  it("시도는 콘텐츠 사본만 읽는다(원본을 바꿔도 영향 없음)", () => {
    const bundle = uniformStage2(ONE_NORMAL) as { stages: { initialGold: number }[] };
    const core = createAttempt(bundle, STAGE2_ID, 1);
    bundle.stages[1].initialGold = 1;
    expect(core.snapshot().gold).toBe(350);
    expect(Object.isFrozen(core.stageContent)).toBe(true);
  });
});

describe("준비 타이머·웨이브 시작(2.1·12.2)", () => {
  it("자연 만료: 준비 3틱 → 틱 1..3 감소, 틱 4 1단계에 waveStarted{timer}, waveStartTick 4", () => {
    const core = createAttempt(uniformStage2(ONE_NORMAL), STAGE2_ID, 1);
    const remaining: unknown[] = [];
    for (let t = 1; t <= 3; t++) {
      expect(core.step()).toEqual([]);
      remaining.push([core.snapshot().phase, core.snapshot().prepTicksRemaining]);
    }
    expect(remaining).toEqual([["preparation", 2], ["preparation", 1], ["preparation", 0]]);
    expect(core.snapshot().waveStartTick).toBe(null);
    const ev = core.step();
    expect(core.snapshot()).toMatchObject({ tick: 4, phase: "combat", waveStartTick: 4, waveIndex: 1 });
    expect(ev[0]).toEqual({ eventSeq: 1, tick: 4, type: "waveStarted", trigger: "timer", waveIndex: 1, waveStartTick: 4 });
    expect(ev[1]).toMatchObject({ eventSeq: 2, tick: 4, type: "enemySpawned", enemyId: 1 }); // startMs 0 → waveStartTick 틱에 생성
  });
  it("조기 시작: 틱 1 에 적용되면 waveStartTick 1(타이머 소비 없음), 조기 시작 보너스 없음", () => {
    const core = createAttempt(uniformStage2(ONE_NORMAL), STAGE2_ID, 1);
    expect(core.submit("startWave", {})).toMatchObject({ ok: true, command: { seq: 1, applyTick: 1 } });
    const ev = core.step();
    expect(ev[0]).toEqual({ eventSeq: 1, tick: 1, type: "waveStarted", trigger: "command", seq: 1, waveIndex: 1, waveStartTick: 1 });
    expect(core.snapshot()).toMatchObject({ phase: "combat", waveStartTick: 1, prepTicksRemaining: 0, gold: 350 });
  });
  it("준비 중 한 틱 지난 뒤 조기 시작: waveStartTick 2", () => {
    const core = createAttempt(uniformStage2(ONE_NORMAL), STAGE2_ID, 1);
    core.step();
    core.submit("startWave", {});
    const ev = core.step();
    expect(ev[0]).toMatchObject({ type: "waveStarted", trigger: "command", waveStartTick: 2 });
  });
  it("전투 중 startWave → wrongPhase 거부(seq·eventSeq 소비, 상태 불변)", () => {
    const core = createAttempt(uniformStage2({ ...ONE_NORMAL, segments: [seg(0, 0, 1, "fast")] }), STAGE2_ID, 1);
    core.submit("startWave", {});
    core.step(); // 틱 1: 전투 시작 + 적 생성
    core.submit("startWave", {});
    const before = core.snapshot();
    const ev = core.step();
    expect(ev[0]).toEqual({ eventSeq: 3, tick: 2, type: "commandRejected", kind: "startWave", reason: "wrongPhase", seq: 2 });
    expect(core.snapshot()).toMatchObject({ phase: "combat", waveStartTick: 1, waveIndex: 1 });
    expect(core.snapshot().counters).toMatchObject({ nextCommandSeq: 3 });
    expect(before.waveStartTick).toBe(1);
  });
  it("같은 틱에 startWave 두 개: 첫째 성공, 둘째 wrongPhase", () => {
    const core = createAttempt(uniformStage2(ONE_NORMAL), STAGE2_ID, 1);
    core.submit("startWave", {});
    core.submit("startWave", {});
    const ev = core.step();
    expect(types(ev).slice(0, 2)).toEqual(["waveStarted", "commandRejected"]);
    expect(ev[1]).toMatchObject({ reason: "wrongPhase", seq: 2 });
  });
  it("타이머가 0 이 된 다음 틱의 startWave 는 이미 전투(타이머 시작이 1단계 명령보다 먼저) → wrongPhase", () => {
    const core = createAttempt(uniformStage2(ONE_NORMAL), STAGE2_ID, 1);
    core.step();
    core.step();
    core.step(); // 틱 3 에서 prepTicksRemaining 0
    core.submit("startWave", {}); // applyTick 4
    const ev = core.step();
    expect(ev[0]).toMatchObject({ type: "waveStarted", trigger: "timer", waveStartTick: 4 });
    expect(ev.find((e) => e.type === "commandRejected")).toMatchObject({ reason: "wrongPhase", seq: 1 });
  });
  it("웨이브 사이 중첩 없음: 웨이브 1 완료 후 준비(3틱)를 거친 틱 N+4 에 웨이브 2 시작", () => {
    const core = createAttempt(uniformStage2(ONE_NORMAL), STAGE2_ID, 1);
    core.submit("startWave", {});
    for (let t = 1; t <= 8; t++) core.step(); // 틱 8 에 웨이브 1 완료 + prepEntered
    expect(core.snapshot()).toMatchObject({ tick: 8, phase: "preparation", waveIndex: 2, prepTicksRemaining: 3, waveStartTick: null });
    const starts: unknown[] = [];
    for (let t = 9; t <= 12; t++) {
      const ev = core.step();
      starts.push(ev.filter((e) => e.type === "waveStarted").map((e) => [e.tick, e.waveStartTick, e.waveIndex]));
    }
    expect(starts).toEqual([[], [], [], [[12, 12, 2]]]); // 진입 틱 8 은 소비 안 함: 9,10,11 감소 → 틱 12 시작
  });
});

describe("생성(12.3 단계 3)", () => {
  // 웨이브 1: seg0 = normal ×2 (start 0, interval 100ms=2틱), seg1 = fast + hpBoost ×1 (start 100ms=2틱). 조기 시작 → waveStartTick 1.
  const spec = { prepMs: 150, clearReward: 20, segments: [seg(0, 100, 2, "normal", null), seg(100, 0, 1, "fast", "hpBoost")] };
  it("일정대로 생성: 틱 1 에 id1, 틱 3 에 (seg0 순번1 → id2, seg1 → id3) 순서, 특성 반영 maxHp·speed·killReward", () => {
    const core = createAttempt(uniformStage2(spec), STAGE2_ID, 1);
    core.submit("startWave", {});
    const e1 = core.step();
    expect(e1.filter((e) => e.type === "enemySpawned")).toEqual([
      { eventSeq: 2, tick: 1, type: "enemySpawned", enemyId: 1, enemyType: "normal", maxHp: 100, segmentIndex: 0, speedPerTick: 5000, trait: null },
    ]);
    const e2 = core.step();
    expect(e2).toEqual([]);
    const e3 = core.step();
    expect(e3).toEqual([
      { eventSeq: 3, tick: 3, type: "enemySpawned", enemyId: 2, enemyType: "normal", maxHp: 100, segmentIndex: 0, speedPerTick: 5000, trait: null },
      { eventSeq: 4, tick: 3, type: "enemySpawned", enemyId: 3, enemyType: "fast", maxHp: 90, segmentIndex: 1, speedPerTick: 100, trait: "hpBoost" },
    ]);
    const enemies = core.snapshot().enemies;
    expect(enemies).toEqual([
      { id: 1, enemyType: "normal", trait: null, hp: 100, maxHp: 100, speedPerTick: 5000, pathProgress: 15000, baseDamage: 1, killReward: 5 },
      { id: 2, enemyType: "normal", trait: null, hp: 100, maxHp: 100, speedPerTick: 5000, pathProgress: 5000, baseDamage: 1, killReward: 5 },
      { id: 3, enemyType: "fast", trait: "hpBoost", hp: 90, maxHp: 90, speedPerTick: 100, pathProgress: 100, baseDamage: 1, killReward: 8 },
    ]);
    expect(core.snapshot().counters).toMatchObject({ nextEnemyId: 4, nextEventSeq: 5 });
  });
  it("속도 강화 특성: normal 5000 → applyBp(5000, 13000) = 6500, 처치 보상 5+2", () => {
    const b = uniformStage2({ ...ONE_NORMAL, segments: [seg(0, 0, 1, "normal", "speedBoost")] });
    const core = createAttempt(b, STAGE2_ID, 1);
    core.submit("startWave", {});
    core.step();
    expect(core.snapshot().enemies).toEqual([
      { id: 1, enemyType: "normal", trait: "speedBoost", hp: 100, maxHp: 100, speedPerTick: 6500, pathProgress: 6500, baseDamage: 1, killReward: 7 },
    ]);
  });
});

describe("이동·기지 도달(12.3 단계 6)", () => {
  it("진행도 증가, 틱 8 에 기지 도달(7번 이동 35000 < 36000 ≤ 8번 40000), baseHp 감소, 처치 골드 없음", () => {
    const core = createAttempt(uniformStage2(ONE_NORMAL), STAGE2_ID, 1);
    core.submit("startWave", {});
    const progress: unknown[] = [];
    for (let t = 1; t <= 7; t++) {
      core.step();
      progress.push((core.snapshot().enemies as { pathProgress: number }[])[0].pathProgress);
    }
    expect(progress).toEqual([5000, 10000, 15000, 20000, 25000, 30000, 35000]);
    expect(core.snapshot()).toMatchObject({ baseHp: 25, gold: 350 });
    const ev = core.step();
    expect(ev[0]).toEqual({ eventSeq: 3, tick: 8, type: "enemyReachedBase", baseDamage: 1, baseHpAfter: 24, enemyId: 1 });
    expect(core.snapshot()).toMatchObject({ baseHp: 24, enemies: [] });
    // 처치 골드 없음, 웨이브 완료 보상 20 만 지급
    expect(core.snapshot().gold).toBe(370);
    expect(core.snapshot().consumedEconomyEvents).toEqual(["waveClear:w1"]);
  });
  it("경계: pathProgress 가 경로 길이와 정확히 같으면 도달(≥) — 4000mt/틱, 9번째 이동 36000", () => {
    const core = createAttempt(withValue("enemies[0].speedMtPerSec", 80_000, uniformStage2(ONE_NORMAL)), STAGE2_ID, 1);
    core.submit("startWave", {});
    for (let t = 1; t <= 8; t++) core.step();
    expect(core.snapshot().enemies).toEqual([
      { id: 1, enemyType: "normal", trait: null, hp: 100, maxHp: 100, speedPerTick: 4000, pathProgress: 32000, baseDamage: 1, killReward: 5 },
    ]);
    const ev = core.step();
    expect(ev[0]).toMatchObject({ type: "enemyReachedBase", enemyId: 1, baseHpAfter: 24, tick: 9 });
  });
  it("기지 HP 는 0 에서 멈춘다(음수 없음)", () => {
    const core = createAttempt(uniformStage2(ONE_NORMAL, { normalDamage: 30 }), STAGE2_ID, 1);
    core.submit("startWave", {});
    for (let t = 1; t <= 8; t++) core.step();
    expect(core.snapshot()).toMatchObject({ baseHp: 0, phase: "defeat", outcome: "defeat" });
  });
});

describe("처치·골드(단계 4~5)", () => {
  it("TEST_ONLY 주입 처치: kill 골드 정확히 한 번(같은 적을 두 번 주입해도 1회), 특성 보너스 합산", () => {
    // 웨이브 1: fast + hpBoost 한 마리(killReward 6 + 2 = 8). 틱 1 생성, 틱 2 에 중복 주입으로 처치.
    const b = uniformStage2({ ...ONE_NORMAL, segments: [seg(0, 0, 1, "fast", "hpBoost")] });
    const core = createAttempt(b, STAGE2_ID, 1, killAt({ tick: 2, enemyId: 1 }, { tick: 2, enemyId: 1 }));
    core.submit("startWave", {});
    core.step();
    expect(core.snapshot().gold).toBe(350);
    const ev = core.step();
    expect(ev.filter((e) => e.enemyId === 1)).toEqual([
      { eventSeq: 3, tick: 2, type: "enemyKilled", enemyId: 1, reward: 8 },
      { eventSeq: 4, tick: 2, type: "economySettled", enemyId: 1, delta: 8, goldAfter: 358, key: "a1:kill:e1" },
    ]);
    // 이어서 웨이브 완료(같은 틱 7단계): 보상 20
    expect(core.snapshot()).toMatchObject({ gold: 378, enemies: [], waveIndex: 2, phase: "preparation" });
    expect(core.snapshot().consumedEconomyEvents).toEqual(["kill:e1", "waveClear:w1"]);
    expect(core.ledger().map((l) => [l.key, l.delta, l.goldAfter])).toEqual([["a1:kill:e1", 8, 358], ["a1:waveClear:w1", 20, 378]]);
  });
});

describe("동시 사건(12.3 단계 5~7, 패배 우선)", () => {
  it("(a) 같은 틱 기지 파괴 + 웨이브 완료 → defeat, 완료 보상 없음", () => {
    const core = createAttempt(uniformStage2(ONE_NORMAL, { normalDamage: 25 }), STAGE2_ID, 1);
    core.submit("startWave", {});
    for (let t = 1; t <= 7; t++) core.step();
    const ev = core.step();
    expect(types(ev)).toEqual(["enemyReachedBase", "resultReached"]);
    expect(ev[1]).toMatchObject({ outcome: "defeat" });
    expect(core.snapshot()).toMatchObject({ phase: "defeat", outcome: "defeat", baseHp: 0, gold: 350, consumedEconomyEvents: [] });
  });
  it("(b) 같은 틱 마지막 적 처치 + 다른 적 기지 도달로 baseHp 0 → defeat (처치 골드는 5단계라 지급됨)", () => {
    // seg0 normal(damage 25) 틱 1 생성 → 틱 8 도달. seg1 fast 틱 3 생성(start 100ms) → 틱 8 에 주입 처치(id 2).
    const spec = { prepMs: 150, clearReward: 20, segments: [seg(0, 0, 1, "normal", null), seg(100, 0, 1, "fast", null)] };
    const core = createAttempt(uniformStage2(spec, { normalDamage: 25 }), STAGE2_ID, 1, killAt({ tick: 8, enemyId: 2 }));
    core.submit("startWave", {});
    for (let t = 1; t <= 7; t++) core.step();
    expect(core.snapshot().enemies).toHaveLength(2);
    const ev = core.step();
    expect(types(ev)).toEqual(["enemyKilled", "economySettled", "enemyReachedBase", "resultReached"]);
    expect(core.snapshot()).toMatchObject({ phase: "defeat", baseHp: 0, gold: 356, enemies: [] });
    expect(core.snapshot().consumedEconomyEvents).toEqual(["kill:e2"]);
  });
  it("(c) 마지막 웨이브 정상 완료 → 보상 1회 후 victory (5개 웨이브, 틱 8·18·28·38·48)", () => {
    const waves = [10, 20, 30, 40, 50].map((r) => ({ prepMs: 100, clearReward: r, segments: [seg(0, 0, 1)] }));
    const core = createAttempt(stage2Bundle(waves), STAGE2_ID, 1);
    core.submit("startWave", {});
    const clearTicks: number[] = [];
    let last: ReturnType<typeof core.step> = [];
    for (let t = 1; t <= 48; t++) {
      last = core.step();
      if (last.some((e) => e.type === "waveCleared")) clearTicks.push(t);
      if (t === 8 || t === 18 || t === 28 || t === 38) expect(core.phase).toBe("preparation");
    }
    // 웨이브 2 는 틱 8 진입 + 준비 2틱(9,10) → 틱 11 시작, 8번째 이동 틱 18 에 도달 …
    expect(clearTicks).toEqual([8, 18, 28, 38, 48]);
    expect(types(last)).toEqual(["enemyReachedBase", "economySettled", "waveCleared", "resultReached"]);
    expect(last[1]).toMatchObject({ key: "a1:waveClear:w5", delta: 50, goldAfter: 500 });
    expect(last[3]).toMatchObject({ outcome: "victory" });
    expect(core.snapshot()).toMatchObject({ phase: "victory", outcome: "victory", gold: 500, baseHp: 20, waveIndex: 5, tick: 48 });
    expect(core.snapshot().consumedEconomyEvents).toEqual(["waveClear:w1", "waveClear:w2", "waveClear:w3", "waveClear:w4", "waveClear:w5"]);
    expect(core.isResult()).toBe(true);
  });
  it("(d) 같은 틱 생성된 적이 4단계 주입으로 같은 틱에 처치됨", () => {
    const core = createAttempt(uniformStage2(ONE_NORMAL), STAGE2_ID, 1, killAt({ tick: 1, enemyId: 1 }));
    core.submit("startWave", {});
    const ev = core.step();
    expect(types(ev)).toEqual(["waveStarted", "enemySpawned", "enemyKilled", "economySettled", "economySettled", "waveCleared", "prepEntered"]);
    expect(core.snapshot()).toMatchObject({ gold: 375, enemies: [], waveIndex: 2, tick: 1 });
  });
  it("(e) 1단계 명령은 같은 틱 처치·완료 골드를 쓸 수 없다(archer 비용 360: 틱 1 골드 350 → 거부, 틱 2 골드 375 → 성공)", () => {
    const core = createAttempt(withValue("towers[0].buildCost", 360, uniformStage2(ONE_NORMAL)), STAGE2_ID, 1, killAt({ tick: 1, enemyId: 1 }));
    core.submit("startWave", {});
    core.submit("build", { towerType: "archer", tile: { col: 0, row: 0 } });
    const ev = core.step();
    expect(ev.find((e) => e.type === "commandRejected")).toMatchObject({ kind: "build", reason: "insufficientGold", seq: 2 });
    expect(core.snapshot()).toMatchObject({ gold: 375, towers: [] });
    core.submit("build", { towerType: "archer", tile: { col: 0, row: 0 } });
    const ev2 = core.step();
    expect(ev2.find((e) => e.type === "economySettled")).toMatchObject({ delta: -360, goldAfter: 15, key: "a1:build:c3" });
    expect(core.snapshot().towers).toHaveLength(1);
  });
});

describe("확장 지점(12.4)", () => {
  it("단계 순서: 둔화 만료 → (생성) → 발사 → 이동속도 질의, 4단계는 같은 틱 생성 적을 본다", () => {
    const log: string[] = [];
    const hooks = {
      expireSlows: (ctx: { enemies: readonly unknown[] }) => {
        log.push(`slow:${ctx.enemies.length}`);
        return undefined;
      },
      fire: (ctx: { enemies: readonly unknown[] }) => {
        log.push(`fire:${ctx.enemies.length}`);
        return undefined;
      },
      enemySpeed: () => {
        log.push("speed");
        return 5000;
      },
    };
    const core = createAttempt(uniformStage2(ONE_NORMAL), STAGE2_ID, 1, hooks);
    core.submit("startWave", {});
    core.step();
    expect(log).toEqual(["slow:0", "fire:1", "speed"]);
  });
  it("enemySpeed 훅: 반으로 줄이면 도달이 늦어진다(2500/틱 → 15번째 이동 37500 ≥ 36000, 틱 15)", () => {
    const core = createAttempt(uniformStage2(ONE_NORMAL), STAGE2_ID, 1, { enemySpeed: () => 2500 });
    core.submit("startWave", {});
    for (let t = 1; t <= 14; t++) core.step();
    expect(core.snapshot().enemies).toHaveLength(1);
    const ev = core.step();
    expect(ev.some((e) => e.type === "enemyReachedBase")).toBe(true);
    expect(() => createAttempt(uniformStage2(ONE_NORMAL), STAGE2_ID, 1, { enemySpeed: () => 0 }).step()).not.toThrow(); // 전투 전에는 질의 안 함
  });
  it("훅 오류 시 step() 은 원자적: 상태·큐·completedTick 불변", () => {
    const core = createAttempt(uniformStage2(ONE_NORMAL), STAGE2_ID, 1, {
      fire: (ctx) => {
        ctx.damage(99, 1);
        return undefined;
      },
    });
    core.submit("startWave", {});
    const before = core.snapshot();
    expect(() => core.step()).toThrow(RangeError);
    expect(core.completedTick).toBe(0);
    expect(core.snapshot()).toEqual(before);
    expect(core.snapshot().queue).toHaveLength(1);
  });
});

describe("결과·일시정지", () => {
  function victoryCore() {
    const core = createAttempt(uniformStage2({ prepMs: 100, clearReward: 10, segments: [seg(0, 0, 1)] }, { normalDamage: 25 }), STAGE2_ID, 1);
    core.submit("startWave", {});
    for (let t = 1; t <= 8; t++) core.step();
    return core; // 틱 8 에 defeat
  }
  it("결과 후 step() 오류·상태 불변, 명령은 접수 즉시 거부(seq 미소비), pause() 오류", () => {
    const core = victoryCore();
    expect(core.phase).toBe("defeat");
    const before = core.snapshot();
    expect(() => core.step()).toThrow(SimStateError);
    expect(core.completedTick).toBe(8);
    expect(core.submit("startWave", {})).toEqual({ ok: false, reason: "resultPhase" });
    expect(() => core.pause()).toThrow(SimStateError);
    expect(core.snapshot()).toEqual(before);
  });
  it("일시정지 중 step() 오류, 새 명령은 즉시 거부, 일시정지 전 접수 명령은 보존되어 resume 후 적용", () => {
    const core = createAttempt(uniformStage2(ONE_NORMAL), STAGE2_ID, 1);
    expect(core.submit("startWave", {})).toMatchObject({ ok: true });
    core.pause();
    expect(core.snapshot()).toMatchObject({ paused: true, tick: 0 });
    expect(() => core.step()).toThrow(SimStateError);
    expect(core.submit("startWave", {})).toEqual({ ok: false, reason: "paused" });
    expect(core.snapshot().queue).toEqual([{ applyTick: 1, kind: "startWave", payload: {}, seq: 1 }]);
    expect(core.snapshot().counters).toMatchObject({ nextCommandSeq: 2 });
    core.resume();
    const ev = core.step();
    expect(ev[0]).toMatchObject({ type: "waveStarted", trigger: "command", seq: 1, waveStartTick: 1 });
    expect(core.snapshot().queue).toEqual([]);
  });
});

describe("재도전", () => {
  it("진행된 시도와 새 시도의 스냅샷 0 이 attemptId 를 빼고 같고, 이전 시도 상태가 유입되지 않는다", () => {
    const bundle = uniformStage2(ONE_NORMAL);
    const first = createAttempt(bundle, STAGE2_ID, 1, killAt({ tick: 2, enemyId: 1 }));
    first.submit("startWave", {});
    for (let t = 1; t <= 5; t++) first.step();
    expect(first.snapshot()).toMatchObject({ gold: 375, waveIndex: 2 });
    const retry = createAttempt(bundle, STAGE2_ID, 2);
    const fresh = createAttempt(bundle, STAGE2_ID, 2);
    expect(retry.snapshot()).toEqual(fresh.snapshot());
    const { attemptId: a, ...rest } = retry.snapshot();
    const { attemptId: b, ...rest0 } = createAttempt(bundle, STAGE2_ID, 1).snapshot();
    expect([a, b]).toEqual([2, 1]);
    expect(rest).toEqual(rest0);
    expect(retry.snapshot().counters).toEqual({ nextCommandSeq: 1, nextEnemyId: 1, nextEventSeq: 1, nextProjectileId: 1, nextTowerId: 1 });
    expect(retry.ledger()).toEqual([]);
    // 새 시도 진행이 이전 시도에 영향 없음
    const frozen = first.snapshot();
    retry.submit("startWave", {});
    retry.step();
    expect(first.snapshot()).toEqual(frozen);
  });
});

describe("코드 버전", () => {
  it("ATTEMPT_CODE_VERSION 은 리플레이 호환성 검사에 쓰는 고정 문자열", () => {
    expect(ATTEMPT_CODE_VERSION).toBe("attempt-v2");
  });
});
