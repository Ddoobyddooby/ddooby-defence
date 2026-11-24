// S01, S06, S07, S08 — golden은 Python 정수 산술로 한 번 산출해 체크인한 값(제품 함수로 즉석 계산하지 않음).
import { describe, expect, it } from "vitest";
import { canonicalize } from "./canonical";
import { contentHashOf, fnv1a64, fnv1a64Bytes, tickEnvelope, tickHash } from "./hash";
import { firstDifference } from "./replay";

describe("FNV-1a 64 (S01, S06)", () => {
  it("S06: UTF-8 바이트 golden", () => {
    expect(fnv1a64("")).toBe("cbf29ce484222325");
    expect(fnv1a64("a")).toBe("af63dc4c8601ec8c");
    expect(fnv1a64("foobar")).toBe("85944171f73967e8");
    expect(fnv1a64("한글")).toBe("5900dac74a762e41");
  });
  it("S06: 한글은 UTF-16 코드 단위가 아니라 UTF-8 바이트(6바이트)를 해시한다", () => {
    const bytes = new Uint8Array([0xed, 0x95, 0x9c, 0xea, 0xb8, 0x80]);
    expect(fnv1a64Bytes(bytes)).toBe("5900dac74a762e41");
    // UTF-16 코드 단위(0xD55C, 0xAE00)를 낮은 바이트로 잘라 해시한 값과 달라야 한다.
    expect(fnv1a64Bytes(new Uint8Array([0x5c, 0x00]))).not.toBe("5900dac74a762e41");
  });
  it("S01: {b:2,a:1} 정규 문자열의 해시", () => {
    expect(fnv1a64(canonicalize({ b: 2, a: 1 }))).toBe("a0ebc03bdc71de7b");
    expect(contentHashOf({ b: 2, a: 1 })).toBe("a0ebc03bdc71de7b");
  });
  it("출력은 항상 소문자 16자리 (0 채움)", () => {
    for (const s of ["", "a", "x".repeat(100), "한글"]) expect(fnv1a64(s)).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("틱 envelope (S07)", () => {
  it("S07: {state:{b:2,a:1},events:[]} → 정확한 바이트 문자열과 해시", () => {
    const env = tickEnvelope([], { b: 2, a: 1 });
    expect(env).toBe('{"events":[],"state":{"a":1,"b":2}}');
    expect(tickHash([], { b: 2, a: 1 })).toBe("9e35c5c623b68b4f");
  });
  it("이벤트 객체 키도 재귀 정렬된다", () => {
    expect(tickEnvelope([{ type: "x", eventSeq: 1 }], {})).toBe('{"events":[{"eventSeq":1,"type":"x"}],"state":{}}');
  });
});

describe("S08: 상태 일부만 달라도 문자열·해시·진단 경로가 달라진다", () => {
  const base = () => ({
    attemptId: 1,
    consumedEconomyEvents: ["build:c1"],
    counters: { nextCommandSeq: 3, nextEnemyId: 1, nextEventSeq: 3, nextProjectileId: 1, nextTowerId: 2 },
    gold: 40,
    prepTicksRemaining: 39,
    queue: [] as unknown[],
    tick: 1,
  });
  const events = [{ eventSeq: 1, type: "towerBuilt" }];

  it("무변경 대조: 같은 입력은 같은 문자열·해시", () => {
    expect(tickEnvelope(events, base())).toBe(tickEnvelope(events, base()));
    expect(tickHash(events, base())).toBe(tickHash(events, base()));
    expect(firstDifference(base(), base(), "state")).toBeNull();
  });
  const mutations: [string, (s: ReturnType<typeof base>) => void, string][] = [
    ["nextTowerId", (s) => (s.counters.nextTowerId = 3), "state.counters.nextTowerId"],
    ["nextCommandSeq", (s) => (s.counters.nextCommandSeq = 4), "state.counters.nextCommandSeq"],
    ["nextEventSeq", (s) => (s.counters.nextEventSeq = 4), "state.counters.nextEventSeq"],
    ["큐", (s) => s.queue.push({ seq: 1 }), "state.queue.length"],
    ["타이머", (s) => (s.prepTicksRemaining = 38), "state.prepTicksRemaining"],
    ["소비 키", (s) => s.consumedEconomyEvents.push("sell:t1"), "state.consumedEconomyEvents.length"],
  ];
  for (const [label, mutate, path] of mutations) {
    it(`${label} 변경 검출`, () => {
      const changed = base();
      mutate(changed);
      expect(tickEnvelope(events, changed)).not.toBe(tickEnvelope(events, base()));
      expect(tickHash(events, changed)).not.toBe(tickHash(events, base()));
      expect(firstDifference(base(), changed, "state")?.path).toBe(path);
    });
  }
});
