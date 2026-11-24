// R01~R09 (+S08 diagnostics, Q14 일부). 7.1 toy 기록을 새 코어로 실행해 틱 0..endTick 전부의 상태·이벤트·해시를 비교한다.
// golden 문자열은 전략 문서 7.1 표와 손으로 대조했고, 해시는 별도 Python 정수 산술로 산출해 체크인한 값이다.
import { describe, expect, it } from "vitest";
import { contentHashOf } from "./hash";
import {
  ReplayCompatibilityError,
  ReplayEndMismatchError,
  ReplayInitialStateError,
  ReplayStructureError,
  firstMismatch,
  initialStateHashOf,
  runReplay,
  validateReplayRecord,
  type ReplayCore,
  type ReplayExpectation,
  type ReplayRecord,
  type ReplayTrace,
} from "./replay";
import { TOY_CONTENT, TOY_STAGE_ID } from "./testing/fixtures";
import { TOY_CODE_VERSION, ToySim, type ToyContent, type ToyOptions } from "./testing/toySim";

const CONTENT_CANONICAL = '{"buildCost":60,"contentVersion":"test-content-v1","initialGold":100,"prepMs":2000,"refundRateBp":5000}';
const CONTENT_HASH = "192d287075d5cc78";
const EXPECT: ReplayExpectation = { formatVersion: 1, codeVersion: TOY_CODE_VERSION, contentHash: CONTENT_HASH };

/** 7.1 golden: [정규 envelope, FNV-1a 64]. 틱 0..4. */
const GOLDEN: [string, string][] = [
  [
    '{"events":[],"state":{"attemptId":1,"consumedEconomyEvents":[],"counters":{"nextCommandSeq":1,"nextEnemyId":1,"nextEventSeq":1,"nextProjectileId":1,"nextTowerId":1},"gold":100,"outcome":null,"paused":false,"phase":"prep","prepTicksRemaining":40,"queue":[],"stageId":"stage-test","tick":0,"towers":[],"waveStartTick":null}}',
    "b6435deadbb45635",
  ],
  [
    '{"events":[{"delta":-60,"eventSeq":1,"goldAfter":40,"key":"a1:build:c1","seq":1,"tick":1,"tile":{"col":0,"row":0},"towerId":1,"type":"towerBuilt"},{"eventSeq":2,"kind":"build","reason":"insufficientGold","seq":2,"tick":1,"type":"commandRejected"}],"state":{"attemptId":1,"consumedEconomyEvents":["build:c1"],"counters":{"nextCommandSeq":3,"nextEnemyId":1,"nextEventSeq":3,"nextProjectileId":1,"nextTowerId":2},"gold":40,"outcome":null,"paused":false,"phase":"prep","prepTicksRemaining":39,"queue":[],"stageId":"stage-test","tick":1,"towers":[{"actuallyPaid":60,"id":1,"targeting":"first","tile":{"col":0,"row":0}}],"waveStartTick":null}}',
    "198a43511a892682",
  ],
  [
    '{"events":[{"delta":30,"eventSeq":3,"goldAfter":70,"key":"a1:sell:t1","seq":3,"tick":2,"towerId":1,"type":"towerSold"},{"delta":-60,"eventSeq":4,"goldAfter":10,"key":"a1:build:c4","seq":4,"tick":2,"tile":{"col":1,"row":0},"towerId":2,"type":"towerBuilt"}],"state":{"attemptId":1,"consumedEconomyEvents":["build:c1","build:c4","sell:t1"],"counters":{"nextCommandSeq":5,"nextEnemyId":1,"nextEventSeq":5,"nextProjectileId":1,"nextTowerId":3},"gold":10,"outcome":null,"paused":false,"phase":"prep","prepTicksRemaining":38,"queue":[],"stageId":"stage-test","tick":2,"towers":[{"actuallyPaid":60,"id":2,"targeting":"first","tile":{"col":1,"row":0}}],"waveStartTick":null}}',
    "2f212b0b9f3f6e9e",
  ],
  [
    '{"events":[{"eventSeq":5,"kind":"setTargeting","reason":"towerNotFound","seq":5,"tick":3,"type":"commandRejected"}],"state":{"attemptId":1,"consumedEconomyEvents":["build:c1","build:c4","sell:t1"],"counters":{"nextCommandSeq":6,"nextEnemyId":1,"nextEventSeq":6,"nextProjectileId":1,"nextTowerId":3},"gold":10,"outcome":null,"paused":false,"phase":"prep","prepTicksRemaining":37,"queue":[],"stageId":"stage-test","tick":3,"towers":[{"actuallyPaid":60,"id":2,"targeting":"first","tile":{"col":1,"row":0}}],"waveStartTick":null}}',
    "eb259b1d98efc71e",
  ],
  [
    '{"events":[],"state":{"attemptId":1,"consumedEconomyEvents":["build:c1","build:c4","sell:t1"],"counters":{"nextCommandSeq":6,"nextEnemyId":1,"nextEventSeq":6,"nextProjectileId":1,"nextTowerId":3},"gold":10,"outcome":null,"paused":false,"phase":"prep","prepTicksRemaining":36,"queue":[],"stageId":"stage-test","tick":4,"towers":[{"actuallyPaid":60,"id":2,"targeting":"first","tile":{"col":1,"row":0}}],"waveStartTick":null}}',
    "314c8be49cb0f5d4",
  ],
];

