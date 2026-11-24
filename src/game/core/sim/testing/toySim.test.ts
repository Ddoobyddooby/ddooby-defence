// Q01, Q03, Q05~Q13, T05~T07(+준비 진입 경계), 결과 단계, 원자성. 장난감 시뮬로 계약 규칙을 확인한다.
import { describe, expect, it } from "vitest";
import { SimStateError } from "../errors";
import { createAttemptIdSource } from "../ids";
import { TOY_CONTENT, TOY_STAGE_ID, tile } from "./fixtures";
import { ToySim, type ToyContent, type ToyEvent } from "./toySim";

const M = Number.MAX_SAFE_INTEGER;
const mk = (over: Partial<ToyContent> = {}, attemptId = 1, options = {}) =>
  new ToySim({ ...TOY_CONTENT, ...over }, TOY_STAGE_ID, attemptId, options);
const build = (sim: ToySim, col: number) => sim.submit("build", { tile: tile(col) });
const sell = (sim: ToySim, towerId: number) => sim.submit("sell", { towerId });
const state = (sim: ToySim) => sim.snapshot() as {
  gold: number;
  tick: number;
  phase: string;
  towers: { id: number; tile: { col: number; row: number }; actuallyPaid: number; targeting: string }[];
  counters: Record<string, number>;
  consumedEconomyEvents: string[];
  queue: { seq: number }[];
  prepTicksRemaining: number;
  waveStartTick: number | null;
};
const types = (events: readonly ToyEvent[]) => events.map((e) => e.type);

describe("Q03: 같은 틱 build 2개 — 앞 명령까지 반영된 상태로 순차 재검증", () => {
  it("gold100/cost60: 1번 성공, 2번 insufficientGold 거부(추가 차감·타워·점유 없음)", () => {
    const sim = mk();
    const a = build(sim, 0);
    const b = build(sim, 1);
    expect([a.ok && a.command.seq, b.ok && b.command.seq]).toEqual([1, 2]);
    expect([a.ok && a.command.applyTick, b.ok && b.command.applyTick]).toEqual([1, 1]);
    const events = sim.step();
    const s = state(sim);
    expect(s.gold).toBe(40);
    expect(s.towers).toEqual([{ id: 1, tile: { col: 0, row: 0 }, actuallyPaid: 60, targeting: "first" }]);
    expect(events[0]).toMatchObject({ type: "towerBuilt", seq: 1, towerId: 1, delta: -60, goldAfter: 40, key: "a1:build:c1" });
    expect(events[1]).toMatchObject({ type: "commandRejected", seq: 2, reason: "insufficientGold" });
    expect(s.counters.nextTowerId).toBe(2); // 거부된 설치는 towerId를 쓰지 않는다 (Q05)
    expect(s.consumedEconomyEvents).toEqual(["build:c1"]);
  });
});

describe("Q05: 같은 타일 build 2개", () => {
  it("첫째 성공, 둘째 occupied 거부. gold60·타워 1개·towerId 1개만 소비", () => {
    const sim = mk({ initialGold: 120 });
    build(sim, 0);
    build(sim, 0);
    const events = sim.step();
    const s = state(sim);
    expect(events[1]).toMatchObject({ type: "commandRejected", reason: "occupied", seq: 2 });
    expect([s.gold, s.towers.length, s.counters.nextTowerId]).toEqual([60, 1, 2]);
  });
  it("격자 밖 타일은 outOfGrid 거부 (골드·타워 불변)", () => {
    const sim = mk();
    sim.submit("build", { tile: { col: 18, row: 0 } });
    sim.submit("build", { tile: { col: 0, row: 10 } });
    const events = sim.step();
    expect(events.map((e) => e.reason)).toEqual(["outOfGrid", "outOfGrid"]);
    expect([state(sim).gold, state(sim).towers.length]).toEqual([100, 0]);
  });
});

