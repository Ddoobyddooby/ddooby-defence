import { describe, expect, it } from "vitest";
import { cellAtAreaPoint, computeLayout, computeMapRect } from "./layout";

describe("computeLayout (UI-CONTRACT 3절)", () => {
  it("800×360: hudW = clamp(round(192),176,320)=192, 맵 영역 608×360, tile = floor(min(33.7, 36)) = 33, 레터박스 가운데", () => {
    const l = computeLayout(800, 360);
    expect(l).toMatchObject({ supported: true, problem: null, hudW: 192, areaW: 608, areaH: 360 });
    expect(l.map).toEqual({ tile: 33, x: 7, y: 15, width: 594, height: 330 });
  });
  it("1280×720: hudW 307, tile = floor(min(973/18=54.05, 72)) = 54", () => {
    const l = computeLayout(1280, 720);
    expect(l).toMatchObject({ supported: true, hudW: 307, areaW: 973 });
    expect(l.map).toMatchObject({ tile: 54, width: 972, height: 540, x: 0, y: 90 });
  });
  it("1920×1080: hudW 320(상한), tile = floor(min(1600/18=88.8, 108)) = 88", () => {
    const l = computeLayout(1920, 1080);
    expect(l.hudW).toBe(320);
    expect(l.map).toMatchObject({ tile: 88, width: 1584, height: 880, x: 8, y: 100 });
  });
  it("hudW 하한 176: 너비 700 → round(168) 대신 176, 640 이상이라 지원", () => {
    const l = computeLayout(700, 400);
    expect(l.hudW).toBe(176);
    expect(l).toMatchObject({ supported: true, problem: null });
  });
  it("최소 640×320(MOB-01): hudW 176, 맵 영역 464×320, tile = floor(min(25.78, 32)) = 25", () => {
    const l = computeLayout(640, 320);
    expect(l).toMatchObject({ supported: true, problem: null, hudW: 176, areaW: 464, areaH: 320 });
    expect(l.map).toEqual({ tile: 25, x: 7, y: 35, width: 450, height: 250 });
  });
  it("실기기 Galaxy A16 가로(카메라 구멍 제외 약 796×384): hudW 191, tile 33", () => {
    const l = computeLayout(796, 384);
    expect(l).toMatchObject({ supported: true, hudW: 191, areaW: 605 });
    expect(l.map).toMatchObject({ tile: 33, width: 594, height: 330 });
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
  const l = computeLayout(800, 360); // 맵 (7,15) tile 33, 594×330
  it("맵 왼쪽 위 모서리 → (0,0), 맵 안 중간", () => {
    expect(cellAtAreaPoint(l, 7, 15)).toEqual({ col: 0, row: 0 });
    expect(cellAtAreaPoint(l, 7 + 33 * 5 + 1, 15 + 33 * 3 + 1)).toEqual({ col: 5, row: 3 });
  });
  it("레터박스(맵 왼쪽 7px 이전·위 15px 이전·아래)와 맵 영역 밖은 null", () => {
    expect(cellAtAreaPoint(l, 3, 100)).toBeNull();
    expect(cellAtAreaPoint(l, 100, 10)).toBeNull();
    expect(cellAtAreaPoint(l, 100, 15 + 330 + 5)).toBeNull();
    expect(cellAtAreaPoint(l, 608, 100)).toBeNull(); // 맵 영역 오른쪽 끝(= HUD 시작)
    expect(cellAtAreaPoint(l, 700, 100)).toBeNull(); // HUD 영역 좌표
    expect(cellAtAreaPoint(l, -1, 100)).toBeNull();
    expect(cellAtAreaPoint(l, Number.NaN, 100)).toBeNull();
  });
  it("맵 끝선은 마지막 칸 (pointToCell 규칙)", () => {
    expect(cellAtAreaPoint(l, 7 + 594, 15 + 330)).toEqual({ col: 17, row: 9 });
  });
});
