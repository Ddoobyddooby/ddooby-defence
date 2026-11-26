// ART-03 — 스프라이트 규격 파일명(docs/ART-SPEC.md 3절, 52장). 텍스처 키 = 파일 이름(확장자 제외).
// 파일은 public/assets/game/ 에 둔다. 없거나 로드에 실패한 그림은 그 요소만 단순 도형으로 대체된다(게임은 항상 돌아감).
import type { EnemyType, TowerType, TraitType } from "../core/content/types";

export const ASSET_BASE = "/assets/game/";
export const TOWER_TYPES: readonly TowerType[] = ["archer", "ballista", "mage", "frost"];
export const ENEMY_TYPES: readonly EnemyType[] = ["normal", "fast", "heavy", "swarm"];

export const groundKey = (stage: number, variant: 1 | 2 | 3): string => `s${stage + 1}-ground-${variant}`;
export const pathKey = (stage: number, base: "straight" | "corner"): string => `s${stage + 1}-path-${base}`;
export const spawnKey = (stage: number): string => `s${stage + 1}-spawn`;
export const gateKey = (stage: number): string => `s${stage + 1}-gate`;
export const towerKey = (type: TowerType, level: number): string => `tower-${type}-${Math.min(4, Math.max(1, level))}`;
export const enemyKey = (type: EnemyType): string => `enemy-${type}`;
export const TRAIT_SPRITE: Readonly<Record<TraitType, string>> = { controlResistance: "trait-resist", hpBoost: "trait-hp", speedBoost: "trait-speed" };
export const PROJECTILE_SPRITE: Readonly<Record<TowerType, string>> = { archer: "proj-arrow", ballista: "proj-bolt", mage: "proj-orb", frost: "proj-shard" };
export const FX_KEYS = ["fx-blast", "fx-frost", "fx-hit", "fx-slow"] as const;

/** 규격 52장의 텍스처 키(파일명에서 .png 를 뺀 것). */
export const ASSET_NAMES: readonly string[] = [
  ...[0, 1, 2].flatMap((s) => [groundKey(s, 1), groundKey(s, 2), groundKey(s, 3), pathKey(s, "straight"), pathKey(s, "corner"), spawnKey(s), gateKey(s)]),
  ...TOWER_TYPES.flatMap((t) => [1, 2, 3, 4].map((l) => towerKey(t, l))),
  ...ENEMY_TYPES.map(enemyKey),
  ...Object.values(TRAIT_SPRITE),
  ...Object.values(PROJECTILE_SPRITE),
  ...FX_KEYS,
];

export const assetUrl = (name: string): string => `${ASSET_BASE}${name}.png`;
