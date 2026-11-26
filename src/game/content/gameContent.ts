// 게임 콘텐츠 수치 bal-01-v1 — **사용자 승인 2026-11-26**(BAL-01, docs/BALANCE.md). 검증 봇(src/game/balance) 통과 기준 BALX-01~10 + 사용자 실기기 플레이.
// 값을 바꾸면 contentVersion 을 올리고 BALANCE.md 9절에 기록, 사용자 재승인을 받는다.
// 맵(STAGE_MAPS)은 승인된 MAP-01 그대로. 조정 이력은 docs/balance/ 보고서 끝.
import type { ContentBundle, WaveDef, WaveRole } from "../core/content/types";
import { STAGE_MAPS } from "./stageMaps";

type Trait = "controlResistance" | "hpBoost" | "speedBoost" | null;
type Enemy = "normal" | "fast" | "heavy" | "swarm";

const s = (startMs: number, intervalMs: number, count: number, enemyType: Enemy, trait: Trait = null) => ({ startMs, intervalMs, count, enemyType, trait });

const ROLES: readonly WaveRole[] = ["basic", "focus", "newMix", "complex", "finale"];
const wave = (i: number, prepMs: number, clearReward: number, segments: ReturnType<typeof s>[]): WaveDef => ({ waveIndex: i + 1, role: ROLES[i], prepMs, clearReward, segments });

// Stage 1: 일반·고속 중심, 5개 웨이브 전체에 적 4종·특성 3종이 모두 등장(11.3 등장 조건).
const STAGE1_WAVES: WaveDef[] = [
  wave(0, 24000, 60, [s(0, 2500, 7, "normal")]),
  wave(1, 15000, 70, [s(0, 2500, 5, "fast"), s(3000, 2300, 3, "fast", "speedBoost"), s(8000, 3000, 4, "normal")]),
  wave(2, 15000, 80, [s(0, 4000, 2, "heavy", "hpBoost"), s(2000, 500, 8, "swarm")]),
  wave(3, 15000, 90, [s(0, 1400, 9, "normal", "controlResistance"), s(1500, 1700, 5, "fast"), s(4000, 2800, 2, "heavy")]),
  wave(4, 15000, 130, [s(0, 3500, 3, "heavy", "hpBoost"), s(1000, 400, 8, "swarm"), s(6000, 1200, 5, "normal", "controlResistance")]),
];
// Stage 2: 중장형·경량 군집형 강조.
const STAGE2_WAVES: WaveDef[] = [
  wave(0, 15000, 60, [s(0, 1400, 10, "normal")]),
  wave(1, 15000, 70, [s(0, 3000, 6, "heavy"), s(1000, 500, 11, "swarm")]),
  wave(2, 15000, 80, [s(0, 700, 11, "fast", "speedBoost"), s(2000, 2500, 4, "heavy", "hpBoost")]),
  wave(3, 15000, 90, [s(0, 300, 20, "swarm", "controlResistance"), s(2000, 2800, 6, "heavy")]),
  wave(4, 15000, 140, [s(0, 2200, 8, "heavy", "hpBoost"), s(500, 300, 25, "swarm"), s(5000, 900, 12, "normal", "controlResistance")]),
];
// Stage 3: 굽이가 많은 경로에서 종합 활용.
const STAGE3_WAVES: WaveDef[] = [
  wave(0, 15000, 65, [s(0, 1500, 8, "normal"), s(2000, 2500, 4, "fast")]),
  wave(1, 8000, 75, [s(0, 2200, 15, "fast", "speedBoost")]),
  wave(2, 8000, 90, [s(0, 1100, 8, "heavy", "hpBoost"), s(1000, 300, 20, "swarm"), s(10500, 250, 20, "swarm")]),
  wave(3, 8000, 100, [s(0, 550, 30, "normal", "controlResistance"), s(1000, 550, 23, "fast"), s(5000, 1200, 12, "heavy")]),
  wave(4, 8000, 170, [s(0, 950, 20, "heavy", "hpBoost"), s(500, 250, 55, "swarm", "controlResistance"), s(5000, 400, 27, "fast", "speedBoost")]),
];

const WAVES = [STAGE1_WAVES, STAGE2_WAVES, STAGE3_WAVES];
const BASE_HP = [24, 40, 30];
const INITIAL_GOLD = [300, 350, 400];

export const GAME_CONTENT: ContentBundle = {
  contentVersion: "bal-01-v1",
  towers: [
    {
      type: "archer",
      buildCost: 100,
      upgradeCosts: [70, 110, 160],
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
      upgradeCosts: [110, 170, 240],
      levels: {
        base: { damage: 45, attackPeriodMs: 1800, rangeMt: 4500, projectileSpeedMtPerSec: 7000, projectileTtlMs: 2500 },
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
      upgradeCosts: [100, 150, 220],
      levels: {
        base: { damage: 12, attackPeriodMs: 1500, rangeMt: 3000, projectileSpeedMtPerSec: 8000, projectileTtlMs: 2500, aoeRadiusMt: 1500 },
        increments: [
          { damage: 8, attackPeriodMs: 0, rangeMt: 250, projectileSpeedMtPerSec: 0, projectileTtlMs: 0, aoeRadiusMt: 100 },
          { damage: 8, attackPeriodMs: -100, rangeMt: 250, projectileSpeedMtPerSec: 0, projectileTtlMs: 0, aoeRadiusMt: 100 },
          { damage: 10, attackPeriodMs: -100, rangeMt: 250, projectileSpeedMtPerSec: 0, projectileTtlMs: 0, aoeRadiusMt: 150 },
        ],
      },
    },
    {
      type: "frost",
      buildCost: 110,
      upgradeCosts: [80, 120, 170],
      levels: {
        base: { damage: 7, attackPeriodMs: 1000, rangeMt: 2750, projectileSpeedMtPerSec: 10000, projectileTtlMs: 2000, slowBp: 8000, slowDurationMs: 4500 },
        increments: [
          { damage: 2, attackPeriodMs: 0, rangeMt: 250, projectileSpeedMtPerSec: 0, projectileTtlMs: 0, slowBp: 500, slowDurationMs: 0 },
          { damage: 2, attackPeriodMs: 0, rangeMt: 250, projectileSpeedMtPerSec: 0, projectileTtlMs: 0, slowBp: 500, slowDurationMs: 500 },
          { damage: 3, attackPeriodMs: -100, rangeMt: 250, projectileSpeedMtPerSec: 0, projectileTtlMs: 0, slowBp: 500, slowDurationMs: 500 },
        ],
      },
    },
  ],
  enemies: [
    { type: "normal", hp: 90, speedMtPerSec: 1000, baseDamage: 1, killReward: 6 },
    { type: "fast", hp: 60, speedMtPerSec: 2200, baseDamage: 1, killReward: 8 },
    { type: "heavy", hp: 320, speedMtPerSec: 600, baseDamage: 3, killReward: 20 },
    { type: "swarm", hp: 30, speedMtPerSec: 1400, baseDamage: 1, killReward: 3 },
  ],
  traits: [
    { type: "controlResistance", resistBp: 5000, killRewardBonus: 3 },
    { type: "hpBoost", hpBoostBp: 5000, killRewardBonus: 3 },
    { type: "speedBoost", speedBoostBp: 3000, killRewardBonus: 3 },
  ],
  economy: { refundRateBp: 7000 },
  stages: STAGE_MAPS.map((map, i) => ({ stageId: map.stageId, initialGold: INITIAL_GOLD[i], baseHp: BASE_HP[i], map, waves: WAVES[i] })),
};
