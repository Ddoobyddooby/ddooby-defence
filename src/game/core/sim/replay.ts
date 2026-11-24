// SIM-CONTRACT 7.3·7.4: 리플레이 기록 구조 검사·실행·틱별 비교.
// 기록은 자동 보정·형변환 없이 검사하고, 항상 새 코어 인스턴스로 completedTick == endTick까지 실행한다.
import { canonicalize } from "./canonical";
import { CommandStructureError, validateCommandInput, type CommandKind, type SubmitResult } from "./commands";
import { tickEnvelope } from "./hash";
import { fnv1a64 } from "./hash";

export interface ReplayCommand {
  readonly applyTick: number;
  readonly seq: number;
  readonly kind: CommandKind;
  readonly payload: unknown;
}

export interface ReplayRecord {
  readonly formatVersion: number;
  readonly codeVersion: string;
  readonly contentHash: string;
  readonly stageId: string;
  readonly attemptId: number;
  readonly initialStateHash: string;
  readonly endTick: number;
  readonly commands: readonly ReplayCommand[];
}

export interface ReplayExpectation {
  readonly formatVersion: number;
  readonly codeVersion: string;
  readonly contentHash: string;
}

/** 리플레이가 구동하는 코어의 최소 인터페이스. 장난감 시뮬과 이후 실제 코어가 같은 모양을 따른다. */
export interface ReplayCore {
  readonly completedTick: number;
  isResult(): boolean;
  submit(kind: unknown, payload: unknown): SubmitResult;
  step(): readonly unknown[];
  snapshot(): unknown;
}

/** 실행 전 구조 오류(필드 경로 포함). 시뮬레이션 불일치와 구분된다. */
export class ReplayStructureError extends Error {
  readonly path: string;
  constructor(path: string, detail: string) {
    super(`${path}: ${detail}`);
    this.name = "ReplayStructureError";
    this.path = path;
  }
}

/** formatVersion·codeVersion·contentHash 불일치(호환성 오류). 시뮬레이션 전에 던진다. */
export class ReplayCompatibilityError extends Error {
  readonly field: string;
  constructor(field: string, expected: unknown, actual: unknown) {
    super(`${field}: 호환되지 않음 (기대 ${JSON.stringify(expected)} / 기록 ${JSON.stringify(actual)})`);
    this.name = "ReplayCompatibilityError";
    this.field = field;
  }
}

/** 새 코어의 스냅샷 0 해시가 기록의 initialStateHash와 다름(초기 상태 변조·재사용된 코어 등). */
export class ReplayInitialStateError extends Error {
  constructor(expected: string, actual: string) {
    super(`초기 상태 해시 불일치 (기록 ${expected} / 새 코어 ${actual})`);
    this.name = "ReplayInitialStateError";
  }
}

/** 결과가 틱 R에 확정됐는데 endTick > R. R에서 멈추고 결과 상태를 진행시키지 않는다. */
export class ReplayEndMismatchError extends Error {
  readonly resultTick: number;
  readonly endTick: number;
  constructor(resultTick: number, endTick: number) {
    super(`종료 불일치: 결과가 틱 ${resultTick}에 확정됐지만 endTick은 ${endTick}`);
    this.name = "ReplayEndMismatchError";
    this.resultTick = resultTick;
    this.endTick = endTick;
  }
}

const HEADER_KEYS = [
  "attemptId",
  "codeVersion",
  "commands",
  "contentHash",
  "endTick",
  "formatVersion",
  "initialStateHash",
  "stageId",
] as const;
const COMMAND_KEYS = ["applyTick", "kind", "payload", "seq"] as const;
const HASH_PATTERN = /^[0-9a-f]{16}$/;

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function requireKeys(obj: Record<string, unknown>, keys: readonly string[], path: string): void {
  for (const key of Object.keys(obj)) {
    if (!keys.includes(key)) throw new ReplayStructureError(`${path}.${key}`, "알 수 없는 필드");
  }
  for (const key of keys) {
    if (!(key in obj)) throw new ReplayStructureError(`${path}.${key}`, "필드 누락");
  }
}

function safeInt(v: unknown, path: string, min: number): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < min) {
    throw new ReplayStructureError(path, `${min} 이상의 안전 정수여야 함 (${String(v)})`);
  }
  return v;
}

function str(v: unknown, path: string): string {
  if (typeof v !== "string") throw new ReplayStructureError(path, `문자열이어야 함 (${String(v)})`);
  return v;
}

