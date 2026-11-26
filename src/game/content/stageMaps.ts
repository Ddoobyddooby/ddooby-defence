// MAP-01 후보 맵 데이터 (SIM-CONTRACT 10.2, 사용자 승인 2026-11-24 — 수치 아님, BAL-01에서 재검토 가능).
// 순수 TS 데이터: framework import·결정성 금지 규칙 적용 대상(eslint.config.mjs).
import type { StageMap } from "../core/map/stageMap";

const w = (col: number, row: number) => ({ col, row });

export const STAGE_MAPS: readonly StageMap[] = [
  {
    stageId: "stage-1-meadow-outpost",
    waypoints: [w(0, 2), w(15, 2), w(15, 5), w(2, 5), w(2, 8), w(17, 8)],
    reservedCells: [],
  },
  {
    stageId: "stage-2-snowfall-pass",
    waypoints: [w(0, 1), w(14, 1), w(14, 4), w(8, 4), w(8, 8), w(17, 8)],
    reservedCells: [],
  },
  {
    stageId: "stage-3-dusk-ruins",
    waypoints: [w(0, 8), w(2, 8), w(2, 1), w(7, 1), w(7, 7), w(12, 7), w(12, 3), w(15, 3), w(15, 6), w(17, 6)],
    reservedCells: [],
  },
  // STAGE-45(2026-11-27, 사용자 결정): Stage 4 설원 테마 — 위쪽 가장자리에서 진입하는 빗살 경로(36칸).
  {
    stageId: "stage-4-frozen-ridge",
    waypoints: [w(3, 0), w(3, 7), w(7, 7), w(7, 2), w(11, 2), w(11, 7), w(15, 7), w(15, 3), w(17, 3)],
    reservedCells: [],
  },
  // Stage 5 폐허 테마 — 바깥을 도는 나선, 기지가 맵 안쪽(12,4)에 있다(54칸).
  {
    stageId: "stage-5-fallen-citadel",
    waypoints: [w(0, 1), w(16, 1), w(16, 8), w(1, 8), w(1, 4), w(12, 4)],
    reservedCells: [],
  },
];