const t = (col: number, row = 0) => ({ col, row });
const BASE_COMMANDS = [
  { applyTick: 1, seq: 1, kind: "build", payload: { towerType: "archer", tile: t(0) } },
  { applyTick: 1, seq: 2, kind: "build", payload: { towerType: "archer", tile: t(1) } },
  { applyTick: 2, seq: 3, kind: "sell", payload: { towerId: 1 } },
  { applyTick: 2, seq: 4, kind: "build", payload: { towerType: "archer", tile: t(1) } },
  { applyTick: 3, seq: 5, kind: "setTargeting", payload: { towerId: 1, mode: "strong" } },
];

const record = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  formatVersion: 1,
  codeVersion: TOY_CODE_VERSION,
  contentHash: CONTENT_HASH,
  stageId: TOY_STAGE_ID,
  attemptId: 1,
  initialStateHash: GOLDEN[0][1],
  endTick: 4,
  commands: structuredClone(BASE_COMMANDS),
  ...over,
});

const toyFactory =
  (content: ToyContent = TOY_CONTENT, options: ToyOptions = {}) =>
  (rec: ReplayRecord): ReplayCore =>
    new ToySim(content, rec.stageId, rec.attemptId, options);

const run = (rec: unknown, factory = toyFactory()): ReplayTrace => runReplay(rec, EXPECT, factory);

describe("fixture 자체 검증", () => {
  it("content 정규 문자열·해시 literal이 제품 출력과 일치", () => {
    expect(contentHashOf(TOY_CONTENT)).toBe(CONTENT_HASH);
    expect(CONTENT_CANONICAL).toContain('"buildCost":60');
  });
});

describe("R01: 7.1 기록을 새 코어 2개로 실행 — 틱 0..4 전부 비교", () => {
  it("틱별 envelope 문자열과 해시가 golden과 같다 (최종 해시 하나만 비교하지 않음)", () => {
    const trace = run(record());
    expect(trace.ticks).toHaveLength(5);
    trace.ticks.forEach((tk, i) => {
      expect(tk.tick).toBe(i);
      expect(tk.envelope, `tick ${i} envelope`).toBe(GOLDEN[i][0]);
      expect(tk.hash, `tick ${i} hash`).toBe(GOLDEN[i][1]);
    });
  });
  it("두 번 실행(새 코어 2개)의 상태·이벤트·해시가 모두 같다", () => {
    const a = run(record());
    const b = run(record());
    expect(firstMismatch(a, b)).toBeNull();
    expect(a.ticks.map((x) => x.hash)).toEqual(b.ticks.map((x) => x.hash));
  });
  it("7.1 경제 원장: 3건, 각 항목이 해당 틱 이벤트에 나타난다", () => {
    let core: ToySim | undefined;
    const trace = run(record(), (rec) => (core = new ToySim(TOY_CONTENT, rec.stageId, rec.attemptId)));
    expect(core!.ledger()).toEqual([
      { tick: 1, eventSeq: 1, key: "a1:build:c1", delta: -60, goldAfter: 40 },
      { tick: 2, eventSeq: 3, key: "a1:sell:t1", delta: 30, goldAfter: 70 },
      { tick: 2, eventSeq: 4, key: "a1:build:c4", delta: -60, goldAfter: 10 },
    ]);
    const keys = trace.ticks.flatMap((tk) => (tk.events as { key?: string }[]).map((e) => e.key).filter(Boolean));
    expect(keys).toEqual(["a1:build:c1", "a1:sell:t1", "a1:build:c4"]);
  });
});

