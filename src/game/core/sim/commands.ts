// SIM-CONTRACT 4절: 명령 접수(seq·applyTick 부여, payload 복사·동결)와 1단계 소비(seq 숫자순).
// 순차 재검증·적용은 시뮬레이션(toySim, 이후 SIM-01)이 맡는다.
import { SUBMIT_REJECT, type SubmitRejectReason } from "./events";
import { SimStateError } from "./errors";
import { takeId, type IdCounters } from "./ids";
import { addSafe } from "./intmath";

export const COMMAND_KINDS = ["build", "upgrade", "sell", "setTargeting", "startWave"] as const;
export type CommandKind = (typeof COMMAND_KINDS)[number];

/** 선두/후미/가까운/강한. 이름은 TECH-02 toy 수준 제안이며 SIM-02에서 확정한다. */
export const TARGETING_MODES = ["first", "last", "close", "strong"] as const;
export type TargetingMode = (typeof TARGETING_MODES)[number];

export interface TilePayload {
  readonly col: number;
  readonly row: number;
}

export type CommandInput =
  | { readonly kind: "build"; readonly payload: { readonly tile: TilePayload } }
  | { readonly kind: "upgrade"; readonly payload: { readonly towerId: number } }
  | { readonly kind: "sell"; readonly payload: { readonly towerId: number } }
  | { readonly kind: "setTargeting"; readonly payload: { readonly towerId: number; readonly mode: TargetingMode } }
  | { readonly kind: "startWave"; readonly payload: Readonly<Record<string, never>> };

export type Command = CommandInput & { readonly seq: number; readonly applyTick: number };

/** 접수 시 구조 검사 실패(알 수 없는 kind·잘못된 payload). seq는 소비되지 않는다. */
export class CommandStructureError extends Error {
  readonly path: string;
  constructor(path: string, detail: string) {
    super(`${path}: ${detail}`);
    this.name = "CommandStructureError";
    this.path = path;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function exactKeys(obj: Record<string, unknown>, keys: readonly string[], path: string): void {
  for (const key of Object.keys(obj)) {
    if (!keys.includes(key)) throw new CommandStructureError(`${path}.${key}`, "알 수 없는 필드");
  }
  for (const key of keys) {
    if (!(key in obj)) throw new CommandStructureError(`${path}.${key}`, "필드 누락");
  }
}

function safeInt(v: unknown, path: string, min: number): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < min) {
    throw new CommandStructureError(path, `${min} 이상의 안전 정수여야 함 (${String(v)})`);
  }
  return v;
}

/**
 * kind·payload를 검사하고 **새 객체로 복사해 동결**한 입력을 돌려준다(자동 보정·형변환 없음).
 * 호출자가 나중에 원본 객체를 바꿔도 반환값은 영향받지 않는다.
 */
export function validateCommandInput(kind: unknown, payload: unknown, path = "command"): CommandInput {
  if (typeof kind !== "string" || !(COMMAND_KINDS as readonly string[]).includes(kind)) {
    throw new CommandStructureError(`${path}.kind`, `알 수 없는 kind (${String(kind)})`);
  }
  if (!isRecord(payload)) throw new CommandStructureError(`${path}.payload`, "payload는 일반 객체여야 함");
  const p = `${path}.payload`;
  switch (kind as CommandKind) {
    case "build": {
      exactKeys(payload, ["tile"], p);
      const tile = payload.tile;
      if (!isRecord(tile)) throw new CommandStructureError(`${p}.tile`, "tile은 일반 객체여야 함");
      exactKeys(tile, ["col", "row"], `${p}.tile`);
      const col = safeInt(tile.col, `${p}.tile.col`, 0);
      const row = safeInt(tile.row, `${p}.tile.row`, 0);
      return Object.freeze({ kind: "build", payload: Object.freeze({ tile: Object.freeze({ col, row }) }) });
    }
    case "upgrade":
    case "sell": {
      exactKeys(payload, ["towerId"], p);
      const towerId = safeInt(payload.towerId, `${p}.towerId`, 1);
      return Object.freeze({ kind: kind as "upgrade" | "sell", payload: Object.freeze({ towerId }) });
    }
    case "setTargeting": {
      exactKeys(payload, ["mode", "towerId"], p);
      const towerId = safeInt(payload.towerId, `${p}.towerId`, 1);
      const mode = payload.mode;
      if (typeof mode !== "string" || !(TARGETING_MODES as readonly string[]).includes(mode)) {
        throw new CommandStructureError(`${p}.mode`, `알 수 없는 mode (${String(mode)})`);
      }
      return Object.freeze({
        kind: "setTargeting",
        payload: Object.freeze({ towerId, mode: mode as TargetingMode }),
      });
    }
    case "startWave":
      exactKeys(payload, [], p);
      return Object.freeze({ kind: "startWave", payload: Object.freeze({}) });
  }
}

export interface SubmitContext {
  /** 마지막으로 완료된 틱. applyTick = completedTick + 1. */
  readonly completedTick: number;
  readonly phase: string;
  readonly paused: boolean;
  /** step() 실행 중이면 true — 이때 접수는 오류. */
  readonly stepping: boolean;
}

export type SubmitResult =
  | { readonly ok: true; readonly command: Command }
  | { readonly ok: false; readonly reason: SubmitRejectReason };

/**
 * 명령 접수. 구조 오류·step 중 접수·카운터 한계는 throw(상태 불변). 일시정지·결과 단계는 seq 없이 즉시 거부.
 * 성공 시 seq(1부터 단조 증가)와 applyTick을 붙인 동결 명령을 큐에 넣는다.
 */
export function submitCommand(
  queue: Command[],
  counters: IdCounters,
  kind: unknown,
  payload: unknown,
  ctx: SubmitContext,
): SubmitResult {
  if (ctx.stepping) throw new SimStateError("step() 실행 중에는 명령을 접수할 수 없음");
  const input = validateCommandInput(kind, payload);
  if (ctx.phase === "result") return { ok: false, reason: SUBMIT_REJECT.resultPhase };
  if (ctx.paused) return { ok: false, reason: SUBMIT_REJECT.paused };
  const applyTick = addSafe(ctx.completedTick, 1);
  const seq = takeId(counters, "command");
  const command = Object.freeze({ ...input, seq, applyTick }) as Command;
  queue.push(command);
  return { ok: true, command };
}

/**
 * step() 1단계: `applyTick == tick`인 명령을 **seq 숫자 오름차순**으로 꺼내 큐를 비운다.
 * 큐의 저장 순서에는 의존하지 않는다. 큐에 다른 applyTick이 섞여 있으면 불변식 위반(오류, 큐 불변).
 */
export function drainCommands(queue: Command[], tick: number): Command[] {
  for (const c of queue) {
    if (c.applyTick !== tick) {
      throw new SimStateError(`큐 불변식 위반: seq ${c.seq}의 applyTick ${c.applyTick} != ${tick}`);
    }
  }
  const sorted = [...queue].sort((a, b) => a.seq - b.seq);
  queue.length = 0;
  return sorted;
}
