// ART-03 — 맵 장식 배치: 결정성, 길·생성·기지 칸 제외, 비율, 같은 행·열 이웃 금지, 5스테이지 전부.
import { describe, expect, it } from "vitest";
import { STAGE_MAPS } from "../content/stageMaps";
import { cellIndex, compileStageMap } from "../core/map/stageMap";
import { computeDecor, DECOR_KINDS, DECOR_WEIGHTS } from "./decor";
import { ENEMY_TYPES, themeOf } from "./assets";
import { enemyBarLayout } from "./sprites";

const maps = STAGE_MAPS.map((m) => compileStageMap(m));
const decorOf = (i: number) => computeDecor(maps[i], themeOf(i));

describe("computeDecor", () => {
  it("스테이지 5개 전부 검증 대상(맵 5개)", () => {
    expect(maps).toHaveLength(5);
  });

  it("같은 맵이면 항상 같은 결과(결정적, 두 번·다시 컴파일해도)", () => {
    for (const [i, m] of maps.entries()) {
      expect(computeDecor(m, themeOf(maps.indexOf(m)))).toEqual(computeDecor(m, themeOf(maps.indexOf(m))));
      expect(computeDecor(compileStageMap(STAGE_MAPS[i]), themeOf(i))).toEqual(computeDecor(m, themeOf(i)));
    }
  });

  it("길·생성·기지·예약 칸에는 놓지 않고, 격자 안, 종류 1~5", () => {
    for (const m of maps) {
      const first = m.pathCells[0];
      const last = m.pathCells[m.pathCells.length - 1];
      for (const d of computeDecor(m, themeOf(maps.indexOf(m)))) {
        expect(m.blocked.has(cellIndex(d))).toBe(false);
        expect(d.col >= 0 && d.col < 18 && d.row >= 0 && d.row < 10).toBe(true);
        expect([d.col, d.row]).not.toEqual([first.col, first.row]);
        expect([d.col, d.row]).not.toEqual([last.col, last.row]);
        expect(d.variant >= 1 && d.variant <= DECOR_KINDS).toBe(true);
      }
    }
  });

  it("빈 칸의 약 20%(스테이지마다 15~25%)", () => {
    for (const m of maps) {
      const empty = 180 - m.blocked.size;
      const n = computeDecor(m, themeOf(maps.indexOf(m))).length;
      expect(n / empty).toBeGreaterThanOrEqual(0.15);
      expect(n / empty).toBeLessThanOrEqual(0.25);
    }
  });

  it("같은 행·열로 이웃한 칸에 두 장식이 없다", () => {
    for (const m of maps) {
      const set = new Set(computeDecor(m, themeOf(maps.indexOf(m))).map(cellIndex));
      for (const d of computeDecor(m, themeOf(maps.indexOf(m)))) {
        if (d.col < 17) expect(set.has(cellIndex({ col: d.col + 1, row: d.row }))).toBe(false);
        if (d.row < 9) expect(set.has(cellIndex({ col: d.col, row: d.row + 1 }))).toBe(false);
      }
    }
  });

  it("8종 모두 등장하고, 초원은 나무·꽃(1·3·6·7·8)이 돌·그루터기(4·5)보다 확실히 자주 나온다", () => {
    const meadow = decorOf(0);
    expect(new Set(maps.flatMap((m, i) => computeDecor(m, themeOf(i)).map((d) => d.variant))).size).toBe(8);
    const count = (vs: number[]) => meadow.filter((d) => vs.includes(d.variant)).length;
    expect(DECOR_WEIGHTS).toHaveLength(3);
    expect(count([1, 3, 6, 7, 8]) / 5).toBeGreaterThan((count([4, 5]) / 2) * 1.5);
  });

  it("같은 테마 스테이지(2·4, 3·5)는 장식 자리가 서로 다르다(스테이지 id 로 섞음)", () => {
    const cells = (i: number) => new Set(decorOf(i).map(cellIndex));
    for (const [a, b] of [[1, 3], [2, 4]] as const) {
      const shared = [...cells(a)].filter((c) => cells(b).has(c)).length;
      expect(shared).toBeLessThan(cells(a).size * 0.5); // 무작위로 겹쳐도 절반 미만
    }
  });

  it("행 우선 순서이고 중복 칸이 없다", () => {
    for (const m of maps) {
      const idx = computeDecor(m, themeOf(maps.indexOf(m))).map(cellIndex);
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