describe("R03: 명령 하나를 바꾸면 그 틱이 첫 불일치", () => {
  it("tick2 seq4 payload tile1→tile2: tick 0·1 동일, 첫 불일치 tick 2, state.towers[0].tile.col 기대 1 / 실제 2", () => {
    const commands = structuredClone(BASE_COMMANDS);
    commands[3].payload = { towerType: "archer", tile: t(2) };
    const m = firstMismatch(run(record()), run(record({ commands })))!;
    expect(m).toMatchObject({ tick: 2, kind: "state", path: "state.towers[0].tile.col", expected: 1, actual: 2 });
    expect(m.message).toBe("tick 2: state.towers[0].tile.col 기대 1 / 실제 2");
  });
});

describe("R04: 상태는 같고 이벤트만 다른 실행도 검출 (스냅샷만 비교하는 변이 검출)", () => {
  /** 코어를 감싸 step()이 돌려주는 이벤트만 바꾼다. */
  const tamper =
    (mutate: (events: Record<string, unknown>[], tick: number) => Record<string, unknown>[]) =>
    (rec: ReplayRecord): ReplayCore => {
      const inner = new ToySim(TOY_CONTENT, rec.stageId, rec.attemptId);
      return {
        get completedTick() {
          return inner.completedTick;
        },
        isResult: () => inner.isResult(),
        submit: (k, p) => inner.submit(k, p),
        snapshot: () => inner.snapshot(),
        step: () => mutate(structuredClone(inner.step() as Record<string, unknown>[]), inner.completedTick),
      };
    };

  it("거부 사유 문자열이 다르면 tick·eventSeq·필드 경로를 보고", () => {
    const tampered = run(
      record(),
      tamper((events, tick) => (tick === 1 ? events.map((e) => (e.type === "commandRejected" ? { ...e, reason: "occupied" } : e)) : events)),
    );
    const m = firstMismatch(run(record()), tampered)!;
    expect(m).toMatchObject({ tick: 1, kind: "events", path: "events[1].reason", eventSeq: 2, expected: "insufficientGold", actual: "occupied" });
  });
  it("이벤트 순서가 다르면 검출", () => {
    const tampered = run(record(), tamper((events, tick) => (tick === 2 ? [...events].reverse() : events)));
    const m = firstMismatch(run(record()), tampered)!;
    expect(m.kind).toBe("events");
    expect(m.tick).toBe(2);
    expect(m.path).toBe("events[0].delta");
    expect(m.eventSeq).toBe(3);
  });
  it("이벤트 개수가 다르면 events.length 보고", () => {
    const tampered = run(record(), tamper((events, tick) => (tick === 4 ? [{ eventSeq: 99, tick: 4, type: "ghost" }] : events)));
    expect(firstMismatch(run(record()), tampered)).toMatchObject({ tick: 4, kind: "events", path: "events.length", expected: 0, actual: 1 });
  });
  it("틱 수가 다른 두 실행은 ticks.length로 보고", () => {
    const m = firstMismatch(run(record()), run(record({ endTick: 3 })));
    expect(m).toMatchObject({ kind: "length", tick: 4, path: "ticks.length", expected: 5, actual: 4 });
  });
});

