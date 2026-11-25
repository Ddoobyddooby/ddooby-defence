// 세션 공개 타입. 코어 스냅샷은 `Record<string, unknown>` 로 나오므로, UI 가 읽는 필드만 좁혀 선언한다(읽기 전용).
import type { TowerType, EnemyType, TraitType } from "../core/content/types";
import type { TargetingMode } from "../core/sim/commands";

export interface SnapSlow {
  readonly sourceTowerId: number;
  readonly slowBp: number;
  readonly expireTick: number;
}
export interface SnapEnemy {
  readonly id: number;
  readonly enemyType: EnemyType;
  readonly trait: TraitType | null;
  readonly hp: number;
  readonly maxHp: number;
  readonly pathProgress: number;
  readonly slows: readonly SnapSlow[];
}
export interface SnapTower {
  readonly towerId: number;
  readonly type: TowerType;
  readonly cell: { readonly col: number; readonly row: number };
  readonly level: number;
  readonly targetingMode: TargetingMode;
  readonly actuallyPaid: number;
}
export interface SnapProjectile {
  readonly projectileId: number;
  readonly towerId: number;
  readonly kind: "single" | "aoe";
  readonly targetEnemyId: number | null;
  readonly pos: { readonly x: number; readonly y: number };
  readonly impact: { readonly x: number; readonly y: number } | null;
  readonly slowBp: number | null;
  readonly aoeRadiusMt: number | null;
}
export type Phase = "preparation" | "combat" | "victory" | "defeat";
export interface Snapshot {
  readonly tick: number;
  readonly attemptId: number;
  readonly phase: Phase;
  readonly paused: boolean;
  readonly outcome: "victory" | "defeat" | null;
  readonly gold: number;
  readonly baseHp: number;
  readonly waveIndex: number;
  readonly waveSpawnCursor: number;
  readonly prepTicksRemaining: number;
  readonly towers: readonly SnapTower[];
  readonly enemies: readonly SnapEnemy[];
  readonly projectiles: readonly SnapProjectile[];
}

/** UI 선택 상태(코어 밖). UI-CONTRACT 6절 표. */
export interface UiState {
  /** 설치 모드의 타워 종류(없으면 null). */
  readonly placeType: TowerType | null;
  readonly selectedTowerId: number | null;
  /** 판매 확인창이 열린 타워. */
  readonly sellConfirmId: number | null;
}
export const EMPTY_UI: UiState = { placeType: null, selectedTowerId: null, sellConfirmId: null };

export type UiMode = "default" | "place" | "sellConfirm";
export const uiModeOf = (ui: UiState): UiMode => (ui.sellConfirmId !== null ? "sellConfirm" : ui.placeType !== null ? "place" : "default");
