// BAL-01 자리 점수 (BALANCE 3.1): 칸 중심에서 타워 Lv1 사거리 안에 들어오는 경로 길이를 100mt 간격 표본의 개수로 센다.
// 설치 가능 칸(경로·예약 제외)만, 점수 내림차순 → 동률은 row 작은 순 → col 작은 순. 순수 정수 계산(결정적).
import { type CompiledStageMap, CELL_MT, isBuildable, progressToPosition, type PointMt } from "../core/map";
import { GRID_COLS, GRID_ROWS } from "../core/grid";

export const PATH_SAMPLE_MT = 100;

export interface ScoredCell {
  readonly col: number;
  readonly row: number;
  readonly score: number;
}

/** 경로를 100mt 간격으로 표본화한 점(0 과 끝 포함). */
export function pathSamples(map: CompiledStageMap): PointMt[] {
  const out: PointMt[] = [];
  for (let p = 0; p <= map.pathLengthMt; p += PATH_SAMPLE_MT) out.push(progressToPosition(map, p));
  return out;
}

/** 칸 중심에서 rangeMt 이내(경계 포함)인 표본 수. */
export function scoreCell(samples: readonly PointMt[], col: number, row: number, rangeMt: number): number {
  const cx = col * CELL_MT + CELL_MT / 2;
  const cy = row * CELL_MT + CELL_MT / 2;
  const r2 = rangeMt * rangeMt;
  let n = 0;
  for (const s of samples) {
    const dx = s.x - cx;
    const dy = s.y - cy;
    if (dx * dx + dy * dy <= r2) n += 1;
  }
  return n;
}

/** 설치 가능한 모든 칸을 점수 순으로(점유는 호출 쪽이 걸러낸다). */
export function rankCells(map: CompiledStageMap, samples: readonly PointMt[], rangeMt: number): ScoredCell[] {
  const empty = new Set<number>();
  const cells: ScoredCell[] = [];
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      if (!isBuildable(map, { col, row }, empty)) continue;
      cells.push({ col, row, score: scoreCell(samples, col, row, rangeMt) });
    }
  }
  return cells.sort((a, b) => b.score - a.score || a.row - b.row || a.col - b.col);
}