describe("R05: 컬렉션 저장 순서 오염에도 모든 틱이 동일", () => {
  // 타워 11개 이상 → ID [1,2,10,11], 소비 키 build:c1,c10,c11,c2... 로 문자열/숫자 정렬이 갈리는 구성.
  const big = { ...TOY_CONTENT, initialGold: 1000 };
  const commands = [
    ...Array.from({ length: 11 }, (_, i) => ({ applyTick: 1, seq: i + 1, kind: "build", payload: { towerType: "archer", tile: t(i) } })),
    { applyTick: 2, seq: 12, kind: "sell", payload: { towerId: 3 } },
    { applyTick: 2, seq: 13, kind: "setTargeting", payload: { towerId: 10, mode: "last" } },
    { applyTick: 2, seq: 14, kind: "build", payload: { towerType: "archer", tile: t(3) } },
  ];
  const expectBig: ReplayExpectation = { ...EXPECT, contentHash: contentHashOf(big) };
  const bigInitialHash = initialStateHashOf(new ToySim(big, TOY_STAGE_ID, 1).snapshot());
  const rec = (cmds: unknown[] = commands) =>
    record({ commands: cmds, endTick: 3, contentHash: expectBig.contentHash, initialStateHash: bigInitialHash });

  it("타워·소비 키·큐를 역순으로 저장한 코어도 같은 상태·이벤트·해시", () => {
    const natural = runReplay(rec(), expectBig, toyFactory(big));
    const reversed = runReplay(rec(), expectBig, toyFactory(big, { storageOrder: "reversed" }));
    expect(firstMismatch(natural, reversed)).toBeNull();
    const state1 = natural.ticks[1].state as { towers: { id: number }[]; consumedEconomyEvents: string[]; counters: { nextTowerId: number } };
    expect(state1.towers.map((x) => x.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]); // 숫자순 (문자열이면 1,10,11,2…)
    expect(state1.consumedEconomyEvents).toEqual(["build:c1", "build:c10", "build:c11", "build:c2", "build:c3", "build:c4", "build:c5", "build:c6", "build:c7", "build:c8", "build:c9"]); // 코드 단위 순
    expect(state1.counters.nextTowerId).toBe(12);
  });
  it("큐에 명령이 남은 중간 스냅샷도 저장 순서와 무관하게 seq 순", () => {
    const a = new ToySim(big, TOY_STAGE_ID, 1);
    const b = new ToySim(big, TOY_STAGE_ID, 1, { storageOrder: "reversed" });
    for (const sim of [a, b]) for (let i = 0; i < 12; i += 1) sim.submit("build", { towerType: "archer", tile: t(i) });
    const qa = (a.snapshot() as { queue: { seq: number }[] }).queue.map((c) => c.seq);
    expect(qa).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(JSON.stringify(a.snapshot())).toBe(JSON.stringify(b.snapshot()));
  });
  it("명령 seq를 바꾼 것은 오염이 아니라 다른 입력이므로 검출된다", () => {
    const swapped = structuredClone(commands);
    swapped[0].payload = { towerType: "archer", tile: t(5) };
    const other = runReplay(rec(swapped), expectBig, toyFactory(big));
    const base = runReplay(rec(), expectBig, toyFactory(big));
    expect(firstMismatch(base, other)).toMatchObject({ tick: 1 });
  });
});