describe("Q06: 같은 틱 sell 2개", () => {
  it("첫째 환급 30·타워 제거, 둘째 towerNotFound. 원장 sell 1건, sell:t1 소비 1회", () => {
    const sim = mk();
    build(sim, 0);
    sim.step(); // tick 1: gold 40
    sell(sim, 1);
    sell(sim, 1);
    const events = sim.step();
    const s = state(sim);
    expect(events[0]).toMatchObject({ type: "towerSold", towerId: 1, delta: 30, goldAfter: 70, key: "a1:sell:t1" });
    expect(events[1]).toMatchObject({ type: "commandRejected", reason: "towerNotFound" });
    expect([s.gold, s.towers.length]).toEqual([70, 0]);
    expect(s.consumedEconomyEvents.filter((k) => k === "sell:t1")).toHaveLength(1);
    expect(sim.ledger().filter((l) => l.key === "a1:sell:t1")).toHaveLength(1);
  });
  it("환급은 실제 지출 기반 내림 한 번 (지출 60, 33% → 19)", () => {
    const sim = mk({ refundRateBp: 3333 });
    build(sim, 0);
    sim.step();
    sell(sim, 1);
    expect(sim.step()[0]).toMatchObject({ delta: 19 });
  });
});

describe("Q07: sell/build 순서에 따라 결과가 달라진다 (앞 명령 반영 상태로 재검증)", () => {
  const setup = () => {
    const sim = mk({ initialGold: 60, refundRateBp: 10000 }); // 환급 60
    build(sim, 0);
    sim.step(); // gold 0, tower1 지출 60
    return sim;
  };
  it("sell → build: 둘 다 성공, gold 0", () => {
    const sim = setup();
    sell(sim, 1);
    build(sim, 1);
    expect(types(sim.step())).toEqual(["towerSold", "towerBuilt"]);
    expect(state(sim).gold).toBe(0);
  });
  it("build → sell: build 거부(골드 0), sell 성공 gold 60", () => {
    const sim = setup();
    build(sim, 1);
    sell(sim, 1);
    const events = sim.step();
    expect(events[0]).toMatchObject({ type: "commandRejected", reason: "insufficientGold" });
    expect(events[1]).toMatchObject({ type: "towerSold" });
    expect(state(sim).gold).toBe(60);
  });
});

describe("Q08: startWave와 sell의 순서", () => {
  const setup = () => {
    const sim = mk();
    build(sim, 0);
    sim.step(); // tick 1
    return sim;
  };
  it("startWave → sell: 판매는 wrongPhase 거부(타워·골드 유지), 전투 시작 waveStartTick=2", () => {
    const sim = setup();
    sim.submit("startWave", {});
    sell(sim, 1);
    const events = sim.step();
    expect(events[0]).toMatchObject({ type: "waveStarted", trigger: "command", waveStartTick: 2 });
    expect(events[1]).toMatchObject({ type: "commandRejected", reason: "wrongPhase" });
    expect([state(sim).gold, state(sim).towers.length, state(sim).phase]).toEqual([40, 1, "combat"]);
  });
  it("sell → startWave: 유효 판매 후 전투", () => {
    const sim = setup();
    sell(sim, 1);
    sim.submit("startWave", {});
    expect(types(sim.step())).toEqual(["towerSold", "waveStarted"]);
    expect([state(sim).gold, state(sim).towers.length, state(sim).phase]).toEqual([70, 0, "combat"]);
  });
  it("전투 중 build·setTargeting은 허용, sell·startWave는 wrongPhase", () => {
    const sim = setup();
    sim.submit("startWave", {});
    sim.step();
    build(sim, 1);
    sim.submit("setTargeting", { towerId: 1, mode: "last" });
    sell(sim, 1);
    sim.submit("startWave", {});
    const events = sim.step();
    expect(types(events)).toEqual(["commandRejected", "targetingChanged", "commandRejected", "commandRejected"]);
    expect(events.map((e) => e.reason)).toEqual(["insufficientGold", undefined, "wrongPhase", "wrongPhase"]);
  });
  it("upgrade는 toy에서 unsupportedKind 거부 (seq·eventSeq 소비)", () => {
    const sim = mk();
    sim.submit("upgrade", { towerId: 1 });
    expect(sim.step()[0]).toMatchObject({ type: "commandRejected", reason: "unsupportedKind", eventSeq: 1 });
  });
});

