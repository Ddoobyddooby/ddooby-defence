// GOLD-01 — 승인 수치(GAME_CONTENT) 골든 회귀 (SIM-CONTRACT 15.6). 코어 변경이 실제 게임 결과를 바꾸면 틱 해시·결과·원장 불일치로 잡힌다.
// 갱신은 `npm run golden:update`(GOLDEN_UPDATE=1)로만 한다. 같은 codeVersion·같은 입력(콘텐츠 해시·스크립트)에서 결과가 달라지면 갱신 가드가 거부한다(회귀).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { GAME_CONTENT } from "../../content/gameContent";
import { canonicalize } from "../../core/sim/canonical";
import { ATTEMPT_CODE_VERSION } from "../../core/attempt";
import { inputOf, playScenario, updateGoldens, verifyGolden, type Golden, type Verified } from "../../core/attempt/regression/golden";
import { GAME_SCENARIOS, GOLDEN_CONTENT_VERSION, goldenUrl, type GameScenario } from "./scenarios";

const UPDATE = process.env.GOLDEN_UPDATE === "1";
const pathOf = (id: string): string => fileURLToPath(goldenUrl(id));

function loadGolden(id: string): Golden {
  const path = pathOf(id);
  if (!existsSync(path)) throw new Error(`${id}: 골든 파일 없음 (${path}). \`npm run golden:update\` 로 만드세요.`);
  return JSON.parse(readFileSync(path, "utf8")) as Golden;
}

beforeAll(() => {
  if (!UPDATE) return;
  updateGoldens(GAME_SCENARIOS, {
    read: (id) => (existsSync(pathOf(id)) ? loadGolden(id) : null),
    write: (id, text) => writeFileSync(pathOf(id), text),
  });
}, 120000);

/** 시나리오마다 검증(틱 해시 비교·재실행·불변식)을 한 번만 한다. */
const verified = new Map<string, Verified>();
const verify = (sc: GameScenario): Verified => {
  let v = verified.get(sc.id);
  if (v === undefined) {
    v = verifyGolden(loadGolden(sc.id), sc);
    verified.set(sc.id, v);
  }
  return v;
};
type Ev = Record<string, unknown>;
const eventsOf = (v: Verified): Ev[] => v.trace.ticks.flatMap((t) => t.events as Ev[]);

describe("승인 수치 변경 가드", () => {
  it("contentVersion 이 골든을 만든 버전과 같다 — 바뀌었다면 `npm run golden:update` 로 의도적으로 갱신하고 GOLDEN_CONTENT_VERSION 을 고친다", () => {
    expect(GAME_CONTENT.contentVersion, "승인 수치 버전이 바뀜: 골든 갱신 필요(npm run golden:update) 후 scenarios.ts 의 GOLDEN_CONTENT_VERSION 수정").toBe(GOLDEN_CONTENT_VERSION);
  });
  it.each(GAME_SCENARIOS)("$id 골든의 contentHash 가 현재 승인 수치와 같다(버전을 올리지 않고 수치만 바꾼 경우도 잡는다)", (sc) => {
    expect(loadGolden(sc.id).input.contentHash, `${sc.id}: 게임 수치가 골든과 달라짐 — 의도한 변경이면 contentVersion 을 올리고 npm run golden:update`).toBe(inputOf(sc).contentHash);
  });
});

describe.each(GAME_SCENARIOS)("실제 수치 골든 $id — $title", (sc) => {
  it("골든 검증: 틱별 해시·outcome·finalGold·finalBaseHp·ledger 일치, 새 코어 2회 실행 동일, 매 틱 불변식", () => {
    const golden = loadGolden(sc.id);
    expect(golden.record.codeVersion, "골든이 오래됨이면 npm run golden:update").toBe(ATTEMPT_CODE_VERSION);
    verify(sc);
    expect(golden.outcome).toBe(sc.expectedOutcome);
  });

  it("결과 틱이 고정 기대값과 같다", () => {
    const golden = loadGolden(sc.id);
    expect(golden.record.endTick).toBe(sc.expectedEndTick);
    expect(golden.tickHashes.length).toBe(sc.expectedEndTick + 1);
  });

  it("스크립트가 일으키는 사건: 비어 있지 않다", () => {
    const types = new Set(eventsOf(verify(sc)).map((e) => e.type as string));
    for (const type of sc.requiredEvents) expect(types.has(type), `${sc.id}: ${type} 이벤트가 나와야 함`).toBe(true);
  });

  it("골든 input 은 시나리오의 현재 입력 정의(콘텐츠 해시·스크립트·종료 정책)와 같다", () => {
    expect(canonicalize(loadGolden(sc.id).input)).toBe(canonicalize(inputOf(sc)));
  });

  it("골든 record 는 스크립트를 기록기로 다시 실행한 기록과 같다", () => {
    expect(JSON.parse(JSON.stringify(playScenario(sc).record))).toEqual(loadGolden(sc.id).record);
  });
});

describe("시나리오별 구체 단언", () => {
  const by = (id: string): GameScenario => GAME_SCENARIOS.find((s) => s.id === id)!;
  const count = (events: Ev[], type: string): number => events.filter((e) => e.type === type).length;

  it("G1~G3: 5웨이브 모두 완료하고 승리, 기지 HP가 남는다", () => {
    for (const id of ["G1", "G2", "G3"]) {
      const v = verify(by(id));
      const ev = eventsOf(v);
      expect(count(ev, "waveCleared"), id).toBe(5);
      expect(ev.at(-1), id).toMatchObject({ type: "resultReached", outcome: "victory" });
      expect(loadGolden(id).finalBaseHp, id).toBeGreaterThan(0);
    }
  });

  it("G4: 초보 봇은 3스테이지에서 웨이브 5 전에 패배하고 패배 틱에 waveCleared 가 없다", () => {
    const ev = eventsOf(verify(by("G4")));
    expect(ev.at(-1)).toMatchObject({ type: "resultReached", outcome: "defeat" });
    expect(count(ev, "waveCleared")).toBeLessThan(5);
    expect(loadGolden("G4").finalBaseHp).toBe(0);
  });

  it("G5: 전투 중 판매는 wrongPhase 로 한 번 거부되고, 준비 중 판매·전투 중 강화·설치·타깃 변경이 적용된다", () => {
    const v = verify(by("G5"));
    const ev = eventsOf(v);
    expect(ev.filter((e) => e.type === "commandRejected")).toMatchObject([{ reason: "wrongPhase", kind: "sell", tick: 950 }]);
    expect(ev.filter((e) => e.type === "towerSold").map((e) => e.tick)).toEqual([1460, 3700]);
    expect(count(ev, "targetingChanged")).toBe(5);
    // 틱 4200 강화·4300 설치는 웨이브 5 전투(3788~) 중에 적용된다
    expect(ev.filter((e) => e.type === "towerUpgraded").map((e) => e.tick)).toEqual([1490, 3400, 3500, 4200]);
    expect(ev.filter((e) => e.type === "towerBuilt" && (e.tick as number) >= 3788).map((e) => e.tick)).toEqual([4300]);
    expect(ev.at(-1)).toMatchObject({ type: "resultReached", outcome: "victory" });
  });
});
