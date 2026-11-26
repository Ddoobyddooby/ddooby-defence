// ART-03 — 규격 파일명 목록(52장).
import { describe, expect, it } from "vitest";
import { ASSET_NAMES, assetUrl, groundKey, towerKey } from "./assets";

describe("ASSET_NAMES", () => {
  it("52장, 중복 없음, 소문자·하이픈 파일명", () => {
    expect(ASSET_NAMES).toHaveLength(52);
    expect(new Set(ASSET_NAMES).size).toBe(52);
    for (const n of ASSET_NAMES) expect(n).toMatch(/^[a-z0-9-]+$/);
  });
  it("규격 표의 이름과 일치", () => {
    for (const n of ["s1-ground-1", "s3-path-corner", "s2-spawn", "s3-gate", "tower-frost-4", "enemy-swarm", "trait-resist", "trait-hp", "trait-speed", "proj-arrow", "proj-bolt", "proj-orb", "proj-shard", "fx-blast", "fx-frost", "fx-hit", "fx-slow"])
      expect(ASSET_NAMES).toContain(n);
    expect(groundKey(0, 2)).toBe("s1-ground-2");
    expect(towerKey("mage", 9)).toBe("tower-mage-4");
    expect(assetUrl("fx-hit")).toBe("/assets/game/fx-hit.png");
  });
});
