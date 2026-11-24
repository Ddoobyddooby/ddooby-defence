// TEST_ONLY (증분은 강화 1회마다 누적) — 검증기 시험용 최소 묶음. 아래 수치는 임의의 테스트 값이며 게임 밸런스 후보·승인값이 아니다(BAL-01 전까지 제품 데이터에 수치 없음).
import { STAGE_MAPS } from "../../../content/stageMaps";
import { WAVE_ROLES } from "../types";

type Plain = Record<string, unknown>;

const COMMON = { attackPeriodMs: 1000, projectileSpeedMtPerSec: 10000, projectileTtlMs: 2000 };

function tower(type: string, buildCost: number, upgrade: number[], base: Plain, extraInc: Plain): Plain {
  const inc = (damage: number, rangeMt: number): Plain => ({
    damage,
    attackPeriodMs: 0,
    rangeMt,
    projectileSpeedMtPerSec: 0,
    projectileTtlMs: 0,
    ...extraInc,
  });
  return {
    type,
    buildCost,
    upgradeCosts: upgrade,
    levels: { base: { ...COMMON, ...base }, increments: [inc(5, 500), inc(5, 500), inc(5, 500)] },
  };
}

function segment(startMs: number, intervalMs: number, count: number, enemyType: string, trait: string | null): Plain {
  return { startMs, intervalMs, count, enemyType, trait };
}

function waves(): Plain[] {
  const defs: Plain[][] = [
    [segment(0, 1000, 3, "normal", null)],
    [segment(0, 500, 4, "fast", "speedBoost")],
    [segment(0, 1000, 2, "heavy", "hpBoost"), segment(1000, 500, 3, "swarm", null)],
    [segment(0, 500, 3, "normal", "controlResistance"), segment(500, 500, 2, "fast", null)],
    [segment(0, 500, 2, "heavy", null), segment(0, 250 * 2, 4, "swarm", "hpBoost")],
  ];
  return defs.map((segments, i) => ({ waveIndex: i + 1, role: WAVE_ROLES[i], prepMs: 5000, clearReward: 20, segments }));
}

/** 새로 만든(공유 없는) 유효한 묶음. 3 스테이지는 실제 후보 맵(MAP-01)을 복사해 쓴다. */
export function validBundle(): Plain {
  return {
    contentVersion: "test-1",
    towers: [
      tower("archer", 100, [150, 250, 400], { damage: 10, rangeMt: 5000 }, {}),
      tower("ballista", 200, [300, 500, 800], { damage: 40, rangeMt: 7000 }, {}),
      tower("mage", 180, [250, 400, 700], { damage: 20, rangeMt: 4000, aoeRadiusMt: 1500 }, { aoeRadiusMt: 100 }),
      tower("frost", 120, [160, 260, 420], { damage: 4, rangeMt: 3000, slowBp: 3000, slowDurationMs: 2000 }, { slowBp: 500, slowDurationMs: 0 }),
    ],
    enemies: [
      { type: "normal", hp: 100, speedMtPerSec: 1000, baseDamage: 1, killReward: 5 },
      { type: "fast", hp: 60, speedMtPerSec: 2000, baseDamage: 1, killReward: 6 },
      { type: "heavy", hp: 400, speedMtPerSec: 600, baseDamage: 3, killReward: 15 },
      { type: "swarm", hp: 30, speedMtPerSec: 1400, baseDamage: 1, killReward: 2 },
    ],
    traits: [
      { type: "controlResistance", resistBp: 5000, killRewardBonus: 0 },
      { type: "hpBoost", hpBoostBp: 5000, killRewardBonus: 2 },
      { type: "speedBoost", speedBoostBp: 3000, killRewardBonus: 2 },
    ],
    economy: { refundRateBp: 7000 },
    stages: STAGE_MAPS.map((map, i) => ({ stageId: map.stageId, initialGold: 300 + i * 50, baseHp: 20 + i * 5, map: structuredClone(map), waves: waves() })),
  };
}

export function seg(startMs: number, intervalMs: number, count: number, enemyType = "normal", trait: string | null = null): Plain {
  return segment(startMs, intervalMs, count, enemyType, trait);
}

type Step = string | number;

function tokens(path: string): Step[] {
  return (path.match(/[^.[\]]+/g) ?? []).map((t) => (/^\d+$/.test(t) ? Number(t) : t));
}

function parentOf(root: unknown, path: string): { parent: Record<Step, unknown>; key: Step } {
  const steps = tokens(path);
  let cur = root as Record<Step, unknown>;
  for (const s of steps.slice(0, -1)) cur = cur[s] as Record<Step, unknown>;
  return { parent: cur, key: steps[steps.length - 1] };
}

/** 깊은 복사본을 만들어 path 의 값을 바꾼다("stages[1].waves[3].segments[0].count"). */
export function withValue(path: string, value: unknown, base: unknown = validBundle()): unknown {
  const root = structuredClone(base);
  const { parent, key } = parentOf(root, path);
  parent[key] = value;
  return root;
}

/** path 의 키(또는 배열 요소)를 delete 한다. 배열이면 hole 이 생긴다. */
export function withDeleted(path: string, base: unknown = validBundle()): unknown {
  const root = structuredClone(base);
  const { parent, key } = parentOf(root, path);
  delete parent[key];
  return root;
}

export function valueAt(root: unknown, path: string): unknown {
  const { parent, key } = parentOf(root, path);
  return parent[key];
}

/** 여러 변경을 차례로 적용한다. */
export function withValues(changes: readonly (readonly [string, unknown])[], base: unknown = validBundle()): unknown {
  return changes.reduce<unknown>((acc, [path, value]) => withValue(path, value, acc), base);
}

/** 모든 객체의 키 삽입 순서를 거꾸로 만든 복사본(값은 같다). */
export function reverseKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(reverseKeys);
  if (typeof v === "object" && v !== null) {
    const out: Plain = {};
    for (const k of Object.keys(v).reverse()) out[k] = reverseKeys((v as Plain)[k]);
    return out;
  }
  return v;
}
