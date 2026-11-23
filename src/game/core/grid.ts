// 순수 TypeScript 게임 코어: next / react / phaser import 금지 (eslint.config.mjs에서 강제).
// SPEC 1·2절 [확정]: 18열×10행 정사각 논리 타일.

export const GRID_COLS = 18;
export const GRID_ROWS = 10;

export interface Cell {
  readonly col: number;
  readonly row: number;
}

export function isInsideGrid({ col, row }: Cell): boolean {
  return (
    Number.isInteger(col) &&
    Number.isInteger(row) &&
    col >= 0 &&
    col < GRID_COLS &&
    row >= 0 &&
    row < GRID_ROWS
  );
}
