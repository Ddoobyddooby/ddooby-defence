// TEST_ONLY — 장난감 시뮬 테스트 공용 fixture. 모든 수치는 테스트용이며 밸런스 후보가 아니다.
import type { ToyContent } from "./toySim";

/** SIM-CONTRACT 7.1 toy: gold100, 설치 비용 60, 환급 50%, 준비 2000ms(40틱 — 틱 0..4 동안 준비 유지). */
export const TOY_CONTENT: ToyContent = {
  contentVersion: "test-content-v1",
  initialGold: 100,
  buildCost: 60,
  refundRateBp: 5000,
  prepMs: 2000,
};

export const TOY_STAGE_ID = "stage-test";

export const tile = (col: number, row = 0): { col: number; row: number } => ({ col, row });
