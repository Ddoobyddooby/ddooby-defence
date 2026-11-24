import { describe, expect, it } from "vitest";
import { pointToCell } from "./pointToCell";

describe("pointToCell (tile=64 → 1152×640)", () => {
  const T = 64;
  it("칸 내부", () => {
    expect(pointToCell(10, 10, T)).toEqual({ col: 0, row: 0 });
    expect(pointToCell(100, 200, T)).toEqual({ col: 1, row: 3 });
    expect(pointToCell(1151, 639, T)).toEqual({ col: 17, row: 9 });
  });
  it("경계선 정확히 → 오른쪽·아래 칸", () => {
    expect(pointToCell(64, 0, T)).toEqual({ col: 1, row: 0 });
    expect(pointToCell(0, 64, T)).toEqual({ col: 0, row: 1 });
    expect(pointToCell(128, 192, T)).toEqual({ col: 2, row: 3 });
    expect(pointToCell(63.999, 63.999, T)).toEqual({ col: 0, row: 0 });
  });
  it("원점 0, 끝선은 마지막 칸", () => {
    expect(pointToCell(0, 0, T)).toEqual({ col: 0, row: 0 });
    expect(pointToCell(1152, 100, T)).toEqual({ col: 17, row: 1 });
    expect(pointToCell(100, 640, T)).toEqual({ col: 1, row: 9 });
    expect(pointToCell(1152, 640, T)).toEqual({ col: 17, row: 9 });
  });
  it("음수·끝선 초과 → 없음", () => {
    expect(pointToCell(-0.001, 10, T)).toBeNull();
    expect(pointToCell(10, -0.001, T)).toBeNull();
    expect(pointToCell(1152.001, 10, T)).toBeNull();
    expect(pointToCell(10, 640.001, T)).toBeNull();
    expect(pointToCell(5000, 5000, T)).toBeNull();
  });
  it("NaN·Infinity·비수치 → 없음", () => {
    expect(pointToCell(Number.NaN, 10, T)).toBeNull();
    expect(pointToCell(10, Number.NaN, T)).toBeNull();
    expect(pointToCell(Number.POSITIVE_INFINITY, 10, T)).toBeNull();
    expect(pointToCell(10, Number.NEGATIVE_INFINITY, T)).toBeNull();
    expect(pointToCell("10" as unknown as number, 10, T)).toBeNull();
  });
  it("소수 좌표·소수 tile", () => {
    expect(pointToCell(95.9, 31.2, T)).toEqual({ col: 1, row: 0 });
    expect(pointToCell(2.5, 2.5, 1.25)).toEqual({ col: 2, row: 2 });
    expect(pointToCell(22.5, 12.5, 1.25)).toEqual({ col: 17, row: 9 });
    expect(pointToCell(22.51, 5, 1.25)).toBeNull();
  });
  it("-0 은 0 으로 정규화", () => {
    const c = pointToCell(-0, -0, T);
    expect(Object.is(c?.col, 0)).toBe(true);
    expect(Object.is(c?.row, 0)).toBe(true);
  });
  it("tile ≤ 0·비유한 → RangeError", () => {
    for (const t of [0, -1, -64, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => pointToCell(1, 1, t)).toThrow(RangeError);
    }
  });
});