describe("Q09: 일시정지·결과 단계", () => {
  it("pause 전 접수 명령은 큐에 보존되고, 일시정지 중 신규 접수는 seq·이벤트 없이 거부, resume 후 T1 1단계에서 한 번만 적용", () => {
    const sim = mk();
    expect(build(sim, 0).ok).toBe(true); // seq1/applyTick1
    sim.pause();
    expect(build(sim, 1)).toEqual({ ok: false, reason: "paused" });
    expect(sell(sim, 1)).toEqual({ ok: false, reason: "paused" });
    let s = state(sim);
    expect([s.gold, s.queue.map((c) => c.seq), s.counters.nextCommandSeq, s.counters.nextEventSeq]).toEqual([100, [1], 2, 1]);
    expect(() => sim.step()).toThrow(SimStateError); // 일시정지 중에는 틱이 진행되지 않는다
    expect(state(sim).tick).toBe(0);
    sim.resume();
    const events = sim.step();
    s = state(sim);
    expect(types(events)).toEqual(["towerBuilt"]);
    expect([s.gold, s.towers.length, s.queue.length, s.tick]).toEqual([40, 1, 0, 1]);
  });
  it("접수 전부터 일시정지: 즉시 거부, 카운터 불변", () => {
    const sim = mk();
    sim.pause();
    expect(sim.submit("startWave", {})).toEqual({ ok: false, reason: "paused" });
    expect(state(sim).counters.nextCommandSeq).toBe(1);
  });
  it("일시정지 전 큐의 명령은 재개 후 현재 상태로 재검증된다 (골드가 모자라면 거부)", () => {
    const sim = mk({ initialGold: 60 });
    build(sim, 0);
    build(sim, 1);
    sim.pause();
    sim.resume();
    expect(types(sim.step())).toEqual(["towerBuilt", "commandRejected"]);
  });
  it("결과 단계: 접수 즉시 거부(seq 없음), step() 오류, tick·상태·카운터 불변", () => {
    const sim = mk({ script: { resultAtTick: 2 } });
    sim.step();
    expect(sim.isResult()).toBe(false);
    const last = sim.step();
    expect(types(last)).toEqual(["resultReached"]);
    expect(sim.isResult()).toBe(true);
    expect(state(sim).tick).toBe(2);
    const before = JSON.stringify(sim.snapshot());
    expect(build(sim, 0)).toEqual({ ok: false, reason: "resultPhase" });
    expect(sim.submit("startWave", {})).toEqual({ ok: false, reason: "resultPhase" });
    expect(() => sim.step()).toThrow(SimStateError);
    expect(JSON.stringify(sim.snapshot())).toBe(before);
  });
});

