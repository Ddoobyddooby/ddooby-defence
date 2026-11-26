// HUD 뷰 모델 (UI-CONTRACT 7절): 코어 스냅샷 + 스테이지 콘텐츠 + UI 상태에서만 파생하는 순수 함수. HUD 가 따로 값을 계산·누적하지 않는다.
// 능력치·환급액은 코어의 helper(towerLevelStats·refundFor)를 그대로 읽는다(규칙 재구현 금지).
import type { StageContent, TowerDef, TowerType } from "../core/content/types";
import { expandWave } from "../core/content/expandWave";
import { towerLevelStats } from "../core/content/levelStats";
import type { TargetingMode } from "../core/sim/commands";
import { refundFor } from "../core/sim/formulas";
import { PHASE_NAMES, STR, TOWER_NAMES } from "../ui/strings.ko";
import { uiModeOf, type Phase, type Snapshot, type Speed, type UiMode, type UiState } from "./types";

export const TOWER_ORDER: readonly TowerType[] = ["archer", "ballista", "mage", "frost"];

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
  /** 현재 배속(1·2·5). */
  readonly speed: Speed;
  /** 단계 짧은 표시(`준비`·`전투`·`승리`·`패배`). 일시정지는 메뉴가 대신 보여 주므로 여기에 섞지 않는다. */
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
  /** 타워 정보 창이 열려 있다(선택한 타워가 실제로 있을 때만 true). */
  readonly infoOpen: boolean;
  /** 메뉴의 `스테이지 선택` 확인창. */
  readonly leaveConfirm: boolean;
  /** 게임플레이 조작 가능(일시정지·결과 단계가 아님). */
  readonly controlsEnabled: boolean;
  readonly isResult: boolean;
}

/** 정수 hundredths → "0.75". 공격 주기·사거리는 50ms·250mt 단위라 소수 1자리로는 변화가 가려진다(리뷰 UI-01 F5). */
export function formatHundredths(hundredths: number): string {
  const t = Math.max(0, Math.round(hundredths));
  return `${Math.floor(t / 100)}.${String(t % 100).padStart(2, "0")}`;
}

/** 정수 tenths → "1.5". */
export function formatTenths(tenths: number): string {
  const t = Math.max(0, Math.round(tenths));
  return `${Math.floor(t / 10)}.${t % 10}`;
}
/** 남은 준비 시간: 틱 × 0.05 초를 정수 초로 올림(UI-02: 소수 없이 초 단위, 남은 시간이 0 으로 먼저 보이지 않게). */
export function prepRemainingText(ticks: number): string {
  return String(Math.ceil(Math.max(0, ticks) / 20));
}

function towerDef(content: StageContent, type: TowerType): TowerDef {
  const def = content.global.towers.find((t) => t.type === type);
  if (def === undefined) throw new Error(`콘텐츠에 없는 타워 종류 ${type}`);
  return def;
}

/** 제출했지만 아직 틱에 적용되지 않은 명령 키(세션이 관리). 같은 명령의 이중 제출을 막는 표시용이다(리뷰 UI-01 F6). */
export type PendingKeys = ReadonlySet<string>;
export const NO_PENDING: PendingKeys = new Set<string>();
export const pendingKey = {
  startWave: "startWave",
  upgrade: (towerId: number): string => `upgrade:${towerId}`,
  sell: (towerId: number): string => `sell:${towerId}`,
} as const;

export function towerDetailOf(snapshot: Snapshot, content: StageContent, towerId: number, controlsEnabled: boolean, pending: PendingKeys = NO_PENDING): TowerDetail | null {
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
    periodText: formatHundredths(stats.attackPeriodMs / 10),
    rangeText: formatHundredths(stats.rangeMt / 10),
    aoeText: stats.aoeRadiusMt === undefined ? null : formatHundredths(stats.aoeRadiusMt / 10),
    slowText: stats.slowBp === undefined ? null : `${Math.round((stats.slowBp as number) / 100)}% / ${formatHundredths((stats.slowDurationMs as number) / 10)}${STR.hud.seconds}`,
    targetingMode: t.targetingMode,
    upgradeCost,
    canAffordUpgrade: upgradeCost !== null && snapshot.gold >= upgradeCost,
    canUpgrade: controlsEnabled && upgradeCost !== null && !pending.has(pendingKey.upgrade(t.towerId)),
    refund: refundFor(t.actuallyPaid, content.global.economy.refundRateBp),
    canSell: controlsEnabled && snapshot.phase === "preparation" && !pending.has(pendingKey.sell(t.towerId)),
  };
}

export function hudView(snapshot: Snapshot, content: StageContent, ui: UiState, stageName: string, pending: PendingKeys = NO_PENDING, speed: Speed = 1): HudView {
  const isResult = snapshot.phase === "victory" || snapshot.phase === "defeat";
  const controlsEnabled = !snapshot.paused && !isResult;
  const wave = content.stage.waves[snapshot.waveIndex - 1];
  const detail = ui.selectedTowerId === null ? null : towerDetailOf(snapshot, content, ui.selectedTowerId, controlsEnabled, pending);
  // 이번 웨이브 총 생성 수는 코어가 쓰는 전개 함수(expandWave)의 결과 길이에서 파생한다(segments.count 를 직접 합하지 않는다, 리뷰 F4).
  const totalSpawn = wave === undefined ? 0 : expandWave(wave, 0).length;
  return {
    stageName,
    waveIndex: snapshot.waveIndex,
    waveTotal: content.stage.waves.length,
    phase: snapshot.phase,
    paused: snapshot.paused,
    speed,
    phaseLabel: PHASE_NAMES[snapshot.phase],
    gold: snapshot.gold,
    baseHp: snapshot.baseHp,
    maxBaseHp: content.stage.baseHp,
    prep: snapshot.phase === "preparation" ? { remainingText: prepRemainingText(snapshot.prepTicksRemaining), canStartNow: controlsEnabled && !pending.has(pendingKey.startWave) } : null,
    combat: snapshot.phase === "combat" ? { spawned: snapshot.waveSpawnCursor, totalSpawn, alive: snapshot.enemies.length } : null,
    towers: TOWER_ORDER.map((type) => {
      const cost = towerDef(content, type).buildCost;
      return { type, name: TOWER_NAMES[type], cost, affordable: snapshot.gold >= cost, selected: ui.placeType === type };
    }),
    detail,
    mode: uiModeOf(ui),
    placeType: ui.placeType,
    infoOpen: ui.infoOpen && detail !== null,
    leaveConfirm: ui.leaveConfirm,
    controlsEnabled,
    isResult,
  };
}

/** ⚙ 메뉴(일시정지 화면) 내용(UI-CONTRACT 7절): HUD 에서 뺀 스테이지 이름·단계·전투 중 생성 진행·생존 적 수. */
export interface MenuView {
  readonly stageName: string;
  /** `준비`·`전투`. */
  readonly phaseLabel: string;
  /** 전투 중이면 `k / 전체`, 아니면 null. */
  readonly spawnText: string | null;
  readonly alive: number | null;
}
export function menuView(hud: HudView): MenuView {
  return {
    stageName: hud.stageName,
    phaseLabel: hud.phaseLabel,
    spawnText: hud.combat === null ? null : `${hud.combat.spawned} / ${hud.combat.totalSpawn}`,
    alive: hud.combat === null ? null : hud.combat.alive,
  };
}
