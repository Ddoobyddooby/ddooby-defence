// SIM-02 — 타워 레벨 N 누적 능력치 (SIM-CONTRACT 11.1·14.1). Lv N = base + inc[0] + … + inc[N−2], 필드별 누적.
import { addSafe, assertSafeInteger } from "../sim/intmath";
import type { CommonLevelFields, TowerDef } from "./types";

export const MAX_TOWER_LEVEL = 4;

/** 레벨 능력치. 종류별 필드(mage: aoeRadiusMt, frost: slowBp·slowDurationMs)는 해당 종류에만 있다. */
export type TowerLevelView = CommonLevelFields & {
  readonly aoeRadiusMt?: number;
  readonly slowBp?: number;
  readonly slowDurationMs?: number;
};

export function towerLevelStats(def: TowerDef, level: number): TowerLevelView {
  assertSafeInteger(level, "level");
  if (level < 1 || level > MAX_TOWER_LEVEL) throw new RangeError(`level: 1..${MAX_TOWER_LEVEL} 범위 밖 (${level})`);
  const acc: Record<string, number> = { ...(def.levels.base as unknown as Record<string, number>) };
  for (let i = 0; i < level - 1; i += 1) {
    const inc = def.levels.increments[i] as unknown as Record<string, number>;
    for (const field of Object.keys(acc)) acc[field] = addSafe(acc[field], inc[field]);
  }
  return acc as unknown as TowerLevelView;
}
