// 웨이브 미리보기 (UI-CONTRACT 7.1): 웨이브 정의에서 파생하는 순수 함수. 코어 상태를 바꾸지 않는다.
import type { EnemyType, TraitType, WaveDef } from "../core/content/types";

export interface WaveGroup {
  readonly enemyType: EnemyType;
  readonly trait: TraitType | null;
  readonly count: number;
}

/** 묶음 = (적 종류, 특성) 쌍. 마릿수는 그 쌍의 모든 구간 count 합, 순서는 원본 구간에서 그 쌍이 처음 나온 순서. */
export function wavePreview(wave: WaveDef): readonly WaveGroup[] {
  const groups: { enemyType: EnemyType; trait: TraitType | null; count: number }[] = [];
  for (const seg of wave.segments) {
    const found = groups.find((g) => g.enemyType === seg.enemyType && g.trait === seg.trait);
    if (found === undefined) groups.push({ enemyType: seg.enemyType, trait: seg.trait, count: seg.count });
    else found.count += seg.count;
  }
  return groups;
}
