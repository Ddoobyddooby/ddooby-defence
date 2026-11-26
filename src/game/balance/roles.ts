// BAL-01 역할 측정 (BALANCE 5절): 한 종류 적만 나오는 웨이브 × 같은 골드로 한 종류 타워 → 골드당 처치·피해.
import type { ContentBundle, EnemyType, SegmentDef, TowerType } from "../core/content/types";
import type { Bot, BotView } from "./bots";
import { runWithBot } from "./runner";

export const ROLE_GOLD = 800;
export const ROLE_STAGE_INDEX = 1;
const seg = (startMs: number, intervalMs: number, count: number, enemyType: EnemyType): SegmentDef => ({ startMs, intervalMs, count, enemyType, trait: null });

/** 적 종류별 측정 웨이브(특성 없음). 방어가 모두 막아 내지 못하도록(골드당 처치에 차이가 나도록) 넉넉히 많은 수. 후보 수치를 보기 전에 정했고 후보에 맞춰 바꾸지 않는다. */
export const ROLE_SEGMENTS: Readonly<Record<EnemyType, readonly SegmentDef[]>> = {
  normal: [seg(0, 500, 30, "normal")],
  fast: [seg(0, 350, 30, "fast")],
  heavy: [seg(0, 1200, 14, "heavy")],
  swarm: [seg(0, 150, 60, "swarm")],
};

export interface RoleResult {
  readonly enemy: EnemyType;
  readonly tower: TowerType;
  readonly towers: number;
  readonly spent: number;
  readonly total: number;
  readonly kills: number;
  readonly leaks: number;
  readonly damage: number;
  /** 골드 1000 당 처치 수. */
  readonly killsPerKGold: number;
  /** 골드 1 당 준 피해. */
  readonly damagePerGold: number;
}

/** ROLE_GOLD 안에서 가장 많이 한 종류 타워를 점수 순 칸에 짓고 즉시 웨이브를 시작하는 봇. */
function roleBot(type: TowerType): Bot {
  let done = false;
  return {
    id: `R-${type}`,
    name: `역할 측정(${type})`,
    act: (v: BotView) => {
      if (done) return [];
      done = true;
      const cost = v.stage.global.towers.find((t) => t.type === type)!.buildCost;
      const n = Math.floor(v.gold / cost);
      const cmds: ReturnType<Bot["act"]> = v.ranked[type].slice(0, n).map((c) => ({ kind: "build", payload: { towerType: type, tile: { col: c.col, row: c.row } } }));
      cmds.push({ kind: "startWave", payload: {} });
      return cmds;
    },
  };
}

export function roleBundle(bundle: ContentBundle, enemy: EnemyType): ContentBundle {
  const b = structuredClone(bundle) as unknown as { stages: { initialGold: number; baseHp: number; waves: { segments: readonly SegmentDef[] }[] }[] };
  const st = b.stages[ROLE_STAGE_INDEX];
  st.initialGold = ROLE_GOLD;
  st.baseHp = 100000;
  st.waves[0].segments = ROLE_SEGMENTS[enemy];
  return b as unknown as ContentBundle;
}

export function runRole(bundle: ContentBundle, enemy: EnemyType, tower: TowerType): RoleResult {
  const b = roleBundle(bundle, enemy);
  const r = runWithBot(b, ROLE_STAGE_INDEX, roleBot(tower), { stopAfterWave: 1 });
  const damage = r.damageByTower.archer + r.damageByTower.ballista + r.damageByTower.mage + r.damageByTower.frost;
  const spent = r.spentBuild;
  const total = ROLE_SEGMENTS[enemy].reduce((n, s) => n + s.count, 0);
  return {
    enemy,
    tower,
    towers: r.towerCount,
    spent,
    total,
    kills: r.kills,
    leaks: r.leaks,
    damage,
    killsPerKGold: spent === 0 ? 0 : Math.round((r.kills * 1000 * 100) / spent) / 100,
    damagePerGold: spent === 0 ? 0 : Math.round((damage * 100) / spent) / 100,
  };
}
