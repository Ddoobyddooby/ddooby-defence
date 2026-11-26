// 전투 씬 (UI-CONTRACT 8절). 게임 상태를 보관·수정하지 않는다: 세션의 렌더 프레임을 읽어 그리고, 포인터를 칸으로 바꿔 세션에 전달할 뿐이다.
// Phaser 모듈은 브라우저에서 동적 import 되므로 씬 클래스를 팩토리 안에서 만든다. 시각 전용 보간·VFX 는 게임 결과에 영향이 없다.
import type * as PhaserNS from "phaser";
import { isBuildable, compileStageMap, type CompiledStageMap } from "../core/map/stageMap";
import { towerLevelStats } from "../core/content/levelStats";
import type { TowerType } from "../core/content/types";
import { progressToPosition } from "../core/map/stageMap";
import { cellAtAreaPoint, computeMapRect, type Layout } from "../session/layout";
import { frameDelta } from "../session/frameTime";
import type { GameSession, RenderFrame } from "../session/session";
import type { Snapshot } from "../session/types";
import {
  drawCellHighlight, drawDot, drawEnemy, drawGrid, drawHpBar, drawMap, drawProjectile, drawRange, drawRing, drawTower, drawTraitMark, screenX, screenY, toPx,
  type GraphicsLike, type MapArt, type MapGeometry,
} from "./draw";
import { paletteOf, UI_COLORS } from "./palette";
import { ASSET_NAMES, assetUrl, enemyKey, gateKey, groundKey, pathKey, PROJECTILE_SPRITE, spawnKey, towerKey, TRAIT_SPRITE } from "./assets";
import { backingSize, clientToArea, renderScale } from "./dpr";
import { computePathTiles, groundVariant } from "./pathTiles";
import { ImagePool } from "./sprites";

type Cell = { col: number; row: number };

interface Vfx {
  readonly kind: "ring" | "dot";
  readonly xMt: number;
  readonly yMt: number;
  /** 링: 반경(mt). 점: 반지름(타일 비율 × 1000). */
  readonly sizeMt: number;
  readonly color: number;
  readonly durMs: number;
  /** 그림(텍스처 키)이 있으면 그것으로, 없으면 아래 도형. fallback=false 면 그림이 없을 때 그리지 않는다. */
  readonly sprite?: string;
  readonly fallback?: boolean;
  age: number;
}

