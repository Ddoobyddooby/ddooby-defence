// ART-03 — 규격 파일명 목록(76장).
import { describe, expect, it } from "vitest";
import { ASSET_NAMES, assetUrl, decorKey, groundKey, STAGE_THEME, themeOf, towerKey } from "./assets";

describe("ASSET_NAMES", () => {
  it("76장, 중복 없음, 소문자·하이픈 파일명", () => {
    expect(ASSET_NAMES).toHaveLength(76);
    expect(new Set(ASSET_NAMES).size).toBe(76);
    for (const n of ASSET_NAMES) expect(n).toMatch(/^[a-z0-9-]+$/);
  });
  it("규격 표의 이름과 일치", () => {
    for (const n of ["s1-ground-1", "s3-path-corner", "s2-spawn", "s3-gate", "tower-frost-4", "enemy-swarm", "trait-resist", "trait-hp", "trait-speed", "proj-arrow", "proj-bolt", "proj-orb", "proj-shard", "fx-blast", "fx-frost", "fx-hit", "fx-slow", "s1-deco-1", "s2-deco-3", "s3-deco-5", "s1-deco-8", "s2-deco-6"])
      expect(ASSET_NAMES).toContain(n);
    expect(decorKey(2, 5)).toBe("s3-deco-5");
    expect(groundKey(0, 2)).toBe("s1-ground-2");
    expect(towerKey("mage", 9)).toBe("tower-mage-4");
    expect(assetUrl("fx-hit")).toBe("/assets/game/fx-hit.png");
  });
});

describe("스테이지 → 그림 테마 (STAGE-45)", () => {
  it("1·2·3 = 초원·설원·폐허, 4 = 설원, 5 = 폐허; 범위 밖은 끝값", () => {
    expect(STAGE_THEME).toEqual([0, 1, 2, 1, 2]);
    expect([0, 1, 2, 3, 4].map(themeOf)).toEqual([0, 1, 2, 1, 2]);
    expect(themeOf(-1)).toBe(0);
    expect(themeOf(9)).toBe(2);
    expect(groundKey(themeOf(3), 1)).toBe("s2-ground-1");
  });
  it("그림 파일은 테마 3개분(76장) 그대로, 새 파일명 없음", () => {
    expect(ASSET_NAMES.filter((n) => /^s[4-9]-/.test(n))).toEqual([]);
  });
});
