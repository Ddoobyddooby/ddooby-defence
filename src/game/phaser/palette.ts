// 단순 도형 자리표시 색 (UI-CONTRACT 8절, DESIGN.md 시안 색감). 실제 스프라이트·최종 색은 후속 디자인 태스크가 교체한다.
import type { EnemyType, TowerType, TraitType } from "../core/content/types";

export interface StagePalette {
  readonly letterbox: number;
  readonly ground: number;
  readonly groundAlt: number;
  readonly path: number;
  readonly pathEdge: number;
  readonly grid: number;
  readonly gridAlpha: number;
  readonly start: number;
  readonly gate: number;
  readonly gateDark: number;
}

/** Stage 1 잔디 초록·황토 길 / Stage 2 눈 흰색·회청 길 / Stage 3 어두운 석재·밝은 석판 길. */
export const STAGE_PALETTES: readonly StagePalette[] = [
  { letterbox: 0x16251a, ground: 0x4f8a3e, groundAlt: 0x57954a, path: 0xc9a165, pathEdge: 0xa88347, grid: 0xffffff, gridAlpha: 0.1, start: 0xf4e3a1, gate: 0x2f9e9a, gateDark: 0x23343a },
  { letterbox: 0x1b2430, ground: 0xe9f0f5, groundAlt: 0xdde7ef, path: 0x7d93a8, pathEdge: 0x62788d, grid: 0x34506a, gridAlpha: 0.12, start: 0xcfe3f2, gate: 0x2f9e9a, gateDark: 0x23343a },
  { letterbox: 0x0e0d14, ground: 0x2f2d3a, groundAlt: 0x35333f, path: 0xb9b4a3, pathEdge: 0x948f7e, grid: 0xffffff, gridAlpha: 0.07, start: 0xe7c97a, gate: 0x2f9e9a, gateDark: 0x15171c },
];
export const paletteOf = (stageIndex: number): StagePalette => STAGE_PALETTES[Math.min(Math.max(stageIndex, 0), STAGE_PALETTES.length - 1)];

export const TOWER_COLORS: Readonly<Record<TowerType, number>> = { archer: 0xe0b341, ballista: 0xc8473d, mage: 0x8e5fd0, frost: 0x6cc4e8 };
export const ENEMY_COLORS: Readonly<Record<EnemyType, number>> = { normal: 0xe8e0c8, fast: 0xc99a5b, heavy: 0x6b8f4e, swarm: 0xa3c94a };
/** 한 마리의 지름 비율(타일 대비 반지름): 군집형 작게·중장형 크게. */
export const ENEMY_RADIUS: Readonly<Record<EnemyType, number>> = { normal: 0.24, fast: 0.2, heavy: 0.33, swarm: 0.15 };
export const TRAIT_COLORS: Readonly<Record<TraitType, number>> = { controlResistance: 0x4aa3ff, hpBoost: 0xff5a4f, speedBoost: 0xffd23f };

export const UI_COLORS = {
  rangeFill: 0xffffff,
  rangeStroke: 0xffffff,
  placeOk: 0x58d36a,
  placeBad: 0xe5534b,
  select: 0xfff1a8,
  hpBack: 0x1a1a1a,
  hpHigh: 0x58d36a,
  hpLow: 0xe5534b,
  slowRing: 0xbfe9ff,
  frostHit: 0xe8f7ff,
  explosion: 0xb98cf0,
  flash: 0xff6b5f,
} as const;