const STAGE_TILE_NAMES = (stage: number): string[] => ASSET_NAMES.filter((n) => n.startsWith(`s${stage + 1}-`));
const COMMON_NAMES: string[] = ASSET_NAMES.filter((n) => !/^s\d-/.test(n));

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function createBattleScene(Phaser: typeof PhaserNS, session: GameSession): PhaserNS.Scene {
  class BattleScene extends Phaser.Scene {
    private mapG!: PhaserNS.GameObjects.Graphics;
    private gridG!: PhaserNS.GameObjects.Graphics;
    private underG!: PhaserNS.GameObjects.Graphics;
    private enemyG!: PhaserNS.GameObjects.Graphics;
    private projG!: PhaserNS.GameObjects.Graphics;
    private fxG!: PhaserNS.GameObjects.Graphics;
    private barG!: PhaserNS.GameObjects.Graphics;
    private towerPool!: ImagePool;
    private enemyPool!: ImagePool;
    private belowPool!: ImagePool;
    private barIconPool!: ImagePool;
    private projPool!: ImagePool;
    private fxPool!: ImagePool;
    private mapImages: PhaserNS.GameObjects.Image[] = [];
    /** 화면(CSS px) 크기와 렌더 배율. 장면의 모든 좌표는 CSS px, 카메라 zoom 이 배율을 맡는다. */
    private areaW = 0;
    private areaH = 0;
    private dpr = 1;
    private geo: MapGeometry = { originX: 0, originY: 0, tile: 18 };
    private map: CompiledStageMap | null = null;
    private builtKey = "";
    private hover: Cell | null = null;
    private vfx: Vfx[] = [];
    private lastEnemyPos = new Map<number, { x: number; y: number }>();
    private lastProjectilePos = new Map<number, { x: number; y: number }>();
    private projectileRotation = new Map<number, number>();
    private enemyFlip = new Map<number, boolean>();
    private recoil = new Map<number, { age: number; dx: number; dy: number }>();
    private seenProjectiles = new Set<number>();
    private projectileRadius = new Map<number, number>();
    private towerTypeById = new Map<number, TowerType>();
    private lastTime: number | null = null;
    /** 걷는 흔들림용 시계. 일시정지에서는 dt=0 이라 멈춘다. */
    private animMs = 0;
    /** 이미 로드를 시도한 파일(성공·실패 모두). 같은 파일을 다시 요청하지 않는다. */
    private attempted = new Set<string>();

    constructor() {
      super("battle");
    }

    preload(): void {
      this.load.maxRetries = 0; // 없는 파일을 다시 요청하지 않는다
      this.queue(COMMON_NAMES);
    }

    private has(key: string): boolean {
      return this.textures.exists(key);
    }

    /** 아직 시도하지 않은 그림만 로드 대기열에 넣는다. 실패하면 그 키는 없는 채로 남고 호출자가 도형으로 대체한다. */
    private queue(names: readonly string[]): boolean {
      let added = false;
      for (const n of names) {
        if (this.attempted.has(n)) continue;
        this.attempted.add(n);
        this.load.image(n, assetUrl(n));
        added = true;
      }
      return added;
    }

    create(): void {
      this.mapG = this.add.graphics().setDepth(0);
      this.gridG = this.add.graphics().setDepth(4);
      this.underG = this.add.graphics().setDepth(10);
      this.enemyG = this.add.graphics().setDepth(30);
      this.projG = this.add.graphics().setDepth(40);
      this.fxG = this.add.graphics().setDepth(50);
      this.barG = this.add.graphics().setDepth(60);
      this.towerPool = new ImagePool(this, 20);
      this.belowPool = new ImagePool(this, 29);
      this.enemyPool = new ImagePool(this, 31);
      this.projPool = new ImagePool(this, 41);
      this.fxPool = new ImagePool(this, 51);
      this.barIconPool = new ImagePool(this, 61);
      this.syncSize();
      this.scale.on("resize", () => this.relayout());
      // 입력: 이벤트 순간의 캔버스 CSS 사각형으로 맵 영역 좌표를 직접 구한다(Phaser 의 canvasBounds 는 낡을 수 있음, UI-01 실측).
      // 사각형은 CSS px 이고 장면 크기도 CSS px 라 렌더 배율(DPR)과 무관하다.
      this.input.on("pointerdown", (p: PhaserNS.Input.Pointer) => {
        if (p.button !== 0) return; // 주 버튼·터치(항상 0)만 맵 입력. 우클릭·휠 클릭이 설치·선택 명령이 되지 않게 한다(리뷰 F3)
        session.tapCell(cellAtAreaPoint(this.layoutLike(), ...this.areaPoint(p)));
      });
      this.input.on("pointermove", (p: PhaserNS.Input.Pointer) => {
        this.hover = p.wasTouch ? null : cellAtAreaPoint(this.layoutLike(), ...this.areaPoint(p));
      });
      this.input.on("pointerout", () => (this.hover = null));
    }

    /** 포인터 → 맵 영역(캔버스 좌상단 기준, CSS px) 좌표. 이벤트 시점의 캔버스 위치를 직접 읽는다. */
    private areaPoint(p: PhaserNS.Input.Pointer): [number, number] {
      const ev = p.event as MouseEvent | TouchEvent | undefined;
      const canvas = this.game.canvas as HTMLCanvasElement;
      const r = canvas.getBoundingClientRect();
      let cx = p.x / this.dpr + r.left;
      let cy = p.y / this.dpr + r.top;
      if (ev !== undefined) {
        const touch = "changedTouches" in ev && ev.changedTouches.length > 0 ? ev.changedTouches[0] : null;
        if (touch !== null) {
          cx = touch.clientX;
          cy = touch.clientY;
        } else if ("clientX" in ev) {
          cx = ev.clientX;
          cy = ev.clientY;
        }
      }
      return clientToArea(cx, cy, r, this.areaW, this.areaH);
    }

    /**
     * 호스트 요소(부모)의 CSS 크기·기기 배율이 바뀌면 캔버스 내부 해상도(CSS × 배율)와 카메라 zoom, CSS 표시 크기를 맞춘다.
     * React 레이아웃(HUD 폭)이 resize 이벤트보다 늦게 확정되는 경우가 있어(UI-01 실측) 매 프레임 호스트를 읽는다. 같으면 아무것도 하지 않는다.
     */
    private syncSize(): void {
      const canvas = this.game.canvas as HTMLCanvasElement;
      const host = canvas.parentElement;
      if (host === null) return;
      const w = Math.max(1, host.clientWidth);
      const h = Math.max(1, host.clientHeight);
      const dpr = renderScale(typeof window === "undefined" ? 1 : window.devicePixelRatio);
      if (w !== this.areaW || h !== this.areaH || dpr !== this.dpr) {
        this.areaW = w;
        this.areaH = h;
        this.dpr = dpr;
        const b = backingSize(w, h, dpr);
        this.scale.resize(b.width, b.height);
        this.cameras.main.setZoom(dpr).centerOn(w / 2, h / 2);
        this.relayout();
      }
      const cw = `${this.areaW}px`;
      const ch = `${this.areaH}px`;
      if (canvas.style.width !== cw) canvas.style.width = cw;
      if (canvas.style.height !== ch) canvas.style.height = ch;
    }

    /** 리사이즈·회전: 다시 배치만 한다(상태·인스턴스는 그대로). */
    private relayout(): void {
      const m = computeMapRect(this.areaW, this.areaH);
      this.geo = { originX: m.x, originY: m.y, tile: m.tile };
      this.builtKey = ""; // 정적 맵 레이어 다시 그리기
    }

    private layoutLike(): Pick<Layout, "areaW" | "areaH" | "map"> {
      const g = this.geo;
      return { areaW: this.areaW, areaH: this.areaH, map: { tile: g.tile, x: g.originX, y: g.originY, width: 18 * g.tile, height: 10 * g.tile } };
    }

    update(time: number): void {
      // Phaser 의 delta 는 평활화·상한이 걸려 실제 경과 시간과 다르다(실측: 게임이 실시간의 약 25% 속도로 진행). 세션은 "실제 경과 ms"를
      // 받아야 하므로 rAF 타임스탬프(time)로 직접 계산한다. 비정상 값은 세션이 걸러내고, 폭주는 세션의 5틱 상한이 막는다.
      this.syncSize();
      const delta = frameDelta(time, this.lastTime); // 첫 프레임·역행은 0, 탭 복귀 뒤 큰 값은 250ms 상한(세션은 복귀 첫 입력도 버린다)
      this.lastTime = time;
      session.advance(delta);
      const frame = session.getRenderFrame();
      this.underG.clear();
      this.enemyG.clear();
      this.projG.clear();
      this.fxG.clear();
      this.barG.clear();
      for (const pool of [this.towerPool, this.enemyPool, this.belowPool, this.barIconPool, this.projPool, this.fxPool]) pool.begin();
      if (frame === null) {
        this.mapG.clear();
        this.gridG.clear();
        this.clearMapImages();
        this.builtKey = "";
        this.endPools();
        return;
      }
      this.ensureMap(frame);
      this.collectVfx(frame);
      // 일시정지·숨김에서는 VFX 도 멈춘다. 결과 단계(게임 상태는 정지)에서는 남은 VFX 가 끝까지 재생돼 링이 화면에 얼어붙지 않는다.
      const result = frame.curr.phase === "victory" || frame.curr.phase === "defeat";
      const dt = frame.running || (result && !frame.curr.paused) ? delta : 0;
      this.animMs += dt;
      this.drawFrame(frame, dt);
      this.endPools();
    }

    private endPools(): void {
      for (const pool of [this.towerPool, this.enemyPool, this.belowPool, this.barIconPool, this.projPool, this.fxPool]) pool.end();
    }

    private clearMapImages(): void {
      for (const im of this.mapImages) im.destroy();
      this.mapImages = [];
    }

    private mapArt(stage: number): MapArt {
      return {
        hasGround: (v) => this.has(groundKey(stage, v)),
        hasPath: (b) => this.has(pathKey(stage, b)),
        hasSpawn: () => this.has(spawnKey(stage)),
        hasGate: () => this.has(gateKey(stage)),
      };
    }

    private ensureMap(frame: RenderFrame): void {
      const key = `${frame.stageIndex}:${frame.attemptId}:${this.areaW}x${this.areaH}:${this.dpr}`;
      if (key === this.builtKey && this.map !== null) return;
      this.builtKey = key;
      if (this.map === null || this.map.stageId !== frame.content.stage.map.stageId) this.map = compileStageMap(frame.content.stage.map);
      const stage = frame.stageIndex;
      // 이 스테이지 타일 그림은 처음 필요할 때 한 번만 로드한다. 끝나면 맵 레이어를 다시 만든다(실패한 파일은 도형 대체 유지).
      if (this.queue(STAGE_TILE_NAMES(stage))) {
        this.load.once("complete", () => (this.builtKey = ""));
        this.load.start();
      }
      const palette = paletteOf(stage);
      drawMap(this.mapG as unknown as GraphicsLike, this.areaW, this.areaH, this.geo, this.map, palette, this.mapArt(stage));
      drawGrid(this.gridG as unknown as GraphicsLike, this.geo, palette);
      this.buildMapImages(stage, this.map);
      if (this.lastEnemyPos.size > 0 && frame.curr.tick === 0) {
        this.lastEnemyPos.clear();
        this.lastProjectilePos.clear();
        this.projectileRotation.clear();
        this.enemyFlip.clear();
        this.recoil.clear();
        this.seenProjectiles.clear();
        this.vfx = [];
      }
    }

    /** 바닥·길·생성·성문 그림(있는 것만). 길 칸의 종류·회전은 computePathTiles, 바닥 변형은 칸 좌표로 정한다. */
    private buildMapImages(stage: number, map: CompiledStageMap): void {
      this.clearMapImages();
      const { tile, originX, originY } = this.geo;
      const tiles = computePathTiles(map);
      const onPath = new Set(tiles.map((t) => t.row * 18 + t.col));
      const add = (key: string, x: number, y: number, size: number, depth: number, ox = 0.5, oy = 0.5, rotDeg = 0): void => {
        const im = this.add.image(x, y, key).setOrigin(ox, oy).setDepth(depth).setRotation((rotDeg * Math.PI) / 180);
        im.setScale(size / (im.width > 0 ? im.width : 128));
        this.mapImages.push(im);
      };
      for (let row = 0; row < 10; row++)
        for (let col = 0; col < 18; col++) {
          if (onPath.has(row * 18 + col)) continue;
          const k = groundKey(stage, groundVariant(col, row));
          if (this.has(k)) add(k, originX + col * tile + tile / 2, originY + row * tile + tile / 2, tile, 1);
        }
      for (const t of tiles) {
        const cx = originX + t.col * tile + tile / 2;
        const cy = originY + t.row * tile + tile / 2;
        const pk = pathKey(stage, t.base);
        if (this.has(pk)) add(pk, cx, cy, tile, 2, 0.5, 0.5, t.rotation);
        if (t.kind === "spawn" && this.has(spawnKey(stage))) add(spawnKey(stage), cx, cy, tile, 3);
        // 성문은 칸보다 위로 커도 된다(규격 3.1): 가로·세로 1.5칸, 아래쪽 기준점 = 칸 아래.
        if (t.kind === "gate" && this.has(gateKey(stage))) add(gateKey(stage), cx, originY + (t.row + 1) * tile, tile * 1.5, 3, 0.5, 1);
      }
    }

    private enemyMt(frame: RenderFrame, id: number, curr: Snapshot["enemies"][number]): { x: number; y: number } {
      const map = this.map as CompiledStageMap;
      const now = progressToPosition(map, curr.pathProgress);
      const before = frame.prev?.enemies.find((e) => e.id === id);
      if (before === undefined) return now;
      const was = progressToPosition(map, before.pathProgress);
      return { x: lerp(was.x, now.x, frame.alpha), y: lerp(was.y, now.y, frame.alpha) };
    }

    /** 이벤트 → 짧은 VFX. 위치는 직전에 그린 마지막 위치 기록을 쓴다(시각 전용). */
    private collectVfx(frame: RenderFrame): void {
      for (const p of frame.curr.projectiles) if (p.aoeRadiusMt !== null) this.projectileRadius.set(p.projectileId, p.aoeRadiusMt);
      for (const t of frame.curr.towers) this.towerTypeById.set(t.towerId, t.type);
      for (const e of session.drainEvents()) {
        const x = e.x as number;
        const y = e.y as number;
        if (e.type === "projectileExploded") {
          const r = this.projectileRadius.get(e.projectileId as number) ?? 1200;
          this.vfx.push({ kind: "ring", xMt: x, yMt: y, sizeMt: r, color: UI_COLORS.explosion, durMs: 350, age: 0, sprite: "fx-blast" });
        } else if (e.type === "slowApplied") {
          const pos = this.lastEnemyPos.get(e.enemyId as number);
          if (pos) this.vfx.push({ kind: "ring", xMt: pos.x, yMt: pos.y, sizeMt: 500, color: UI_COLORS.frostHit, durMs: 300, age: 0, sprite: "fx-frost" });
        } else if (e.type === "enemyDamaged") {
          // 궁수·발리스타 명중 불꽃(그림이 있을 때만; 마법은 폭발, 서리는 서리 효과가 따로 있다)
          const tt = this.towerTypeById.get(e.towerId as number);
          const pos = this.lastEnemyPos.get(e.enemyId as number);
          if (pos && (tt === "archer" || tt === "ballista")) this.vfx.push({ kind: "dot", xMt: pos.x, yMt: pos.y, sizeMt: 700, color: 0xffffff, durMs: 180, age: 0, sprite: "fx-hit", fallback: false });
        } else if (e.type === "enemyKilled") {
          const pos = this.lastEnemyPos.get(e.enemyId as number);
          if (pos) this.vfx.push({ kind: "dot", xMt: pos.x, yMt: pos.y, sizeMt: 350, color: 0xffffff, durMs: 250, age: 0 });
        } else if (e.type === "enemyReachedBase") {
          const pos = this.lastEnemyPos.get(e.enemyId as number);
          if (pos) this.vfx.push({ kind: "ring", xMt: pos.x, yMt: pos.y, sizeMt: 900, color: UI_COLORS.flash, durMs: 400, age: 0 });
        } else if (e.type === "projectileCancelled" || e.type === "projectileExpired") {
          const pos = this.lastProjectilePos.get(e.projectileId as number);
          if (pos) this.vfx.push({ kind: "dot", xMt: pos.x, yMt: pos.y, sizeMt: 120, color: 0xcccccc, durMs: 200, age: 0 });
        }
      }
      if (this.vfx.length > 200) this.vfx.splice(0, this.vfx.length - 200);
    }

    private drawFrame(frame: RenderFrame, dt: number): void {
      const under = this.underG as unknown as GraphicsLike;
      const eg = this.enemyG as unknown as GraphicsLike;
      const pg = this.projG as unknown as GraphicsLike;
      const fg = this.fxG as unknown as GraphicsLike;
      const bg = this.barG as unknown as GraphicsLike;
      const geo = this.geo;
      const tile = geo.tile;
      const map = this.map as CompiledStageMap;
      const snap = frame.curr;
      const content = frame.content;

      // 선택·설치 미리보기
      for (const t of snap.towers) if (t.towerId === frame.ui.selectedTowerId) {
        const def = content.global.towers.find((d) => d.type === t.type)!;
        drawRange(under, geo.originX + (t.cell.col + 0.5) * tile, geo.originY + (t.cell.row + 0.5) * tile, toPx(geo, towerLevelStats(def, t.level).rangeMt));
        drawCellHighlight(under, geo, t.cell.col, t.cell.row, UI_COLORS.select, 0.18);
      }
      if (frame.ui.placeType !== null && this.hover !== null) {
        const occupied = new Set(snap.towers.map((t) => t.cell.row * 18 + t.cell.col));
        const ok = isBuildable(map, this.hover, occupied) && !occupied.has(this.hover.row * 18 + this.hover.col);
        const def = content.global.towers.find((d) => d.type === frame.ui.placeType)!;
        drawCellHighlight(under, geo, this.hover.col, this.hover.row, ok ? UI_COLORS.placeOk : UI_COLORS.placeBad, 0.3);
        drawRange(under, geo.originX + (this.hover.col + 0.5) * tile, geo.originY + (this.hover.row + 0.5) * tile, toPx(geo, towerLevelStats(def, 1).rangeMt));
      }

      // 발사 반동: 새 투사체가 보이면 그 타워가 발사 방향 반대로 잠깐 밀린다(시각 전용).
      const alive = new Set<number>();
      for (const pr of snap.projectiles) {
        alive.add(pr.projectileId);
        if (this.seenProjectiles.has(pr.projectileId)) continue;
        this.seenProjectiles.add(pr.projectileId);
        const tw = snap.towers.find((t) => t.towerId === pr.towerId);
        if (tw === undefined) continue;
        const dx = pr.pos.x - (tw.cell.col + 0.5) * 1000;
        const dy = pr.pos.y - (tw.cell.row + 0.5) * 1000;
        const len = Math.hypot(dx, dy) || 1;
        this.recoil.set(tw.towerId, { age: 0, dx: dx / len, dy: dy / len });
      }
      for (const id of this.seenProjectiles) if (!alive.has(id)) this.seenProjectiles.delete(id);

      // 타워(아래 칸일수록 앞에 그린다)
      const towers = [...snap.towers].sort((a, b) => a.cell.row - b.cell.row);
      for (const t of towers) {
        const rc = this.recoil.get(t.towerId);
        let k = 0;
        if (rc !== undefined) {
          rc.age += dt;
          k = Math.max(0, 1 - rc.age / 150);
          if (k === 0) this.recoil.delete(t.towerId);
        }
        const cx = geo.originX + (t.cell.col + 0.5) * tile;
        const bottom = geo.originY + (t.cell.row + 1) * tile - tile * 0.1;
        const drawn = this.towerPool.put(towerKey(t.type, t.level), {
          x: cx - (rc?.dx ?? 0) * tile * 0.07 * k,
          y: bottom - (rc?.dy ?? 0) * tile * 0.07 * k,
          size: tile * 1.12,
          originY: 0.85,
          scaleYMul: 1 - 0.05 * k,
          sort: t.cell.row / 10,
        });
        if (!drawn) drawTower(this.underG as unknown as GraphicsLike, geo, t.type, t.level, t.cell.col, t.cell.row);
      }

      const nextEnemyPos = new Map<number, { x: number; y: number }>();
      const enemies = snap.enemies.map((e) => ({ e, p: this.enemyMt(frame, e.id, e) })).sort((a, b) => a.p.y - b.p.y);
      for (const { e, p } of enemies) {
        nextEnemyPos.set(e.id, p);
        const px = screenX(geo, p.x);
        const py = screenY(geo, p.y);
        const last = this.lastEnemyPos.get(e.id);
        if (last !== undefined && Math.abs(p.x - last.x) > 1) this.enemyFlip.set(e.id, p.x < last.x); // 왼쪽으로 가면 뒤집기
        const size = tile * 1.05;
        const phase = this.animMs * 0.012 + e.id * 1.3; // 걷는 흔들림(시각 전용)
        const bob = Math.abs(Math.sin(phase)) * tile * 0.04;
        const feetY = py + tile * 0.22 - bob;
        const slowed = e.slows.length > 0;
        const key = enemyKey(e.enemyType);
        const hasSprite = this.has(key);
        const sort = p.y / (10 * 1000);
        if (slowed && this.belowPool.put("fx-slow", { x: px, y: py + tile * 0.2, size: tile * 0.85, alpha: 0.9 })) {
          /* 그림 둔화 고리 */
        }
        if (hasSprite) {
          this.enemyPool.put(key, { x: px, y: feetY, size, originY: 0.85, rotation: Math.sin(phase) * 0.1, flipX: this.enemyFlip.get(e.id) === true, sort });
          const barW = Math.max(10, tile * 0.55);
          const barTop = feetY - size * 0.85 - Math.max(3, tile * 0.1);
          drawHpBar(bg, px, barTop, barW, e.hp / e.maxHp);
          if (slowed && !this.has("fx-slow")) {
            eg.lineStyle(Math.max(1.5, tile * 0.05), UI_COLORS.slowRing, 0.95);
            eg.strokeCircle(px, py + tile * 0.1, tile * 0.3);
          }
          if (e.trait !== null) {
            const ts = Math.min(20, Math.max(14, tile * 0.28));
            const tx = px - barW / 2 - ts / 2 - 1;
            const ty = barTop + Math.max(2, barW * 0.12) / 2;
            if (!this.barIconPool.put(TRAIT_SPRITE[e.trait], { x: tx, y: ty, size: ts })) drawTraitMark(bg, e.trait, tx, ty, Math.max(4, tile * 0.2));
          }
        } else {
          drawEnemy(eg, geo, e.enemyType, e.trait, e.hp, e.maxHp, slowed && !this.has("fx-slow"), px, py);
          // 몸은 도형이어도 특성 그림이 있으면 쓰고 싶지만 도형 표식(drawEnemy 안)으로 충분하다.
        }
      }
      // 이번 틱에 사라진 적의 마지막 위치는 VFX 용으로 한 프레임 더 남겨 둔다
      for (const [id, pos] of nextEnemyPos) this.lastEnemyPos.set(id, pos);
      for (const id of this.enemyFlip.keys()) if (!nextEnemyPos.has(id) && !this.lastEnemyPos.has(id)) this.enemyFlip.delete(id);

      for (const pr of snap.projectiles) {
        const before = frame.prev?.projectiles.find((q) => q.projectileId === pr.projectileId);
        const x = before === undefined ? pr.pos.x : lerp(before.pos.x, pr.pos.x, frame.alpha);
        const y = before === undefined ? pr.pos.y : lerp(before.pos.y, pr.pos.y, frame.alpha);
        const prevPos = this.lastProjectilePos.get(pr.projectileId);
        if (prevPos !== undefined && (Math.abs(x - prevPos.x) > 1 || Math.abs(y - prevPos.y) > 1)) this.projectileRotation.set(pr.projectileId, Math.atan2(y - prevPos.y, x - prevPos.x));
        this.lastProjectilePos.set(pr.projectileId, { x, y });
        const tt = this.towerTypeById.get(pr.towerId) ?? null;
        const sx = screenX(geo, x);
        const sy = screenY(geo, y);
        const drawn = tt !== null && this.projPool.put(PROJECTILE_SPRITE[tt], { x: sx, y: sy, size: tile * (pr.kind === "aoe" ? 0.6 : 0.5), rotation: this.projectileRotation.get(pr.projectileId) ?? 0 });
        if (!drawn) drawProjectile(pg, geo, tt, pr.kind === "aoe", sx, sy);
      }
      if (this.projectileRotation.size > 400) this.projectileRotation.clear();

      for (const v of this.vfx) {
        v.age += dt;
        const t = Math.min(1, v.age / v.durMs);
        const x = screenX(geo, v.xMt);
        const y = screenY(geo, v.yMt);
        if (v.sprite !== undefined && this.has(v.sprite)) {
          // 그림 효과: 확대하며 투명해진다(규격 3.5: 코드가 반경에 맞춰 확대·투명화)
          const full = v.kind === "ring" ? toPx(geo, v.sizeMt) * 2 : toPx(geo, v.sizeMt);
          this.fxPool.put(v.sprite, { x, y, size: full * (0.55 + 0.45 * t), alpha: 1 - t });
        } else if (v.fallback === false) {
          continue;
        } else if (v.kind === "ring") drawRing(fg, x, y, toPx(geo, v.sizeMt), t, v.color);
        else drawDot(fg, x, y, toPx(geo, v.sizeMt), t, v.color);
      }
      this.vfx = this.vfx.filter((v) => v.age < v.durMs);
    }
  }
  return new BattleScene();
}