describe("Q10: 경제 이벤트 정확히 한 번 (kill/waveClear 정산 모사)", () => {
  const settlements = [
    { tick: 1, attemptId: 1, key: "kill:e1", delta: 5 },
    { tick: 1, attemptId: 1, key: "kill:e1", delta: 5 },
    { tick: 1, attemptId: 1, key: "waveClear:w1", delta: 10 },
    { tick: 2, attemptId: 1, key: "waveClear:w1", delta: 10 },
    { tick: 2, attemptId: 1, key: "kill:e1", delta: 5 },
  ];
  it("같은 키를 두 번 주입해도 원장 1건·금액 1회", () => {
    const sim = mk({ script: { settlements } });
    sim.step();
    sim.step();
    expect(sim.ledger()).toEqual([
      { tick: 1, eventSeq: 1, key: "a1:kill:e1", delta: 5, goldAfter: 105 },
      { tick: 1, eventSeq: 2, key: "a1:waveClear:w1", delta: 10, goldAfter: 115 },
    ]);
    expect(state(sim).gold).toBe(115);
  });
  it("다음 시도의 같은 로컬 키는 새 시도에서 정상 정산, 이전 attempt 이벤트는 유입 차단", () => {
    const content = {
      script: {
        settlements: [
          { tick: 1, attemptId: 1, key: "kill:e1", delta: 5 },
          { tick: 1, attemptId: 2, key: "kill:e1", delta: 7 },
        ],
      },
    };
    const source = createAttemptIdSource();
    const a1 = mk(content, source.next());
    const a2 = mk(content, source.next());
    a1.step();
    a2.step();
    expect(a1.ledger().map((l) => [l.key, l.delta])).toEqual([["a1:kill:e1", 5]]);
    expect(a2.ledger().map((l) => [l.key, l.delta])).toEqual([["a2:kill:e1", 7]]);
    expect([state(a1).gold, state(a2).gold]).toEqual([105, 107]);
  });
});

describe("Q11: 모든 이벤트가 eventSeq를 소비하고, 거부는 경제 delta가 없다", () => {
  it("build → rejected → sell : eventSeq 1,2,3 / 원장은 eventSeq 1·3만", () => {
    const sim = mk();
    build(sim, 0); // 성공(gold 40)
    build(sim, 1); // gold 부족 거부
    sell(sim, 1); // 같은 틱 안에서 방금 지은 타워 판매
    const events = sim.step();
    expect(events.map((e) => [e.eventSeq, e.type])).toEqual([
      [1, "towerBuilt"],
      [2, "commandRejected"],
      [3, "towerSold"],
    ]);
    expect(sim.ledger().map((l) => [l.eventSeq, l.key, l.delta, l.goldAfter])).toEqual([
      [1, "a1:build:c1", -60, 40],
      [3, "a1:sell:t1", 30, 70],
    ]);
    expect(state(sim).counters.nextEventSeq).toBe(4);
  });
  it("원장 항목은 해당 틱 이벤트 목록에도 같은 key·delta·goldAfter로 나타난다", () => {
    const sim = mk();
    build(sim, 0);
    const events = sim.step();
    const entry = sim.ledger()[0];
    expect(events.find((e) => e.eventSeq === entry.eventSeq)).toMatchObject({
      key: entry.key,
      delta: entry.delta,
      goldAfter: entry.goldAfter,
    });
  });
});

describe("Q01: 새 시도는 카운터·큐·소비 키가 초기화된다", () => {
  it("재도전: attemptId 1→2, 첫 번호는 다시 1", () => {
    const source = createAttemptIdSource();
    const first = mk({}, source.next());
    build(first, 0);
    first.step();
    build(first, 1); // 큐에 남은 명령
    const retry = mk({}, source.next());
    const s = state(retry);
    expect((retry.snapshot() as { attemptId: number }).attemptId).toBe(2);
    expect(s.counters).toEqual({ nextCommandSeq: 1, nextEnemyId: 1, nextEventSeq: 1, nextProjectileId: 1, nextTowerId: 1 });
    expect([s.consumedEconomyEvents, s.queue, s.towers, s.gold]).toEqual([[], [], [], 100]);
    build(retry, 0);
    expect(retry.step()[0]).toMatchObject({ seq: 1, towerId: 1, eventSeq: 1, key: "a2:build:c1" });
  });
});

