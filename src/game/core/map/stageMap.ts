// MAP-01 — 맵 기하 (SIM-CONTRACT 10절). 순수 정수 계산, 입력 오류는 필드 경로가 담긴 예외로 보고하고 자동 보정하지 않는다.
import { GRID_COLS, GRID_ROWS, type Cell } from "../grid";
import { assertSafeInteger } from "../sim/intmath";

/** 칸 한 변 길이(mt). 칸 중심 = (col×1000+500, row×1000+500). */
export const CELL_MT = 1000;

export interface StageMap {
  readonly stageId: string;
  /** 가로·세로 직선 구간만. 첫 waypoint=출발점(가장자리), 마지막=기지. */
  readonly waypoints: readonly Cell[];
  /** 장식 등 추가 설치 불가 칸(기본 빈 목록). */
  readonly reservedCells: readonly Cell[];
}

export interface PointMt {
  readonly x: number;
  readonly y: number;
}

/** 검증·파생을 마친 맵. compileStageMap 으로만 만든다. */
export interface CompiledStageMap {
  readonly stageId: string;
  readonly waypoints: readonly Cell[];
  readonly reservedCells: readonly Cell[];
  /** 출발→기지 순서의 경로 칸(양 끝 포함, 중복 없음). */
  readonly pathCells: readonly Cell[];
  /** 경로 총길이 = (경로 칸 수 − 1) × 1000. */
  readonly pathLengthMt: number;
  /** 각 waypoint 의 진행도(mt). 길이 = waypoints.length. */
  readonly waypointProgressMt: readonly number[];
  /** 경로 ∪ reservedCells 의 칸 인덱스(row×18+col). */
  readonly blocked: ReadonlySet<number>;
}

export class MapValidationError extends Error {
  readonly field: string;
  constructor(field: string, message: string) {
    super(`${field}: ${message}`);
    this.name = "MapValidationError";
    this.field = field;
  }
}

