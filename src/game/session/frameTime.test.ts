import { describe, expect, it } from "vitest";
import { frameDelta, MAX_FRAME_DELTA_MS } from "./frameTime";

describe("frameDelta (리뷰 UI-01 F1)", () => {
  it("첫 프레임(last=null)은 0", () => {
    expect(frameDelta(1000, null)).toBe(0);
  });
  it("보통 프레임은 그대로(16.7ms, 33ms, 정확히 상한 250ms)", () => {
    expect(frameDelta(1016.7, 1000)).toBeCloseTo(16.7, 5);
    expect(frameDelta(1033, 1000)).toBe(33);
    expect(frameDelta(1250, 1000)).toBe(250);
  });
  it("상한 경계: 250.001ms 는 250 으로, 탭 복귀 수 초·수 분은 250", () => {
    expect(frameDelta(1250.001, 1000)).toBe(MAX_FRAME_DELTA_MS);
    expect(frameDelta(7000, 1000)).toBe(250);
    expect(frameDelta(1_000_000, 1000)).toBe(250);
  });
  it("0·음수(시계 역행)·NaN·Infinity 는 0", () => {
    expect(frameDelta(1000, 1000)).toBe(0);
    expect(frameDelta(900, 1000)).toBe(0);
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(frameDelta(bad, 1000)).toBe(0);
      expect(frameDelta(1000, bad)).toBe(0);
    }
  });
});
