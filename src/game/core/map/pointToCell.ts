// 입력 좌표 → 칸 (SIM-CONTRACT 10.1). 코어 밖 입력 어댑터가 쓰는 유일한 소수 연산이며 결과는 정수 칸이다.
import { GRID_COLS, GRID_ROWS, type Cell } from "../grid";

/** 경계선은 오른쪽·아래 칸, 끝선(x==18·tile, y==10·tile)은 마지막 칸. 범위 밖·비유한 값은 null. tile ≤ 0 또는 비유한은 RangeError. */
export function pointToCell(x: number, y: number, tile: number): Cell | null {
  if (typeof tile !== "number" || !Number.isFinite(tile) || tile <= 0) throw new RangeError(`tile: 양의 유한수여야 함 (${String(tile)})`);
  if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < 0 || y < 0 || x > GRID_COLS * tile || y > GRID_ROWS * tile) return null;
  return { col: owningIndex(x, tile, GRID_COLS), row: owningIndex(y, tile, GRID_ROWS) };
}

/** floor(v/tile)는 소수 tile에서 격자선(n*tile)의 소유를 틀릴 수 있어, 렌더가 쓰는 n*tile 경계와 직접 비교해 보정한다. 끝선은 마지막 칸. */
function owningIndex(v: number, tile: number, count: number): number {
  let c = Math.min(Math.max(Math.floor(v / tile), 0), count - 1);
  while (c < count - 1 && v >= (c + 1) * tile) c++;
  while (c > 0 && v < c * tile) c--;
  return c + 0;
}
