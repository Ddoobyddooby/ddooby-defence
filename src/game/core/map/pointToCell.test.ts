import { describe, expect, it } from "vitest";
import { pointToCell } from "./pointToCell";

/** 양의 유한 double 의 바로 이전 표현 가능 값. */
function prevDouble(v: number): number {
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, v);
  dv.setBigUint64(0, dv.getBigUint64(0) - BigInt(1));
  return dv.getFloat64(0);
}

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

describe("소수 tile 격자선 소유 (F1)", () => {
  for (const tile of [30.4, 30.9, 31.4, 34.2]) {
    it(`tile ${tile}: 모든 내부 세로·가로 경계 n*tile → 오른쪽·아래 칸, 바로 이전 double → 왼쪽·위 칸`, () => {
      for (let n = 1; n <= 17; n++) {
        const b = n * tile;
        expect(pointToCell(b, 5, tile)).toEqual({ col: n, row: 0 });
        expect(pointToCell(prevDouble(b), 5, tile)).toEqual({ col: n - 1, row: 0 });
      }
      for (let n = 1; n <= 9; n++) {
        const b = n * tile;
        expect(pointToCell(5, b, tile)).toEqual({ col: 0, row: n });
        expect(pointToCell(5, prevDouble(b), tile)).toEqual({ col: 0, row: n - 1 });
      }
    });
    it(`tile ${tile}: 모서리·끝선`, () => {
      expect(pointToCell(0, 0, tile)).toEqual({ col: 0, row: 0 });
      expect(pointToCell(18 * tile, 10 * tile, tile)).toEqual({ col: 17, row: 9 });
      expect(pointToCell(18 * tile, 0, tile)).toEqual({ col: 17, row: 0 });
      expect(pointToCell(prevDouble(18 * tile), prevDouble(10 * tile), tile)).toEqual({ col: 17, row: 9 });
      expect(pointToCell(18 * tile + 0.001, 5, tile)).toBeNull();
      expect(pointToCell(5, 10 * tile + 0.001, tile)).toBeNull();
      expect(pointToCell(-0.001, 5, tile)).toBeNull();
    });
  }
  it("재현 사례: tile 30.4, x=y=3*tile → (3,3)", () => {
    expect(pointToCell(3 * 30.4, 3 * 30.4, 30.4)).toEqual({ col: 3, row: 3 });
  });
  it("tile 34.2 의 15번째 세로선 513 → col 15 (이전 결함: col 14)", () => {
    expect(pointToCell(15 * 34.2, 1, 34.2)).toEqual({ col: 15, row: 0 });
  });
});
