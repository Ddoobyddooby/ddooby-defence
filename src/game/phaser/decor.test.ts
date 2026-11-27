// ART-03 — 맵 장식 배치: 결정성, 길·생성·기지 칸 제외, 비율, 같은 행·열 이웃 금지, 5스테이지 전부.
import { describe, expect, it } from "vitest";
import { STAGE_MAPS } from "../content/stageMaps";
import { cellIndex, compileStageMap } from "../core/map/stageMap";
import { computeDecor } from "./decor";
import { ENEMY_TYPES } from "./assets";
import { enemyBarLayout } from "./sprites";

const maps = STAGE_MAPS.map((m) => compileStageMap(m));

describe("computeDecor", () => {
  it("스테이지 5개 전부 검증 대상(맵 5개)", () => {
    expect(maps).toHaveLength(5);
  });

  it("같은 맵이면 항상 같은 결과(결정적, 두 번·다시 컴파일해도)", () => {
    for (const [i, m] of maps.entries()) {
      expect(computeDecor(m)).toEqual(computeDecor(m));
      expect(computeDecor(compileStageMap(STAGE_MAPS[i]))).toEqual(computeDecor(m));
    }
  });

  it("길·생성·기지·예약 칸에는 놓지 않고, 격자 안, 종류 1~5", () => {
    for (const m of maps) {
      const first = m.pathCells[0];
      const last = m.pathCells[m.pathCells.length - 1];
      for (const d of computeDecor(m)) {
        expect(m.blocked.has(cellIndex(d))).toBe(false);
        expect(d.col >= 0 && d.col < 18 && d.row >= 0 && d.row < 10).toBe(true);
        expect([d.col, d.row]).not.toEqual([first.col, first.row]);
        expect([d.col, d.row]).not.toEqual([last.col, last.row]);
        expect([1, 2, 3, 4, 5]).toContain(d.variant);
      }
    }
  });

  it("빈 칸의 약 10%(스테이지마다 6~14%)", () => {
    for (const m of maps) {
      const empty = 180 - m.blocked.size;
      const n = computeDecor(m).length;
      expect(n / empty).toBeGreaterThanOrEqual(0.06);
      expect(n / empty).toBeLessThanOrEqual(0.14);
    }
  });

  it("같은 행·열로 이웃한 칸에 두 장식이 없다", () => {
    for (const m of maps) {
      const set = new Set(computeDecor(m).map(cellIndex));
      for (const d of computeDecor(m)) {
        if (d.col < 17) expect(set.has(cellIndex({ col: d.col + 1, row: d.row }))).toBe(false);
        if (d.row < 9) expect(set.has(cellIndex({ col: d.col, row: d.row + 1 }))).toBe(false);
      }
    }
  });

  it("종류가 한 가지로 쏠리지 않는다(스테이지 5개 합쳐 5종 모두 등장)", () => {
    const kinds = new Set(maps.flatMap((m) => computeDecor(m).map((d) => d.variant)));
    expect(kinds.size).toBe(5);
  });

  it("행 우선 순서이고 중복 칸이 없다", () => {
    for (const m of maps) {
      const idx = computeDecor(m).map(cellIndex);
      expect([...idx].sort((a, b) => a - b)).toEqual(idx);
      expect(new Set(idx).size).toBe(idx.length);
    }
  });
});

describe("enemyBarLayout", () => {
  it("바 아래 끝이 종류별 머리 꼭대기 위(몸을 덮지 않음)이고, 머리가 높은 종류일수록 바도 높다", () => {
    const tile = 60;
    const size = tile * 1.25;
    const feet = 200;
    const top = Object.fromEntries(ENEMY_TYPES.map((t) => [t, enemyBarLayout(t, feet, size, tile)]));
    expect(top.heavy.barTop).toBeLessThan(top.normal.barTop);
    expect(top.normal.barTop).toBeLessThan(top.fast.barTop);
    expect(top.fast.barTop).toBeLessThan(top.swarm.barTop);
    for (const t of ENEMY_TYPES) {
      const l = top[t];
      expect(l.barTop + Math.max(2, l.barW * 0.12)).toBeLessThan(feet); // 발보다 위
      expect(l.barW).toBeGreaterThanOrEqual(tile * 0.45);
      expect(l.barW).toBeLessThanOrEqual(tile * 0.9);
    }
  });
  it("오크(heavy)의 바가 고블린(swarm)보다 넓다", () => {
    expect(enemyBarLayout("heavy", 100, 75, 60).barW).toBeGreaterThan(enemyBarLayout("swarm", 100, 75, 60).barW);
  });
});