describe("T05~T07, 준비 타이머 경계 (SIM-CONTRACT 2.1)", () => {
  it("T05: 첫 step 전 startWave는 applyTick=1, 그 틱에 전투 전환 waveStartTick=1", () => {
    const sim = mk();
    const r = sim.submit("startWave", {});
    expect(r.ok && r.command.applyTick).toBe(1);
    const events = sim.step();
    expect(events[0]).toMatchObject({ type: "waveStarted", trigger: "command", waveStartTick: 1, tick: 1 });
    expect([state(sim).phase, state(sim).waveStartTick, state(sim).tick]).toEqual(["combat", 1, 1]);
  });
  it("T06: 시도 시작 준비 7틱 — T7에 remaining 0·전환, waveStartTick=8, 타이머 전환 이벤트는 T7에 기록", () => {
    const sim = mk({ prepMs: 350 });
    for (let t = 1; t <= 6; t += 1) {
      expect(sim.step()).toEqual([]);
      expect([state(sim).prepTicksRemaining, state(sim).phase]).toEqual([7 - t, "prep"]);
    }
    const events = sim.step();
    expect(events[0]).toMatchObject({ type: "waveStarted", trigger: "timer", waveStartTick: 8, tick: 7 });
    expect([state(sim).phase, state(sim).prepTicksRemaining, state(sim).waveStartTick]).toEqual(["combat", 0, 8]);
  });
  it("준비 N=2로 시작: T1→1, T2→0, waveStart=3", () => {
    const sim = mk({ prepMs: 100 });
    sim.step();
    expect(state(sim).prepTicksRemaining).toBe(1);
    sim.step();
    expect([state(sim).prepTicksRemaining, state(sim).phase, state(sim).waveStartTick]).toEqual([0, "combat", 3]);
  });
  it("T07: T7 remaining=1에서 startWave 2개 — 첫째만 전환(waveStartTick=7), 둘째 wrongPhase, 타이머 시작 없음", () => {
    const sim = mk({ prepMs: 350 });
    for (let t = 1; t <= 6; t += 1) sim.step();
    sim.submit("startWave", {});
    sim.submit("startWave", {});
    const events = sim.step();
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ type: "waveStarted", trigger: "command", waveStartTick: 7, seq: 1 });
    expect(events[1]).toMatchObject({ type: "commandRejected", reason: "wrongPhase", seq: 2 });
    expect([state(sim).waveStartTick, state(sim).prepTicksRemaining]).toEqual([7, 0]);
  });
  it("준비 진입 경계: 전투 T10 8단계에서 N=2 진입 — T10 remaining 2, T11 1, T12 0/전환, waveStart=13", () => {
    const sim = mk({ prepMs: 100, script: { reenterPrepAtTick: 10 } });
    sim.submit("startWave", {});
    sim.step(); // T1 조기 시작
    for (let t = 2; t <= 9; t += 1) expect(sim.step()).toEqual([]);
    expect(types(sim.step())).toEqual(["prepEntered"]); // T10
    expect([state(sim).prepTicksRemaining, state(sim).phase, state(sim).waveStartTick]).toEqual([2, "prep", null]);
    sim.step(); // T11
    expect(state(sim).prepTicksRemaining).toBe(1);
    const events = sim.step(); // T12
    expect(events[0]).toMatchObject({ type: "waveStarted", trigger: "timer", waveStartTick: 13 });
    expect([state(sim).prepTicksRemaining, state(sim).phase, state(sim).waveStartTick]).toEqual([0, "combat", 13]);
  });
});

