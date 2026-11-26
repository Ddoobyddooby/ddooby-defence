// SIM-03 — 골든 회귀 (SIM-CONTRACT 15.2). 골든 갱신은 `npm run golden:update`(GOLDEN_UPDATE=1)로만 한다.
// 같은 코드 버전에서 해시가 바뀌면 회귀이므로 갱신 가드(assertUpdateAllowed)가 덮어쓰기를 거부한다. 코드 버전이 다르면 "골든이 오래됨"으로 실패한다.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { ATTEMPT_CODE_VERSION } from "../attempt";
import { canonicalize } from "../../sim/canonical";
import { goldenFilePath, inputOf, playScenario, updateGoldens, verifyGolden, type Golden } from "./golden";
import { SCENARIOS, type Scenario } from "./scenarios";

const UPDATE = process.env.GOLDEN_UPDATE === "1";

function loadGolden(id: string): Golden {
  const path = goldenFilePath(id);
  if (!existsSync(path)) throw new Error(`${id}: 골든 파일 없음 (${path}). \`npm run golden:update\` 로 만드세요.`);
  return JSON.parse(readFileSync(path, "utf8")) as Golden;
}

beforeAll(() => {
  if (!UPDATE) return;
  updateGoldens(
    SCENARIOS,
    {
      read: (id) => (existsSync(goldenFilePath(id)) ? loadGolden(id) : null),
      write: (id, text) => writeFileSync(goldenFilePath(id), text),
    },
  );
});

type Ev = Record<string, unknown>;
const eventsOf = (trace: { ticks: readonly { events: readonly unknown[] }[] }): Ev[] => trace.ticks.flatMap((t) => t.events as Ev[]);

describe.each(SCENARIOS)("골든 회귀 $id", (sc) => {
  it("골든 검증: 틱별 해시·outcome·finalGold·finalBaseHp·ledger 일치, 새 코어 2회 실행 동일, 매 틱 불변식", () => {
    const golden = loadGolden(sc.id);
    expect(golden.record.codeVersion, "골든이 오래됨이면 npm run golden:update").toBe(ATTEMPT_CODE_VERSION);
    verifyGolden(golden, sc);
    expect(golden.outcome).toBe(sc.expectedOutcome);
  });

  it("스크립트가 일으키는 사건: 시나리오가 비어 있지 않다(투사체·폭발·둔화·처치·웨이브·기지 피해 등)", () => {
    const { trace } = verifyGolden(loadGolden(sc.id), sc);
    const types = new Set(eventsOf(trace).map((e) => e.type as string));
    for (const type of sc.requiredEvents) expect(types.has(type), `${sc.id}: ${type} 이벤트가 나와야 함`).toBe(true);
  });

  it("골든 input 은 시나리오의 현재 입력 정의(콘텐츠 해시·스크립트·종료 정책)와 같다", () => {
    expect(canonicalize(loadGolden(sc.id).input)).toBe(canonicalize(inputOf(sc)));
  });

  it("골든 record 는 스크립트를 기록기로 다시 실행한 기록과 같다(시나리오만 바꾸고 골든을 안 갱신하는 실수 방지)", () => {
    const golden = loadGolden(sc.id);
    expect(JSON.parse(JSON.stringify(playScenario(sc).record))).toEqual(golden.record);
  });
});

describe("시나리오별 구체 단언", () => {
  const trace = (id: Scenario["id"]) => verifyGolden(loadGolden(id), SCENARIOS.find((s) => s.id === id)!).trace;

  it("R1: 5웨이브 승리, 4종 설치·강화·타깃 변경·판매, 전투 중 판매는 wrongPhase 거부, 일부 기지 도달", () => {
    const events = eventsOf(trace("R1"));
    const count = (type: string) => events.filter((e) => e.type === type).length;
    expect(count("waveCleared")).toBe(5);
    expect(events.filter((e) => e.type === "towerBuilt").map((e) => e.towerType).sort()).toEqual(["archer", "archer", "ballista", "frost", "mage"]);
    expect(count("towerSold")).toBe(3);
    expect(count("towerUpgraded")).toBe(3);
    expect(events.filter((e) => e.type === "commandRejected")).toMatchObject([{ reason: "wrongPhase", kind: "sell" }]);
    expect(count("enemyReachedBase")).toBeGreaterThan(0);
    expect(events.filter((e) => e.type === "enemySpawned").map((e) => e.enemyType).sort()).toContain("heavy");
    expect(events.at(-1)).toMatchObject({ type: "resultReached", outcome: "victory" });
  });

  it("R2: 패배 틱(마지막 도착)에 웨이브 완료 조건이 성립해도 waveCleared·waveClear 보상이 없다", () => {
    const t = trace("R2");
    const last = t.ticks[t.ticks.length - 1];
    const lastTypes = (last.events as Ev[]).map((e) => e.type);
    expect(lastTypes).toEqual(["enemyReachedBase", "resultReached"]);
    expect(eventsOf(t).some((e) => e.type === "waveCleared")).toBe(false);
    expect(eventsOf(t).some((e) => String(e.key ?? "").includes("waveClear"))).toBe(false);
    expect((last.state as { baseHp: number; enemies: unknown[]; phase: string }).phase).toBe("defeat");
    expect((last.state as { enemies: unknown[] }).enemies).toEqual([]); // 마지막 적까지 사라진 같은 틱 = 웨이브 완료 조건 성립
    expect(eventsOf(t).filter((e) => e.type === "enemyKilled")).toHaveLength(1); // swarm 하나(mage 폭발)
  });

  it("R3: 결과 없이 endTick 500(전투 중)에 끝나고, 특성 3종 모두 등장·전투 중 설치·강화·타깃 변경이 적용된다", () => {
    const t = trace("R3");
    const events = eventsOf(t);
    const last = t.ticks[t.ticks.length - 1];
    expect(last.tick).toBe(500);
    expect((last.state as { outcome: unknown; phase: string }).outcome).toBeNull();
    expect((last.state as { phase: string }).phase).toBe("combat");
    expect(new Set(events.filter((e) => e.type === "enemySpawned").map((e) => e.trait))).toEqual(new Set([null, "speedBoost", "hpBoost", "controlResistance"]));
    // 전투 중(틱 30·120·200 설치, 틱 215 같은 칸 재설치는 occupied 로 거부)에 타워가 늘고 강화·타깃 변경이 성공했다
    expect(events.filter((e) => e.type === "towerBuilt").map((e) => e.tick)).toEqual([1, 1, 1, 30, 120, 200]);
    expect(events.filter((e) => e.type === "towerUpgraded").length).toBe(4);
    expect(events.filter((e) => e.type === "targetingChanged").length).toBe(4);
    expect(events.filter((e) => e.type === "commandRejected")).toMatchObject([{ reason: "occupied", kind: "build", tick: 215 }]);
    // 서로 다른 출처의 둔화가 한 적에 동시에 걸린 틱이 있다(가장 강한 것만 적용되는 규칙의 회귀 보호)
    expect(t.ticks.some((x) => (x.state as { enemies: { slows: unknown[] }[] }).enemies.some((e) => e.slows.length >= 2))).toBe(true);
    // 둔화가 실제로 적용돼 있던 틱이 있다
    expect(t.ticks.some((x) => (x.state as { enemies: { slows: unknown[] }[] }).enemies.some((e) => e.slows.length > 0))).toBe(true);
  });
});
