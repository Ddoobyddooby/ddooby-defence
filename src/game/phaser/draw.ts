// 그리기 함수 모음 (UI-CONTRACT 8절). 종류별로 분리해 두어 실제 스프라이트로 교체할 때 이 파일의 함수만 바꾸면 된다.
// 모두 Graphics 의 최소 부분집합(GraphicsLike)만 쓴다. 게임 상태는 읽기만 한다.
import type { EnemyType, TowerType, TraitType } from "../core/content/types";
import { CELL_MT, type CompiledStageMap } from "../core/map/stageMap";
import { ENEMY_COLORS, ENEMY_RADIUS, TOWER_COLORS, TRAIT_COLORS, UI_COLORS, type StagePalette } from "./palette";

export interface GraphicsLike {
  clear(): unknown;
  fillStyle(color: number, alpha?: number): unknown;
  lineStyle(width: number, color: number, alpha?: number): unknown;
  fillRect(x: number, y: number, w: number, h: number): unknown;
  strokeRect(x: number, y: number, w: number, h: number): unknown;
  fillCircle(x: number, y: number, r: number): unknown;
  strokeCircle(x: number, y: number, r: number): unknown;
  fillTriangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number): unknown;
  lineBetween(x0: number, y0: number, x1: number, y1: number): unknown;
}

export interface MapGeometry {
  /** 맵 영역 안 레터박스 오프셋과 타일 크기(px). */
  readonly originX: number;
  readonly originY: number;
  readonly tile: number;
}

/** mt(밀리타일) → 화면 px. */
export const toPx = (geo: MapGeometry, mt: number): number => (mt / CELL_MT) * geo.tile;
export const screenX = (geo: MapGeometry, xMt: number): number => geo.originX + toPx(geo, xMt);
export const screenY = (geo: MapGeometry, yMt: number): number => geo.originY + toPx(geo, yMt);

/** 배경·경로·격자·출발 칸·기지(성문) 표식. 스테이지·크기가 바뀔 때만 다시 그린다. */
export function drawMap(g: GraphicsLike, areaW: number, areaH: number, geo: MapGeometry, map: CompiledStageMap, palette: StagePalette): void {
  g.clear();
  g.fillStyle(palette.letterbox, 1);
  g.fillRect(0, 0, areaW, areaH);
  const { tile, originX, originY } = geo;
  const onPath = new Set(map.pathCells.map((c) => c.row * 18 + c.col));
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 18; col++) {
      const isPath = onPath.has(row * 18 + col);
      g.fillStyle(isPath ? palette.path : (col + row) % 2 === 0 ? palette.ground : palette.groundAlt, 1);
      g.fillRect(originX + col * tile, originY + row * tile, tile, tile);
      if (isPath) {
        g.lineStyle(1, palette.pathEdge, 0.6);
        g.strokeRect(originX + col * tile + 0.5, originY + row * tile + 0.5, tile - 1, tile - 1);
      }
    }
  }
  g.lineStyle(1, palette.grid, palette.gridAlpha);
  for (let c = 0; c <= 18; c++) g.lineBetween(originX + c * tile, originY, originX + c * tile, originY + 10 * tile);
  for (let r = 0; r <= 10; r++) g.lineBetween(originX, originY + r * tile, originX + 18 * tile, originY + r * tile);
  const first = map.pathCells[0];
  const last = map.pathCells[map.pathCells.length - 1];
  // 출발 칸: 밝은 마름모
  const sx = originX + (first.col + 0.5) * tile;
  const sy = originY + (first.row + 0.5) * tile;
  g.fillStyle(palette.start, 0.9);
  g.fillTriangle(sx, sy - tile * 0.3, sx - tile * 0.3, sy, sx + tile * 0.3, sy);
  g.fillTriangle(sx, sy + tile * 0.3, sx - tile * 0.3, sy, sx + tile * 0.3, sy);
  // 기지(성문): 어두운 문 + 청록 깃발
  const gx = originX + last.col * tile;
  const gy = originY + last.row * tile;
  g.fillStyle(palette.gateDark, 1);
  g.fillRect(gx + tile * 0.1, gy + tile * 0.15, tile * 0.8, tile * 0.75);
  g.fillStyle(palette.gate, 1);
  g.fillRect(gx + tile * 0.62, gy + tile * 0.05, tile * 0.28, tile * 0.25);
}

/** 타워: 칸 안 정사각형 + 종류 색 + 레벨 점 1~4. */
export function drawTower(g: GraphicsLike, geo: MapGeometry, type: TowerType, level: number, col: number, row: number): void {
  const { tile } = geo;
  const x = geo.originX + col * tile;
  const y = geo.originY + row * tile;
  g.fillStyle(0x2b2b33, 1);
  g.fillRect(x + tile * 0.12, y + tile * 0.12, tile * 0.76, tile * 0.76);
  g.fillStyle(TOWER_COLORS[type], 1);
  g.fillRect(x + tile * 0.2, y + tile * 0.2, tile * 0.6, tile * 0.5);
  const dot = Math.max(1.5, tile * 0.05);
  for (let i = 0; i < level; i++) {
    g.fillStyle(0xffffff, 1);
    g.fillCircle(x + tile * (0.5 + (i - (level - 1) / 2) * 0.14), y + tile * 0.8, dot);
  }
}