export function cellIndex(cell: Cell): number {
  return cell.row * GRID_COLS + cell.col;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseCell(v: unknown, field: string): Cell {
  if (!isRecord(v)) throw new MapValidationError(field, "칸 객체가 아님");
  const { col, row } = v;
  if (typeof col !== "number" || !Number.isSafeInteger(col)) throw new MapValidationError(`${field}.col`, `정수가 아님 (${String(col)})`);
  if (typeof row !== "number" || !Number.isSafeInteger(row)) throw new MapValidationError(`${field}.row`, `정수가 아님 (${String(row)})`);
  if (col < 0 || col >= GRID_COLS) throw new MapValidationError(`${field}.col`, `격자 밖 (0..${GRID_COLS - 1}): ${col}`);
  if (row < 0 || row >= GRID_ROWS) throw new MapValidationError(`${field}.row`, `격자 밖 (0..${GRID_ROWS - 1}): ${row}`);
  return { col: col + 0, row: row + 0 };
}

function sign(n: number): number {
  return n > 0 ? 1 : n < 0 ? -1 : 0;
}

/** 입력을 검증하고 경로 칸·길이·설치 불가 집합을 파생한다. 오류는 MapValidationError(field). */
export function compileStageMap(input: unknown): CompiledStageMap {
  if (!isRecord(input)) throw new MapValidationError("map", "객체가 아님");
  const { stageId } = input;
  if (typeof stageId !== "string" || stageId.length === 0) throw new MapValidationError("stageId", "비어 있지 않은 문자열이어야 함");

  const rawWp = input.waypoints;
  if (!Array.isArray(rawWp)) throw new MapValidationError("waypoints", "배열이 아님");
  if (rawWp.length < 2) throw new MapValidationError("waypoints", `2개 이상 필요 (${rawWp.length})`);
  const waypoints = rawWp.map((w, i) => parseCell(w, `waypoints[${i}]`));

  const start = waypoints[0];
  const onEdge = start.col === 0 || start.col === GRID_COLS - 1 || start.row === 0 || start.row === GRID_ROWS - 1;
  if (!onEdge) throw new MapValidationError("waypoints[0]", `출발점은 격자 가장자리 칸이어야 함 (${start.col},${start.row})`);

  // 구간 방향 검증 + 경로 칸 전개(꺾임 칸은 한 번만).
  const pathCells: Cell[] = [start];
  const seen = new Map<number, number>([[cellIndex(start), 0]]);
  const waypointProgressMt: number[] = [0];
  let prevDir: { dc: number; dr: number } | null = null;
  for (let i = 1; i < waypoints.length; i++) {
    const a = waypoints[i - 1];
    const b = waypoints[i];
    const field = `waypoints[${i}]`;
    const dcTotal = b.col - a.col;
    const drTotal = b.row - a.row;
    if (dcTotal === 0 && drTotal === 0) throw new MapValidationError(field, `길이 0 구간 (${a.col},${a.row})`);
    if (dcTotal !== 0 && drTotal !== 0) throw new MapValidationError(field, `대각 구간 (${a.col},${a.row})→(${b.col},${b.row})`);
    const dir = { dc: sign(dcTotal), dr: sign(drTotal) };
    if (prevDir !== null && prevDir.dc === dir.dc && prevDir.dr === dir.dr) {
      throw new MapValidationError(`waypoints[${i - 1}]`, "같은 방향으로 이어지는 불필요한 중간 waypoint");
    }
    prevDir = dir;
    const steps = Math.abs(dcTotal) + Math.abs(drTotal);
    for (let s = 1; s <= steps; s++) {
      const cell = { col: a.col + dir.dc * s, row: a.row + dir.dr * s };
      const idx = cellIndex(cell);
      if (seen.has(idx)) throw new MapValidationError(field, `경로 칸 중복 (${cell.col},${cell.row}) — 교차 또는 되돌아감`);
      seen.set(idx, pathCells.length);
      pathCells.push(cell);
    }
    waypointProgressMt.push((pathCells.length - 1) * CELL_MT);
  }

  // 맞닿은 통로: 경로 순서상 2 이상 떨어진 두 칸이 상하좌우로 붙으면 오류(연속 칸·꺾임 칸은 순서 차 1이라 제외).
  for (let i = 0; i < pathCells.length; i++) {
    const c = pathCells[i];
    for (const [dc, dr] of [[1, 0], [0, 1]] as const) {
      if (c.col + dc >= GRID_COLS || c.row + dr >= GRID_ROWS) continue;
      const j = seen.get(cellIndex({ col: c.col + dc, row: c.row + dr }));
      if (j !== undefined && Math.abs(i - j) > 1) {
        throw new MapValidationError("waypoints", `통로가 맞닿음: (${c.col},${c.row})와 (${c.col + dc},${c.row + dr})`);
      }
    }
  }

  const rawReserved = input.reservedCells;
  if (!Array.isArray(rawReserved)) throw new MapValidationError("reservedCells", "배열이 아님");
  const reservedCells = rawReserved.map((c, i) => parseCell(c, `reservedCells[${i}]`));
  const blocked = new Set<number>(seen.keys());
  reservedCells.forEach((c, i) => {
    const idx = cellIndex(c);
    if (blocked.has(idx)) {
      const onPath = seen.has(idx);
      throw new MapValidationError(`reservedCells[${i}]`, `${onPath ? "경로 칸과 겹침" : "중복"} (${c.col},${c.row})`);
    }
    blocked.add(idx);
  });

  return {
    stageId,
    waypoints,
    reservedCells,
    pathCells,
    pathLengthMt: (pathCells.length - 1) * CELL_MT,
    waypointProgressMt,
    blocked,
  };
}

/** 설치 가능 칸 수(경로·reservedCells 제외). */
export function buildableCellCount(map: CompiledStageMap): number {
  return GRID_COLS * GRID_ROWS - map.blocked.size;
}

/** 격자 안, 경로·reservedCells 아님, 점유(occupied: 칸 인덱스 집합) 아님 → true. 격자 밖·비정수 칸은 false. */
export function isBuildable(map: CompiledStageMap, cell: Cell, occupied: ReadonlySet<number>): boolean {
  if (!Number.isSafeInteger(cell.col) || !Number.isSafeInteger(cell.row)) return false;
  if (cell.col < 0 || cell.col >= GRID_COLS || cell.row < 0 || cell.row >= GRID_ROWS) return false;
  const idx = cellIndex(cell);
  return !map.blocked.has(idx) && !occupied.has(idx);
}

/**
 * 경로 진행도(mt) → 위치(mt). 0 → 출발 칸 중심, pathLengthMt → 기지 칸 중심.
 * 음수·비정수는 오류(RangeError/TypeError). pathLengthMt 초과는 기지 칸 중심으로 고정(틱 말미 초과 이동분 허용).
 */
export function progressToPosition(map: CompiledStageMap, pathProgress: number): PointMt {
  assertSafeInteger(pathProgress, "pathProgress");
  if (pathProgress < 0) throw new RangeError(`pathProgress: 음수 불가 (${pathProgress})`);
  const p = pathProgress > map.pathLengthMt ? map.pathLengthMt : pathProgress;
  const last = map.waypoints.length - 1;
  let i = 1;
  while (i < last && p > map.waypointProgressMt[i]) i++;
  const a = map.waypoints[i - 1];
  const b = map.waypoints[i];
  const segStart = map.waypointProgressMt[i - 1];
  // 구간 길이(mt) = 칸 수 × 1000 이고 진행도도 mt 이므로 선형 보간의 비율이 1:1 → 반올림 없이 정확한 정수.
  const offset = p - segStart;
  const dc = sign(b.col - a.col);
  const dr = sign(b.row - a.row);
  return { x: a.col * CELL_MT + CELL_MT / 2 + dc * offset, y: a.row * CELL_MT + CELL_MT / 2 + dr * offset };
}
