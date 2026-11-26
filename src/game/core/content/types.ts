// DATA-01 — 콘텐츠 묶음 타입 (SIM-CONTRACT 11.1). 값이 아니라 형식만 정한다. 실제 수치는 미승인(BAL-01).
import type { StageMap } from "../map/stageMap";

export const TOWER_TYPES = ["archer", "ballista", "mage", "frost"] as const;
export const ENEMY_TYPES = ["normal", "fast", "heavy", "swarm"] as const;
export const TRAIT_TYPES = ["controlResistance", "hpBoost", "speedBoost"] as const;
export const WAVE_ROLES = ["basic", "focus", "newMix", "complex", "finale"] as const;

export type TowerType = (typeof TOWER_TYPES)[number];
export type EnemyType = (typeof ENEMY_TYPES)[number];
export type TraitType = (typeof TRAIT_TYPES)[number];
export type WaveRole = (typeof WAVE_ROLES)[number];

export const STAGE_COUNT = 5;
export const WAVES_PER_STAGE = 5;

/** 모든 타워 공통 레벨 필드. base 와 각 증분이 모두 이 필드 전부를 가진다. */
export interface CommonLevelFields {
  readonly damage: number;
  readonly attackPeriodMs: number;
  readonly rangeMt: number;
  readonly projectileSpeedMtPerSec: number;
  readonly projectileTtlMs: number;
}
export interface MageLevelFields extends CommonLevelFields {
  readonly aoeRadiusMt: number;
}
export interface FrostLevelFields extends CommonLevelFields {
  readonly slowBp: number;
  readonly slowDurationMs: number;
}
/** 종류별 레벨 필드: mage 만 aoeRadiusMt, frost 만 slowBp·slowDurationMs 를 가진다(다른 종류에 있으면 검증 오류). */
export type TowerLevelStats = CommonLevelFields | MageLevelFields | FrostLevelFields;

interface TowerBase<T extends TowerType, L extends CommonLevelFields> {
  readonly type: T;
  readonly buildCost: number;
  /** [Lv2, Lv3, Lv4] 강화 비용(엄격 증가). */
  readonly upgradeCosts: readonly [number, number, number];
  readonly levels: {
    /** Lv1 기본값. */
    readonly base: L;
    /**
     * [Lv2, Lv3, Lv4]: 강화 1회마다 누적되는 정수 차이(음수·0 허용), base 와 같은 필드 전부.
     * Lv2 = base + increments[0], Lv3 = Lv2 + increments[1], Lv4 = Lv3 + increments[2].
     */
    readonly increments: readonly [L, L, L];
  };
}

export type TowerDef =
  | TowerBase<"archer", CommonLevelFields>
  | TowerBase<"ballista", CommonLevelFields>
  | TowerBase<"mage", MageLevelFields>
  | TowerBase<"frost", FrostLevelFields>;

export interface EnemyDef {
  readonly type: EnemyType;
  readonly hp: number;
  readonly speedMtPerSec: number;
  readonly baseDamage: number;
  readonly killReward: number;
}

export interface TraitDef {
  readonly type: TraitType;
  readonly killRewardBonus: number;
  readonly resistBp?: number;
  readonly hpBoostBp?: number;
  readonly speedBoostBp?: number;
}

export interface EconomyDef {
  readonly refundRateBp: number;
}

export interface SegmentDef {
  readonly startMs: number;
  readonly intervalMs: number;
  readonly count: number;
  readonly enemyType: EnemyType;
  readonly trait: TraitType | null;
}

export interface WaveDef {
  readonly waveIndex: number;
  readonly role: WaveRole;
  readonly prepMs: number;
  readonly clearReward: number;
  readonly segments: readonly SegmentDef[];
}

export interface StageDef {
  readonly stageId: string;
  readonly initialGold: number;
  /** 기지 HP 초기값(SIM-01). */
  readonly baseHp: number;
  readonly map: StageMap;
  readonly waves: readonly WaveDef[];
}

export interface GlobalContent {
  readonly contentVersion: string;
  readonly towers: readonly TowerDef[];
  readonly enemies: readonly EnemyDef[];
  readonly traits: readonly TraitDef[];
  readonly economy: EconomyDef;
}

export interface ContentBundle extends GlobalContent {
  readonly stages: readonly StageDef[];
}

/** 한 스테이지 시도가 읽는 콘텐츠(전역 + 그 스테이지). 해시 입력이기도 하다. */
export interface StageContent {
  readonly global: GlobalContent;
  readonly stage: StageDef;
}

export interface ContentError {
  readonly path: string;
  readonly message: string;
}

export interface StageValidation {
  /** 스테이지 stageId 가 문자열이 아니면 null. */
  readonly stageId: string | null;
  readonly errors: readonly ContentError[];
}

export interface ContentValidation {
  readonly globalErrors: readonly ContentError[];
  readonly stages: readonly StageValidation[];
}

export type StageEntryResult =
  | { readonly ok: true; readonly content: StageContent; readonly contentHash: string }
  | { readonly ok: false; readonly errors: readonly ContentError[] };
