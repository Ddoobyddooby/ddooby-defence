// TEST_ONLY — 골든 회귀 시나리오 (SIM-CONTRACT 15.2). 시드·난수 없는 고정 명령 스크립트이며 수치는 모두 임의의 테스트 값(밸런스 후보 아님).
// 스크립트의 tick 은 "그 틱의 1단계에 적용될 명령"(= completedTick + 1 일 때 접수)이다.
import { seg, validBundle, withValues } from "../testing/bundles";

export type ScenarioId = "R1" | "R2" | "R3";

export interface ScriptedCommand {
  readonly tick: number;
  readonly kind: "build" | "upgrade" | "sell" | "setTargeting" | "startWave";
  readonly payload: unknown;
}

export interface Scenario {
  readonly id: ScenarioId;
  readonly stageId: string;
  readonly attemptId: number;
  readonly bundle: () => unknown;
  readonly commands: readonly ScriptedCommand[];
  /** null 이면 결과가 날 때까지, 숫자면 그 completedTick 까지. */
  readonly endTick: number | null;
  /** 폭주 방지: 이 틱까지 결과가 안 나면 오류. */
  readonly maxTick: number;
  readonly expectedOutcome: "victory" | "defeat" | null;
  /** 시나리오가 실제로 일으켜야 하는 이벤트 type (빈 시나리오 방지). */
  readonly requiredEvents: readonly string[];
}

type Patch = readonly [string, unknown];
const build = (tick: number, towerType: string, col: number, row: number): ScriptedCommand => ({ tick, kind: "build", payload: { towerType, tile: { col, row } } });
const upgrade = (tick: number, towerId: number): ScriptedCommand => ({ tick, kind: "upgrade", payload: { towerId } });
const sell = (tick: number, towerId: number): ScriptedCommand => ({ tick, kind: "sell", payload: { towerId } });
const target = (tick: number, towerId: number, mode: string): ScriptedCommand => ({ tick, kind: "setTargeting", payload: { towerId, mode } });
const startWave = (tick: number): ScriptedCommand => ({ tick, kind: "startWave", payload: {} });

/** 적을 4배 빠르게 해 시나리오 길이를 줄인다(normal 200/틱, fast 400/틱, heavy 120/틱, swarm 280/틱). */
const FAST_ENEMIES: Patch[] = [
  ["enemies[0].speedMtPerSec", 4000],
  ["enemies[1].speedMtPerSec", 8000],
  ["enemies[2].speedMtPerSec", 2400],
  ["enemies[3].speedMtPerSec", 5600],
];
const wavePrep = (stage: number, prepMs: number): Patch[] => [0, 1, 2, 3, 4].map((i) => [`stages[${stage}].waves[${i}].prepMs`, prepMs]);

export const SCENARIOS: readonly Scenario[] = [
  {
    id: "R1",
    stageId: "stage-1-meadow-outpost",
    attemptId: 1,
    bundle: () =>
      withValues([
        ...FAST_ENEMIES,
        ["towers[0].levels.base.damage", 30],
        ["towers[1].levels.base.damage", 60],
        ["towers[2].levels.base.damage", 30],
        ["stages[0].initialGold", 1500],
        ...wavePrep(0, 1000),
      ]),
    commands: [
      build(1, "archer", 3, 3), build(1, "ballista", 6, 3), build(1, "mage", 9, 3), build(1, "frost", 12, 3),
      upgrade(2, 1), upgrade(2, 3),
      target(3, 2, "strong"),
      build(4, "archer", 4, 4), sell(5, 5),
      // 웨이브 2 준비(틱 175~): 강화·타깃 변경
      upgrade(177, 2), target(178, 4, "close"),
      // 웨이브 4 준비(틱 428~): 방어 약화(ballista·archer 판매) → 일부 적이 기지에 도달. 전투 중 판매(틱 460)는 wrongPhase 로 거부된다.
      sell(430, 2), sell(430, 1), sell(460, 3),
    ],
    endTick: null,
    maxTick: 4000,
    expectedOutcome: "victory",
    requiredEvents: ["projectileFired", "projectileExploded", "slowApplied", "enemyKilled", "waveCleared", "towerSold", "towerUpgraded", "targetingChanged"],
  },
  {
    id: "R2",
    stageId: "stage-2-snowfall-pass",
    attemptId: 2,
    // 기지 HP 3, normal hp 1_000_000(처치 불가) ×3 이 모두 도착하면 마지막 적이 기지를 0 으로 만드는 같은 틱에 웨이브 완료 조건도 성립한다(패배 우선, 보상 없음).
    // swarm(hp 30)은 mage(damage 30) 폭발로 처치된다. 웨이브 1 만 쓴다.
    bundle: () =>
      withValues([
        ...FAST_ENEMIES,
        ["enemies[0].hp", 1_000_000],
        ["towers[0].levels.base.damage", 5],
        ["towers[2].levels.base.damage", 30],
        ["towers[3].levels.base.damage", 1],
        ["stages[1].initialGold", 600],
        ["stages[1].baseHp", 3],
        ["stages[1].waves[0].segments", [seg(0, 1000, 3, "normal"), seg(0, 0, 1, "swarm")]],
      ]),
    commands: [build(1, "archer", 3, 2), build(1, "mage", 6, 2), build(1, "frost", 9, 2), startWave(1), target(10, 1, "last")],
    endTick: null,
    maxTick: 1000,
    expectedOutcome: "defeat",
    requiredEvents: ["projectileFired", "projectileExploded", "slowApplied", "enemyKilled", "enemyReachedBase", "resultReached"],
  },
  {
    id: "R3",
    stageId: "stage-3-dusk-ruins",
    attemptId: 3,
    bundle: () =>
      withValues([
        ...FAST_ENEMIES,
        ["towers[0].levels.base.damage", 30],
        ["towers[1].levels.base.damage", 60],
        ["towers[2].levels.base.damage", 30],
        ["stages[2].initialGold", 2500],
        ...wavePrep(2, 600),
      ]),
    commands: [
      build(1, "archer", 4, 3), build(1, "frost", 4, 2), build(1, "mage", 5, 3), startWave(1),
      build(30, "ballista", 9, 5), upgrade(40, 1), target(45, 2, "close"), upgrade(60, 3),
      target(80, 1, "last"), build(120, "mage", 10, 5), upgrade(125, 4), target(130, 4, "strong"),
      // 둘째 frost(6,3)를 Lv2 로 강화: 같은 적에 서로 다른 출처·강도의 둔화가 겹친다(가장 강한 것만 적용). 틱 215 의 같은 칸 재설치는 occupied 로 거부된다.
      build(200, "frost", 6, 3), upgrade(210, 6), build(215, "archer", 6, 3), target(260, 3, "first"),
    ],
    endTick: 500, // 웨이브 5 전투 중(비행 중 투사체·활성 둔화가 남은 상태). 결과 틱은 626
    maxTick: 500,
    expectedOutcome: null,
    requiredEvents: ["projectileFired", "projectileExploded", "slowApplied", "enemyKilled", "waveCleared", "towerUpgraded", "targetingChanged"],
  },
];

export { seg, validBundle };
