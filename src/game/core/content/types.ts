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

export const STAGE_COUNT = 3;
export const WAVES_PER_STAGE = 5;

/** 타워 레벨 필드. mage 는 aoeRadiusMt, frost 는 slowBp·slowDurationMs 가 추가로 필수이고 다른 종류에는 있으면 오류. */
export interface TowerLevelStats {
  readonly damage: number;
  readonly attackPeriodMs: number;
  readonly rangeMt: number;
  readonly projectileSpeedMtPerSec: number;
  readonly projectileTtlMs: number;
  readonly aoeRadiusMt?: number;
  readonly slowBp?: number;
  readonly slowDurationMs?: number;
}

export interface TowerDef {
  readonly type: TowerType;
  readonly buildCost: number;
  /** [Lv2, Lv3, Lv4] 강화 비용. */
  readonly upgradeCosts: readonly [number, number, number];
  readonly levels: {
    /** Lv1 기본값. */
    readonly base: TowerLevelStats;
    /** [Lv2, Lv3, Lv4]: Lv1 과 같은 필드의 정수 차이(음수·0 허용). 레벨 N 값 = base + increments[N−2]. */
    readonly increments: readonly [Partial<TowerLevelStats>, Partial<TowerLevelStats>, Partial<TowerLevelStats>];
  };
}

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
