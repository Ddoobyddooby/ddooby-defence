// UI-01 — 임시 묶음이 검증기를 통과하고 승인 맵을 쓰며 임시 표식을 가진다.
import { describe, expect, it } from "vitest";
import { validateContent, validateStageForEntry } from "../core/content/validate";
import { DEV_PLACEHOLDER, DEV_PLACEHOLDER_LABEL } from "./devBundle";
import { STAGE_MAPS } from "./stageMaps";

describe("DEV_PLACEHOLDER", () => {
  it("validateContent 를 통과한다(전역 오류 0, 5 스테이지 오류 0)", () => {
    const v = validateContent(DEV_PLACEHOLDER);
    expect(v.globalErrors).toEqual([]);
    expect(v.stages.map((x) => x.errors)).toEqual([[], [], [], [], []]);
  });
  it("각 스테이지가 진입 재검증을 통과하고 승인된 후보 맵을 그대로 쓴다", () => {
    DEV_PLACEHOLDER.stages.forEach((st, i) => {
      expect(st.map).toBe(STAGE_MAPS[i]);
      expect(validateStageForEntry(DEV_PLACEHOLDER, st.stageId).ok).toBe(true);
    });
    expect(DEV_PLACEHOLDER.stages).toHaveLength(5);
    for (const st of DEV_PLACEHOLDER.stages) expect(st.waves).toHaveLength(5);
  });
  it("임시 수치임을 이름·콘텐츠 버전·라벨로 드러낸다", () => {
    expect(DEV_PLACEHOLDER.contentVersion).toContain("placeholder");
    expect(DEV_PLACEHOLDER_LABEL).toBe("임시 수치");
  });
});
