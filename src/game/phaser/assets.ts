// ART-03 — 스프라이트 규격 파일명(docs/ART-SPEC.md 3절, 76장). 텍스처 키 = 파일 이름(확장자 제외).
// 파일은 public/assets/game/ 에 둔다. 없거나 로드에 실패한 그림은 그 요소만 단순 도형으로 대체된다(게임은 항상 돌아감).
import type { EnemyType, TowerType, TraitType } from "../core/content/types";

export const ASSET_BASE = "/assets/game/";
export const TOWER_TYPES: readonly TowerType[] = ["archer", "ballista", "mage", "frost"];
export const ENEMY_TYPES: readonly EnemyType[] = ["normal", "fast", "heavy", "swarm"];

/** 스테이지 → 그림 테마 번호(0 초원·1 설원·2 폐허). Stage 4 는 설원, Stage 5 는 폐허 그림을 재사용한다(STAGE-45, ART-SPEC 3.1). */
export const STAGE_THEME: readonly number[] = [0, 1, 2, 1, 2];
export const themeOf = (stage: number): number => STAGE_THEME[Math.min(Math.max(stage, 0), STAGE_THEME.length - 1)];

// 아래 키 함수의 첫 인자는 **테마** 번호다(스테이지 아님). 스테이지에서 쓸 때는 themeOf(stage) 를 넘긴다.
export const groundKey = (stage: number, variant: 1 | 2 | 3): string => `s${stage + 1}-ground-${variant}`;
export const pathKey = (stage: number, base: "straight" | "corner"): string => `s${stage + 1}-path-${base}`;
export const spawnKey = (stage: number): string => `s${stage + 1}-spawn`;
export const gateKey = (stage: number): string => `s${stage + 1}-gate`;
/** 맵 장식(테마마다 8종, ART-SPEC 3.6). */
export const DECOR_VARIANTS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
export const decorKey = (stage: number, variant: number): string => `s${stage + 1}-deco-${variant}`;
export const towerKey = (type: TowerType, level: number): string => `tower-${type}-${Math.min(4, Math.max(1, level))}`;
export const enemyKey = (type: EnemyType): string => `enemy-${type}`;
export const TRAIT_SPRITE: Readonly<Record<TraitType, string>> = { controlResistance: "trait-resist", hpBoost: "trait-hp", speedBoost: "trait-speed" };
export const PROJECTILE_SPRITE: Readonly<Record<TowerType, string>> = { archer: "proj-arrow", ballista: "proj-bolt", mage: "proj-orb", frost: "proj-shard" };
export const FX_KEYS = ["fx-blast", "fx-frost", "fx-hit", "fx-slow"] as const;

/** 규격 76장의 텍스처 키(파일명에서 .png 를 뺀 것). */
export const ASSET_NAMES: readonly string[] = [
  ...[0, 1, 2].flatMap((s) => [groundKey(s, 1), groundKey(s, 2), groundKey(s, 3), pathKey(s, "straight"), pathKey(s, "corner"), spawnKey(s), gateKey(s), ...DECOR_VARIANTS.map((v) => decorKey(s, v))]),
  ...TOWER_TYPES.flatMap((t) => [1, 2, 3, 4].map((l) => towerKey(t, l))),
  ...ENEMY_TYPES.map(enemyKey),
  ...Object.values(TRAIT_SPRITE),
  ...Object.values(PROJECTILE_SPRITE),
  ...FX_KEYS,
];

export const assetUrl = (name: string): string => `${ASSET_BASE}${name}.png`;

/**
 * 적 그림(128 캔버스, D안 시안 실측)의 머리 꼭대기 y(0~1, 위가 0)와 몸 가로 폭(0~1). 체력 바·특성 표식을 머리 위에 붙이는 데 쓴다.
 * 발 기준점은 y 0.85(스프라이트 한 변 × 0.85 가 발). 최종 그림이 오면 값만 조정한다.
 */
export const ENEMY_ART_METRICS: Readonly<Record<EnemyType, { readonly headTop: number; readonly bodyW: number }>> = {
  normal: { headTop: 29 / 128, bodyW: 56 / 128 },
  fast: { headTop: 60 / 128, bodyW: 91 / 128 },
  heavy: { headTop: 3 / 128, bodyW: 114 / 128 },
  swarm: { headTop: 67 / 128, bodyW: 47 / 128 },
};
