// ART-03 — 맵 장식 배치(순수 함수, docs/ART-SPEC.md 3.6). 길·생성·기지 칸(map.blocked)이 아닌 빈 칸 중 약 20% 에,
// 칸 좌표·스테이지 id 정수 해시로 결정적으로 놓는다(같은 맵이면 항상 같은 자리·종류, 난수 없음). 같은 행·열로 이웃한 칸에는 놓지 않는다.
// 종류는 테마별 가중표(DECOR_WEIGHTS)로 고른다. 시각 전용: 설치·입력·게임 상태와 무관하다.
import { cellIndex, type CompiledStageMap } from "../core/map/stageMap";

export type DecorVariant = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export const DECOR_KINDS = 8;
export interface DecorCell {
  readonly col: number;
  readonly row: number;
  readonly variant: DecorVariant;
}

/** 종류별 가중치(합 = 확률의 분모). 인덱스 = 종류 1~8. 초원: 나무·꽃(1·3·6·7·8) 자주, 덤불(2) 보통, 돌·그루터기(4·5) 드물게. 설원·폐허는 일단 균등(같은 구조). */
export const DECOR_WEIGHTS: readonly (readonly number[])[] = [
  [4, 3, 4, 1, 1, 4, 4, 4],
  [1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1],
];

/** 후보 칸이 장식 칸으로 뽑히는 확률(%). 같은 행·열 이웃 금지로 줄어드는 몫을 감안해 20% 보다 높게 둔다(결과 약 20%). */
const PICK_PERCENT = 29;

const hash = (col: number, row: number, salt: number): number => {
  let h = (Math.imul(col + 1, 374761393) ^ Math.imul(row + 1, 668265263) ^ Math.imul(salt | 0, 2147483647)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822519) >>> 0;
  return (h ^ (h >>> 15)) >>> 0;
};

/** 스테이지 id 문자열 → 해시 salt(FNV-1a). 같은 테마를 쓰는 스테이지끼리 자리가 겹치지 않게 한다. */
const stageSalt = (stageId: string): number => {
  let h = 2166136261;
  for (let i = 0; i < stageId.length; i++) h = Math.imul(h ^ stageId.charCodeAt(i), 16777619) >>> 0;
  return h;
};

/** 맵 → 장식 칸 목록(행 우선 순서). theme = 그림 테마 번호(0 초원·1 설원·2 폐허, 가중표 선택용). */
export function computeDecor(map: CompiledStageMap, theme = 0): DecorCell[] {
  const weights = DECOR_WEIGHTS[Math.min(Math.max(theme, 0), DECOR_WEIGHTS.length - 1)];
  const total = weights.reduce((a, b) => a + b, 0);
  const salt = stageSalt(map.stageId);
  const out: DecorCell[] = [];
  const chosen = new Set<number>();
  for (let row = 0; row < 10; row++)
    for (let col = 0; col < 18; col++) {
      if (map.blocked.has(cellIndex({ col, row }))) continue;
      if (hash(col, row, salt ^ 1) % 100 >= PICK_PERCENT) continue;
      // 행 우선으로 훑으므로 왼쪽·위쪽 이웃만 확인하면 같은 행·열 인접이 모두 걸러진다.
      if ((col > 0 && chosen.has(cellIndex({ col: col - 1, row }))) || (row > 0 && chosen.has(cellIndex({ col, row: row - 1 })))) continue;
      chosen.add(cellIndex({ col, row }));
      let r = hash(col, row, salt ^ 2) % total;
      let v = 0;
      while (r >= weights[v]) r -= weights[v++];
      out.push({ col, row, variant: (v + 1) as DecorVariant });
    }
  return out;
}
