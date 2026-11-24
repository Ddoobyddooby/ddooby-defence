// DATA-01 — 콘텐츠 검증기 (SIM-CONTRACT 11.2~11.4). 오류는 필드 경로와 함께 전부 수집하고, 자동 보정·형변환은 하지 않는다.
import { compileStageMap, MapValidationError } from "../map/stageMap";
import { contentHashOf } from "../sim/hash";
import {
  ENEMY_TYPES,
  STAGE_COUNT,
  TOWER_TYPES,
  TRAIT_TYPES,
  WAVE_ROLES,
  WAVES_PER_STAGE,
  type ContentError,
  type ContentValidation,
  type EconomyDef,
  type EnemyDef,
  type EnemyType,
  type GlobalContent,
  type SegmentDef,
  type StageContent,
  type StageDef,
  type StageEntryResult,
  type StageValidation,
  type TowerDef,
  type TowerType,
  type TraitDef,
  type TraitType,
  type WaveDef,
} from "./types";

type Errs = ContentError[];
type Rec = Record<string, unknown>;
const HOLE = Symbol("hole");

interface Range {
  readonly min: number;
  readonly max: number;
  readonly multiple?: number;
}
const GOLD: Range = { min: 1, max: 1_000_000 };
const BONUS: Range = { min: 0, max: 1_000_000 };
const STAT: Range = { min: 1, max: 1_000_000 };
const DIST: Range = { min: 1, max: 25_000 };
const SPEED: Range = { min: 20, max: 100_000, multiple: 20 };
const DURATION: Range = { min: 50, max: 600_000, multiple: 50 };
const START: Range = { min: 0, max: 600_000, multiple: 50 };
const COUNT: Range = { min: 1, max: 1_000 };
const SLOW: Range = { min: 1, max: 9_999 };
const BP: Range = { min: 0, max: 10_000 };
const BOOST: Range = { min: 1, max: 90_000 };
const MAX_SEGMENTS = 64;
const MAX_ENEMIES_PER_WAVE = 5_000;

const LEVEL_RANGE: Record<string, Range> = {
  damage: STAT,
  attackPeriodMs: DURATION,
  rangeMt: DIST,
  projectileSpeedMtPerSec: SPEED,
  projectileTtlMs: DURATION,
  aoeRadiusMt: DIST,
  slowBp: SLOW,
  slowDurationMs: DURATION,
};
const COMMON_LEVEL_FIELDS = ["damage", "attackPeriodMs", "rangeMt", "projectileSpeedMtPerSec", "projectileTtlMs"] as const;
const TOWER_EXTRA_FIELDS: Record<TowerType, readonly string[]> = {
  archer: [],
  ballista: [],
  mage: ["aoeRadiusMt"],
  frost: ["slowBp", "slowDurationMs"],
};
const RANGE_ORDER: readonly TowerType[] = ["ballista", "archer", "mage", "frost"];

function show(v: unknown): string {
  if (v === HOLE) return "배열 구멍";
  if (v === undefined) return "undefined";
  if (v === null) return "null";
  if (typeof v === "string") return `문자열 ${JSON.stringify(v)}`;
  if (typeof v === "number") return Number.isNaN(v) ? "NaN" : String(v);
  return Array.isArray(v) ? "배열" : typeof v;
}

