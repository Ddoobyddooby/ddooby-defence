// TEST_ONLY — 13.3·14.8 틱 불변식 (SIM-CONTRACT 15.4). 스냅샷 + 그 틱 이벤트만 읽으므로 코어 없이 리플레이 trace 에도 쓴다.
// 위반하면 틱·불변식 이름·값을 담은 InvariantViolation 을 던진다.
import { isInsideGrid } from "../../grid";
import { compileStageMap, isBuildable, type CompiledStageMap } from "../../map/stageMap";
import type { StageContent, TowerType } from "../../content/types";

export class InvariantViolation extends Error {
  readonly tick: number;
  readonly invariant: string;
  constructor(tick: number, invariant: string, detail: string) {
    super(`tick ${tick} 불변식 위반 [${invariant}]: ${detail}`);
    this.name = "InvariantViolation";
    this.tick = tick;
    this.invariant = invariant;
  }
}

interface SnapTower {
  towerId: number;
  type: TowerType;
  level: number;
  actuallyPaid: number;
  cell: { col: number; row: number };
}
interface SnapEnemy {
  id: number;
  slows: { sourceTowerId: number; slowBp: number; expireTick: number }[];
}
interface SnapProjectile {
  projectileId: number;
  kind: string;
  targetEnemyId: number | null;
  expireTick: number;
}
interface Snap {
  gold: number;
  consumedEconomyEvents: string[];
  towers: SnapTower[];
  enemies: SnapEnemy[];
  projectiles: SnapProjectile[];
}
type Ev = Record<string, unknown>;

export class InvariantChecker {
  private readonly map: CompiledStageMap;
  private readonly initialGold: number;
  private ledgerSum = 0;
  private lastGoldAfter: number | null = null;
  /** 투사체 id → { 종류, 종료 횟수 }. */
  private readonly fired = new Map<number, { kind: string; endings: number }>();

  constructor(private readonly content: StageContent) {
    this.map = compileStageMap(content.stage.map);
    this.initialGold = content.stage.initialGold;
  }

  private fail(tick: number, invariant: string, detail: string): never {
    throw new InvariantViolation(tick, invariant, detail);
  }

  private buildPlusUpgrades(type: TowerType, level: number): number {
    const def = this.content.global.towers.find((t) => t.type === type);
    if (def === undefined) throw new Error(`콘텐츠에 없는 타워 종류 ${type}`);
    return def.buildCost + def.upgradeCosts.slice(0, level - 1).reduce((a, b) => a + b, 0);
  }

