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
];