describe("Q12: 카운터 한계에서 원자성 (부분 변경 없음)", () => {
  const frozenView = (sim: ToySim) => JSON.stringify([sim.snapshot(), sim.ledger()]);

  it("nextCommandSeq=M: 접수가 RangeError, 큐·카운터 불변", () => {
    const sim = mk({}, 1, { initialCounters: { nextCommandSeq: M } });
    const before = frozenView(sim);
    expect(() => build(sim, 0)).toThrow(RangeError);
    expect(frozenView(sim)).toBe(before);
  });
  it("nextTowerId=M: step이 오류로 끝나도 골드·타워·큐·원장·tick 모두 그대로, 명령은 큐에 남는다", () => {
    const sim = mk({}, 1, { initialCounters: { nextTowerId: M } });
    build(sim, 0);
    const before = frozenView(sim);
    expect(() => sim.step()).toThrow(RangeError);
    expect(frozenView(sim)).toBe(before);
    expect(state(sim).queue).toHaveLength(1);
    expect([state(sim).gold, state(sim).tick, sim.ledger().length]).toEqual([100, 0, 0]);
  });
  it("nextEventSeq=M: 타워 ID를 쓴 뒤 이벤트에서 실패해도 되돌려진다", () => {
    const sim = mk({}, 1, { initialCounters: { nextEventSeq: M } });
    build(sim, 0);
    const before = frozenView(sim);
    expect(() => sim.step()).toThrow(RangeError);
    expect(frozenView(sim)).toBe(before);
    expect(state(sim).counters.nextTowerId).toBe(1);
  });
  it("앞선 명령이 성공한 뒤 뒤 명령에서 실패해도 앞 명령의 효과까지 모두 되돌려진다", () => {
    // 첫 build는 이벤트 번호 M−1을 쓰고, 둘째 거부 이벤트에서 eventSeq가 한계(M)에 걸린다.
    const sim = mk({}, 1, { initialCounters: { nextEventSeq: M - 1 } });
    build(sim, 0);
    build(sim, 1);
    const before = frozenView(sim);
    expect(() => sim.step()).toThrow(RangeError);
    expect(frozenView(sim)).toBe(before);
    expect(state(sim).gold).toBe(100);
  });
});

describe("I2: 콘텐츠 깊은 사본 소유", () => {
  it("생성·접수 뒤 원본 content(중첩 settlement 포함)를 바꿔도 상태·이벤트 불변", () => {
    const content = {
      ...TOY_CONTENT,
      script: { settlements: [{ tick: 1, attemptId: 1, key: "kill:e1", delta: 5 }] },
    };
    const sim = new ToySim(content, TOY_STAGE_ID, 1);
    build(sim, 0);
    (content as { buildCost: number }).buildCost = 1;
    (content as { refundRateBp: number }).refundRateBp = 10000;
    content.script.settlements[0].delta = 999;
    content.script.settlements.push({ tick: 1, attemptId: 1, key: "kill:e2", delta: 50 });
    const events = sim.step();
    expect(events[0]).toMatchObject({ type: "towerBuilt", delta: -60 });
    expect(state(sim).gold).toBe(45); // 100 - 60 + 5
    expect(state(sim).towers[0].actuallyPaid).toBe(60);
    sell(sim, 1);
    expect(sim.step()[0]).toMatchObject({ delta: 30 });
    expect(Object.isFrozen(content)).toBe(false);
  });
});

describe("기타", () => {
  it("setTargeting 성공 이벤트와 상태 반영", () => {
    const sim = mk();
    build(sim, 0);
    sim.step();
    sim.submit("setTargeting", { towerId: 1, mode: "strong" });
    expect(sim.step()[0]).toMatchObject({ type: "targetingChanged", towerId: 1, mode: "strong" });
    expect(state(sim).towers[0].targeting).toBe("strong");
  });
  it("snapshot()은 독립 복사본이다 (변경해도 시뮬레이션에 영향 없음)", () => {
    const sim = mk();
    const snap = sim.snapshot() as { gold: number };
    snap.gold = 9999;
    expect(state(sim).gold).toBe(100);
  });
  it("L04: 소수 콘텐츠 값은 시도 시작 전에 거부된다", () => {
    expect(() => mk({ initialGold: 0.5 })).toThrow(TypeError);
    expect(() => mk({ prepMs: 75 })).toThrow(RangeError);
    expect(() => mk({ prepMs: 0 })).toThrow(RangeError);
    expect(() => mk({ refundRateBp: 10001 })).toThrow(RangeError);
  });
  it("타워 ID는 판매 후에도 재사용되지 않는다", () => {
    const sim = mk({ initialGold: 1000 });
    build(sim, 0);
    sim.step();
    sell(sim, 1);
    build(sim, 0);
    sim.step();
    expect(state(sim).towers.map((t) => t.id)).toEqual([2]);
    expect(state(sim).counters.nextTowerId).toBe(3);
  });
});