function isRec(v: unknown): v is Rec {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function has(o: object, key: string | number): boolean {
  return Object.prototype.hasOwnProperty.call(o, key);
}

function readRec(v: unknown, path: string, errs: Errs, allowed: readonly string[]): Rec | undefined {
  if (!isRec(v)) {
    errs.push({ path, message: `객체가 아님 (${show(v)})` });
    return undefined;
  }
  for (const key of Object.keys(v)) {
    if (!allowed.includes(key)) errs.push({ path: `${path}.${key}`, message: "알 수 없는 필드(이 항목에서 허용되지 않음)" });
  }
  return v;
}

function getField(rec: Rec, key: string, path: string, errs: Errs): { v: unknown } | undefined {
  if (!has(rec, key)) {
    errs.push({ path: `${path}.${key}`, message: "필수 필드 누락" });
    return undefined;
  }
  return { v: rec[key] };
}

function checkRange(v: number, r: Range, path: string, errs: Errs, label = ""): boolean {
  if (v < r.min || v > r.max) {
    errs.push({ path, message: `${label}범위 ${r.min}..${r.max} 밖 (${v})` });
    return false;
  }
  if (r.multiple !== undefined && v % r.multiple !== 0) {
    errs.push({ path, message: `${label}${r.multiple}의 배수가 아님 (${v})` });
    return false;
  }
  return true;
}

function readInt(rec: Rec, key: string, path: string, errs: Errs, range: Range | null): number | undefined {
  const f = getField(rec, key, path, errs);
  if (f === undefined) return undefined;
  const p = `${path}.${key}`;
  if (typeof f.v !== "number" || !Number.isSafeInteger(f.v)) {
    errs.push({ path: p, message: `안전 정수가 아님 (${show(f.v)})` });
    return undefined;
  }
  if (range !== null && !checkRange(f.v, range, p, errs)) return undefined;
  return f.v + 0;
}

function readEnum<T extends string>(rec: Rec, key: string, path: string, errs: Errs, values: readonly T[]): T | undefined {
  const f = getField(rec, key, path, errs);
  if (f === undefined) return undefined;
  if (typeof f.v !== "string" || !values.includes(f.v as T)) {
    errs.push({ path: `${path}.${key}`, message: `허용 값(${values.join("·")})이 아님 (${show(f.v)})` });
    return undefined;
  }
  return f.v as T;
}

function readNonEmptyString(rec: Rec, key: string, path: string, errs: Errs): string | undefined {
  const f = getField(rec, key, path, errs);
  if (f === undefined) return undefined;
  if (typeof f.v !== "string" || f.v.length === 0) {
    errs.push({ path: `${path}.${key}`, message: `비어 있지 않은 문자열이 아님 (${show(f.v)})` });
    return undefined;
  }
  return f.v;
}

/** 배열의 0..length−1 을 직접 순회한다. hole 은 `path[i]` 오류, 해당 위치 값은 HOLE. 배열이 아니면 undefined. */
function readItems(v: unknown, path: string, errs: Errs): unknown[] | undefined {
  if (!Array.isArray(v)) {
    errs.push({ path, message: `배열이 아님 (${show(v)})` });
    return undefined;
  }
  const out: unknown[] = [];
  for (let i = 0; i < v.length; i++) {
    if (!has(v, i)) {
      errs.push({ path: `${path}[${i}]`, message: "배열 구멍(요소 없음)" });
      out.push(HOLE);
    } else out.push(v[i]);
  }
  return out;
}

function readExactItems(v: unknown, path: string, errs: Errs, count: number): unknown[] | undefined {
  const items = readItems(v, path, errs);
  if (items !== undefined && items.length !== count) {
    errs.push({ path, message: `정확히 ${count}개여야 함 (${items.length}개)` });
  }
  return items;
}

interface Parsed<T> {
  readonly type: string | undefined;
  readonly value: T | undefined;
}

/** 정확히 types.length 개, type 각 1개. 개수·누락·중복 오류를 모은다. 결과는 입력 순서를 유지한다(없으면 undefined). */
function readTypedList<T>(
  v: unknown,
  path: string,
  errs: Errs,
  types: readonly string[],
  parseOne: (item: unknown, itemPath: string) => Parsed<T>,
): (T | undefined)[] | undefined {
  const items = readExactItems(v, path, errs, types.length);
  if (items === undefined) return undefined;
  const seen = new Set<string>();
  const out: (T | undefined)[] = [];
  items.forEach((item, i) => {
    if (item === HOLE) {
      out.push(undefined);
      return;
    }
    const { type, value } = parseOne(item, `${path}[${i}]`);
    if (type !== undefined) {
      if (seen.has(type)) errs.push({ path: `${path}[${i}].type`, message: `type 중복 (${type})` });
      seen.add(type);
    }
    out.push(value);
  });
  const missing = types.filter((t) => !seen.has(t));
  if (items.length === types.length && missing.length > 0 && items.every((x) => x !== HOLE)) {
    errs.push({ path, message: `누락된 type: ${missing.join("·")}` });
  }
  return out;
}

// ───────── 타워 ─────────

interface TowerParse {
  readonly def: TowerDef | undefined;
  readonly type: TowerType | undefined;
  /** 레벨(1~4) 별 결과 사거리와 그 오류가 가리킬 경로. */
  readonly ranges: { value: number; path: string }[];
}

function levelPath(base: string, level: number, field: string): string {
  return level === 1 ? `${base}.levels.base.${field}` : `${base}.levels.increments[${level - 2}].${field}`;
}

function parseTower(item: unknown, path: string, errs: Errs): TowerParse {
  const ranges: { value: number; path: string }[] = [];
  const errCountBefore = errs.length;
  const rec = readRec(item, path, errs, ["type", "buildCost", "upgradeCosts", "levels"]);
  if (rec === undefined) return { def: undefined, type: undefined, ranges };
  const type = readEnum(rec, "type", path, errs, TOWER_TYPES);
  const buildCost = readInt(rec, "buildCost", path, errs, GOLD);

  let upgradeCosts: number[] | undefined;
  const uf = getField(rec, "upgradeCosts", path, errs);
  if (uf !== undefined) {
    const items = readItems(uf.v, `${path}.upgradeCosts`, errs);
    if (items !== undefined) {
      if (items.length !== 3) errs.push({ path: `${path}.upgradeCosts`, message: `정확히 3개여야 함 (${items.length}개)` });
      // 길이 오류가 있어도 존재하는 항목은 각각 검사한다.
      const nums: (number | undefined)[] = items.map((x, i) => {
        const p = `${path}.upgradeCosts[${i}]`;
        if (x === HOLE) return undefined;
        if (typeof x !== "number" || !Number.isSafeInteger(x)) {
          errs.push({ path: p, message: `안전 정수가 아님 (${show(x)})` });
          return undefined;
        }
        return checkRange(x, GOLD, p, errs) ? x + 0 : undefined;
      });
      for (const i of [1, 2]) {
        const a = nums[i - 1];
        const b = nums[i];
        if (a !== undefined && b !== undefined && !(a < b)) {
          errs.push({ path: `${path}.upgradeCosts[${i}]`, message: `강화 비용은 Lv${i + 1} < Lv${i + 2} 여야 함 (${a} → ${b})` });
        }
      }
      if (items.length === 3 && nums.every((n) => n !== undefined)) upgradeCosts = nums as number[];
    }
  }

  let levelsOut: TowerDef["levels"] | undefined;
  const lf = getField(rec, "levels", path, errs);
  if (lf !== undefined && type !== undefined) {
    const fields = [...COMMON_LEVEL_FIELDS, ...TOWER_EXTRA_FIELDS[type]];
    const lp = `${path}.levels`;
    const lrec = readRec(lf.v, lp, errs, ["base", "increments"]);
    if (lrec !== undefined) {
      const base = parseLevelBlock(lrec, "base", lp, errs, fields);
      let incs: (LevelFields | undefined)[] | undefined;
      const inf = getField(lrec, "increments", lp, errs);
      if (inf !== undefined) {
        const items = readItems(inf.v, `${lp}.increments`, errs);
        if (items !== undefined) {
          if (items.length !== 3) errs.push({ path: `${lp}.increments`, message: `정확히 3개여야 함 (${items.length}개)` });
          incs = items.map((x, i) => (x === HOLE ? undefined : parseLevelRec(x, `${lp}.increments[${i}]`, errs, fields)));
        }
      }
      // 레벨 결과값(Lv1~4)에 범위 적용 (11.2). 증분은 강화 1회마다 누적: Lv2 = base+inc[0], Lv3 = Lv2+inc[1], Lv4 = Lv3+inc[2].
      // 필드별로 따로 누적한다: 값을 알 수 없는 필드(무효·누락)의 후속 레벨만 생략하고 다른 필드는 계속 검사한다.
      if (base !== undefined) {
        for (const field of fields) {
          let v = base[field];
          for (let level = 1; level <= 4; level++) {
            if (level > 1) {
              const inc = incs?.[level - 2]?.[field];
              v = v === undefined || inc === undefined ? undefined : v + inc;
            }
            if (v === undefined) break;
            const p = levelPath(path, level, field);
            checkRange(v, LEVEL_RANGE[field], p, errs, `Lv${level} 결과값 `);
            if (field === "rangeMt") ranges[level - 1] = { value: v, path: p };
          }
        }
      }
      if (base !== undefined && incs !== undefined && incs.length === 3 && incs.every((x) => x !== undefined)) {
        // 오류가 하나도 없을 때만 쓰이므로 모든 필드가 정수다.
        levelsOut = { base, increments: incs } as unknown as TowerDef["levels"];
      }
    }
  }

  const def =
    type !== undefined && buildCost !== undefined && upgradeCosts !== undefined && levelsOut !== undefined && errs.length === errCountBefore
      ? ({ type, buildCost, upgradeCosts: upgradeCosts as unknown as TowerDef["upgradeCosts"], levels: levelsOut } as TowerDef)
      : undefined;
  return { def, type, ranges };
}

type LevelFields = Record<string, number | undefined>;

function parseLevelBlock(parent: Rec, key: string, parentPath: string, errs: Errs, fields: readonly string[]): LevelFields | undefined {
  const f = getField(parent, key, parentPath, errs);
  if (f === undefined) return undefined;
  return parseLevelRec(f.v, `${parentPath}.${key}`, errs, fields);
}

/** 레벨 블록의 정수 필드를 필드별로 읽는다(범위 검사는 누적 결과값에서). 틀린 필드만 undefined 이고 나머지는 유지한다. */
function parseLevelRec(v: unknown, path: string, errs: Errs, fields: readonly string[]): LevelFields | undefined {
  const rec = readRec(v, path, errs, fields);
  if (rec === undefined) return undefined;
  const out: LevelFields = {};
  for (const field of fields) out[field] = readInt(rec, field, path, errs, null);
  return out;
}

// ───────── 적·특성·경제 ─────────

function parseEnemy(item: unknown, path: string, errs: Errs): Parsed<EnemyDef> {
  const rec = readRec(item, path, errs, ["type", "hp", "speedMtPerSec", "baseDamage", "killReward"]);
  if (rec === undefined) return { type: undefined, value: undefined };
  const type = readEnum(rec, "type", path, errs, ENEMY_TYPES);
  const hp = readInt(rec, "hp", path, errs, STAT);
  const speedMtPerSec = readInt(rec, "speedMtPerSec", path, errs, SPEED);
  const baseDamage = readInt(rec, "baseDamage", path, errs, STAT);
  const killReward = readInt(rec, "killReward", path, errs, GOLD);
  const value =
    type !== undefined && hp !== undefined && speedMtPerSec !== undefined && baseDamage !== undefined && killReward !== undefined
      ? { type, hp, speedMtPerSec, baseDamage, killReward }
      : undefined;
  return { type, value };
}

const TRAIT_FIELD: Record<TraitType, { key: string; range: Range }> = {
  controlResistance: { key: "resistBp", range: BP },
  hpBoost: { key: "hpBoostBp", range: BOOST },
  speedBoost: { key: "speedBoostBp", range: BOOST },
};

function parseTrait(item: unknown, path: string, errs: Errs): Parsed<TraitDef> {
  if (!isRec(item)) {
    errs.push({ path, message: `객체가 아님 (${show(item)})` });
    return { type: undefined, value: undefined };
  }
  const rawType = item.type;
  const knownType = typeof rawType === "string" && (TRAIT_TYPES as readonly string[]).includes(rawType) ? (rawType as TraitType) : undefined;
  const rec = readRec(item, path, errs, ["type", "killRewardBonus", ...(knownType ? [TRAIT_FIELD[knownType].key] : [])]);
  if (rec === undefined) return { type: undefined, value: undefined };
  const type = readEnum(rec, "type", path, errs, TRAIT_TYPES);
  const killRewardBonus = readInt(rec, "killRewardBonus", path, errs, BONUS);
  if (type === undefined) return { type, value: undefined };
  const spec = TRAIT_FIELD[type];
  const n = readInt(rec, spec.key, path, errs, spec.range);
  const value = killRewardBonus !== undefined && n !== undefined ? ({ type, killRewardBonus, [spec.key]: n } as unknown as TraitDef) : undefined;
  return { type, value };
}

function parseEconomy(v: unknown, path: string, errs: Errs): EconomyDef | undefined {
  const rec = readRec(v, path, errs, ["refundRateBp"]);
  if (rec === undefined) return undefined;
  const refundRateBp = readInt(rec, "refundRateBp", path, errs, BP);
  return refundRateBp === undefined ? undefined : { refundRateBp };
}

// ───────── 스테이지 ─────────

interface SegmentUse {
  enemies: Set<EnemyType>;
  traits: Set<TraitType>;
}

function parseSegment(item: unknown, path: string, errs: Errs, use: SegmentUse): { def: SegmentDef | undefined; count: number | undefined } {
  const rec = readRec(item, path, errs, ["startMs", "intervalMs", "count", "enemyType", "trait"]);
  if (rec === undefined) return { def: undefined, count: undefined };
  const startMs = readInt(rec, "startMs", path, errs, START);
  const count = readInt(rec, "count", path, errs, COUNT);
  // intervalMs: count > 1 이면 50..600000, count == 1 이면 0 도 허용. count 가 무효면 0 도 허용하는 느슨한 쪽으로 읽는다.
  let intervalMs: number | undefined;
  const ivf = getField(rec, "intervalMs", path, errs);
  if (ivf !== undefined) {
    const p = `${path}.intervalMs`;
    if (typeof ivf.v !== "number" || !Number.isSafeInteger(ivf.v)) errs.push({ path: p, message: `안전 정수가 아님 (${show(ivf.v)})` });
    else if (ivf.v === 0 && (count === undefined || count === 1)) intervalMs = 0;
    else if (ivf.v === 0) errs.push({ path: p, message: "count > 1 이면 intervalMs 는 50 이상이어야 함 (0)" });
    else if (checkRange(ivf.v, DURATION, p, errs)) intervalMs = ivf.v + 0;
  }
  const enemyType = readEnum(rec, "enemyType", path, errs, ENEMY_TYPES);
  let trait: TraitType | null | undefined;
  const tf = getField(rec, "trait", path, errs);
  if (tf !== undefined) {
    if (tf.v === null) trait = null;
    else if (typeof tf.v === "string" && (TRAIT_TYPES as readonly string[]).includes(tf.v)) trait = tf.v as TraitType;
    else errs.push({ path: `${path}.trait`, message: `null 또는 특성 type(${TRAIT_TYPES.join("·")})이어야 함 (${show(tf.v)})` });
  }
  if (enemyType !== undefined) use.enemies.add(enemyType);
  if (trait) use.traits.add(trait);
  const def =
    startMs !== undefined && intervalMs !== undefined && count !== undefined && enemyType !== undefined && trait !== undefined
      ? { startMs, intervalMs, count, enemyType, trait }
      : undefined;
  return { def, count };
}

function parseWave(item: unknown, path: string, index: number, errs: Errs, use: SegmentUse): WaveDef | undefined {
  const rec = readRec(item, path, errs, ["waveIndex", "role", "prepMs", "clearReward", "segments"]);
  if (rec === undefined) return undefined;
  const waveIndex = readInt(rec, "waveIndex", path, errs, null);
  if (waveIndex !== undefined && waveIndex !== index + 1) {
    errs.push({ path: `${path}.waveIndex`, message: `순서와 맞지 않음: ${index + 1} 이어야 함 (${waveIndex})` });
  }
  const role = readEnum(rec, "role", path, errs, WAVE_ROLES);
  if (role !== undefined && role !== WAVE_ROLES[index]) {
    errs.push({ path: `${path}.role`, message: `웨이브 ${index + 1} 의 role 은 ${WAVE_ROLES[index]} 이어야 함 (${role})` });
  }
  const prepMs = readInt(rec, "prepMs", path, errs, DURATION);
  const clearReward = readInt(rec, "clearReward", path, errs, GOLD);

  let segments: SegmentDef[] | undefined;
  const sf = getField(rec, "segments", path, errs);
  if (sf !== undefined) {
    const sp = `${path}.segments`;
    const items = readItems(sf.v, sp, errs);
    if (items !== undefined) {
      if (items.length < 1) errs.push({ path: sp, message: "Segment 가 1개 이상 필요" });
      if (items.length > MAX_SEGMENTS) errs.push({ path: sp, message: `Segment 는 ${MAX_SEGMENTS}개 이하 (${items.length}개)` });
      let total = 0;
      const defs = items.map((s, i) => {
        if (s === HOLE) return undefined;
        const r = parseSegment(s, `${sp}[${i}]`, errs, use);
        if (r.count !== undefined) total += r.count;
        return r.def;
      });
      if (total > MAX_ENEMIES_PER_WAVE) errs.push({ path: sp, message: `웨이브당 적 총수는 ${MAX_ENEMIES_PER_WAVE}마리 이하 (${total}마리)` });
      if (items.length >= 1 && items.length <= MAX_SEGMENTS && total <= MAX_ENEMIES_PER_WAVE && defs.every((d) => d !== undefined)) {
        segments = defs as SegmentDef[];
      }
    }
  }
  const roleOk = role !== undefined && role === WAVE_ROLES[index];
  return waveIndex === index + 1 && roleOk && prepMs !== undefined && clearReward !== undefined && segments !== undefined
    ? { waveIndex, role, prepMs, clearReward, segments }
    : undefined;
}

const GRID_COL: Range = { min: 0, max: 17 };
const GRID_ROW: Range = { min: 0, max: 9 };

/** 칸 배열을 필드별로 읽어 구조·좌표 오류를 모두 모은다. 하나라도 있으면 undefined. */
function parseMapCells(v: unknown, path: string, errs: Errs): { col: number; row: number }[] | undefined {
  const items = readItems(v, path, errs);
  if (items === undefined) return undefined;
  let ok = true;
  const cells = items.map((item, i) => {
    if (item === HOLE) {
      ok = false;
      return undefined;
    }
    const cp = `${path}[${i}]`;
    const rec = readRec(item, cp, errs, ["col", "row"]);
    if (rec === undefined) {
      ok = false;
      return undefined;
    }
    const col = readInt(rec, "col", cp, errs, GRID_COL);
    const row = readInt(rec, "row", cp, errs, GRID_ROW);
    if (col === undefined || row === undefined) {
      ok = false;
      return undefined;
    }
    return { col, row };
  });
  return ok ? (cells as { col: number; row: number }[]) : undefined;
}

/** 맵: 필드·좌표 구조 오류를 모두 모은 뒤, 그것이 없을 때만 10절 기하 검증(compileStageMap)을 수행한다. */
function parseMap(v: unknown, path: string, stageId: string | undefined, errs: Errs): StageDef["map"] | undefined {
  const rec = readRec(v, path, errs, ["stageId", "waypoints", "reservedCells"]);
  if (rec === undefined) return undefined;
  const mapId = readNonEmptyString(rec, "stageId", path, errs);
  if (mapId !== undefined && stageId !== undefined && mapId !== stageId) {
    errs.push({ path: `${path}.stageId`, message: `map.stageId(${mapId}) 가 stageId(${stageId}) 와 다름` });
  }
  const wf = getField(rec, "waypoints", path, errs);
  const waypoints = wf === undefined ? undefined : parseMapCells(wf.v, `${path}.waypoints`, errs);
  const rf = getField(rec, "reservedCells", path, errs);
  const reservedCells = rf === undefined ? undefined : parseMapCells(rf.v, `${path}.reservedCells`, errs);
  if (mapId === undefined || waypoints === undefined || reservedCells === undefined) return undefined;
  if (stageId !== undefined && mapId !== stageId) return undefined;
  try {
    const compiled = compileStageMap({ stageId: mapId, waypoints, reservedCells });
    return { stageId: compiled.stageId, waypoints: compiled.waypoints, reservedCells: compiled.reservedCells };
  } catch (err) {
    if (!(err instanceof MapValidationError)) throw err;
    errs.push({ path: err.field === "map" ? path : `${path}.${err.field}`, message: err.message });
    return undefined;
  }
}

function parseStage(item: unknown, i: number, errs: Errs): StageDef | undefined {
  const path = `stages[${i}]`;
  const rec = readRec(item, path, errs, ["stageId", "initialGold", "map", "waves"]);
  if (rec === undefined) return undefined;
  const stageId = readNonEmptyString(rec, "stageId", path, errs);
  const initialGold = readInt(rec, "initialGold", path, errs, GOLD);

  let map: StageDef["map"] | undefined;
  const mf = getField(rec, "map", path, errs);
  if (mf !== undefined) map = parseMap(mf.v, `${path}.map`, stageId, errs);

  const use: SegmentUse = { enemies: new Set(), traits: new Set() };
  let waves: WaveDef[] | undefined;
  const wf = getField(rec, "waves", path, errs);
  if (wf !== undefined) {
    const items = readExactItems(wf.v, `${path}.waves`, errs, WAVES_PER_STAGE);
    if (items !== undefined) {
      const parsed = items.map((w, k) => (w === HOLE ? undefined : parseWave(w, `${path}.waves[${k}]`, k, errs, use)));
      if (items.length === WAVES_PER_STAGE && parsed.every((w) => w !== undefined)) waves = parsed as WaveDef[];
    }
  }

  if (i === 0) {
    for (const e of ENEMY_TYPES) {
      if (!use.enemies.has(e)) errs.push({ path: `${path}.waves`, message: `Stage 1 에 적 ${e} 가 한 번도 등장하지 않음` });
    }
    for (const t of TRAIT_TYPES) {
      if (!use.traits.has(t)) errs.push({ path: `${path}.waves`, message: `Stage 1 에 특성 ${t} 가 한 번도 등장하지 않음` });
    }
  }

  return stageId !== undefined && initialGold !== undefined && map !== undefined && waves !== undefined ? { stageId, initialGold, map, waves } : undefined;
}

// ───────── 전체 ─────────

interface FullParse {
  readonly validation: ContentValidation;
  readonly global: GlobalContent | undefined;
  readonly stages: (StageDef | undefined)[];
}

function parseAll(input: unknown): FullParse {
  const g: Errs = [];
  const stageErrs: Errs[] = [];
  let towers: (TowerDef | undefined)[] | undefined;
  let enemies: (EnemyDef | undefined)[] | undefined;
  let traits: (TraitDef | undefined)[] | undefined;
  let economy: EconomyDef | undefined;
  let contentVersion: string | undefined;
  const stages: (StageDef | undefined)[] = [];
  const stageIds: (string | null)[] = [];

  const rec = readRec(input, "content", g, ["contentVersion", "towers", "enemies", "traits", "economy", "stages"]);
  if (rec !== undefined) {
    contentVersion = readNonEmptyString(rec, "contentVersion", "content", g)?.valueOf();
    const tf = getField(rec, "towers", "content", g);
    const towerParses: TowerParse[] = [];
    if (tf !== undefined) {
      towers = readTypedList(tf.v, "towers", g, TOWER_TYPES, (item, p) => {
        const r = parseTower(item, p, g);
        towerParses.push(r);
        return { type: r.type, value: r.def };
      });
      crossCheckTowers(towerParses, g);
    }
    const ef = getField(rec, "enemies", "content", g);
    if (ef !== undefined) enemies = readTypedList(ef.v, "enemies", g, ENEMY_TYPES, (item, p) => parseEnemy(item, p, g));
    const trf = getField(rec, "traits", "content", g);
    if (trf !== undefined) traits = readTypedList(trf.v, "traits", g, TRAIT_TYPES, (item, p) => parseTrait(item, p, g));
    const ecf = getField(rec, "economy", "content", g);
    if (ecf !== undefined) economy = parseEconomy(ecf.v, "economy", g);

    const sf = getField(rec, "stages", "content", g);
    if (sf !== undefined) {
      // 길이 ≠ 3 은 전역 오류. 각 자리(hole·undefined·null·객체 아님)는 그 자리 스테이지만의 오류로 격리한다(stageId = null).
      if (!Array.isArray(sf.v)) g.push({ path: "stages", message: `배열이 아님 (${show(sf.v)})` });
      else {
        const arr = sf.v;
        if (arr.length !== STAGE_COUNT) g.push({ path: "stages", message: `정확히 ${STAGE_COUNT}개여야 함 (${arr.length}개)` });
        const seen = new Map<string, number>();
        for (let i = 0; i < arr.length; i++) {
          const errs: Errs = [];
          stageErrs.push(errs);
          if (!has(arr, i)) {
            stageIds.push(null);
            stages.push(undefined);
            errs.push({ path: `stages[${i}]`, message: "배열 구멍(요소 없음)" });
            continue;
          }
          const item = arr[i];
          const rawId = isRec(item) && typeof item.stageId === "string" ? item.stageId : null;
          stageIds.push(rawId);
          if (rawId !== null && rawId.length > 0) {
            if (seen.has(rawId)) g.push({ path: `stages[${i}].stageId`, message: `stageId 중복 (${rawId}, stages[${seen.get(rawId)}] 와 같음)` });
            else seen.set(rawId, i);
          }
          stages.push(parseStage(item, i, errs));
        }
      }
    }
  }

  const globalOk =
    g.length === 0 &&
    contentVersion !== undefined &&
    towers !== undefined &&
    enemies !== undefined &&
    traits !== undefined &&
    economy !== undefined;
  const global = globalOk
    ? ({
        contentVersion,
        towers: canonicalOrder(towers as TowerDef[], TOWER_TYPES),
        enemies: canonicalOrder(enemies as EnemyDef[], ENEMY_TYPES),
        traits: canonicalOrder(traits as TraitDef[], TRAIT_TYPES),
        economy,
      } as GlobalContent)
    : undefined;
  const validation: ContentValidation = {
    globalErrors: g,
    stages: stageErrs.map((errors, i) => ({ stageId: stageIds[i], errors }) as StageValidation),
  };
  return { validation, global, stages };
}

/** 타워·적·특성은 정규 type 순서로 정렬해 돌려준다(해시가 입력 순서에 의존하지 않도록). 오류 경로는 입력 인덱스를 쓴다. */
function canonicalOrder<T extends { type: string }>(items: readonly T[], order: readonly string[]): T[] {
  return [...items].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
}

/** 같은 레벨끼리 ballista > archer > mage > frost (엄격). 위반은 더 짧아야 하는 쪽 타워의 해당 레벨 필드 경로에 보고한다. */
function crossCheckTowers(parses: readonly TowerParse[], errs: Errs): void {
  const byType = new Map<TowerType, TowerParse>();
  for (const p of parses) if (p.type !== undefined && !byType.has(p.type)) byType.set(p.type, p);
  for (let k = 0; k + 1 < RANGE_ORDER.length; k++) {
    const longer = byType.get(RANGE_ORDER[k]);
    const shorter = byType.get(RANGE_ORDER[k + 1]);
    if (longer === undefined || shorter === undefined) continue;
    for (let level = 1; level <= 4; level++) {
      const a = longer.ranges[level - 1];
      const b = shorter.ranges[level - 1];
      if (a !== undefined && b !== undefined && !(a.value > b.value)) {
        errs.push({
          path: b.path,
          message: `Lv${level} 사거리 순서 위반: ${RANGE_ORDER[k]}(${a.value}) > ${RANGE_ORDER[k + 1]}(${b.value}) 여야 함`,
        });
      }
    }
  }
}

/** 사전 검증(콘텐츠 로드 시). 모든 오류를 수집한다. 전역 오류가 있으면 모든 스테이지 플레이 불가(`isStagePlayable`). */
export function validateContent(input: unknown): ContentValidation {
  return parseAll(input).validation;
}

/** 전역 오류가 없고 그 스테이지 오류도 없을 때만 true. */
export function isStagePlayable(validation: ContentValidation, stageIndex: number): boolean {
  const s = validation.stages[stageIndex];
  return validation.globalErrors.length === 0 && s !== undefined && s.errors.length === 0;
}

/** 11.4 스테이지 콘텐츠 해시: 정규 JSON {"global":…,"stage":…} 의 FNV-1a 64. */
export function stageContentHash(content: StageContent): string {
  return contentHashOf({ global: content.global, stage: content.stage });
}

function deepFreeze<T>(v: T): T {
  if (typeof v === "object" && v !== null && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const key of Object.keys(v)) deepFreeze((v as Rec)[key]);
  }
  return v;
}

/** 진입 재검증: 전역 + 해당 스테이지를 사전 검증과 같은 검증기로 다시 검사. 통과하면 깊은 복사·동결 결과와 해시를 돌려준다. */
export function validateStageForEntry(input: unknown, stageId: string): StageEntryResult {
  const { validation, global, stages } = parseAll(input);
  const index = validation.stages.findIndex((s) => s.stageId === stageId);
  const errors: ContentError[] = [...validation.globalErrors];
  if (index < 0) {
    errors.push({ path: "stageId", message: `콘텐츠에 없는 stageId (${stageId})` });
    return { ok: false, errors };
  }
  errors.push(...validation.stages[index].errors);
  const stage = stages[index];
  if (errors.length > 0 || global === undefined || stage === undefined) return { ok: false, errors };
  const content = deepFreeze<StageContent>({ global, stage });
  return { ok: true, content, contentHash: stageContentHash(content) };
}
