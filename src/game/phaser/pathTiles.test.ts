// ART-03 — 길 타일 자동 배치: 3맵 전부, 모든 모퉁이 4방향, 바닥 변형 결정성.
import { describe, expect, it } from "vitest";
import { STAGE_MAPS } from "../content/stageMaps";
import { compileStageMap, type CompiledStageMap } from "../core/map/stageMap";
import { computePathTiles, groundVariant, spawnRotation } from "./pathTiles";

const mk = (waypoints: { col: number; row: number }[]): CompiledStageMap => compileStageMap({ stageId: "t", waypoints, reservedCells: [] });
const c = (col: number, row: number) => ({ col, row });

describe("computePathTiles", () => {
  it("직선: 가로는 회전 0, 세로는 90(위→아래·아래→위 모두)", () => {
    const h = computePathTiles(mk([c(0, 2), c(4, 2)]));
    expect(h.map((t) => [t.base, t.rotation])).toEqual(Array(5).fill(["straight", 0]));
    const down = computePathTiles(mk([c(2, 0), c(2, 3)]));
    expect(down.every((t) => t.base === "straight" && t.rotation === 90)).toBe(true);
    const up = computePathTiles(mk([c(2, 9), c(2, 6)]));
    expect(up.every((t) => t.base === "straight" && t.rotation === 90)).toBe(true);
  });

  it("첫 칸은 spawn, 마지막 칸은 gate, 그 칸 아래 길(base)도 있다", () => {
    const t = computePathTiles(mk([c(0, 1), c(3, 1)]));
    expect(t[0]).toMatchObject({ kind: "spawn", base: "straight", rotation: 0 });
    expect(t[3]).toMatchObject({ kind: "gate", base: "straight", rotation: 0 });
    expect(t[1].kind).toBe("straight");
  });

  // 모퉁이 4방향: (들어오는 쪽 이웃, 나가는 쪽 이웃) → 기준 corner = 왼쪽에서 들어와 아래로. 시계 방향 90° 마다 W+S → N+W → E+N → S+E.
  const cases: { name: string; wp: { col: number; row: number }[]; rot: number }[] = [
    { name: "왼쪽 이웃+아래 이웃 (왼→오른, 아래로)", wp: [c(0, 1), c(2, 1), c(2, 3)], rot: 0 },
    { name: "위 이웃+왼쪽 이웃 (위→아래, 왼쪽으로)", wp: [c(2, 0), c(2, 2), c(0, 2)], rot: 90 },
    { name: "오른쪽 이웃+위 이웃 (오른→왼, 위로)", wp: [c(17, 3), c(14, 3), c(14, 1)], rot: 180 },
    { name: "아래 이웃+오른쪽 이웃 (아래→위, 오른쪽으로)", wp: [c(5, 9), c(5, 6), c(8, 6)], rot: 270 },
  ];
  for (const k of cases) {
    it(`모퉁이 ${k.name} → 회전 ${k.rot}`, () => {
      const tiles = computePathTiles(mk(k.wp));
      const corner = tiles.filter((t) => t.base === "corner");
      expect(corner).toHaveLength(1);
      expect(corner[0].rotation).toBe(k.rot);
    });
  }
  it("반대 방향으로 걷는 같은 모퉁이도 같은 회전(연결 쌍만 본다)", () => {
    const a = computePathTiles(mk([c(0, 1), c(2, 1), c(2, 3)])).find((t) => t.base === "corner")!;
    const b = computePathTiles(mk([c(2, 9), c(2, 1), c(0, 1)])).find((t) => t.base === "corner")!;
    expect(b.rotation).toBe(a.rotation);
  });

  for (const [i, m] of STAGE_MAPS.entries()) {
    it(`Stage ${i + 1}: 경로 칸마다 하나, 모퉁이 수 = 꺾임 수, 이웃 연결과 일치`, () => {
      const map = compileStageMap(m);
      const tiles = computePathTiles(map);
      expect(tiles).toHaveLength(map.pathCells.length);
      expect(tiles.map((t) => [t.col, t.row])).toEqual(map.pathCells.map((p) => [p.col, p.row]));
      expect(tiles.filter((t) => t.base === "corner")).toHaveLength(map.waypoints.length - 2);
      expect(tiles[0].kind).toBe("spawn");
      expect(tiles[tiles.length - 1].kind).toBe("gate");
      // 직선 방향이 실제 이웃과 일치
      tiles.forEach((t, idx) => {
        if (t.base !== "straight") return;
        const nb = [map.pathCells[idx - 1], map.pathCells[idx + 1]].filter(Boolean)[0];
        const horizontal = nb.row === t.row;
        expect(t.rotation).toBe(horizontal ? 0 : 90);
      });
    });
  }
});

describe("groundVariant", () => {
  it("1~3, 같은 칸은 항상 같은 값, 세 변형이 모두 쓰인다", () => {
    const seen = new Set<number>();
    for (let r = 0; r < 10; r++)
      for (let col = 0; col < 18; col++) {
        const v = groundVariant(col, r);
        expect([1, 2, 3]).toContain(v);
        expect(groundVariant(col, r)).toBe(v);
        seen.add(v);
      }
    expect(seen.size).toBe(3);
  });
  it("주기 무늬가 없다: 대각선 이웃·가로 이웃이 항상 같거나 항상 다르지 않고 변형 비율이 고르다", () => {
    let diagSame = 0;
    let diagTotal = 0;
    const count = [0, 0, 0];
    for (let r = 1; r < 10; r++)
      for (let col = 0; col < 17; col++) {
        diagTotal += 1;
        if (groundVariant(col, r) === groundVariant(col + 1, r - 1)) diagSame += 1;
      }
    for (let r = 0; r < 10; r++) for (let col = 0; col < 18; col++) count[groundVariant(col, r) - 1] += 1;
    expect(diagSame).toBeGreaterThan(0);
    expect(diagSame).toBeLessThan(diagTotal);
    for (const n of count) expect(n).toBeGreaterThan(30);
    // 한 행이 123123… 처럼 3 주기로 반복하지 않는다
    for (let r = 0; r < 10; r++) {
      let periodic = true;
      for (let col = 3; col < 18; col++) if (groundVariant(col, r) !== groundVariant(col - 3, r)) periodic = false;
      expect(periodic).toBe(false);
    }
  });
});

describe("spawnRotation (STAGE-45)", () => {
  it("생성 그림은 길이 나가는 방향으로 돌린다: Stage 1~3 은 동쪽 0, Stage 4 는 위에서 아래라 90", () => {
    expect(STAGE_MAPS.map((m) => spawnRotation(compileStageMap(m)))).toEqual([0, 0, 0, 90, 0]);
  });
  it("서쪽·북쪽으로 나가면 180·270", () => {
    expect(spawnRotation(mk([c(17, 2), c(10, 2)]))).toBe(180);
    expect(spawnRotation(mk([c(4, 9), c(4, 3)]))).toBe(270);
  });
  it("Stage 4 첫 칸 = 직선 세로(회전 90), Stage 5 기지 칸은 안쪽 직선(가로)이며 gate 표식", () => {
    const t4 = computePathTiles(compileStageMap(STAGE_MAPS[3]));
    expect(t4[0]).toMatchObject({ kind: "spawn", base: "straight", rotation: 90 });
    const t5 = computePathTiles(compileStageMap(STAGE_MAPS[4]));
    expect(t5[t5.length - 1]).toMatchObject({ kind: "gate", base: "straight", rotation: 0, col: 12, row: 4 });
  });
});
