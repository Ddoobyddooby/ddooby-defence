// DEV_PLACEHOLDER — 개발용 임시 수치 묶음 (UI-CONTRACT 2절). **밸런스 승인값이 아니다.**
// 화면에서 "플레이가 되는지" 확인하려고 검증기(SIM-CONTRACT 11절)를 통과하도록 만든 값이며, BAL-01 이 이 파일을 승인 수치로 교체한다.
// 맵은 승인된 후보 맵(STAGE_MAPS)을 그대로 쓴다. 난이도 조정 대상 아님.
import type { ContentBundle, WaveDef, WaveRole } from "../core/content/types";
import { STAGE_MAPS } from "./stageMaps";

export const DEV_PLACEHOLDER_LABEL = "임시 수치";

type Trait = "controlResistance" | "hpBoost" | "speedBoost" | null;
type Enemy = "normal" | "fast" | "heavy" | "swarm";

const s = (startMs: number, intervalMs: number, count: number, enemyType: Enemy, trait: Trait = null) => ({ startMs, intervalMs, count, enemyType, trait });

const ROLES: readonly WaveRole[] = ["basic", "focus", "newMix", "complex", "finale"];
const wave = (i: number, prepMs: number, clearReward: number, segments: ReturnType<typeof s>[]): WaveDef => ({ waveIndex: i + 1, role: ROLES[i], prepMs, clearReward, segments });

// Stage 1: 5개 웨이브 전체에 적 4종·특성 3종이 모두 등장(11.3 등장 조건).
const STAGE1_WAVES: WaveDef[] = [
  wave(0, 20000, 40, [s(0, 1500, 6, "normal")]),
  wave(1, 12000, 50, [s(0, 800, 6, "fast"), s(3000, 800, 3, "fast", "speedBoost")]),
  wave(2, 12000, 60, [s(0, 3000, 3, "heavy", "hpBoost"), s(2000, 400, 10, "swarm")]),
  wave(3, 12000, 70, [s(0, 1000, 8, "normal", "controlResistance"), s(1500, 800, 5, "fast"), s(4000, 3000, 2, "heavy")]),
  wave(4, 12000, 100, [s(0, 2500, 4, "heavy", "hpBoost"), s(1000, 350, 12, "swarm"), s(6000, 700, 6, "normal", "controlResistance")]),
];
// Stage 2: 중장형·경량 군집형 강조.
const STAGE2_WAVES: WaveDef[] = [
  wave(0, 20000, 40, [s(0, 1400, 7, "normal")]),
  wave(1, 12000, 55, [s(0, 3000, 4, "heavy"), s(1000, 500, 8, "swarm")]),
  wave(2, 12000, 65, [s(0, 700, 8, "fast", "speedBoost"), s(2000, 2500, 3, "heavy", "hpBoost")]),
  wave(3, 12000, 75, [s(0, 300, 14, "swarm", "controlResistance"), s(2000, 2800, 4, "heavy")]),
  wave(4, 12000, 110, [s(0, 2200, 5, "heavy", "hpBoost"), s(500, 300, 16, "swarm"), s(5000, 900, 8, "normal", "controlResistance")]),
];
// Stage 3: 굽이가 많은 경로에서 혼합.
const STAGE3_WAVES: WaveDef[] = [
  wave(0, 20000, 45, [s(0, 1300, 8, "normal"), s(2000, 1500, 4, "fast")]),
  wave(1, 12000, 55, [s(0, 600, 10, "fast", "speedBoost")]),
  wave(2, 12000, 70, [s(0, 2600, 4, "heavy", "hpBoost"), s(1500, 350, 12, "swarm")]),
  wave(3, 12000, 80, [s(0, 800, 10, "normal", "controlResistance"), s(1000, 700, 8, "fast"), s(5000, 2500, 3, "heavy")]),
  wave(4, 12000, 120, [s(0, 2000, 6, "heavy", "hpBoost"), s(500, 300, 18, "swarm", "controlResistance"), s(6000, 600, 10, "fast", "speedBoost")]),
];

const WAVES = [STAGE1_WAVES, STAGE2_WAVES, STAGE3_WAVES];
const BASE_HP = [20, 25, 30];
const INITIAL_GOLD = [300, 350, 400];

