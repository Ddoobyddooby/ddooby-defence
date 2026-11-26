// BAL-01 — 후보 수치(bal-01-v1)가 BALANCE 4절 통과 기준 BALX-01~10 을 만족하는지 고정한다. 봇 9종×3스테이지 + 역할 16회 + 추적 6회를 한 번만 모아 기준마다 단언한다.
import { beforeAll, describe, expect, it } from "vitest";
import { BALANCE_CANDIDATE } from "../content/balanceCandidate";
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
  data = collectData(BALANCE_CANDIDATE);
  criteria = evaluateCriteria(BALANCE_CANDIDATE, data);
}, 180000);

describe("후보 번들", () => {
  it("버전·환급률·특성 처치 보상 보너스가 BALANCE 1절 결정을 따른다", () => {
    expect(BALANCE_CANDIDATE.contentVersion).toBe("bal-01-v1");
    expect(BALANCE_CANDIDATE.economy.refundRateBp).toBe(7000);
    expect(BALANCE_CANDIDATE.traits.every((t) => t.killRewardBonus > 0)).toBe(true);
  });
  it("콘텐츠 검증을 통과하고 맵은 승인된 STAGE_MAPS 그대로다", () => {
    const v = validateContent(BALANCE_CANDIDATE);
    expect(v.globalErrors).toEqual([]);
    [0, 1, 2].forEach((i) => expect(isStagePlayable(v, i)).toBe(true));
    BALANCE_CANDIDATE.stages.forEach((s, i) => expect(s.map).toEqual(STAGE_MAPS[i]));
  });
});

describe("BALX 기준", () => {
  for (let n = 1; n <= 10; n++) {
    const id = `BALX-${String(n).padStart(2, "0")}`;
    it(id, () => {
      const c = criteria.find((x) => x.id === id);
      expect(c, id).toBeDefined();
      expect(c!.pass, `${c!.title}: ${c!.detail}`).toBe(true);
    });
  }
  it("기준이 10개 모두 평가된다", () => {
    expect(criteria.map((c) => c.id)).toEqual(Array.from({ length: 10 }, (_, i) => `BALX-${String(i + 1).padStart(2, "0")}`));
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
    const r = runBot(BALANCE_CANDIDATE, 0, "B0");
    expect(r.outcome).toBe("defeat");
    expect(r.towerCount).toBe(0);
  });
  it("보고서에 기준 표·튜닝 이력이 들어 있다", () => {
    const md = buildReport(BALANCE_CANDIDATE, data);
    expect(md).toContain("전체: 10/10 통과");
    expect(md).toContain("튜닝 이력");
  });
});
