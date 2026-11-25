// SIM-03 — 실패 주입·의도적 불일치 (SIM-CONTRACT 15.3). 각 경우의 오류 종류·시점·첫 불일치 틱·필드 경로를 정확히 단언한다.
/* eslint-disable @typescript-eslint/no-explicit-any -- 기록·trace 를 임의 필드 단위로 일부러 변조하는 테스트라 형태를 고정할 수 없다 */
import { describe, expect, it } from "vitest";
import { ATTEMPT_CODE_VERSION, createAttempt } from "../attempt";
import {
  firstMismatch,
  ReplayCompatibilityError,
  ReplayEndMismatchError,
  ReplayInitialStateError,
  ReplayStructureError,
  runReplay,
  type ReplayCore,
  type ReplayRecord,
  type ReplayTrace,
} from "../../sim/replay";
import { seg, STAGE2_ID, uniformStage2, withValues } from "../testing/bundles";
import { assertUpdateAllowed, GoldenMismatchError, playScenario, serializeGolden, StaleGoldenError, updateGoldens, verifyGolden, buildGolden, type Golden } from "./golden";
import { SCENARIOS, type Scenario } from "./scenarios";
import { InvariantChecker, InvariantViolation } from "../testing/invariants";

const scenario = (id: Scenario["id"]): Scenario => SCENARIOS.find((s) => s.id === id)!;
const R1 = scenario("R1");
const R3 = scenario("R3");
const R2 = scenario("R2");

const expectationOf = (sc: Scenario) => ({
  formatVersion: 1,
  codeVersion: ATTEMPT_CODE_VERSION,
  contentHash: createAttempt(sc.bundle(), sc.stageId, sc.attemptId).contentHash,
});

interface Counting {
  created: number;
  steps: number;
}
/** 코어 생성·step 호출 횟수를 센다(실행 전 오류는 둘 다 0 이어야 한다). */
function counting(sc: Scenario, counts: Counting) {
  return (r: ReplayRecord): ReplayCore => {
    counts.created += 1;
    const core = createAttempt(sc.bundle(), r.stageId, r.attemptId);
    return {
      get completedTick() {
        return core.completedTick;
      },
      isResult: () => core.isResult(),
      submit: (k, p) => core.submit(k, p),
      snapshot: () => core.snapshot(),
      step: () => {
        counts.steps += 1;
        return core.step();
      },
    };
  };
}

const run = (sc: Scenario, record: unknown, counts: Counting = { created: 0, steps: 0 }): ReplayTrace => runReplay(record, expectationOf(sc), counting(sc, counts));
const mutable = (record: ReplayRecord): any => structuredClone(record) as any;

describe("F1 기록 명령 변조 → 첫 불일치 틱 = 변조한 명령의 (원래·새 중 이른) applyTick", () => {
  const played = playScenario(R3);
  const base = run(R3, played.record);
  const index = (kind: string, applyTick: number): number => played.record.commands.findIndex((c) => c.kind === kind && c.applyTick === applyTick);

  it("원 실행과 재생은 완전히 같다(기준)", () => {
    expect(firstMismatch(played.trace, base)).toBeNull();
  });
  it("payload 값 변조(틱 40 강화 대상 1 → 3): 틱 40", () => {
    const r = mutable(played.record);
    const i = index("upgrade", 40);
    expect(i).toBeGreaterThan(0);
    expect(r.commands[i].payload).toEqual({ towerId: 1 });
    r.commands[i].payload = { towerId: 3 };
    expect(firstMismatch(base, run(R3, r))).toMatchObject({ tick: 40, kind: "state" });
  });
  it("kind 변조(틱 60 upgrade → sell, 같은 payload): 전투 중 판매는 거부되므로 틱 60", () => {
    const r = mutable(played.record);
    const i = index("upgrade", 60);
    r.commands[i].kind = "sell";
    const m = firstMismatch(base, run(R3, r));
    expect(m?.tick).toBe(60);
  });
  it("applyTick 1틱 이동(틱 80 setTargeting → 81): 이른 쪽 80", () => {
    const r = mutable(played.record);
    const i = index("setTargeting", 80);
    expect(played.record.commands[i + 1].applyTick).toBeGreaterThan(81);
    r.commands[i].applyTick = 81;
    expect(firstMismatch(base, run(R3, r))).toMatchObject({ tick: 80, kind: "state" });
  });
  it("applyTick 앞으로 이동(틱 130 → 129): 이른 쪽 129", () => {
    const r = mutable(played.record);
    const i = index("setTargeting", 130);
    expect(played.record.commands[i - 1].applyTick).toBeLessThanOrEqual(129);
    r.commands[i].applyTick = 129;
    expect(firstMismatch(base, run(R3, r))?.tick).toBe(129);
  });
});

