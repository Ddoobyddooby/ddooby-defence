import { describe, expect, it } from "vitest";
import { GRID_COLS, GRID_ROWS, isInsideGrid } from "./grid";

describe("grid", () => {
  it("is 18 columns by 10 rows", () => {
    expect([GRID_COLS, GRID_ROWS]).toEqual([18, 10]);
  });

  it("accepts the four corner cells", () => {
    for (const cell of [
      { col: 0, row: 0 },
      { col: 17, row: 0 },
      { col: 0, row: 9 },
      { col: 17, row: 9 },
    ]) {
      expect(isInsideGrid(cell)).toBe(true);
    }
  });

  it("rejects cells just outside the edges and non-integer cells", () => {
    for (const cell of [
      { col: -1, row: 0 },
      { col: 18, row: 0 },
      { col: 0, row: -1 },
      { col: 0, row: 10 },
      { col: 0.5, row: 0 },
      { col: Number.NaN, row: 0 },
    ]) {
      expect(isInsideGrid(cell)).toBe(false);
    }
  });
});