/** 특성 표식(작은 모서리 기호 3종): 저항=사각형, 체력=삼각형, 속도=마름모. */
export function drawTraitMark(g: GraphicsLike, trait: TraitType, cx: number, cy: number, size: number): void {
  g.fillStyle(TRAIT_COLORS[trait], 1);
  if (trait === "controlResistance") g.fillRect(cx - size / 2, cy - size / 2, size, size);
  else if (trait === "hpBoost") g.fillTriangle(cx, cy - size / 2, cx - size / 2, cy + size / 2, cx + size / 2, cy + size / 2);
  else {
    g.fillTriangle(cx, cy - size / 2, cx - size / 2, cy, cx + size / 2, cy);
    g.fillTriangle(cx, cy + size / 2, cx - size / 2, cy, cx + size / 2, cy);
  }
}

export function drawHpBar(g: GraphicsLike, cx: number, top: number, width: number, ratio: number): void {
  const h = Math.max(2, width * 0.12);
  g.fillStyle(UI_COLORS.hpBack, 0.85);
  g.fillRect(cx - width / 2, top, width, h);
  g.fillStyle(ratio > 0.35 ? UI_COLORS.hpHigh : UI_COLORS.hpLow, 1);
  g.fillRect(cx - width / 2, top, width * Math.min(1, Math.max(0, ratio)), h);
}

/** 적: 유형 색 원(크기 차이) + HP 바 + 특성 표식 + 둔화 중이면 얼음 링. */
export function drawEnemy(g: GraphicsLike, geo: MapGeometry, enemyType: EnemyType, trait: TraitType | null, hp: number, maxHp: number, slowed: boolean, px: number, py: number): void {
  const r = ENEMY_RADIUS[enemyType] * geo.tile;
  g.fillStyle(0x000000, 0.25);
  g.fillCircle(px + 1, py + 2, r);
  g.fillStyle(ENEMY_COLORS[enemyType], 1);
  g.fillCircle(px, py, r);
  if (slowed) {
    g.lineStyle(Math.max(1.5, geo.tile * 0.05), UI_COLORS.slowRing, 0.95);
    g.strokeCircle(px, py, r + 2);
  }
  if (trait !== null) drawTraitMark(g, trait, px + r * 0.95, py - r * 0.95, Math.max(4, geo.tile * 0.2));
  drawHpBar(g, px, py - r - Math.max(4, geo.tile * 0.16), Math.max(10, r * 2.2), hp / maxHp);
}

/** 투사체: 작은 점(마법은 조금 더 크고 보라). */
export function drawProjectile(g: GraphicsLike, geo: MapGeometry, towerType: TowerType | null, aoe: boolean, px: number, py: number): void {
  g.fillStyle(towerType === null ? 0xffffff : TOWER_COLORS[towerType], 1);
  g.fillCircle(px, py, geo.tile * (aoe ? 0.12 : 0.08));
}

export function drawRange(g: GraphicsLike, cx: number, cy: number, radiusPx: number): void {
  g.fillStyle(UI_COLORS.rangeFill, 0.08);
  g.fillCircle(cx, cy, radiusPx);
  g.lineStyle(1.5, UI_COLORS.rangeStroke, 0.55);
  g.strokeCircle(cx, cy, radiusPx);
}

export function drawCellHighlight(g: GraphicsLike, geo: MapGeometry, col: number, row: number, color: number, alpha: number): void {
  g.fillStyle(color, alpha);
  g.fillRect(geo.originX + col * geo.tile, geo.originY + row * geo.tile, geo.tile, geo.tile);
  g.lineStyle(2, color, 0.95);
  g.strokeRect(geo.originX + col * geo.tile + 1, geo.originY + row * geo.tile + 1, geo.tile - 2, geo.tile - 2);
}

/** 확장하며 사라지는 링(VFX). t ∈ [0,1]. */
export function drawRing(g: GraphicsLike, cx: number, cy: number, maxRadiusPx: number, t: number, color: number): void {
  g.lineStyle(Math.max(1.5, 4 * (1 - t)), color, 1 - t);
  g.strokeCircle(cx, cy, maxRadiusPx * (0.25 + 0.75 * t));
}

export function drawDot(g: GraphicsLike, cx: number, cy: number, radiusPx: number, t: number, color: number): void {
  g.fillStyle(color, 1 - t);
  g.fillCircle(cx, cy, radiusPx * (1 - 0.5 * t));
}