describe("R06: 이전 시도·코어 상태 재사용 차단", () => {
  it("이미 진행된 코어(큐·소비 키·카운터 보유)를 factory가 돌려주면 거부", () => {
    const dirty = new ToySim(TOY_CONTENT, TOY_STAGE_ID, 1);
    dirty.submit("build", { towerType: "archer", tile: t(0) });
    dirty.step();
    dirty.submit("build", { towerType: "archer", tile: t(3) });
    expect(() => run(record(), () => dirty)).toThrow(ReplayStructureError); // completedTick != 0
  });
  it("틱은 0이지만 큐·카운터가 남은 코어는 초기 상태 해시 불일치로 거부", () => {
    const dirty = new ToySim(TOY_CONTENT, TOY_STAGE_ID, 1);
    dirty.submit("build", { towerType: "archer", tile: t(0) });
    expect(() => run(record(), () => dirty)).toThrow(ReplayInitialStateError);
  });
  it("같은 세션에서 먼저 시도를 돌린 뒤에도 같은 기록의 재생은 fresh와 동일", () => {
    const live = new ToySim(TOY_CONTENT, TOY_STAGE_ID, 1);
    live.submit("build", { towerType: "archer", tile: t(0) });
    live.step();
    const replayed = run(record());
    expect(firstMismatch(replayed, run(record()))).toBeNull();
    expect(replayed.ticks.map((x) => x.hash)).toEqual(GOLDEN.map((g) => g[1]));
  });
  it("다른 attemptId 기록은 새 코어의 초기 해시가 달라 초기 상태 오류 (attemptId가 해시에 들어간다)", () => {
    expect(() => run(record({ attemptId: 2 }))).toThrow(ReplayInitialStateError);
  });
});

describe("R07: 버전·콘텐츠 불일치는 시뮬레이션 전 호환성 오류", () => {
  const calls = { created: 0 };
  const counting = (rec: ReplayRecord) => {
    calls.created += 1;
    return toyFactory()(rec);
  };
  it("codeVersion / formatVersion / contentHash 불일치", () => {
    for (const [field, over] of [
      ["codeVersion", { codeVersion: "toy-sim-v0" }],
      ["formatVersion", { formatVersion: 2 }],
      ["contentHash", { contentHash: "0000000000000000" }],
    ] as const) {
      expect(() => run(record(over), counting), field).toThrow(ReplayCompatibilityError);
    }
    expect(calls.created).toBe(0);
  });
  it("콘텐츠 숫자 하나를 바꾸면 contentHash가 달라져 기록과 불일치", () => {
    const changed = { ...TOY_CONTENT, buildCost: 61 };
    expect(contentHashOf(changed)).not.toBe(CONTENT_HASH);
    expect(() => runReplay(record(), { ...EXPECT, contentHash: contentHashOf(changed) }, counting)).toThrow(ReplayCompatibilityError);
    expect(calls.created).toBe(0);
  });
  it("호환성 오류와 구조 오류·초기 상태 오류는 서로 다른 클래스", () => {
    expect(new ReplayCompatibilityError("x", 1, 2)).not.toBeInstanceOf(ReplayStructureError);
    expect(new ReplayInitialStateError("a", "b")).not.toBeInstanceOf(ReplayCompatibilityError);
  });
});