/** 실행 전 구조 검사. 구조 오류는 ReplayStructureError, 버전·콘텐츠 불일치는 ReplayCompatibilityError. */
export function validateReplayRecord(raw: unknown, expected: ReplayExpectation): ReplayRecord {
  if (!isPlainRecord(raw)) throw new ReplayStructureError("record", "기록은 일반 객체여야 함");
  requireKeys(raw, HEADER_KEYS, "record");
  const formatVersion = safeInt(raw.formatVersion, "record.formatVersion", 0);
  const codeVersion = str(raw.codeVersion, "record.codeVersion");
  const contentHash = str(raw.contentHash, "record.contentHash");
  if (formatVersion !== expected.formatVersion) {
    throw new ReplayCompatibilityError("formatVersion", expected.formatVersion, formatVersion);
  }
  if (codeVersion !== expected.codeVersion) throw new ReplayCompatibilityError("codeVersion", expected.codeVersion, codeVersion);
  if (contentHash !== expected.contentHash) throw new ReplayCompatibilityError("contentHash", expected.contentHash, contentHash);

  const stageId = str(raw.stageId, "record.stageId");
  if (stageId.length === 0) throw new ReplayStructureError("record.stageId", "빈 문자열 불가");
  const attemptId = safeInt(raw.attemptId, "record.attemptId", 1);
  const initialStateHash = str(raw.initialStateHash, "record.initialStateHash");
  if (!HASH_PATTERN.test(initialStateHash)) {
    throw new ReplayStructureError("record.initialStateHash", "소문자 16자리 16진수여야 함");
  }
  const endTick = safeInt(raw.endTick, "record.endTick", 0);

  if (!Array.isArray(raw.commands)) throw new ReplayStructureError("record.commands", "배열이어야 함");
  const rawCommands: unknown[] = raw.commands;
  if (Object.keys(rawCommands).length !== rawCommands.length) {
    throw new ReplayStructureError("record.commands", "배열 구멍 또는 비인덱스 속성");
  }
  let previousApplyTick = 1;
  const commands: ReplayCommand[] = rawCommands.map((entry, i) => {
    const path = `record.commands[${i}]`;
    if (!isPlainRecord(entry)) throw new ReplayStructureError(path, "명령은 일반 객체여야 함");
    requireKeys(entry, COMMAND_KEYS, path);
    const seq = safeInt(entry.seq, `${path}.seq`, 1);
    if (seq !== i + 1) {
      throw new ReplayStructureError(`${path}.seq`, `seq는 1부터 빈틈·중복 없이 증가해야 함 (기대 ${i + 1} / 기록 ${seq})`);
    }
    const applyTick = safeInt(entry.applyTick, `${path}.applyTick`, 1);
    if (applyTick < previousApplyTick) {
      throw new ReplayStructureError(`${path}.applyTick`, `seq 순으로 감소할 수 없음 (${applyTick} < ${previousApplyTick})`);
    }
    if (applyTick > endTick) {
      throw new ReplayStructureError(`${path}.applyTick`, `endTick(${endTick})보다 클 수 없음 (${applyTick})`);
    }
    previousApplyTick = applyTick;
    let input;
    try {
      input = validateCommandInput(entry.kind, entry.payload, path);
    } catch (error) {
      if (error instanceof CommandStructureError) throw new ReplayStructureError(error.path, error.message);
      throw error;
    }
    return { applyTick, seq, kind: input.kind, payload: input.payload };
  });

  return { formatVersion, codeVersion, contentHash, stageId, attemptId, initialStateHash, endTick, commands };
}

export interface TickTrace {
  readonly tick: number;
  readonly state: unknown;
  readonly events: readonly unknown[];
  /** 해시 입력(정규 envelope 문자열). 진단용. */
  readonly envelope: string;
  readonly hash: string;
}

export interface ReplayTrace {
  readonly ticks: readonly TickTrace[];
}

function makeTrace(tick: number, state: unknown, events: readonly unknown[]): TickTrace {
  const envelope = tickEnvelope(events, state);
  return { tick, state, events: [...events], envelope, hash: fnv1a64(envelope) };
}

/** 스냅샷 0의 틱 해시(이벤트 없음). 기록의 initialStateHash는 이 값과 같아야 한다. */
export function initialStateHashOf(snapshot0: unknown): string {
  return makeTrace(0, snapshot0, []).hash;
}

/**
 * 기록을 검사하고 `createCore`가 만든 **새 코어**로 completedTick == endTick까지 실행해 틱 0..endTick 전부의
 * 상태·이벤트·해시를 돌려준다. 결과가 endTick 전에 확정되면 ReplayEndMismatchError(그 틱에서 멈춤).
 */
