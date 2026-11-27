// ART-03 — 맵 장식 배치(순수 함수, docs/ART-SPEC.md 3.6). 길·생성·기지 칸(map.blocked)이 아닌 빈 칸 중 약 10% 에,
// 칸 좌표 정수 해시로 결정적으로 놓는다(같은 맵이면 항상 같은 자리·종류, 난수 없음). 같은 행·열로 이웃한 칸에는 놓지 않는다.
// 시각 전용: 설치·입력·게임 상태와 무관하다.
import { cellIndex, type CompiledStageMap } from "../core/map/stageMap";

export type DecorVariant = 1 | 2 | 3 | 4 | 5;
export interface DecorCell {
  readonly col: number;
  readonly row: number;
  readonly variant: DecorVariant;
}

/** 후보 칸이 장식 칸으로 뽑히는 확률(%). 이웃 금지 규칙으로 줄어드는 몫을 감안해 10% 보다 약간 높게 둔다(결과 약 8~11%). */
const PICK_PERCENT = 11;

const hash = (col: number, row: number, salt: number): number => {
  let h = (Math.imul(col + 1, 374761393) ^ Math.imul(row + 1, 668265263) ^ Math.imul(salt, 2147483647)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822519) >>> 0;
  return (h ^ (h >>> 15)) >>> 0;
};

/** 맵 → 장식 칸 목록(행 우선 순서). */
export function computeDecor(map: CompiledStageMap): DecorCell[] {
  const out: DecorCell[] = [];
  const chosen = new Set<number>();
  for (let row = 0; row < 10; row++)
    for (let col = 0; col < 18; col++) {
      if (map.blocked.has(cellIndex({ col, row }))) continue;
      if (hash(col, row, 1) % 100 >= PICK_PERCENT) continue;
      // 행 우선으로 훑으므로 왼쪽·위쪽 이웃만 확인하면 같은 행·열 인접이 모두 걸러진다.
      if ((col > 0 && chosen.has(cellIndex({ col: col - 1, row }))) || (row > 0 && chosen.has(cellIndex({ col, row: row - 1 })))) continue;
      chosen.add(cellIndex({ col, row }));
      out.push({ col, row, variant: ((hash(col, row, 2) % 5) + 1) as DecorVariant });
    }
  return out;
}
