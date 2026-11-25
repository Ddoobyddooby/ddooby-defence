import { describe, expect, it } from "vitest";
import { validateContent } from "../core/content/validate";
import { DEV_PLACEHOLDER } from "../content/devBundle";
import { deriveStageCards, isEnterable, MemoryProgressStore } from "./progress";

const ids = DEV_PLACEHOLDER.stages.map((s) => s.stageId);
const ok = validateContent(DEV_PLACEHOLDER);

describe("deriveStageCards (SPEC 10절·UI-CONTRACT 4절)", () => {
  it("처음: Stage 1 선택 가능, 2·3 잠김", () => {
    expect(deriveStageCards(ok, ids, []).map((c) => c.state)).toEqual(["available", "locked", "locked"]);
  });
  it("Stage 1 클리어 → 1 클리어, 2 선택 가능, 3 잠김. 2 도 클리어 → 3 선택 가능", () => {
    expect(deriveStageCards(ok, ids, [ids[0]]).map((c) => c.state)).toEqual(["cleared", "available", "locked"]);
    expect(deriveStageCards(ok, ids, [ids[0], ids[1]]).map((c) => c.state)).toEqual(["cleared", "cleared", "available"]);
  });
  it("앞 스테이지가 클리어 안 됐으면 뒤 스테이지 클리어 플래그가 있어도 해금 파생은 '클리어'로 보인다(플래그 우선), 3 은 2 클리어 필요", () => {
    expect(deriveStageCards(ok, ids, [ids[2]]).map((c) => c.state)).toEqual(["available", "locked", "cleared"]);
  });
  it("그 스테이지만 콘텐츠 오류: 해당 카드만 contentError + 진단, 다른 카드는 정상 파생", () => {
    const bad = structuredClone(DEV_PLACEHOLDER) as unknown as { stages: { baseHp: number }[] };
    bad.stages[1].baseHp = 0;
    const cards = deriveStageCards(validateContent(bad), ids, [ids[0]]);
    expect(cards.map((c) => c.state)).toEqual(["cleared", "contentError", "locked"]);
    expect(cards[1].diagnostics[0]).toContain("stages[1].baseHp");
    expect(isEnterable(cards[1])).toBe(false);
    expect(isEnterable(cards[0])).toBe(true);
  });
  it("전역 오류는 모든 카드가 contentError, 클리어 플래그가 있어도 오류가 우선", () => {
    const bad = structuredClone(DEV_PLACEHOLDER) as unknown as { economy: { refundRateBp: number } };
    bad.economy.refundRateBp = 10001;
    const cards = deriveStageCards(validateContent(bad), ids, [ids[0]]);
    expect(cards.map((c) => c.state)).toEqual(["contentError", "contentError", "contentError"]);
  });
  it("stageId 를 알 수 없는 자리(null)는 클리어로 보이지 않는다", () => {
    expect(deriveStageCards(ok, [null, ids[1], ids[2]], []).map((c) => c.state)).toEqual(["available", "locked", "locked"]);
  });
});

describe("MemoryProgressStore", () => {
  it("markCleared 는 멱등이고 정렬된 목록을 준다", () => {
    const s = new MemoryProgressStore();
    s.markCleared("b");
    s.markCleared("a");
    s.markCleared("b");
    expect(s.getCleared()).toEqual(["a", "b"]);
  });
});