  /** 한 틱의 (스냅샷, 그 틱 이벤트)를 검사한다. 틱 순서대로 호출한다. */
  check(tick: number, state: unknown, events: readonly unknown[]): void {
    const s = state as Snap;
    const evs = events as readonly Ev[];

    // ── 경제 (13.3) ──
    for (const e of evs) {
      if (e.type !== "economySettled") continue;
      this.ledgerSum += e.delta as number;
      if (e.goldAfter !== this.initialGold + this.ledgerSum) this.fail(tick, "goldAfter", `${String(e.key)}: goldAfter ${String(e.goldAfter)} ≠ 초기 ${this.initialGold} + Σdelta ${this.ledgerSum}`);
      this.lastGoldAfter = e.goldAfter as number;
    }
    if (!Number.isSafeInteger(s.gold) || s.gold < 0) this.fail(tick, "gold≥0", `gold ${s.gold}`);
    if (s.gold !== this.initialGold + this.ledgerSum) this.fail(tick, "gold==초기+Σ원장", `gold ${s.gold} ≠ ${this.initialGold} + ${this.ledgerSum}`);
    if (new Set(s.consumedEconomyEvents).size !== s.consumedEconomyEvents.length) this.fail(tick, "경제 키 1회", s.consumedEconomyEvents.join(","));
    const cells = new Set<string>();
    for (const t of s.towers) {
      const expectedPaid = this.buildPlusUpgrades(t.type, t.level);
      if (t.level < 1 || t.level > 4) this.fail(tick, "타워 레벨 1~4", `tower ${t.towerId} level ${t.level}`);
      if (t.actuallyPaid !== expectedPaid) this.fail(tick, "actuallyPaid", `tower ${t.towerId}: ${t.actuallyPaid} ≠ 설치+강화 합 ${expectedPaid}`);
      if (!isInsideGrid(t.cell) || !isBuildable(this.map, t.cell, new Set())) this.fail(tick, "경로·예약 칸 무타워", `tower ${t.towerId} (${t.cell.col},${t.cell.row})`);
      const key = `${t.cell.col},${t.cell.row}`;
      if (cells.has(key)) this.fail(tick, "칸당 타워 1개", key);
      cells.add(key);
    }

    // ── 전투 (14.8) ──
    const enemyIds = new Set(s.enemies.map((e) => e.id));
    for (const p of s.projectiles) {
      if (p.kind === "single" && !enemyIds.has(p.targetEnemyId as number)) this.fail(tick, "single 대상 존재", `projectile ${p.projectileId} → enemy ${String(p.targetEnemyId)}`);
      if (p.expireTick < tick) this.fail(tick, "투사체 expireTick≥T", `projectile ${p.projectileId} expireTick ${p.expireTick}`);
    }
    const pids = s.projectiles.map((p) => p.projectileId);
    if (pids.some((id, i) => i > 0 && id <= pids[i - 1])) this.fail(tick, "투사체 ID 오름차순", pids.join(","));
    for (const e of s.enemies) {
      const sources = e.slows.map((x) => x.sourceTowerId);
      if (new Set(sources).size !== sources.length) this.fail(tick, "둔화 출처 중복 없음", `enemy ${e.id}: ${sources.join(",")}`);
      if (sources.some((id, i) => i > 0 && id <= sources[i - 1])) this.fail(tick, "둔화 출처 오름차순", `enemy ${e.id}`);
      for (const x of e.slows) if (x.expireTick <= tick) this.fail(tick, "둔화 expireTick>T", `enemy ${e.id}: expireTick ${x.expireTick}`);
    }

    // 이벤트 순서 기반: 타워당 1발, 투사체는 정확히 하나로 끝남, hp 0 이 된 적은 이후 비대상
    const perTower = new Map<number, number>();
    const dead = new Set<number>();
    for (const e of evs) {
      if (e.type === "projectileFired") {
        perTower.set(e.towerId as number, (perTower.get(e.towerId as number) ?? 0) + 1);
        this.fired.set(e.projectileId as number, { kind: e.kind as string, endings: 0 });
        if (dead.has(e.targetEnemyId as number)) this.fail(tick, "hp 0 적 비대상(발사)", `enemy ${String(e.targetEnemyId)}`);
      } else if (e.type === "projectileCancelled" || e.type === "projectileExpired" || e.type === "projectileExploded") {
        this.end(tick, e.projectileId as number);
      } else if (e.type === "enemyDamaged") {
        if (dead.has(e.enemyId as number)) this.fail(tick, "hp 0 적 비대상(피해)", `enemy ${String(e.enemyId)}`);
        if (this.fired.get(e.projectileId as number)?.kind === "single") this.end(tick, e.projectileId as number);
        if (e.hpAfter === 0) dead.add(e.enemyId as number);
      }
    }
    for (const [towerId, n] of perTower) if (n !== 1) this.fail(tick, "타워당 틱 1발", `tower ${towerId}: ${n}발`);
  }

  private end(tick: number, projectileId: number): void {
    const f = this.fired.get(projectileId);
    if (f === undefined) this.fail(tick, "투사체 종료는 발사 뒤", `projectile ${projectileId}`);
    f.endings += 1;
    if (f.endings > 1) this.fail(tick, "투사체는 정확히 하나로 끝남", `projectile ${projectileId}: ${f.endings}회`);
  }

  /** 마지막 틱 뒤: 비행 중이 아닌 모든 투사체는 정확히 한 번 끝났어야 한다. */
  finish(tick: number, state: unknown): void {
    const inFlight = new Set((state as Snap).projectiles.map((p) => p.projectileId));
    for (const [id, f] of this.fired) {
      const want = inFlight.has(id) ? 0 : 1;
      if (f.endings !== want) this.fail(tick, "투사체 종료 횟수", `projectile ${id}: ${f.endings}회 (기대 ${want})`);
    }
  }

  /** 발사된 투사체 수(시나리오가 전투를 실제로 일으켰는지 단언용). */
  get firedCount(): number {
    return this.fired.size;
  }
  get lastGold(): number | null {
    return this.lastGoldAfter;
  }
}
