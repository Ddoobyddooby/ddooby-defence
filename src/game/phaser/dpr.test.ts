// ART-03 — DPR: 렌더 배율·내부 해상도, 입력 좌표 변환이 배율과 무관한지.
import { describe, expect, it } from "vitest";
import { cellAtAreaPoint, computeLayout } from "../session/layout";
import { backingSize, clientToArea, renderScale } from "./dpr";

describe("renderScale", () => {
  it("1~3 으로 제한, 비정상 값은 1", () => {
    expect(renderScale(1)).toBe(1);
    expect(renderScale(2.625)).toBe(2.625);
    expect(renderScale(4)).toBe(3);
    expect(renderScale(0.5)).toBe(1);
    expect(renderScale(NaN)).toBe(1);
    expect(renderScale(Infinity)).toBe(1);
  });
  it("내부 해상도 = CSS × 배율(반올림, 최소 1)", () => {
    expect(backingSize(696, 384, 2)).toEqual({ width: 1392, height: 768 });
    expect(backingSize(696, 384, 2.625)).toEqual({ width: 1827, height: 1008 });
    expect(backingSize(0, 0, 3)).toEqual({ width: 1, height: 1 });
  });
});

describe("clientToArea / 입력 좌표", () => {
  const layout = computeLayout(796, 384);
  const area = { areaW: layout.areaW, areaH: layout.areaH, map: layout.map };
  const rect = { left: 12, top: 5, width: layout.areaW, height: layout.areaH };
  it("배율이 달라도 같은 화면 위치는 같은 칸(CSS 사각형 기준)", () => {
    const cx = rect.left + layout.map.x + layout.map.tile * 3.5;
    const cy = rect.top + layout.map.y + layout.map.tile * 2.5;
    const [x, y] = clientToArea(cx, cy, rect, layout.areaW, layout.areaH);
    expect(cellAtAreaPoint(area, x, y)).toEqual({ col: 3, row: 2 });
    // 같은 CSS 사각형이면 내부 해상도(DPR)는 변환식에 들어가지 않는다
    for (const scale of [1, 2, 3]) {
      backingSize(layout.areaW, layout.areaH, scale);
      expect(clientToArea(cx, cy, rect, layout.areaW, layout.areaH)).toEqual([x, y]);
    }
  });
  it("CSS 사각형이 장면 크기와 다르면(CSS 확대) 비율을 보정한다", () => {
    const [x, y] = clientToArea(100, 50, { left: 0, top: 0, width: 200, height: 100 }, 400, 200);
    expect([x, y]).toEqual([200, 100]);
  });
  it("폭 0 사각형은 보정 없이 통과(0 나눗셈 없음)", () => {
    expect(clientToArea(5, 6, { left: 1, top: 2, width: 0, height: 0 }, 400, 200)).toEqual([4, 4]);
  });
});