describe("R08: 종료 틱 정책", () => {
  /** 코어를 감싸 step 호출 수를 센다. */
  const counted = (content: ToyContent = TOY_CONTENT) => {
    const stat = { steps: 0, core: undefined as ToySim | undefined };
    const factory = (rec: ReplayRecord): ReplayCore => {
      const core = new ToySim(content, rec.stageId, rec.attemptId);
      stat.core = core;
      return {
        get completedTick() {
          return core.completedTick;
        },
        isResult: () => core.isResult(),
        submit: (k, p) => core.submit(k, p),
        snapshot: () => core.snapshot(),
        step: () => {
          stat.steps += 1;
          return core.step();
        },
      };
    };
    return { stat, factory };
  };

  it("명령 없는 기록 + endTick 4: T1..4 모두 실행, 스냅샷 0..4 비교, 새 이벤트 없음", () => {
    const { stat, factory } = counted();
    const trace = run(record({ commands: [] }), factory);
    expect(stat.steps).toBe(4);
    expect(trace.ticks).toHaveLength(5);
    expect(trace.ticks.map((x) => (x.state as { tick: number }).tick)).toEqual([0, 1, 2, 3, 4]);
    expect(trace.ticks.every((x) => x.events.length === 0)).toBe(true);
  });
  it("마지막 명령이 T3이어도 endTick 4까지 실행 (7.1 기록)", () => {
    const { stat, factory } = counted();
    run(record(), factory);
    expect(stat.steps).toBe(4);
  });
  it("I1: 마지막 step이 completedTick을 올리지 않거나 두 번 올리면 재생 오류 (중간 step은 정상)", () => {
    for (const delta of [0, 2]) {
      let calls = 0;
      const factory = (rec: ReplayRecord): ReplayCore => {
        const core = new ToySim(TOY_CONTENT, rec.stageId, rec.attemptId);
        let skew = 0;
        return {
          get completedTick() {
            return core.completedTick + skew;
          },
          isResult: () => core.isResult(),
          submit: (k, p) => core.submit(k, p),
          snapshot: () => core.snapshot(),
          step: () => {
            calls += 1;
            const ev = core.step();
            if (calls === 4) skew = delta === 0 ? -1 : 1; // 마지막(endTick 4) step만 어긋남
            return ev;
          },
        };
      };
      expect(() => run(record(), factory), `delta ${delta}`).toThrow(ReplayStructureError);
      expect(calls).toBe(4);
    }
  });
  it("I1: 새 코어의 completedTick이 0이 아니면 오류", () => {
    const factory = (rec: ReplayRecord): ReplayCore => {
      const core = new ToySim(TOY_CONTENT, rec.stageId, rec.attemptId);
      return { completedTick: 1, isResult: () => false, submit: (k, p) => core.submit(k, p), snapshot: () => core.snapshot(), step: () => core.step() };
    };
    expect(() => run(record({ commands: [], endTick: 0 }), factory)).toThrow(ReplayStructureError);
  });
  it("endTick 0: step 0회, 스냅샷 0 하나만 검증", () => {
    const { stat, factory } = counted();
    const trace = run(record({ commands: [], endTick: 0 }), factory);
    expect(stat.steps).toBe(0);
    expect(trace.ticks).toHaveLength(1);
    expect(trace.ticks[0].hash).toBe(GOLDEN[0][1]);
  });
  const withResult = { ...TOY_CONTENT, script: { resultAtTick: 3 } };
  const resultExpect: ReplayExpectation = { ...EXPECT, contentHash: contentHashOf(withResult) };
  it("결과 R=3 / endTick 3: step 3회, 스냅샷 0..3 검증 후 종료 (결과 이후 step 없음)", () => {
    const { stat, factory } = counted(withResult);
    const trace = runReplay(record({ contentHash: resultExpect.contentHash, commands: [], endTick: 3 }), resultExpect, factory);
    expect(stat.steps).toBe(3);
    expect(trace.ticks).toHaveLength(4);
    expect((trace.ticks[3].state as { phase: string }).phase).toBe("result");
  });
  it("결과 R=3 / endTick 5: R3 도달 시점에 종료 불일치 오류, T4·T5 미실행, 결과 상태 유지", () => {
    const { stat, factory } = counted(withResult);
    let error: unknown;
    try {
      runReplay(record({ contentHash: resultExpect.contentHash, commands: [], endTick: 5 }), resultExpect, factory);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ReplayEndMismatchError);
    expect(error).toMatchObject({ resultTick: 3, endTick: 5 });
    expect(stat.steps).toBe(3);
    expect(stat.core!.completedTick).toBe(3);
    expect(stat.core!.phase).toBe("result");
  });
});

