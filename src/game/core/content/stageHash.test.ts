import { describe, expect, it } from "vitest";
import { canonicalize } from "../sim/canonical";
import type { StageContent } from "./types";
import { stageContentHash, validateStageForEntry } from "./validate";
import { reverseKeys, validBundle, withValue } from "./testing/fixtures";

const IDS = ["stage-1-meadow-outpost", "stage-2-snowfall-pass", "stage-3-dusk-ruins"];

function hashes(bundle: unknown): string[] {
  return IDS.map((id) => {
    const r = validateStageForEntry(bundle, id);
    if (!r.ok) throw new Error(`${id}: ${JSON.stringify(r.errors)}`);
    return r.contentHash;
  });
}

describe("스테이지 콘텐츠 해시 (11.4)", () => {
  it("golden: 정규 문자열 리터럴과 독립(Python FNV-1a 64) 계산값", () => {
    const tiny = {
      global: { contentVersion: "t", towers: [], enemies: [], traits: [], economy: { refundRateBp: 7000 } },
      stage: { stageId: "s", initialGold: 5, map: { stageId: "s", waypoints: [{ col: 0, row: 1 }, { col: 3, row: 1 }], reservedCells: [] }, waves: [] },
    } as unknown as StageContent;
    expect(canonicalize({ global: tiny.global, stage: tiny.stage })).toBe(
      '{"global":{"contentVersion":"t","economy":{"refundRateBp":7000},"enemies":[],"towers":[],"traits":[]},"stage":{"initialGold":5,"map":{"reservedCells":[],"stageId":"s","waypoints":[{"col":0,"row":1},{"col":3,"row":1}]},"stageId":"s","waves":[]}}',
    );
    expect(stageContentHash(tiny)).toBe("3b20f1a5f4a7dff6");
  });
  it("소문자 16자리 16진수, 스테이지마다 다르다", () => {
    const h = hashes(validBundle());
    for (const x of h) expect(x).toMatch(/^[0-9a-f]{16}$/);
    expect(new Set(h).size).toBe(3);
  });
  it("같은 내용·다른 키 삽입 순서 → 같은 해시, 같은 입력 반복도 같다", () => {
    const base = hashes(validBundle());
    expect(hashes(reverseKeys(validBundle()))).toEqual(base);
    expect(hashes(validBundle())).toEqual(base);
  });
  it("한 스테이지 값 변경 → 그 스테이지 해시만 변경", () => {
    const base = hashes(validBundle());
    const changed = hashes(withValue("stages[1].waves[0].segments[0].count", 4));
    expect([changed[0] === base[0], changed[1] === base[1], changed[2] === base[2]]).toEqual([true, false, true]);
    const gold = hashes(withValue("stages[2].initialGold", 301));
    expect([gold[0] === base[0], gold[1] === base[1], gold[2] === base[2]]).toEqual([true, true, false]);
  });
  it("전역 값 변경 → 모든 스테이지 해시 변경", () => {
    const base = hashes(validBundle());
    for (const [path, value] of [["towers[0].buildCost", 101], ["economy.refundRateBp", 6999], ["contentVersion", "test-2"], ["enemies[3].hp", 31], ["traits[1].killRewardBonus", 3]] as const) {
      const changed = hashes(withValue(path, value));
      expect(changed.map((c, i) => c !== base[i]), path).toEqual([true, true, true]);
    }
  });
});
