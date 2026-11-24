// N11, N12, N13, N14 — SIM-CONTRACT 3.3 파생 능력치 정수 식. 모든 수치는 TEST_ONLY.
import { describe, expect, it } from "vitest";
import {
  baseSpeedPerTick,
  boostedMaxHp,
  boostedSpeedPerTick,
  effectiveSlowBp,
  refundFor,
  slowedSpeedPerTick,
} from "./formulas";

describe("체력·둔화 (N11, N12)", () => {
  it("N11: baseHp 101 +2500bp → 126, baseHp 1 +0 → 1", () => {
    expect(boostedMaxHp(101, 2500)).toBe(126);
    expect(boostedMaxHp(1, 0)).toBe(1);
    expect(boostedMaxHp(0, 0)).toBe(1); // max(1, …)
  });
  it("N12: 둔화 5000 저항 2500 → 3750, 저항 10000 → 0, 저항 범위 밖은 오류", () => {
    expect(effectiveSlowBp(5000, 2500)).toBe(3750);
    expect(effectiveSlowBp(5000, 10000)).toBe(0);
    expect(() => effectiveSlowBp(5000, -1)).toThrow(RangeError);
    expect(() => effectiveSlowBp(5000, 10001)).toThrow(RangeError);
  });
});

describe("속도 (N14, C2) — 먼저 mt/틱으로 변환한 뒤 특성·둔화를 적용", () => {
  it("1000mt/s, boost 0, slow 2500 → 38mt/틱 (37.5를 저장하면 실패)", () => {
    const base = baseSpeedPerTick(1000);
    expect(base).toBe(50);
    expect(slowedSpeedPerTick(boostedSpeedPerTick(base, 0), 2500)).toBe(38);
  });
  it("20mt/s, boost +5000, slow 0 → 2mt/틱 (1.5를 저장하면 실패)", () => {
    expect(slowedSpeedPerTick(boostedSpeedPerTick(baseSpeedPerTick(20), 5000), 0)).toBe(2);
  });
  it("최소 1mt/틱 보장, 20의 배수가 아닌 데이터 속도·둔화 범위 밖은 오류", () => {
    expect(slowedSpeedPerTick(1, 10000)).toBe(1);
    expect(() => baseSpeedPerTick(30)).toThrow(RangeError);
    expect(() => baseSpeedPerTick(-20)).toThrow(RangeError);
    expect(() => slowedSpeedPerTick(50, 10001)).toThrow(RangeError);
  });
});

describe("환급 (N13)", () => {
  it("실제 지출 3, 50% → 1 (반올림이면 2)", () => {
    expect(refundFor(3, 5000)).toBe(1);
  });
  it("설치 1 + 강화 1 = 누적 2, 50% → 1 (거래별 내림 합은 0)", () => {
    expect(refundFor(1 + 1, 5000)).toBe(1);
    expect(refundFor(1, 5000) + refundFor(1, 5000)).toBe(0);
  });
});
