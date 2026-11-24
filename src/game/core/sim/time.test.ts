// T01~T04, T08, T09(산술), Q02(생성 순서). 모든 수치는 TEST_ONLY.
import { describe, expect, it } from "vitest";
import {
  TICK_MS,
  durationMsToTicks,
  expireTickFor,
  isExpired,
  msToTicks,
  planSpawns,
  ticksToMs,
} from "./time";

describe("시간 변환 (T01~T03)", () => {
  it("TICK_MS=50", () => {
    expect(TICK_MS).toBe(50);
  });
  it("T01: 0/50/100/1000ms → 0/1/2/20틱", () => {
    expect([0, 50, 100, 1000].map((ms) => msToTicks(ms))).toEqual([0, 1, 2, 20]);
  });
  it("T02: 50 배수가 아니거나 정수가 아닌 입력은 변환 전 오류(보정·형변환 없음)", () => {
    for (const bad of [1, 49, 51, 99, -50, -1]) {
      expect(() => msToTicks(bad), String(bad)).toThrow(RangeError);
    }
    for (const bad of [0.5, NaN, Infinity, -Infinity, 2 ** 53, null, true, "50", undefined]) {
      expect(() => msToTicks(bad), String(bad)).toThrow(TypeError);
    }
  });
  it("T03: 50×N (N=0..1000) 왕복, MAX_SAFE_INTEGER ms는 50의 배수가 아니라 오류", () => {
    for (let n = 0; n <= 1000; n += 1) {
      expect(msToTicks(50 * n)).toBe(n);
      expect(ticksToMs(n)).toBe(50 * n);
    }
    expect(() => msToTicks(Number.MAX_SAFE_INTEGER)).toThrow(RangeError);
    expect(msToTicks(9007199254740950)).toBe(180143985094819);
  });
});

describe("필드별 하한 (T04, C3 해소 기준)", () => {
  it("지속시간 필드(준비·둔화·공격 주기·TTL)는 0 오류, 50ms는 통과 — 몰래 1틱으로 보정하지 않음", () => {
    expect(() => durationMsToTicks(0)).toThrow(RangeError);
    expect(durationMsToTicks(50)).toBe(1);
    expect(() => durationMsToTicks(75)).toThrow(RangeError);
  });
  it("startMs=0 허용 (planSpawns)", () => {
    expect(planSpawns(5, [{ startMs: 0, count: 1, intervalMs: 0 }])).toEqual([{ tick: 5, segmentIndex: 0, index: 0 }]);
  });
  it("count>1에서 intervalMs=0은 오류, count=1에서 intervalMs=0은 단일 생성으로 허용, count<1 오류", () => {
    expect(() => planSpawns(1, [{ startMs: 0, count: 2, intervalMs: 0 }])).toThrow(RangeError);
    expect(planSpawns(1, [{ startMs: 100, count: 1, intervalMs: 0 }])).toHaveLength(1);
    expect(() => planSpawns(1, [{ startMs: 0, count: 0, intervalMs: 50 }])).toThrow(RangeError);
    expect(() => planSpawns(1, [{ startMs: -50, count: 1, intervalMs: 0 }])).toThrow(RangeError);
    expect(() => planSpawns(1, [{ startMs: 25, count: 1, intervalMs: 0 }])).toThrow(RangeError);
  });
});

describe("생성 순서 (T08, Q02) — 원본 S1 interval0/count2는 이제 오류가 정답", () => {
  it("waveStart=10, S0 start100/interval50/count3 + S1 start150/interval50/count2", () => {
    const plan = planSpawns(10, [
      { startMs: 100, count: 3, intervalMs: 50 },
      { startMs: 150, count: 2, intervalMs: 50 },
    ]);
    // (tick, segment, index) → enemyId는 이 순서의 1부터 순번: id1..5
    expect(plan.map((p) => [p.tick, p.segmentIndex, p.index])).toEqual([
      [12, 0, 0],
      [13, 0, 1],
      [13, 1, 0],
      [14, 0, 2],
      [14, 1, 1],
    ]);
  });
  it("Segment 입력 순서가 같은 틱의 순서를 정한다 (원본 순서 보존)", () => {
    const plan = planSpawns(0, [
      { startMs: 50, count: 1, intervalMs: 0 },
      { startMs: 50, count: 1, intervalMs: 0 },
      { startMs: 0, count: 1, intervalMs: 0 },
    ]);
    expect(plan.map((p) => [p.tick, p.segmentIndex])).toEqual([
      [0, 2],
      [1, 0],
      [1, 1],
    ]);
  });
  it("T05: waveStartTick=1, startMs=0, count=1 → 틱 1에 생성", () => {
    expect(planSpawns(1, [{ startMs: 0, count: 1, intervalMs: 0 }])[0].tick).toBe(1);
  });
});

describe("둔화 만료 산술 (T09; 단계별 동작은 SIM-02)", () => {
  it("T10 4단계 명중, 100ms → expireTick 12, 만료 판정은 tick >= expireTick", () => {
    const expire = expireTickFor(10, 100);
    expect(expire).toBe(12);
    expect([10, 11, 12, 13].map((t) => isExpired(t, expire))).toEqual([false, false, true, true]);
  });
  it("둔화 지속 0ms는 오류", () => {
    expect(() => expireTickFor(10, 0)).toThrow(RangeError);
  });
});