describe("F2 구조 위반 → 실행 전 ReplayStructureError(필드 경로), 코어 생성·step 0회", () => {
  const record = playScenario(R3).record;
  const cases: [string, (r: any) => void, string][] = [
    ["seq 빈틈", (r) => (r.commands[1].seq = 3), "record.commands[1].seq"],
    ["seq 중복", (r) => (r.commands[2].seq = 2), "record.commands[2].seq"],
    ["applyTick 감소", (r) => (r.commands[r.commands.length - 1].applyTick = 1), `record.commands[${record.commands.length - 1}].applyTick`],
    ["endTick 보다 큰 applyTick", (r) => (r.endTick = 100), `record.commands[${record.commands.findIndex((c) => c.applyTick > 100)}].applyTick`],
    ["기록 알 수 없는 필드", (r) => (r.extra = 1), "record.extra"],
    ["명령 알 수 없는 필드", (r) => (r.commands[0].foo = 1), "record.commands[0].foo"],
    ["endTick 문자열", (r) => (r.endTick = "500"), "record.endTick"],
    ["payload 필드 누락", (r) => delete r.commands[0].payload.tile, "record.commands[0].payload.tile"],
  ];
  for (const [name, mutate, path] of cases) {
    it(`${name} → ${path}`, () => {
      const r = mutable(record);
      mutate(r);
      const counts = { created: 0, steps: 0 };
      let error: unknown;
      try {
        run(R3, r, counts);
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(ReplayStructureError);
      expect((error as ReplayStructureError).path).toBe(path);
      expect(counts).toEqual({ created: 0, steps: 0 });
    });
  }
});

describe("F3 버전·콘텐츠 불일치 → 실행 전 ReplayCompatibilityError, step() 0회", () => {
  const record = playScenario(R3).record;
  const field = (mutate: (r: any) => void): string => {
    const r = mutable(record);
    mutate(r);
    const counts = { created: 0, steps: 0 };
    try {
      run(R3, r, counts);
    } catch (e) {
      expect(e).toBeInstanceOf(ReplayCompatibilityError);
      expect(counts).toEqual({ created: 0, steps: 0 });
      return (e as ReplayCompatibilityError).field;
    }
    throw new Error("오류가 나야 함");
  };
  it("codeVersion", () => expect(field((r) => (r.codeVersion = "attempt-v2"))).toBe("codeVersion"));
  it("formatVersion", () => expect(field((r) => (r.formatVersion = 2))).toBe("formatVersion"));
  it("contentHash", () => expect(field((r) => (r.contentHash = "0000000000000000"))).toBe("contentHash"));
  it("콘텐츠 값 1개가 바뀐 묶음(archer damage 30 → 31): 같은 기록이 contentHash 불일치로 거부된다", () => {
    const changed = withValues([["towers[0].levels.base.damage", 31]], R3.bundle());
    const expectation = { formatVersion: 1, codeVersion: ATTEMPT_CODE_VERSION, contentHash: createAttempt(changed, R3.stageId, R3.attemptId).contentHash };
    expect(expectation.contentHash).not.toBe(record.contentHash);
    let steps = 0;
    expect(() =>
      runReplay(record, expectation, (r) => {
        const core = createAttempt(changed, r.stageId, r.attemptId);
        return { ...core, completedTick: 0, isResult: () => false, submit: () => ({ ok: false, reason: "paused" }), snapshot: () => core.snapshot(), step: () => ((steps += 1), []) } as ReplayCore;
      }),
    ).toThrow(ReplayCompatibilityError);
    expect(steps).toBe(0);
  });
});

describe("F4 초기 상태 해시 변조 → ReplayInitialStateError(step 0회)", () => {
  it("유효한 형식의 다른 해시", () => {
    const r = mutable(playScenario(R3).record);
    r.initialStateHash = "0123456789abcdef";
    const counts = { created: 0, steps: 0 };
    expect(() => run(R3, r, counts)).toThrow(ReplayInitialStateError);
    expect(counts).toEqual({ created: 1, steps: 0 });
  });
  it("형식이 틀린 해시는 구조 오류(필드 경로 record.initialStateHash)", () => {
    const r = mutable(playScenario(R3).record);
    r.initialStateHash = "ABC";
    expect(() => run(R3, r)).toThrowError(expect.objectContaining({ path: "record.initialStateHash" }));
  });
});

describe("F5 전투 중 fire 훅 예외 → 상태·원장·카운터 불변, 같은 틱 재시도 뒤 이어지는 trace 는 예외 없는 실행과 같다", () => {
  // archer(틱 1 발사) + mage(느린 투사체 10mt/틱, TTL 400틱: 오래 비행) + frost(빠른 투사체, 틱 2 명중 → 둔화 틱 42 까지). 틱 12 에 hook 예외.
  const bundle = (): unknown =>
    withValues(
      [
        ["enemies[0].speedMtPerSec", 1000],
        ["towers[2].levels.base.projectileSpeedMtPerSec", 200],
        ["towers[2].levels.base.projectileTtlMs", 20000],
        ["towers[3].levels.base.projectileSpeedMtPerSec", 100000],
        ["stages[1].initialGold", 1000],
      ],
      uniformStage2({ prepMs: 150, clearReward: 20, segments: [seg(0, 1000, 3)] }),
    );
  const FAIL_TICK = 12;
  const END = 40;
  type Sink = { events: unknown[]; states: unknown[] };
  const make = (hooks = {}) => {
    const core = createAttempt(bundle(), STAGE2_ID, 1, hooks);
    for (const [towerType, col, row] of [["archer", 0, 0], ["mage", 3, 2], ["frost", 1, 2]] as const) core.submit("build", { towerType, tile: { col, row } });
    core.submit("startWave", {});
    return core;
  };
  const advance = (core: ReturnType<typeof make>, to: number, sink: Sink): void => {
    while (core.completedTick < to) {
      sink.events.push(core.step());
      sink.states.push(core.snapshot());
    }
  };

  it("예외 직전 투사체·둔화가 있고, 예외 뒤 상태·원장·카운터·큐가 그대로이며, 재시도 후 틱 1..40 의 이벤트·상태가 기준과 같다", () => {
    let armed = true;
    let thrown = 0;
    const faulty = make({
      fire(ctx: { tick: number }) {
        if (armed && ctx.tick === FAIL_TICK) {
          thrown += 1;
          throw new Error("hook boom");
        }
        return undefined;
      },
    });
    const clean = make();
    const a: Sink = { events: [], states: [] };
    const b: Sink = { events: [], states: [] };

    advance(clean, FAIL_TICK - 1, b);
    clean.submit("upgrade", { towerId: 1 }); // 틱 12 1단계에서 적용
    advance(clean, END, b);

    advance(faulty, FAIL_TICK - 1, a);
    const before = faulty.snapshot() as { projectiles: unknown[]; enemies: { slows: unknown[] }[] };
    expect(before.projectiles.length).toBeGreaterThan(0); // mage 투사체 비행 중
    expect(before.enemies.some((e) => e.slows.length > 0)).toBe(true); // frost 둔화 활성
    faulty.submit("upgrade", { towerId: 1 });
    const queued = faulty.snapshot();
    const ledger = faulty.ledger();

    expect(() => faulty.step()).toThrow("hook boom");
    expect(thrown).toBe(1);
    expect(faulty.completedTick).toBe(FAIL_TICK - 1);
    expect(faulty.snapshot()).toEqual(queued); // 골드·카운터(nextEventSeq 등)·큐(강화 명령 보존) 불변
    expect(faulty.ledger()).toEqual(ledger);

    armed = false;
    advance(faulty, END, a); // 같은 틱 12 재시도부터 이어간다
    expect(a.events).toEqual(b.events);
    expect(a.states).toEqual(b.states);
    expect(a.events).toHaveLength(END);
    expect(faulty.ledger()).toEqual(clean.ledger());
  });
});

describe("F6 trace 한 틱의 상태·이벤트 필드 1개 변조 → firstMismatch 가 그 틱·필드 경로(이벤트는 eventSeq)를 정확히 보고", () => {
  const trace = playScenario(R3).trace;
  const tampered = (): { ticks: any[] } => ({ ticks: structuredClone(trace.ticks) as any[] });

  it("상태 필드(틱 77 의 gold + 1)", () => {
    const t = tampered();
    t.ticks[77].state.gold += 1;
    const m = firstMismatch(trace, t as ReplayTrace)!;
    expect(m).toMatchObject({ tick: 77, kind: "state", path: "state.gold" });
    expect(m.expected).toBe(trace.ticks[77].state && (trace.ticks[77].state as { gold: number }).gold);
    expect(m.actual).toBe((trace.ticks[77].state as { gold: number }).gold + 1);
  });
  it("중첩 상태 필드(첫 적이 있는 틱의 enemies[0].pathProgress)", () => {
    const k = trace.ticks.findIndex((x) => (x.state as { enemies: unknown[] }).enemies.length > 0);
    const t = tampered();
    t.ticks[k].state.enemies[0].pathProgress += 1;
    expect(firstMismatch(trace, t as ReplayTrace)).toMatchObject({ tick: k, kind: "state", path: "state.enemies[0].pathProgress" });
  });
  it("이벤트 필드(첫 enemyDamaged 의 damage + 1): 경로 events[i].damage, eventSeq 보고", () => {
    const k = trace.ticks.findIndex((x) => (x.events as { type: string }[]).some((e) => e.type === "enemyDamaged"));
    const i = (trace.ticks[k].events as { type: string }[]).findIndex((e) => e.type === "enemyDamaged");
    const original = trace.ticks[k].events[i] as { eventSeq: number; damage: number };
    const t = tampered();
    t.ticks[k].events[i].damage += 1;
    expect(firstMismatch(trace, t as ReplayTrace)).toMatchObject({ tick: k, kind: "events", path: `events[${i}].damage`, eventSeq: original.eventSeq, expected: original.damage, actual: original.damage + 1 });
  });
  it("틱이 여러 곳에서 어긋나면 가장 이른 틱을 보고한다", () => {
    const t = tampered();
    t.ticks[300].state.baseHp += 1;
    t.ticks[90].state.gold += 1;
    expect(firstMismatch(trace, t as ReplayTrace)?.tick).toBe(90);
  });
});

describe("F7 결과 틱 뒤로 늘린 endTick → ReplayEndMismatchError(결과 틱에서 멈춤)", () => {
  const played = playScenario(R2);
  const R = played.record.endTick; // R2 는 결과 틱에서 끝난다
  it("endTick == R 은 통과, R+1 은 종료 불일치(resultTick R)", () => {
    expect(run(R2, played.record).ticks).toHaveLength(R + 1);
    const r = mutable(played.record);
    r.endTick = R + 1;
    const counts = { created: 0, steps: 0 };
    let error: unknown;
    try {
      run(R2, r, counts);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ReplayEndMismatchError);
    expect(error).toMatchObject({ resultTick: R, endTick: R + 1 });
    expect(counts.steps).toBe(R); // 결과 틱에서 멈추고 더 진행하지 않는다
  });
});

describe("F8 골든 오래됨·변조·갱신 가드", () => {
  const golden = (): Golden => buildGolden(R3);

  it("골든 codeVersion 이 다르면 StaleGoldenError(\"골든이 오래됨\") — 조용히 통과하지 않는다", () => {
    const stale = structuredClone(golden()) as any;
    stale.record.codeVersion = "attempt-v2";
    expect(() => verifyGolden(stale, R3)).toThrow(StaleGoldenError);
    expect(() => verifyGolden(stale, R3)).toThrow(/골든이 오래됨/);
  });
  it("틱 해시 1개 변조 → GoldenMismatchError 가 첫 불일치 틱·이벤트 type·상태 요약을 담는다", () => {
    const g = structuredClone(golden()) as any;
    g.tickHashes[37] = "0000000000000000";
    let message = "";
    try {
      verifyGolden(g, R3);
    } catch (e) {
      expect(e).toBeInstanceOf(GoldenMismatchError);
      message = (e as Error).message;
    }
    expect(message).toContain("첫 불일치 tick 37");
    expect(message).toContain("이벤트 [");
    expect(message).toMatch(/phase combat, wave 1, gold \d+, baseHp 30/);
  });
  it("outcome·finalGold·finalBaseHp·ledger 변조도 각각 잡힌다", () => {
    for (const [field, value] of [["outcome", "defeat"], ["finalGold", 1], ["finalBaseHp", 1]] as const) {
      const g = structuredClone(golden()) as any;
      g[field] = value;
      expect(() => verifyGolden(g, R3), field).toThrow(new RegExp(field));
    }
    const g = structuredClone(golden()) as any;
    g.ledger[0].delta += 1;
    expect(() => verifyGolden(g, R3)).toThrow(/ledger 불일치/);
  });
  it("시나리오(콘텐츠)가 바뀌었는데 골든이 그대로면 contentHash 불일치로 실패한다", () => {
    const changed: Scenario = { ...R3, bundle: () => withValues([["towers[0].levels.base.damage", 31]], R3.bundle()) };
    expect(() => verifyGolden(golden(), changed)).toThrow(ReplayCompatibilityError);
  });
});

describe("F9 골든 갱신 가드: 입력 정의가 같은데 결과가 달라지면 거부, 원자적 갱신 (리뷰 SIM-03 F1, 15.2)", () => {
  const files = (): Map<string, string> => new Map(SCENARIOS.map((sc) => [sc.id, serializeGolden(buildGolden(sc))]));
  const memoryIo = (store: Map<string, string>) => {
    const writes: string[] = [];
    return {
      writes,
      io: {
        read: (id: Scenario["id"]): Golden | null => (store.has(id) ? (JSON.parse(store.get(id)!) as Golden) : null),
        write: (id: Scenario["id"], text: string): void => {
          writes.push(id);
          store.set(id, text);
        },
      },
    };
  };
  /** 코어 동작만 바뀐 것처럼, 같은 input 으로 결과(endTick·해시)만 다른 후보 골든. 이동 +1 변이에서 R1 이 1093 → 1086 이 되는 것과 같은 모양. */
  const regressed = (g: Golden, deltaTicks: number): Golden => ({
    ...g,
    record: { ...g.record, endTick: g.record.endTick - deltaTicks, initialStateHash: g.record.initialStateHash },
    tickHashes: g.tickHashes.slice(0, g.tickHashes.length - deltaTicks).map((h, i) => (i >= 5 ? h.replace(/^./, h[0] === "0" ? "1" : "0") : h)),
  });
  const candidates = (mutate: (sc: Scenario, g: Golden) => Golden) => (sc: Scenario): Golden => mutate(sc, buildGolden(sc));

  it("결과 틱(endTick)이 바뀐 R1·R2 후보(같은 input) → 거부", () => {
    for (const [id, delta] of [["R1", 7], ["R2", 1]] as const) {
      const sc = scenario(id);
      const prev = buildGolden(sc);
      const next = regressed(prev, delta);
      expect(next.input).toEqual(prev.input);
      expect(next.record.endTick).toBe(prev.record.endTick - delta);
      expect(() => assertUpdateAllowed(prev, next)).toThrow(GoldenMismatchError);
      expect(() => assertUpdateAllowed(prev, next)).toThrow(new RegExp(`endTick ${prev.record.endTick} → ${next.record.endTick}`));
    }
  });
  it("계산값만 바뀐 경우도 거부: initialStateHash·outcome·finalGold·ledger", () => {
    const prev = buildGolden(R2);
    const variants: Golden[] = [
      { ...prev, record: { ...prev.record, initialStateHash: "0123456789abcdef" } },
      { ...prev, outcome: "victory" },
      { ...prev, finalGold: prev.finalGold + 1 },
      { ...prev, ledger: prev.ledger.map((e, i) => (i === 0 ? { ...e, delta: e.delta + 1 } : e)) },
    ];
    for (const v of variants) expect(() => assertUpdateAllowed(prev, v)).toThrow(/회귀/);
  });
  it("원자적 갱신: R3 후보가 거부되면 R1(입력 변경으로 허용될 후보)·R2 파일도 바이트 그대로이고 쓰기 0회", () => {
    const store = files();
    const before = new Map(store);
    const { io, writes } = memoryIo(store);
    const inputChangedR1 = (sc: Scenario, g: Golden): Golden => {
      if (sc.id === "R1") return { ...g, input: { ...g.input, commands: [...g.input.commands, { tick: 9999, kind: "startWave", payload: {} }] } };
      if (sc.id === "R3") return regressed(g, 3);
      return g;
    };
    expect(() => updateGoldens(SCENARIOS, io, candidates(inputChangedR1))).toThrow(GoldenMismatchError);
    expect(writes).toEqual([]);
    expect([...store]).toEqual([...before]);
  });
  it("입력 정의 변경(명령 추가)·코드 버전 변경은 결과가 달라도 허용되고 모든 시나리오를 쓴다", () => {
    for (const mutate of [
      (_: Scenario, g: Golden): Golden => ({ ...regressed(g, 1), input: { ...g.input, endPolicy: 123_456 } }),
      (_: Scenario, g: Golden): Golden => ({ ...regressed(g, 1), record: { ...regressed(g, 1).record, codeVersion: "attempt-v4" } }),
    ]) {
      const store = files();
      const { io, writes } = memoryIo(store);
      updateGoldens(SCENARIOS, io, candidates(mutate));
      expect(writes).toEqual(["R1", "R2", "R3"]);
    }
  });
  it("변경 없음·골든 없음은 허용(정상 갱신·최초 생성)", () => {
    const store = files();
    const { io, writes } = memoryIo(store);
    updateGoldens(SCENARIOS, io);
    expect(writes).toEqual(["R1", "R2", "R3"]);
    const fresh = memoryIo(new Map());
    updateGoldens(SCENARIOS, fresh.io);
    expect(fresh.writes).toEqual(["R1", "R2", "R3"]);
  });

  describe("RR1-F1: 같은 코드 버전의 이전 골든에 input 이 없거나 유효하지 않으면 거부", () => {
    const withoutInput = (g: Golden): any => {
      const old = structuredClone(g) as any;
      delete old.input;
      return old;
    };
    it("(1) 재현: input 삭제 + 같은 버전·같은 명령으로 tickHashes[1] 만 변경 → 거부, updateGoldens 쓰기 0회·파일 불변", () => {
      const store = files();
      const before = new Map(store);
      const old = withoutInput(JSON.parse(store.get("R1")!));
      store.set("R1", JSON.stringify(old));
      const snapshot = new Map(store);
      const { io, writes } = memoryIo(store);
      const changed = (sc: Scenario): Golden => {
        const g = buildGolden(sc);
        return sc.id === "R1" ? { ...g, tickHashes: g.tickHashes.map((h, i) => (i === 1 ? "ffffffffffffffff" : h)) } : g;
      };
      expect(() => updateGoldens(SCENARIOS, io, changed)).toThrow(GoldenMismatchError);
      expect(() => updateGoldens(SCENARIOS, io, changed)).toThrow(/유효한 input 이 없어/);
      expect(writes).toEqual([]);
      expect([...store]).toEqual([...snapshot]);
      expect(before.get("R2")).toBe(store.get("R2"));
    });
    it("(2) input 삭제만 하고 결과가 완전히 같은 후보도 같은 버전이면 거부", () => {
      const prev = buildGolden(R2);
      expect(() => assertUpdateAllowed(withoutInput(prev), buildGolden(R2))).toThrow(/유효한 input 이 없어/);
    });
    it("(3) input 없는 구형식이어도 codeVersion 이 다르면 허용", () => {
      const prev = withoutInput(buildGolden(R2));
      prev.record.codeVersion = "attempt-v2";
      expect(() => assertUpdateAllowed(prev, buildGolden(R2))).not.toThrow();
    });
    it("(4) 최초 생성·input 변경 허용 유지(위 F9 테스트)와 함께, input 변경 후보는 결과가 달라도 허용", () => {
      const prev = buildGolden(R2);
      const next = { ...regressed(prev, 1), input: { ...prev.input, attemptId: prev.input.attemptId + 1 } };
      expect(() => assertUpdateAllowed(prev, next)).not.toThrow();
      expect(() => assertUpdateAllowed(null, prev)).not.toThrow();
    });
    it("우회 경로: input 을 null·빈 객체·배열·문자열·숫자·알 수 없는 필드·필드 누락·잘못된 타입으로 바꾼 이전 골든은 같은 버전에서 모두 거부", () => {
      const prev = buildGolden(R2);
      const bad: unknown[] = [
        null,
        {},
        [],
        "x",
        7,
        { ...prev.input, extra: 1 },
        Object.fromEntries(Object.entries(prev.input).filter(([k]) => k !== "commands")),
        { ...prev.input, contentHash: "not-a-hash" },
        { ...prev.input, attemptId: "2" },
        { ...prev.input, endPolicy: -1 },
        { ...prev.input, endPolicy: "never" },
        { ...prev.input, commands: [{ tick: 1, kind: "build" }] },
        { ...prev.input, commands: [{ tick: 1.5, kind: "build", payload: {} }] },
      ];
      for (const input of bad) {
        const old = { ...structuredClone(prev), input } as unknown as Golden;
        expect(() => assertUpdateAllowed(old, regressed(prev, 1)), JSON.stringify(input)).toThrow(GoldenMismatchError);
      }
    });
    it("우회 경로: 이전 골든 자체가 손상(null·record 없음·codeVersion 비문자열·tickHashes 없음)되었거나 다른 시나리오 파일이면 거부", () => {
      const prev = buildGolden(R2);
      const next = regressed(prev, 1);
      for (const old of [{}, { scenario: "R2" }, { ...prev, record: null }, { ...prev, record: { ...prev.record, codeVersion: 3 } }, { ...prev, tickHashes: "x" }, "x", 5]) {
        expect(() => assertUpdateAllowed(old as unknown as Golden, next), JSON.stringify(old).slice(0, 40)).toThrow(/손상/);
      }
      expect(() => assertUpdateAllowed(buildGolden(R1), next)).toThrow(/시나리오 ID/);
    });
    it("새 후보의 input 이 유효하지 않아도 거부(주입된 build 가 형식을 깨는 경우)", () => {
      const prev = buildGolden(R2);
      expect(() => assertUpdateAllowed(prev, { ...prev, input: null } as unknown as Golden)).toThrow(/새 골든의 input/);
    });
    it("한계(문서화): 골든 파일을 직접 편집해 이전 골든의 codeVersion 을 낮추면 코드로 구분할 수 없어 허용된다 — 커밋 diff 리뷰로만 막는다", () => {
      const forged = structuredClone(buildGolden(R2)) as any;
      forged.record.codeVersion = "attempt-v2";
      expect(() => assertUpdateAllowed(forged, buildGolden(R2))).not.toThrow();
    });
  });
});

describe("불변식 helper 자체 (15.4)", () => {
  it("정상 trace 는 통과, 골드·투사체·둔화·타워 불변식 위반은 틱·이름을 담은 InvariantViolation", () => {
    const played = playScenario(R3);
    const content = createAttempt(R3.bundle(), R3.stageId, R3.attemptId).stageContent;
    const check = (mutate?: (ticks: any[]) => void): void => {
      const ticks = structuredClone(played.trace.ticks) as any[];
      mutate?.(ticks);
      const checker = new InvariantChecker(content);
      for (const t of ticks) if (t.tick > 0) checker.check(t.tick, t.state, t.events);
      checker.finish(ticks.length - 1, ticks[ticks.length - 1].state);
    };
    expect(() => check()).not.toThrow();
    const violation = (mutate: (ticks: any[]) => void): InvariantViolation => {
      try {
        check(mutate);
      } catch (e) {
        expect(e).toBeInstanceOf(InvariantViolation);
        return e as InvariantViolation;
      }
      throw new Error("위반이 감지돼야 함");
    };
    expect(violation((t) => (t[50].state.gold += 1))).toMatchObject({ tick: 50, invariant: "gold==초기+Σ원장" });
    const withProjectile = played.trace.ticks.findIndex((x) => (x.state as { projectiles: { kind: string }[] }).projectiles.some((p) => p.kind === "single"));
    expect(violation((t) => (t[withProjectile].state.projectiles.find((p: any) => p.kind === "single").targetEnemyId = 999))).toMatchObject({ tick: withProjectile, invariant: "single 대상 존재" });
    const withSlow = played.trace.ticks.findIndex((x) => (x.state as { enemies: { slows: unknown[] }[] }).enemies.some((e) => e.slows.length > 0));
    expect(violation((t) => (t[withSlow].state.enemies.find((e: any) => e.slows.length > 0).slows[0].expireTick = withSlow))).toMatchObject({ tick: withSlow, invariant: "둔화 expireTick>T" });
    expect(violation((t) => (t[10].state.towers[0].actuallyPaid += 1))).toMatchObject({ tick: 10, invariant: "actuallyPaid" });
    expect(violation((t) => (t[10].state.towers[1].cell = { ...t[10].state.towers[0].cell }))).toMatchObject({ tick: 10, invariant: "칸당 타워 1개" });
  });
});
