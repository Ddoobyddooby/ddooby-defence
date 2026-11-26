// ART-03 / UI-01 리뷰 F7 — 기기 배율(DPR) 대응. 캔버스 내부 해상도 = CSS 크기 × 배율(상한 3), CSS 크기는 그대로.
// 장면은 계속 CSS px 좌표로 계산하고(카메라 zoom = 배율), 입력 좌표는 캔버스의 CSS 사각형 기준이라 배율과 무관하다.
export const MAX_RENDER_SCALE = 3;

/** devicePixelRatio → 렌더 배율(1~3, 비정상 값은 1). */
export function renderScale(dpr: number): number {
  if (!Number.isFinite(dpr) || dpr < 1) return 1;
  return Math.min(MAX_RENDER_SCALE, dpr);
}

/** CSS 크기 → 캔버스 내부 해상도(정수 px, 최소 1). */
export function backingSize(cssW: number, cssH: number, scale: number): { width: number; height: number } {
  return { width: Math.max(1, Math.round(cssW * scale)), height: Math.max(1, Math.round(cssH * scale)) };
}

/** 포인터(clientX/Y) → 맵 영역 좌표(CSS px, 캔버스 좌상단 기준). 캔버스의 CSS 사각형(rect)과 장면 CSS 크기(areaW/H)만 쓴다. */
export function clientToArea(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }, areaW: number, areaH: number): [number, number] {
  const sx = rect.width > 0 ? areaW / rect.width : 1;
  const sy = rect.height > 0 ? areaH / rect.height : 1;
  return [(clientX - rect.left) * sx, (clientY - rect.top) * sy];
}
