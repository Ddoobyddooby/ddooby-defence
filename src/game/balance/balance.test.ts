// BAL-01·STAGE-45 — 수치(bal-02-v1)가 BALANCE 4절·8.1 통과 기준 BALX-01~11 을 만족하는지 고정한다. 봇 9종×5스테이지 + 역할 16회 + 추적 10회를 한 번만 모아 기준마다 단언한다.
import { beforeAll, describe, expect, it } from "vitest";
import { GAME_CONTENT } from "../content/gameContent";
import { isStagePlayable, validateContent } from "../core/content/validate";
import { compileStageMap } from "../core/map";
import { STAGE_MAPS } from "../content/stageMaps";
import { createBot } from "./bots";
import { collectData, evaluateCriteria, type BalanceData, type Criterion } from "./criteria";
import { pathSamples, rankCells, scoreCell } from "./placement";
import { buildReport } from "./report";
import { runBot } from "./runner";

let data: BalanceData;
let criteria: Criterion[];

beforeAll(() => {
  data = collectData(GAME_CONTENT);
  criteria = evaluateCriteria(GAME_CONTENT, data);
}, 180000);

describe("후보 번들", () => {
  it("버전·환급률·특성 처치 보상 보너스가 BALANCE 1절 결정을 따른다", () => {
    expect(GAME_CONTENT.contentVersion).toBe("bal-02-v1");
    expect(GAME_CONTENT.economy.refundRateBp).toBe(7000);
    expect(GAME_CONTENT.traits.every((t) => t.killRewardBonus > 0)).toBe(true);
  });
  it("콘텐츠 검증을 통과하고 맵은 승인된 STAGE_MAPS 그대로다", () => {
    const v = validateContent(GAME_CONTENT);
    expect(v.globalErrors).toEqual([]);
    [0, 1, 2].forEach((i) => expect(isStagePlayable(v, i)).toBe(true));
    GAME_CONTENT.stages.forEach((s, i) => expect(s.map).toEqual(STAGE_MAPS[i]));
  });
});

describe("BALX 기준", () => {
  for (let n = 1; n <= 11; n++) {
    const id = `BALX-${String(n).padStart(2, "0")}`;
    it(id, () => {
      const c = criteria.find((x) => x.id === id);
      expect(c, id).toBeDefined();
      expect(c!.pass, `${c!.title}: ${c!.detail}`).toBe(true);
    });
  }
  it("기준이 11개 모두 평가된다", () => {
    expect(criteria.map((c) => c.id)).toEqual(Array.from({ length: 11 }, (_, i) => `BALX-${String(i + 1).padStart(2, "0")}`));
  });
});

describe("timeout 은 패배로 세지 않는다(리뷰 F1)", () => {
  const withOutcome = (ids: string[], stage: number, outcome: "timeout" | "defeat") => {
    const runs = { ...data.runs } as Record<string, (typeof data.runs)["B1"]>;
    for (const id of ids) runs[id] = data.runs.B1.map((r, i) => (i === stage ? { ...data.runs[id as "B1"][i], outcome } : data.runs[id as "B1"][i]));
    return { ...data, runs } as BalanceData;
  };
  const pass = (d: BalanceData, id: string) => evaluateCriteria(GAME_CONTENT, d).find((c) => c.id === id)!.pass;
  it("BALX-05: S3 단일 종류가 timeout 이면 실패, defeat 이면 통과", () => {
    expect(pass(withOutcome(["B3a", "B3b", "B3d"], 2, "timeout"), "BALX-05")).toBe(false);
    expect(pass(withOutcome(["B3a", "B3b", "B3d"], 2, "defeat"), "BALX-05")).toBe(true);
  });
  it("BALX-04: B2 S3 timeout 이면 실패", () => {
    expect(pass(withOutcome(["B2"], 2, "timeout"), "BALX-04")).toBe(false);
  });
  it("BALX-01/02/06: timeout 이면 실패", () => {
    expect(pass(withOutcome(["B0"], 0, "timeout"), "BALX-01")).toBe(false);
    expect(pass(withOutcome(["B1"], 1, "timeout"), "BALX-02")).toBe(false);
    expect(pass(withOutcome(["B4"], 0, "timeout"), "BALX-06")).toBe(false);
  });
  it("BALX-09: 서리 제외(B5) S3 가 timeout 이면 '나빠짐' 으로 세지 않는다", () => {
    const ok = (d: BalanceData) => evaluateCriteria(GAME_CONTENT, d).find((c) => c.id === "BALX-09")!.detail.includes("× 서리 제외");
    expect(ok(withOutcome(["B5"], 2, "timeout"))).toBe(true);
    expect(ok(withOutcome(["B5"], 2, "defeat"))).toBe(false);
  });
});

describe("자리 점수·봇·보고서", () => {
  it("자리 점수: 같은 입력은 같은 순서, 점수 내림차순·동률은 row→col", () => {
    const map = compileStageMap(STAGE_MAPS[0]);
    const samples = pathSamples(map);
    const a = rankCells(map, samples, 3500);
    expect(rankCells(map, samples, 3500)).toEqual(a);
    for (let i = 1; i < a.length; i++) {
      const p = a[i - 1];
      const q = a[i];
      expect(p.score >= q.score).toBe(true);
      if (p.score === q.score) expect(p.row < q.row || (p.row === q.row && p.col < q.col)).toBe(true);
    }
    expect(scoreCell(samples, a[0].col, a[0].row, 3500)).toBe(a[0].score);
  });
  it("B0 는 아무 명령도 내지 않는다(웨이브 3 안에 패배)", () => {
    expect(createBot("B0").id).toBe("B0");
    const r = runBot(GAME_CONTENT, 0, "B0");
    expect(r.outcome).toBe("defeat");
    expect(r.towerCount).toBe(0);
  });
  it("보고서에 기준 표·튜닝 이력이 들어 있다", () => {
    const md = buildReport(GAME_CONTENT, data);
    expect(md).toContain("전체: 11/11 통과");
    expect(md).toContain("튜닝 이력");
  });
});