/** 사거리 순서(ballista > archer > mage > frost, 레벨마다)·가격 증가·시간 50ms 배수·속도 20 배수를 모두 지킨다. */
export const DEV_PLACEHOLDER: ContentBundle = {
  contentVersion: "dev-placeholder-1",
  towers: [
    {
      type: "archer",
      buildCost: 100,
      upgradeCosts: [80, 120, 180],
      levels: {
        base: { damage: 12, attackPeriodMs: 800, rangeMt: 3500, projectileSpeedMtPerSec: 12000, projectileTtlMs: 2000 },
        increments: [
          { damage: 6, attackPeriodMs: 0, rangeMt: 250, projectileSpeedMtPerSec: 0, projectileTtlMs: 0 },
          { damage: 6, attackPeriodMs: -50, rangeMt: 250, projectileSpeedMtPerSec: 0, projectileTtlMs: 0 },
          { damage: 8, attackPeriodMs: -50, rangeMt: 250, projectileSpeedMtPerSec: 0, projectileTtlMs: 0 },
        ],
      },
    },
    {
      type: "ballista",
      buildCost: 160,
      upgradeCosts: [120, 180, 260],
      levels: {
        base: { damage: 40, attackPeriodMs: 1800, rangeMt: 4500, projectileSpeedMtPerSec: 10000, projectileTtlMs: 2500 },
        increments: [
          { damage: 20, attackPeriodMs: 0, rangeMt: 250, projectileSpeedMtPerSec: 0, projectileTtlMs: 0 },
          { damage: 25, attackPeriodMs: -100, rangeMt: 250, projectileSpeedMtPerSec: 0, projectileTtlMs: 0 },
          { damage: 30, attackPeriodMs: -100, rangeMt: 250, projectileSpeedMtPerSec: 0, projectileTtlMs: 0 },
        ],
      },
    },
    {
      type: "mage",
      buildCost: 150,
      upgradeCosts: [110, 170, 250],
      levels: {
        base: { damage: 18, attackPeriodMs: 1500, rangeMt: 3000, projectileSpeedMtPerSec: 8000, projectileTtlMs: 2500, aoeRadiusMt: 1200 },
        increments: [
          { damage: 9, attackPeriodMs: 0, rangeMt: 250, projectileSpeedMtPerSec: 0, projectileTtlMs: 0, aoeRadiusMt: 100 },
          { damage: 9, attackPeriodMs: -100, rangeMt: 250, projectileSpeedMtPerSec: 0, projectileTtlMs: 0, aoeRadiusMt: 100 },
          { damage: 12, attackPeriodMs: -100, rangeMt: 250, projectileSpeedMtPerSec: 0, projectileTtlMs: 0, aoeRadiusMt: 150 },
        ],
      },
    },
    {
      type: "frost",
      buildCost: 110,
      upgradeCosts: [90, 130, 190],
      levels: {
        base: { damage: 4, attackPeriodMs: 1000, rangeMt: 2500, projectileSpeedMtPerSec: 10000, projectileTtlMs: 2000, slowBp: 3500, slowDurationMs: 2000 },
        increments: [
          { damage: 2, attackPeriodMs: 0, rangeMt: 250, projectileSpeedMtPerSec: 0, projectileTtlMs: 0, slowBp: 500, slowDurationMs: 0 },
          { damage: 2, attackPeriodMs: 0, rangeMt: 250, projectileSpeedMtPerSec: 0, projectileTtlMs: 0, slowBp: 500, slowDurationMs: 500 },
          { damage: 3, attackPeriodMs: -100, rangeMt: 250, projectileSpeedMtPerSec: 0, projectileTtlMs: 0, slowBp: 500, slowDurationMs: 500 },
        ],
      },
    },
  ],
  enemies: [
    { type: "normal", hp: 60, speedMtPerSec: 1000, baseDamage: 1, killReward: 5 },
    { type: "fast", hp: 40, speedMtPerSec: 2000, baseDamage: 1, killReward: 6 },
    { type: "heavy", hp: 220, speedMtPerSec: 600, baseDamage: 3, killReward: 15 },
    { type: "swarm", hp: 20, speedMtPerSec: 1400, baseDamage: 1, killReward: 2 },
  ],
  traits: [
    { type: "controlResistance", resistBp: 5000, killRewardBonus: 2 },
    { type: "hpBoost", hpBoostBp: 5000, killRewardBonus: 2 },
    { type: "speedBoost", speedBoostBp: 3000, killRewardBonus: 2 },
  ],
  economy: { refundRateBp: 7000 },
  stages: STAGE_MAPS.map((map, i) => ({ stageId: map.stageId, initialGold: INITIAL_GOLD[i], baseHp: BASE_HP[i], map, waves: WAVES[i] })),
};
