// HUD 뷰 모델 (UI-CONTRACT 7절): 코어 스냅샷 + 스테이지 콘텐츠 + UI 상태에서만 파생하는 순수 함수. HUD 가 따로 값을 계산·누적하지 않는다.
// 능력치·환급액은 코어의 helper(towerLevelStats·refundFor)를 그대로 읽는다(규칙 재구현 금지).
import type { StageContent, TowerDef, TowerType } from "../core/content/types";
import { towerLevelStats } from "../core/content/levelStats";
import type { TargetingMode } from "../core/sim/commands";
import { refundFor } from "../core/sim/formulas";
import { PHASE_NAMES, TOWER_NAMES } from "../ui/strings.ko";
import { uiModeOf, type Phase, type Snapshot, type UiMode, type UiState } from "./types";

export const TOWER_ORDER: readonly TowerType[] = ["archer", "ballista", "mage", "frost"];
export const WAVES_TOTAL = 5;

export interface TowerListItem {
  readonly type: TowerType;
  readonly name: string;
  readonly cost: number;
  /** 골드가 설치 가격 이상(표시 편의, 최종 판정은 코어). */
  readonly affordable: boolean;
  readonly selected: boolean;
}

export interface TowerDetail {
  readonly towerId: number;
  readonly type: TowerType;
  readonly name: string;
  readonly level: number;
  readonly damage: number;
  /** 공격 주기(초, 소수 1자리). */
  readonly periodText: string;
  /** 사거리(타일, 소수 1자리). */
  readonly rangeText: string;
  readonly aoeText: string | null;
  readonly slowText: string | null;
  readonly targetingMode: TargetingMode;
  /** 다음 강화 가격(Lv4 면 null). */
  readonly upgradeCost: number | null;
  readonly canAffordUpgrade: boolean;
  readonly canUpgrade: boolean;
  readonly refund: number;
  readonly canSell: boolean;
}

export interface HudView {
  readonly stageName: string;
  readonly waveIndex: number;
  readonly waveTotal: number;
  readonly phase: Phase;
  readonly paused: boolean;
  /** 표시용 단계명(일시정지면 "일시정지"). */
  readonly phaseLabel: string;
  readonly gold: number;
  readonly baseHp: number;
  readonly maxBaseHp: number;
  /** 준비 단계: 남은 시간 문자열(초, 소수 1자리)과 조기 시작 가능 여부. */
  readonly prep: { readonly remainingText: string; readonly canStartNow: boolean } | null;
  /** 전투 단계: 이번 웨이브 생성 진행과 생존 적 수. */
  readonly combat: { readonly spawned: number; readonly totalSpawn: number; readonly alive: number } | null;
  readonly towers: readonly TowerListItem[];
  readonly detail: TowerDetail | null;
  readonly mode: UiMode;
  readonly placeType: TowerType | null;
  /** 게임플레이 조작 가능(일시정지·결과 단계가 아님). */
  readonly controlsEnabled: boolean;
  readonly isResult: boolean;
}

/** 정수 tenths → "1.5". */
export function formatTenths(tenths: number): string {
  const t = Math.max(0, Math.round(tenths));
  return `${Math.floor(t / 10)}.${t % 10}`;
}
/** 틱 × 0.05 초를 소수 1자리로(올림: 남은 시간이 0.0 으로 먼저 보이지 않게). */
export function prepRemainingText(ticks: number): string {
  return formatTenths(Math.ceil(Math.max(0, ticks) / 2));
}

function towerDef(content: StageContent, type: TowerType): TowerDef {
  const def = content.global.towers.find((t) => t.type === type);
  if (def === undefined) throw new Error(`콘텐츠에 없는 타워 종류 ${type}`);
  return def;
}

export function towerDetailOf(snapshot: Snapshot, content: StageContent, towerId: number, controlsEnabled: boolean): TowerDetail | null {
  const t = snapshot.towers.find((x) => x.towerId === towerId);
  if (t === undefined) return null;
  const def = towerDef(content, t.type);
  const stats = towerLevelStats(def, t.level);
  const upgradeCost = t.level >= 4 ? null : def.upgradeCosts[t.level - 1];
  return {
    towerId: t.towerId,
    type: t.type,
    name: TOWER_NAMES[t.type],
    level: t.level,
    damage: stats.damage,
    periodText: formatTenths(Math.round(stats.attackPeriodMs / 100)),
    rangeText: formatTenths(Math.round(stats.rangeMt / 100)),
    aoeText: stats.aoeRadiusMt === undefined ? null : formatTenths(Math.round(stats.aoeRadiusMt / 100)),
    slowText: stats.slowBp === undefined ? null : `${Math.round((stats.slowBp as number) / 100)}% / ${formatTenths(Math.round((stats.slowDurationMs as number) / 100))}`,
    targetingMode: t.targetingMode,
    upgradeCost,
    canAffordUpgrade: upgradeCost !== null && snapshot.gold >= upgradeCost,
    canUpgrade: controlsEnabled && upgradeCost !== null,
    refund: refundFor(t.actuallyPaid, content.global.economy.refundRateBp),
    canSell: controlsEnabled && snapshot.phase === "preparation",
  };
}

export function hudView(snapshot: Snapshot, content: StageContent, ui: UiState, stageName: string): HudView {
  const isResult = snapshot.phase === "victory" || snapshot.phase === "defeat";
  const controlsEnabled = !snapshot.paused && !isResult;
  const wave = content.stage.waves[snapshot.waveIndex - 1];
  const totalSpawn = wave === undefined ? 0 : wave.segments.reduce((a, s) => a + s.count, 0);
  return {
    stageName,
    waveIndex: snapshot.waveIndex,
    waveTotal: WAVES_TOTAL,
    phase: snapshot.phase,
    paused: snapshot.paused,
    phaseLabel: snapshot.paused && !isResult ? "일시정지" : PHASE_NAMES[snapshot.phase],
    gold: snapshot.gold,
    baseHp: snapshot.baseHp,
    maxBaseHp: content.stage.baseHp,
    prep: snapshot.phase === "preparation" ? { remainingText: prepRemainingText(snapshot.prepTicksRemaining), canStartNow: controlsEnabled } : null,
    combat: snapshot.phase === "combat" ? { spawned: snapshot.waveSpawnCursor, totalSpawn, alive: snapshot.enemies.length } : null,
    towers: TOWER_ORDER.map((type) => {
      const cost = towerDef(content, type).buildCost;
      return { type, name: TOWER_NAMES[type], cost, affordable: snapshot.gold >= cost, selected: ui.placeType === type };
    }),
    detail: ui.selectedTowerId === null ? null : towerDetailOf(snapshot, content, ui.selectedTowerId, controlsEnabled),
    mode: uiModeOf(ui),
    placeType: ui.placeType,
    controlsEnabled,
    isResult,
  };
}
