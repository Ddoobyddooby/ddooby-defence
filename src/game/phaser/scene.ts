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
  drawCellHighlight, drawDot, drawEnemy, drawMap, drawProjectile, drawRange, drawRing, drawTower, screenX, screenY, toPx,
  type GraphicsLike, type MapGeometry,
} from "./draw";
import { paletteOf, UI_COLORS } from "./palette";

type Cell = { col: number; row: number };

interface Vfx {
  readonly kind: "ring" | "dot";
  readonly xMt: number;
  readonly yMt: number;
  /** 링: 반경(mt). 점: 반지름(타일 비율 × 1000). */
  readonly sizeMt: number;
  readonly color: number;
  readonly durMs: number;
  age: number;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function createBattleScene(Phaser: typeof PhaserNS, session: GameSession): PhaserNS.Scene {
  class BattleScene extends Phaser.Scene {
    private mapG!: PhaserNS.GameObjects.Graphics;
    private dynG!: PhaserNS.GameObjects.Graphics;
    private areaW = 0;
    private areaH = 0;
    private geo: MapGeometry = { originX: 0, originY: 0, tile: 18 };
    private map: CompiledStageMap | null = null;
    private builtKey = "";
    private hover: Cell | null = null;
    private vfx: Vfx[] = [];
    private lastEnemyPos = new Map<number, { x: number; y: number }>();
    private lastProjectilePos = new Map<number, { x: number; y: number }>();
    private projectileRadius = new Map<number, number>();
    private towerTypeById = new Map<number, TowerType>();
    private lastTime: number | null = null;

    constructor() {
      super("battle");
    }

    create(): void {
      this.mapG = this.add.graphics();
      this.dynG = this.add.graphics();
      this.relayout();
      this.scale.on("resize", () => this.relayout());
      // Phaser 가 변환한 p.x/p.y 는 캔버스 경계(canvasBounds)가 낡으면 어긋난다(레이아웃이 마운트 직후 바뀌는 경우 실측: 클릭 (530,293) → (563,-491)).
      // 그래서 DOM 이벤트의 clientX/Y 와 그 순간의 캔버스 위치로 맵 영역 좌표를 직접 구한다.
      this.input.on("pointerdown", (p: PhaserNS.Input.Pointer) => {
        if (p.button !== 0) return; // 주 버튼·터치(항상 0)만 맵 입력. 우클릭·휠 클릭이 설치·선택 명령이 되지 않게 한다(리뷰 F3)
        session.tapCell(cellAtAreaPoint(this.layoutLike(), ...this.areaPoint(p)));
      });
      this.input.on("pointermove", (p: PhaserNS.Input.Pointer) => {
        this.hover = p.wasTouch ? null : cellAtAreaPoint(this.layoutLike(), ...this.areaPoint(p));
      });
      this.input.on("pointerout", () => (this.hover = null));
    }

    /** 포인터 → 맵 영역(캔버스 좌상단 기준) 좌표. 이벤트 시점의 캔버스 위치를 직접 읽는다. */
    private areaPoint(p: PhaserNS.Input.Pointer): [number, number] {
      const ev = p.event as MouseEvent | TouchEvent | undefined;
      const canvas = this.game.canvas as HTMLCanvasElement;
      const r = canvas.getBoundingClientRect();
      let cx = p.x + r.left;
      let cy = p.y + r.top;
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
      const sx = r.width > 0 ? this.areaW / r.width : 1;
      const sy = r.height > 0 ? this.areaH / r.height : 1;
      return [(cx - r.left) * sx, (cy - r.top) * sy];
    }

    /**
     * 호스트 요소(부모) 실측 크기와 캔버스 크기가 다르면 맞춘다. React 레이아웃(HUD 폭)이 resize 이벤트보다 늦게 확정되는 경우가 있어
     * 이벤트·ResizeObserver 만으로는 낡은 폭이 남는 것이 실측됐다(1000×500 에서 693 vs 760). 읽기만 하고 같으면 아무것도 하지 않는다.
     */
    private syncSize(): void {
      const host = (this.game.canvas as HTMLCanvasElement).parentElement;
      if (host === null) return;
      const w = Math.max(1, host.clientWidth);
      const h = Math.max(1, host.clientHeight);
      if (w !== this.scale.width || h !== this.scale.height) this.scale.resize(w, h);
    }

    /** 리사이즈·회전: 다시 배치만 한다(상태·인스턴스는 그대로). */
    private relayout(): void {
      this.areaW = this.scale.width;
      this.areaH = this.scale.height;
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
      this.dynG.clear();
      if (frame === null) {
        this.mapG.clear();
        this.builtKey = "";
        return;
      }
      this.ensureMap(frame);
      this.collectVfx(frame);
      // 일시정지·숨김에서는 VFX 도 멈춘다. 결과 단계(게임 상태는 정지)에서는 남은 VFX 가 끝까지 재생돼 링이 화면에 얼어붙지 않는다.
      const result = frame.curr.phase === "victory" || frame.curr.phase === "defeat";
      const dt = frame.running || (result && !frame.curr.paused) ? delta : 0;
      this.drawFrame(frame, dt);
    }

    private ensureMap(frame: RenderFrame): void {
      const key = `${frame.stageIndex}:${frame.attemptId}:${this.areaW}x${this.areaH}`;
      if (key === this.builtKey && this.map !== null) return;
      this.builtKey = key;
      if (this.map === null || this.map.stageId !== frame.content.stage.map.stageId) this.map = compileStageMap(frame.content.stage.map);
      drawMap(this.mapG as unknown as GraphicsLike, this.areaW, this.areaH, this.geo, this.map, paletteOf(frame.stageIndex));
      if (this.lastEnemyPos.size > 0 && frame.curr.tick === 0) {
        this.lastEnemyPos.clear();
        this.lastProjectilePos.clear();
        this.vfx = [];
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
          this.vfx.push({ kind: "ring", xMt: x, yMt: y, sizeMt: r, color: UI_COLORS.explosion, durMs: 350, age: 0 });
        } else if (e.type === "slowApplied") {
          const pos = this.lastEnemyPos.get(e.enemyId as number);
          if (pos) this.vfx.push({ kind: "ring", xMt: pos.x, yMt: pos.y, sizeMt: 500, color: UI_COLORS.frostHit, durMs: 300, age: 0 });
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
      const g = this.dynG as unknown as GraphicsLike;
      const geo = this.geo;
      const map = this.map as CompiledStageMap;
      const snap = frame.curr;
      const content = frame.content;

      // 선택·설치 미리보기
      for (const t of snap.towers) if (t.towerId === frame.ui.selectedTowerId) {
        const def = content.global.towers.find((d) => d.type === t.type)!;
        drawRange(g, geo.originX + (t.cell.col + 0.5) * geo.tile, geo.originY + (t.cell.row + 0.5) * geo.tile, toPx(geo, towerLevelStats(def, t.level).rangeMt));
        drawCellHighlight(g, geo, t.cell.col, t.cell.row, UI_COLORS.select, 0.18);
      }
      if (frame.ui.placeType !== null && this.hover !== null) {
        const occupied = new Set(snap.towers.map((t) => t.cell.row * 18 + t.cell.col));
        const ok = isBuildable(map, this.hover, occupied) && !occupied.has(this.hover.row * 18 + this.hover.col);
        const def = content.global.towers.find((d) => d.type === frame.ui.placeType)!;
        drawCellHighlight(g, geo, this.hover.col, this.hover.row, ok ? UI_COLORS.placeOk : UI_COLORS.placeBad, 0.3);
        drawRange(g, geo.originX + (this.hover.col + 0.5) * geo.tile, geo.originY + (this.hover.row + 0.5) * geo.tile, toPx(geo, towerLevelStats(def, 1).rangeMt));
      }

      for (const t of snap.towers) drawTower(g, geo, t.type, t.level, t.cell.col, t.cell.row);

      const nextEnemyPos = new Map<number, { x: number; y: number }>();
      for (const e of snap.enemies) {
        const p = this.enemyMt(frame, e.id, e);
        nextEnemyPos.set(e.id, p);
        drawEnemy(g, geo, e.enemyType, e.trait, e.hp, e.maxHp, e.slows.length > 0, screenX(geo, p.x), screenY(geo, p.y));
      }
      // 이번 틱에 사라진 적의 마지막 위치는 VFX 용으로 한 프레임 더 남겨 둔다
      for (const [id, pos] of nextEnemyPos) this.lastEnemyPos.set(id, pos);

      for (const pr of snap.projectiles) {
        const before = frame.prev?.projectiles.find((q) => q.projectileId === pr.projectileId);
        const x = before === undefined ? pr.pos.x : lerp(before.pos.x, pr.pos.x, frame.alpha);
        const y = before === undefined ? pr.pos.y : lerp(before.pos.y, pr.pos.y, frame.alpha);
        this.lastProjectilePos.set(pr.projectileId, { x, y });
        drawProjectile(g, geo, this.towerTypeById.get(pr.towerId) ?? null, pr.kind === "aoe", screenX(geo, x), screenY(geo, y));
      }

      for (const v of this.vfx) {
        v.age += dt;
        const t = Math.min(1, v.age / v.durMs);
        const x = screenX(geo, v.xMt);
        const y = screenY(geo, v.yMt);
        if (v.kind === "ring") drawRing(g, x, y, toPx(geo, v.sizeMt), t, v.color);
        else drawDot(g, x, y, toPx(geo, v.sizeMt), t, v.color);
      }
      this.vfx = this.vfx.filter((v) => v.age < v.durMs);
    }
  }
  return new BattleScene();
}
