import { describe, expect, it } from "vitest";
import { animationDelta } from "./animClock";

describe("animationDelta", () => {
  it("진행 중에는 배속을 곱한다", () => {
    expect(animationDelta(16, true, false, 1)).toBe(16);
    expect(animationDelta(16, true, false, 2)).toBe(32);
    expect(animationDelta(16, true, false, 5)).toBe(80);
  });
  it("일시정지는 0, 결과 잔여 재생은 배속과 무관하게 실제 시간", () => {
    expect(animationDelta(16, false, false, 5)).toBe(0);
    expect(animationDelta(16, false, true, 5)).toBe(16);
  });
  it("비정상 배속은 1배", () => {
    expect(animationDelta(10, true, false, 0)).toBe(10);
    expect(animationDelta(10, true, false, NaN)).toBe(10);
  });
});
