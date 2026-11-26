// GOLD-01 — 실제 수치(GAME_CONTENT, bal-01-v1) 골든 시나리오 정의 (SIM-CONTRACT 15.6).
// 코어 TEST_ONLY 골든(R1~R3, core/attempt/regression)과 같은 유틸을 쓰되, 코어가 content/ 를 import 하지 않는 규칙을 지키려고 core 밖에 둔다.
import { GAME_CONTENT } from "../../content/gameContent";
import type { ScenarioLike } from "../../core/attempt/regression/scenarios";
import { G1_S1_B1, G2_S2_B1, G3_S3_B1, G4_S3_B2, G5_S1_MIXED } from "./scripts";

/**
 * 골든을 만든 콘텐츠 버전. 승인 수치(GAME_CONTENT.contentVersion)를 바꾸면(BALANCE.md 9절: 버전 올림·사용자 재승인) 이 값과 달라져
 * regression.test.ts 가 "수치가 바뀜"으로 실패한다. 의도한 변경이면 `npm run golden:update` 로 골든을 갱신하고 이 상수를 새 버전으로 고친다.
 */
export const GOLDEN_CONTENT_VERSION = "bal-01-v1";

export type GameScenarioId = "G1" | "G2" | "G3" | "G4" | "G5";

export interface GameScenario extends ScenarioLike {
  readonly id: GameScenarioId;
  /** 사람이 읽는 설명(보고·실패 메시지용). */
  readonly title: string;
  /** 기대 결과 틱(completedTick). 기록한 봇 실행의 값이며 골든과 별개로 한 번 더 고정한다. */
  readonly expectedEndTick: number;
}

const common = { attemptId: 1, bundle: () => GAME_CONTENT as unknown, endTick: null, maxTick: 12000 } as const;
const stageId = (i: number): string => GAME_CONTENT.stages[i].stageId;

export const GAME_SCENARIOS: readonly GameScenario[] = [
  {
    ...common,
    id: "G1",
    title: "스테이지 1 · 균형 봇(B1) 기록 · 승리",
    stageId: stageId(0),
    commands: G1_S1_B1,
    expectedOutcome: "victory",
    expectedEndTick: 5116,
    requiredEvents: ["towerBuilt", "projectileFired", "projectileExploded", "slowApplied", "enemyKilled", "waveCleared", "towerUpgraded", "resultReached"],
  },
  {
    ...common,
    id: "G2",
    title: "스테이지 2 · 균형 봇(B1) 기록 · 승리",
    stageId: stageId(1),
    commands: G2_S2_B1,
    expectedOutcome: "victory",
    expectedEndTick: 6903,
    requiredEvents: ["towerBuilt", "projectileFired", "projectileExploded", "slowApplied", "enemyKilled", "waveCleared", "towerUpgraded", "resultReached"],
  },
  {
    ...common,
    id: "G3",
    title: "스테이지 3 · 균형 봇(B1) 기록 · 승리",
    stageId: stageId(2),
    commands: G3_S3_B1,
    expectedOutcome: "victory",
    expectedEndTick: 6941,
    requiredEvents: ["towerBuilt", "projectileFired", "projectileExploded", "slowApplied", "enemyKilled", "waveCleared", "towerUpgraded", "resultReached"],
  },
  {
    ...common,
    id: "G4",
    title: "스테이지 3 · 초보 봇(B2) 기록 · 패배",
    stageId: stageId(2),
    commands: G4_S3_B2,
    expectedOutcome: "defeat",
    expectedEndTick: 5403,
    requiredEvents: ["towerBuilt", "projectileFired", "enemyKilled", "enemyReachedBase", "resultReached"],
  },
  {
    ...common,
    id: "G5",
    title: "스테이지 1 · 혼합(조기 시작·전투 중 설치/강화·준비 중 판매·타깃 변경·전투 중 판매 거부) · 승리",
    stageId: stageId(0),
    commands: G5_S1_MIXED,
    expectedOutcome: "victory",
    expectedEndTick: 4687,
    requiredEvents: ["towerBuilt", "towerSold", "towerUpgraded", "targetingChanged", "commandRejected", "waveStarted", "waveCleared", "enemyKilled", "resultReached"],
  },
];

export const goldenUrl = (id: string): URL => new URL(`./golden/${id}.json`, import.meta.url);