export function runReplay(
  raw: unknown,
  expected: ReplayExpectation,
  createCore: (record: ReplayRecord) => ReplayCore,
): ReplayTrace {
  const record = validateReplayRecord(raw, expected);
  const core = createCore(record);
  const first = makeTrace(0, core.snapshot(), []);
  if (first.hash !== record.initialStateHash) throw new ReplayInitialStateError(record.initialStateHash, first.hash);
  const ticks: TickTrace[] = [first];
  let next = 0;
  for (let T = 1; T <= record.endTick; T += 1) {
    if (core.completedTick !== T - 1) {
      throw new ReplayStructureError("core", `completedTick이 ${T - 1}이어야 함 (${core.completedTick})`);
    }
    while (next < record.commands.length && record.commands[next].applyTick === T) {
      const c = record.commands[next];
      const r = core.submit(c.kind, c.payload);
      if (!r.ok || r.command.seq !== c.seq || r.command.applyTick !== T) {
        throw new ReplayStructureError(
          `record.commands[${next}]`,
          r.ok ? `접수 결과 불일치 (seq ${r.command.seq}, applyTick ${r.command.applyTick})` : `접수 거부 (${r.reason})`,
        );
      }
      next += 1;
    }
    const events = core.step();
    ticks.push(makeTrace(T, core.snapshot(), events));
    if (core.isResult() && T < record.endTick) throw new ReplayEndMismatchError(T, record.endTick);
  }
  return { ticks };
}

export interface ValueDifference {
  readonly path: string;
  readonly expected: unknown;
  readonly actual: unknown;
}

/** 정규 값(JSON 형태) 두 개를 비교해 첫 차이의 필드 경로·기대·실제를 돌려준다. 키는 정렬 순으로 훑는다. */
export function firstDifference(expected: unknown, actual: unknown, path: string): ValueDifference | null {
  if (Array.isArray(expected) && Array.isArray(actual)) {
    const n = Math.min(expected.length, actual.length);
    for (let i = 0; i < n; i += 1) {
      const d = firstDifference(expected[i], actual[i], `${path}[${i}]`);
      if (d) return d;
    }
    if (expected.length !== actual.length) {
      return { path: `${path}.length`, expected: expected.length, actual: actual.length };
    }
    return null;
  }
  if (isPlainRecord(expected) && isPlainRecord(actual)) {
    const keys = Array.from(new Set([...Object.keys(expected), ...Object.keys(actual)])).sort();
    for (const key of keys) {
      const d = firstDifference(expected[key], actual[key], `${path}.${key}`);
      if (d) return d;
    }
    return null;
  }
  return Object.is(expected, actual) ? null : { path, expected, actual };
}

export interface ReplayMismatch {
  readonly tick: number;
  readonly kind: "state" | "events" | "hash" | "length";
  readonly path: string;
  readonly expected: unknown;
  readonly actual: unknown;
  /** 이벤트 불일치일 때 해당 이벤트의 eventSeq(기대 쪽 우선). */
  readonly eventSeq?: number;
  readonly message: string;
}

function show(v: unknown): string {
  return v === undefined ? "(없음)" : canonicalizeLoose(v);
}

function canonicalizeLoose(v: unknown): string {
  try {
    return canonicalize(v);
  } catch {
    return String(v);
  }
}

/** 두 실행의 **첫 불일치 틱**을 찾아 필드 경로 단위로 보고한다. 같으면 null. 최종 해시 하나만 비교하지 않는다. */
export function firstMismatch(expected: ReplayTrace, actual: ReplayTrace): ReplayMismatch | null {
  const n = Math.min(expected.ticks.length, actual.ticks.length);
  for (let i = 0; i < n; i += 1) {
    const a = expected.ticks[i];
    const b = actual.ticks[i];
    const sd = firstDifference(a.state, b.state, "state");
    if (sd) return { tick: a.tick, kind: "state", ...sd, message: `tick ${a.tick}: ${sd.path} 기대 ${show(sd.expected)} / 실제 ${show(sd.actual)}` };
    const ed = firstDifference(a.events, b.events, "events");
    if (ed) {
      const m = /^events\[(\d+)\]/.exec(ed.path);
      const index = m ? Number(m[1]) : -1;
      const pick = (t: TickTrace): number | undefined => {
        const ev = t.events[index];
        return isPlainRecord(ev) && typeof ev.eventSeq === "number" ? ev.eventSeq : undefined;
      };
      const eventSeq = pick(a) ?? pick(b);
      const where = eventSeq === undefined ? "" : ` (eventSeq ${eventSeq})`;
      return {
        tick: a.tick,
        kind: "events",
        ...ed,
        ...(eventSeq === undefined ? {} : { eventSeq }),
        message: `tick ${a.tick}: ${ed.path}${where} 기대 ${show(ed.expected)} / 실제 ${show(ed.actual)}`,
      };
    }
    if (a.hash !== b.hash) {
      return { tick: a.tick, kind: "hash", path: "hash", expected: a.hash, actual: b.hash, message: `tick ${a.tick}: hash 기대 ${a.hash} / 실제 ${b.hash}` };
    }
  }
  if (expected.ticks.length !== actual.ticks.length) {
    return {
      tick: n,
      kind: "length",
      path: "ticks.length",
      expected: expected.ticks.length,
      actual: actual.ticks.length,
      message: `tick ${n}: ticks.length 기대 ${expected.ticks.length} / 실제 ${actual.ticks.length}`,
    };
  }
  return null;
}
