// 화면 배치 계산 (UI-CONTRACT 3절). 순수 정수 계산이며 DOM·Phaser 를 모른다.
import { GRID_COLS, GRID_ROWS, type Cell } from "../core/grid";
import { pointToCell } from "../core/map/pointToCell";

// MOB-01(2026-11-25): 실제 휴대폰 가로 화면(카메라 구멍 제외 약 796×384, iPhone SE 667×375)을 받도록 800×360 → 640×320.
export const MIN_VIEWPORT_W = 640;
export const MIN_VIEWPORT_H = 320;
export const MIN_TILE = 18;

export interface MapRect {
  /** 맵 영역(HUD 를 뺀 왼쪽 영역) 안에서 맵이 시작하는 좌표(레터박스 오프셋). */
  readonly tile: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type ViewportProblem = "portrait" | "tooSmall";

export interface Layout {
  readonly supported: boolean;
  readonly problem: ViewportProblem | null;
  readonly viewportW: number;
  readonly viewportH: number;
  readonly hudW: number;
  /** 맵 영역(왼쪽, Phaser 캔버스) 크기. */
  readonly areaW: number;
  readonly areaH: number;
  readonly map: MapRect;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);

/** 맵 영역 크기 → 타일·레터박스. tile = floor(min(areaW/18, areaH/10)), 최소 18. */
export function computeMapRect(areaW: number, areaH: number): MapRect {
  const tile = Math.max(MIN_TILE, Math.floor(Math.min(areaW / GRID_COLS, areaH / GRID_ROWS)));
  const width = GRID_COLS * tile;
  const height = GRID_ROWS * tile;
  return { tile, x: Math.floor((areaW - width) / 2), y: Math.floor((areaH - height) / 2), width, height };
}

/** 뷰포트 → 배치. 세로(높이 > 너비)·640×320 미만은 supported=false (게임 대신 안내). */
export function computeLayout(viewportW: number, viewportH: number): Layout {
  const w = Math.max(0, Math.floor(viewportW));
  const h = Math.max(0, Math.floor(viewportH));
  // MOB-02(2026-11-26): HUD 를 줄여 18×10 격자는 유지하고 칸을 키운다(이전 × 0.24, 176~320).
  const hudW = clamp(Math.round(w * 0.17), 136, 240);
  const areaW = Math.max(0, w - hudW);
  const problem: ViewportProblem | null = h > w ? "portrait" : w < MIN_VIEWPORT_W || h < MIN_VIEWPORT_H ? "tooSmall" : null;
  return { supported: problem === null, problem, viewportW: w, viewportH: h, hudW, areaW, areaH: h, map: computeMapRect(areaW, h) };
}

/**
 * 맵 영역 좌표(Phaser 포인터, 캔버스 좌상단 기준) → 칸. 레터박스·맵 밖은 null.
 * HUD 는 DOM 이라 이 함수에 도달하지 않지만, 영역 밖 좌표(areaW 이상)도 null 로 막는다.
 */
export function cellAtAreaPoint(layout: Pick<Layout, "areaW" | "areaH" | "map">, x: number, y: number): Cell | null {
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= layout.areaW || y >= layout.areaH) return null;
  const m = layout.map;
  if (x < m.x || y < m.y || x > m.x + m.width || y > m.y + m.height) return null;
  return pointToCell(x - m.x, y - m.y, m.tile);
}