describe("R09 / Q14: 구조 오류 — 실행 전 거부, 자동 보정 없음", () => {
  const spy = () => {
    const stat = { created: 0 };
    return {
      stat,
      factory: (rec: ReplayRecord) => {
        stat.created += 1;
        return toyFactory()(rec);
      },
    };
  };
  const cmds = (patch: (c: typeof BASE_COMMANDS) => void) => {
    const c = structuredClone(BASE_COMMANDS);
    patch(c);
    return c;
  };

  it("endTick가 안전 정수 ≥ 0이 아니면 step 0회로 구조 오류", () => {
    const { stat, factory } = spy();
    for (const bad of [-1, 0.5, NaN, Infinity, -Infinity, "4", null, true, 9007199254740992, undefined]) {
      expect(() => run(record({ endTick: bad }), factory), String(bad)).toThrow(ReplayStructureError);
    }
    expect(stat.created).toBe(0);
  });
  const cases: [string, Record<string, unknown>, string][] = [
    ["중복 seq", { commands: cmds((c) => (c[1].seq = 1)) }, "record.commands[1].seq"],
    ["seq 빈틈(2부터 시작)", { commands: cmds((c) => c.forEach((x, i) => (x.seq = i + 2))) }, "record.commands[0].seq"],
    ["seq 순서 뒤바뀜", { commands: cmds((c) => ([c[0].seq, c[1].seq] = [2, 1])) }, "record.commands[0].seq"],
    ["applyTick 0 (과거)", { commands: cmds((c) => (c[0].applyTick = 0)) }, "record.commands[0].applyTick"],
    ["applyTick 소수", { commands: cmds((c) => (c[0].applyTick = 1.5)) }, "record.commands[0].applyTick"],
    ["applyTick 음수", { commands: cmds((c) => (c[0].applyTick = -2)) }, "record.commands[0].applyTick"],
    ["applyTick 감소", { commands: cmds((c) => (c[3].applyTick = 1)) }, "record.commands[3].applyTick"],
    ["applyTick > endTick", { endTick: 2 }, "record.commands[4].applyTick"],
    ["알 수 없는 kind", { commands: cmds((c) => (c[0].kind = "teleport")) }, "record.commands[0].kind"],
    ["잘못된 payload", { commands: cmds((c) => (c[0].payload = { towerType: "archer", tile: { col: 0.5, row: 0 } })) }, "record.commands[0].payload.tile.col"],
    ["명령 필드 누락", { commands: cmds((c) => delete (c[0] as Partial<(typeof c)[0]>).payload) }, "record.commands[0].payload"],
    ["명령에 알 수 없는 필드", { commands: cmds((c) => ((c[0] as Record<string, unknown>).extra = 1)) }, "record.commands[0].extra"],
    ["attemptId 0", { attemptId: 0 }, "record.attemptId"],
    ["attemptId 비안전 정수", { attemptId: 9007199254740992 }, "record.attemptId"],
    ["seq 비안전 정수", { commands: cmds((c) => (c[0].seq = 9007199254740992)) }, "record.commands[0].seq"],
    ["stageId 빈 문자열", { stageId: "" }, "record.stageId"],
    ["initialStateHash 형식 오류", { initialStateHash: "ABC" }, "record.initialStateHash"],
    ["commands가 배열이 아님", { commands: {} }, "record.commands"],
    ["헤더 필드 누락", { endTick: undefined }, "record.endTick"],
  ];
  for (const [label, over, path] of cases) {
    it(`${label}: ReplayStructureError, 코어 생성 전 거부`, () => {
      const { stat, factory } = spy();
      const rec = record(over);
      if (label === "헤더 필드 누락") delete rec.endTick;
      let error: unknown;
      try {
        run(rec, factory);
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(ReplayStructureError);
      if (path) expect((error as ReplayStructureError).path).toBe(path);
      expect(stat.created).toBe(0);
    });
  }
  it("알 수 없는 헤더 필드·일반 객체가 아닌 기록도 거부", () => {
    expect(() => validateReplayRecord({ ...record(), extra: 1 }, EXPECT)).toThrow(ReplayStructureError);
    expect(() => validateReplayRecord(null, EXPECT)).toThrow(ReplayStructureError);
    expect(() => validateReplayRecord([], EXPECT)).toThrow(ReplayStructureError);
  });
  it("초기 snapshot 변조(initialStateHash가 형식은 맞지만 다른 값): ReplayInitialStateError", () => {
    expect(() => run(record({ initialStateHash: "0123456789abcdef" }))).toThrow(ReplayInitialStateError);
  });
  it("정상 기록은 구조 검사를 통과하고 payload가 동결된 복사본이 된다", () => {
    const raw = record();
    const checked = validateReplayRecord(raw, EXPECT);
    expect(checked.commands).toHaveLength(5);
    expect(Object.isFrozen(checked.commands[0].payload)).toBe(true);
    (raw.commands as { payload: { tile: { col: number } } }[])[0].payload.tile.col = 9;
    expect((checked.commands[0].payload as { tile: { col: number } }).tile.col).toBe(0);
  });
});
