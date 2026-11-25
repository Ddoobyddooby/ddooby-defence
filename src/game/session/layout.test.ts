import { describe, expect, it } from "vitest";
import { cellAtAreaPoint, computeLayout, computeMapRect } from "./layout";

describe("computeLayout (UI-CONTRACT 3절, MOB-02: hudW = clamp(round(W×0.17), 136, 240))", () => {
  // 기대값은 계약 3절 예시와 손계산 숫자 리터럴이다(구현 함수를 다시 쓰지 않는다).
  it("640×320(최소): hudW 136, 맵 영역 504×320, tile 28, 맵 504×280 (위아래 레터박스 20)", () => {
    const l = computeLayout(640, 320);
    expect(l).toMatchObject({ supported: true, problem: null, hudW: 136, areaW: 504, areaH: 320 });
    expect(l.map).toEqual({ tile: 28, x: 0, y: 20, width: 504, height: 280 });
  });
  it("796×384(Galaxy A16 가로): hudW 136(round 135.32→135 → 하한 136), 맵 영역 660×384, tile 36, 맵 648×360", () => {
    const l = computeLayout(796, 384);
    expect(l).toMatchObject({ supported: true, hudW: 136, areaW: 660, areaH: 384 });
    expect(l.map).toEqual({ tile: 36, x: 6, y: 12, width: 648, height: 360 });
  });
  it("800×360: hudW 136, tile 36 (높이가 한계), 맵 648×360", () => {
    const l = computeLayout(800, 360);
    expect(l).toMatchObject({ supported: true, hudW: 136, areaW: 664 });
    expect(l.map).toEqual({ tile: 36, x: 8, y: 0, width: 648, height: 360 });
  });
  it("1280×720: hudW 218(round 217.6), 맵 영역 1062×720, tile 59, 맵 1062×590", () => {
    const l = computeLayout(1280, 720);
    expect(l).toMatchObject({ supported: true, hudW: 218, areaW: 1062 });
    expect(l.map).toEqual({ tile: 59, x: 0, y: 65, width: 1062, height: 590 });
  });
  it("1920×1080: hudW 240(상한, 계산값 326), 맵 영역 1680×1080, tile 93, 맵 1674×930", () => {
    const l = computeLayout(1920, 1080);
    expect(l.hudW).toBe(240);
    expect(l.map).toEqual({ tile: 93, x: 3, y: 75, width: 1674, height: 930 });
  });
  it("hudW 하한 136: 너비 700 → round(119) 대신 136, 반올림 경계 1000 → 170(범위 안)", () => {
    expect(computeLayout(700, 400).hudW).toBe(136);
    expect(computeLayout(1000, 500).hudW).toBe(170);
    expect(computeLayout(1411, 800).hudW).toBe(240); // 239.87 → 240
    expect(computeLayout(1500, 800).hudW).toBe(240); // 255 → 상한
  });
  it("세로 방향(높이 > 너비) → portrait, 640×319·639×320 → tooSmall, 정확히 640×320 → 지원", () => {
    expect(computeLayout(400, 800)).toMatchObject({ supported: false, problem: "portrait" });
    expect(computeLayout(640, 319)).toMatchObject({ supported: false, problem: "tooSmall" });
    expect(computeLayout(639, 320)).toMatchObject({ supported: false, problem: "tooSmall" });
    expect(computeLayout(640, 320).supported).toBe(true);
  });
  it("tile 은 항상 정수이고 최소 18", () => {
    expect(computeMapRect(100, 100).tile).toBe(18);
    expect(Number.isInteger(computeLayout(1001, 777).map.tile)).toBe(true);
  });
});

describe("cellAtAreaPoint: 좌표 → 칸 (레터박스·영역 밖 → null)", () => {
  const l = computeLayout(800, 360); // 맵 (8,0) tile 36, 648×360, 맵 영역 664×360
  it("맵 왼쪽 위 모서리 → (0,0), 맵 안 중간", () => {
    expect(cellAtAreaPoint(l, 8, 0)).toEqual({ col: 0, row: 0 });
    expect(cellAtAreaPoint(l, 8 + 36 * 5 + 1, 36 * 3 + 1)).toEqual({ col: 5, row: 3 });
  });
  it("레터박스(맵 왼쪽 8px 이전·맵 오른쪽 8px)와 맵 영역 밖은 null", () => {
    expect(cellAtAreaPoint(l, 3, 100)).toBeNull();
    expect(cellAtAreaPoint(l, 8 + 648 + 4, 100)).toBeNull();
    expect(cellAtAreaPoint(computeLayout(796, 384), 100, 5)).toBeNull(); // 위 12px 레터박스
    expect(cellAtAreaPoint(computeLayout(796, 384), 100, 12 + 360 + 5)).toBeNull();
    expect(cellAtAreaPoint(l, 664, 100)).toBeNull(); // 맵 영역 오른쪽 끝(= HUD 시작)
    expect(cellAtAreaPoint(l, 700, 100)).toBeNull(); // HUD 영역 좌표
    expect(cellAtAreaPoint(l, -1, 100)).toBeNull();
    expect(cellAtAreaPoint(l, Number.NaN, 100)).toBeNull();
  });
  it("맵 끝선은 마지막 칸 (pointToCell 규칙)", () => {
    expect(cellAtAreaPoint(computeLayout(796, 384), 6 + 648, 12 + 360)).toEqual({ col: 17, row: 9 });
  });
});
