// 입력 좌표 → 칸 (SIM-CONTRACT 10.1). 코어 밖 입력 어댑터가 쓰는 유일한 소수 연산이며 결과는 정수 칸이다.
import { GRID_COLS, GRID_ROWS, type Cell } from "../grid";

/** 경계선은 오른쪽·아래 칸, 끝선(x==18·tile, y==10·tile)은 마지막 칸. 범위 밖·비유한 값은 null. tile ≤ 0 또는 비유한은 RangeError. */
export function pointToCell(x: number, y: number, tile: number): Cell | null {
  if (typeof tile !== "number" || !Number.isFinite(tile) || tile <= 0) throw new RangeError(`tile: 양의 유한수여야 함 (${String(tile)})`);
  if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < 0 || y < 0 || x > GRID_COLS * tile || y > GRID_ROWS * tile) return null;
  const col = Math.min(Math.floor(x / tile), GRID_COLS - 1);
  const row = Math.min(Math.floor(y / tile), GRID_ROWS - 1);
  return { col: col + 0, row: row + 0 };
}
