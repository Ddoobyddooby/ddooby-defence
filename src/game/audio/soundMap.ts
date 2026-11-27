// SND-01 (AUDIO-SPEC 3절): 세션 이벤트 → 효과음 이름 매핑과 소리별 재생 제한을 한 파일에 모은다. 소리는 표현 전용이라 코어·리플레이에 영향이 없다.
import type { TowerType } from "../core/content/types";

export const SFX_NAMES = [
  "tap",
  "error",
  "build",
  "upgrade",
  "sell",
  "wave-start",
  "arrow",
  "bolt",
  "fire",
  "explode",
  "frost",
  "enemy-die",
  "base-hit",
  "victory",
  "defeat",
] as const;
export type SfxName = (typeof SFX_NAMES)[number];

export interface SfxConfig {
  /** 같은 소리의 실제 시간 최소 재생 간격(ms). 배속에서도 소리가 뭉개지지 않게 실제 시간 기준. */
  readonly minIntervalMs: number;
  /** 같은 소리의 동시 재생 상한. */
  readonly maxConcurrent: number;
  /** 상대 음량(0~1). 발사 소리는 작게, 승리·패배는 크게. */
  readonly volume: number;
}

export const SFX_CONFIG: Readonly<Record<SfxName, SfxConfig>> = {
  tap: { minIntervalMs: 40, maxConcurrent: 2, volume: 0.5 },
  error: { minIntervalMs: 150, maxConcurrent: 1, volume: 0.6 },
  build: { minIntervalMs: 60, maxConcurrent: 2, volume: 0.7 },
  upgrade: { minIntervalMs: 60, maxConcurrent: 2, volume: 0.6 },
  sell: { minIntervalMs: 60, maxConcurrent: 2, volume: 0.6 },
  "wave-start": { minIntervalMs: 500, maxConcurrent: 1, volume: 0.7 },
  arrow: { minIntervalMs: 80, maxConcurrent: 3, volume: 0.3 },
  bolt: { minIntervalMs: 80, maxConcurrent: 3, volume: 0.35 },
  fire: { minIntervalMs: 80, maxConcurrent: 3, volume: 0.45 },
  explode: { minIntervalMs: 90, maxConcurrent: 3, volume: 0.8 },
  frost: { minIntervalMs: 90, maxConcurrent: 3, volume: 0.6 },
  "enemy-die": { minIntervalMs: 70, maxConcurrent: 4, volume: 0.4 },
  "base-hit": { minIntervalMs: 200, maxConcurrent: 2, volume: 0.7 },
  victory: { minIntervalMs: 1000, maxConcurrent: 1, volume: 1 },
  defeat: { minIntervalMs: 1000, maxConcurrent: 1, volume: 1 },
};
/** 모든 효과음을 합친 동시 재생 상한(5×에서도 겹쳐 커지지 않게). */
export const GLOBAL_MAX_CONCURRENT = 10;

/** 게임 이벤트(코어 AttemptEvent 모양) → 효과음 목록. 알 수 없는 이벤트는 빈 배열. */
export function soundsForEvent(e: { readonly type: string } & Readonly<Record<string, unknown>>, towerTypeOf: (towerId: number) => TowerType | undefined): readonly SfxName[] {
  switch (e.type) {
    case "towerBuilt":
      return ["build"];
    case "towerUpgraded":
      return ["upgrade"];
    case "towerSold":
      return ["sell"];
    case "waveStarted":
      return ["wave-start"];
    case "commandRejected":
      return ["error"];
    case "projectileFired": {
      const t = towerTypeOf(e.towerId as number);
      return t === "archer" ? ["arrow"] : t === "ballista" ? ["bolt"] : t === "mage" ? ["fire"] : [];
    }
    case "projectileExploded":
      return ["explode"];
    case "slowApplied":
      return ["frost"];
    case "enemyKilled":
      return ["enemy-die"];
    case "enemyReachedBase":
      return ["base-hit"];
    case "resultReached":
      return [e.outcome === "victory" ? "victory" : "defeat"];
    default:
      return [];
  }
}
