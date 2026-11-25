// TEST_ONLY — 골든 회귀 지원 (SIM-CONTRACT 15.2). 골든 생성·직렬화·검증과 갱신 가드.
import { fileURLToPath } from "node:url";
import { canonicalize, cloneCanonical } from "../../sim/canonical";
import { firstMismatch, runReplay, type ReplayRecord, type ReplayTrace } from "../../sim/replay";
import { ATTEMPT_CODE_VERSION, createAttempt } from "../attempt";
import { REPLAY_FORMAT_VERSION, createRecordedAttempt } from "../record";
import type { LedgerEntry } from "../types";
import { InvariantChecker } from "../testing/invariants";
import type { Scenario, ScenarioId } from "./scenarios";

/** 시나리오 입력 정의(15.2 "시나리오 변경 판정"). 실행 결과로 계산되는 값(endTick·initialStateHash·해시·원장)은 넣지 않는다. */
export interface GoldenInput {
  readonly contentHash: string;
  readonly stageId: string;
  readonly attemptId: number;
  /** 명령 스크립트(시나리오 정의 그대로). */
  readonly commands: readonly { readonly tick: number; readonly kind: string; readonly payload: unknown }[];
  /** 종료 정책: 고정 endTick 값 또는 "result"(결과 틱까지). */
  readonly endPolicy: number | "result";
}

export interface Golden {
  readonly scenario: ScenarioId;
  readonly input: GoldenInput;
  readonly record: ReplayRecord;
  /** 틱 0..endTick 의 틱 해시. */
  readonly tickHashes: readonly string[];
  readonly outcome: "victory" | "defeat" | null;
  readonly finalGold: number;
  readonly finalBaseHp: number;
  /** 경제 원장 전체(이벤트 economySettled 에서 도출, 코어 ledger() 와 같음). */
  readonly ledger: readonly LedgerEntry[];
}

/** 골든 record.codeVersion 이 현재 ATTEMPT_CODE_VERSION 과 다름. 조용히 통과·자동 갱신하지 않는다. */
export class StaleGoldenError extends Error {
  constructor(scenario: string, goldenVersion: string) {
    super(`골든이 오래됨: ${scenario} 골든 codeVersion ${goldenVersion} ≠ 현재 ${ATTEMPT_CODE_VERSION}. 코드 버전 변경 사유를 확인한 뒤 \`npm run golden:update\` 로 갱신하세요.`);
    this.name = "StaleGoldenError";
  }
}

/** 같은 코드 버전에서 틱 해시·결과가 달라짐 = 회귀. */
export class GoldenMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoldenMismatchError";
  }
}

export const goldenFileUrl = (id: ScenarioId): URL => new URL(`./golden/${id}.json`, import.meta.url);
export const goldenFilePath = (id: ScenarioId): string => fileURLToPath(goldenFileUrl(id));

export interface Played {
  readonly record: ReplayRecord;
  readonly trace: ReplayTrace;
  readonly ledger: readonly LedgerEntry[];
}

/** 스크립트를 기록기로 실행한다(원 실행). commands 의 tick 은 completedTick + 1 일 때 접수한다. */
export function playScenario(sc: Scenario): Played {
  const rec = createRecordedAttempt(sc.bundle(), sc.stageId, sc.attemptId);
  const core = rec.core;
  for (let t = 1; t <= sc.maxTick; t += 1) {
    for (const c of sc.commands) {
      if (c.tick !== t) continue;
      const r = core.submit(c.kind, c.payload);
      if (!r.ok) throw new Error(`${sc.id}: 틱 ${t} 명령 접수 거부 (${r.reason}) — 스크립트가 결과 이후까지 이어짐`);
    }
    core.step();
    if (core.isResult() || (sc.endTick !== null && core.completedTick >= sc.endTick)) break;
  }
  if (sc.endTick === null && !core.isResult()) throw new Error(`${sc.id}: maxTick ${sc.maxTick} 까지 결과가 나지 않음`);
  if (sc.endTick !== null && core.completedTick !== sc.endTick) throw new Error(`${sc.id}: endTick ${sc.endTick} 에 도달하기 전에 끝남 (${core.completedTick})`);
  return { record: rec.finish(), trace: rec.trace(), ledger: core.ledger() };
}

export function ledgerFromTrace(trace: ReplayTrace): LedgerEntry[] {
  const out: LedgerEntry[] = [];
  for (const t of trace.ticks) {
    for (const e of t.events as Record<string, unknown>[]) {
      if (e.type === "economySettled") out.push({ tick: e.tick as number, eventSeq: e.eventSeq as number, key: e.key as string, delta: e.delta as number, goldAfter: e.goldAfter as number });
    }
  }
  return out;
}

function finalState(trace: ReplayTrace): { outcome: Golden["outcome"]; gold: number; baseHp: number } {
  const s = trace.ticks[trace.ticks.length - 1].state as { outcome: Golden["outcome"]; gold: number; baseHp: number };
  return { outcome: s.outcome, gold: s.gold, baseHp: s.baseHp };
}

export function inputOf(sc: Scenario): GoldenInput {
  return cloneCanonical(
    {
      contentHash: createAttempt(sc.bundle(), sc.stageId, sc.attemptId).contentHash,
      stageId: sc.stageId,
      attemptId: sc.attemptId,
      commands: sc.commands.map((c) => ({ tick: c.tick, kind: c.kind, payload: c.payload })),
      endPolicy: sc.endTick === null ? "result" : sc.endTick,
    },
    "input",
  ) as GoldenInput;
}

export function buildGolden(sc: Scenario): Golden {
  const played = playScenario(sc);
  const derived = ledgerFromTrace(played.trace);
  if (canonicalize(derived) !== canonicalize(played.ledger)) throw new Error(`${sc.id}: 이벤트에서 도출한 원장이 코어 ledger() 와 다름`);
  const f = finalState(played.trace);
  return cloneCanonical(
    {
      scenario: sc.id,
      input: inputOf(sc),
      record: played.record,
      tickHashes: played.trace.ticks.map((t) => t.hash),
      outcome: f.outcome,
      finalGold: f.gold,
      finalBaseHp: f.baseHp,
      ledger: played.ledger,
    },
    "golden",
  ) as Golden;
}

/** 정규 JSON, 최상위 키마다 한 줄(tickHashes 는 12개씩 줄바꿈)로 diff 가 읽히게 쓴다. JSON.parse 로 그대로 읽힌다. */
export function serializeGolden(g: Golden): string {
  const c = cloneCanonical(g, "golden") as unknown as Record<string, unknown>;
  const lines = Object.keys(c).map((k) => {
    if (k === "tickHashes") {
      const hashes = c[k] as string[];
      const rows: string[] = [];
      for (let i = 0; i < hashes.length; i += 12) rows.push("  " + hashes.slice(i, i + 12).map((h) => JSON.stringify(h)).join(","));
      return `${JSON.stringify(k)}: [\n${rows.join(",\n")}\n]`;
    }
    return `${JSON.stringify(k)}: ${JSON.stringify(c[k])}`;
  });
  return `{\n${lines.join(",\n")}\n}\n`;
}

function summarize(state: unknown): string {
  const s = state as { phase: string; gold: number; baseHp: number; enemies: unknown[]; towers: unknown[]; projectiles: unknown[]; waveIndex: number };
  return `phase ${s.phase}, wave ${s.waveIndex}, gold ${s.gold}, baseHp ${s.baseHp}, 적 ${s.enemies.length}, 타워 ${s.towers.length}, 투사체 ${s.projectiles.length}`;
}

export interface Verified {
  readonly trace: ReplayTrace;
  readonly second: ReplayTrace;
}

/**
 * 골든을 검증한다: (0) 코드 버전 (1) 새 코어 재생 후 틱 해시를 틱마다 비교(첫 불일치 틱·이벤트 type·상태 요약) (2) outcome·finalGold·finalBaseHp·ledger
 * (3) 새 코어로 한 번 더 실행해 trace 전체 동일 (4) 매 틱 불변식. 어느 하나라도 어긋나면 던진다.
 */
export function verifyGolden(golden: Golden, sc: Scenario): Verified {
  if (golden.record.codeVersion !== ATTEMPT_CODE_VERSION) throw new StaleGoldenError(golden.scenario, golden.record.codeVersion);
  const expectation = {
    formatVersion: REPLAY_FORMAT_VERSION,
    codeVersion: ATTEMPT_CODE_VERSION,
    contentHash: createAttempt(sc.bundle(), sc.stageId, sc.attemptId).contentHash,
  };
  const run = (): ReplayTrace => runReplay(golden.record, expectation, (r) => createAttempt(sc.bundle(), r.stageId, r.attemptId));
  const trace = run();

  if (trace.ticks.length !== golden.tickHashes.length) {
    throw new GoldenMismatchError(`${golden.scenario}: 틱 수 불일치 (골든 ${golden.tickHashes.length} / 실제 ${trace.ticks.length})`);
  }
  for (let i = 0; i < trace.ticks.length; i += 1) {
    const t = trace.ticks[i];
    if (t.hash !== golden.tickHashes[i]) {
      const types = (t.events as { type: string }[]).map((e) => e.type);
      throw new GoldenMismatchError(
        `${golden.scenario}: 첫 불일치 tick ${t.tick}: 해시 골든 ${golden.tickHashes[i]} / 실제 ${t.hash}\n  이벤트 [${types.join(", ")}]\n  상태 ${summarize(t.state)}`,
      );
    }
  }
  const f = finalState(trace);
  const ledger = ledgerFromTrace(trace);
  const wrong: string[] = [];
  if (f.outcome !== golden.outcome) wrong.push(`outcome 골든 ${String(golden.outcome)} / 실제 ${String(f.outcome)}`);
  if (f.gold !== golden.finalGold) wrong.push(`finalGold 골든 ${golden.finalGold} / 실제 ${f.gold}`);
  if (f.baseHp !== golden.finalBaseHp) wrong.push(`finalBaseHp 골든 ${golden.finalBaseHp} / 실제 ${f.baseHp}`);
  if (canonicalize(ledger) !== canonicalize(golden.ledger)) wrong.push(`ledger 불일치 (골든 ${golden.ledger.length}건 / 실제 ${ledger.length}건)`);
  if (wrong.length > 0) throw new GoldenMismatchError(`${golden.scenario}: ${wrong.join("; ")}`);

  const second = run();
  const m = firstMismatch(trace, second);
  if (m !== null) throw new GoldenMismatchError(`${golden.scenario}: 같은 기록을 새 코어로 두 번 실행한 결과가 다름 — ${m.message}`);

  const checker = new InvariantChecker(createAttempt(sc.bundle(), sc.stageId, sc.attemptId).stageContent);
  for (const t of trace.ticks) if (t.tick > 0) checker.check(t.tick, t.state, t.events);
  checker.finish(trace.ticks.length - 1, trace.ticks[trace.ticks.length - 1].state);
  return { trace, second };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const hasExactKeys = (o: Record<string, unknown>, keys: readonly string[]): boolean => {
  const own = Object.keys(o);
  return own.length === keys.length && keys.every((k) => own.includes(k));
};
const isSafeInt = (v: unknown, min: number): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= min;

/** 입력 정의의 정확한 형태(계약 15.2): 알 수 없는 필드·누락·잘못된 타입이 있으면 false. null·빈 객체·배열·문자열 등도 false. */
export function isValidGoldenInput(v: unknown): v is GoldenInput {
  if (!isRecord(v) || !hasExactKeys(v, ["attemptId", "commands", "contentHash", "endPolicy", "stageId"])) return false;
  if (typeof v.contentHash !== "string" || !/^[0-9a-f]{16}$/.test(v.contentHash)) return false;
  if (typeof v.stageId !== "string" || v.stageId.length === 0 || !isSafeInt(v.attemptId, 1)) return false;
  if (!(v.endPolicy === "result" || isSafeInt(v.endPolicy, 0))) return false;
  if (!Array.isArray(v.commands)) return false;
  return v.commands.every((c: unknown) => isRecord(c) && hasExactKeys(c, ["kind", "payload", "tick"]) && isSafeInt(c.tick, 1) && typeof c.kind === "string" && isRecord(c.payload));
}

/** 골든이 갱신 가드가 읽을 수 있는 최소 형태(시나리오 ID·record.codeVersion 문자열·tickHashes 배열)인지. */
function hasGoldenShape(v: unknown): v is Golden {
  return isRecord(v) && typeof v.scenario === "string" && isRecord(v.record) && typeof v.record.codeVersion === "string" && Array.isArray(v.tickHashes);
}

/**
 * 갱신 가드(15.2, 리뷰 SIM-03 F1·RR1-F1). 허용은 (1) 이전 골든 없음(최초 생성) (2) codeVersion 변경 (3) 같은 버전에서 입력 정의(input) 변경 뿐이다.
 * 같은 codeVersion·같은 input 인데 결과(record·tickHashes·outcome·finalGold·finalBaseHp·ledger)가 다르면 회귀이므로 거부한다.
 * 같은 codeVersion 의 이전 골든에 유효한 input 이 없으면(삭제·null·빈 객체·잘못된 타입·알 수 없는 필드) 거부한다 — 구형식 허용 분기는 없다.
 * endTick(결과 틱)·initialStateHash 는 결과 값이라 시나리오 변경 판정에 쓰지 않는다.
 * 한계: 골든 파일을 직접 편집해 codeVersion 을 낮추는 위조는 코드로 구분할 수 없다(커밋 diff 리뷰 몫).
 */
export function assertUpdateAllowed(previous: Golden | null, next: Golden): void {
  if (previous === null) return;
  if (!hasGoldenShape(previous)) throw new GoldenMismatchError(`${next.scenario}: 이전 골든 형식이 손상되어 갱신을 거부합니다(시나리오 ID·record.codeVersion·tickHashes 필요).`);
  if (previous.scenario !== next.scenario) throw new GoldenMismatchError(`${next.scenario}: 이전 골든의 시나리오 ID(${previous.scenario})가 다릅니다. 파일이 섞였을 수 있어 갱신을 거부합니다.`);
  if (!isValidGoldenInput(next.input)) throw new GoldenMismatchError(`${next.scenario}: 새 골든의 input 이 유효하지 않습니다.`);
  if (previous.record.codeVersion !== next.record.codeVersion) return;
  if (!isValidGoldenInput(previous.input)) {
    throw new GoldenMismatchError(
      `${next.scenario}: 같은 코드 버전(${next.record.codeVersion})의 이전 골든에 유효한 input 이 없어 입력 변경 여부를 판정할 수 없습니다. 같은 버전 회귀를 덮을 수 있으므로 갱신을 거부합니다.`,
    );
  }
  if (canonicalize(previous.input) !== canonicalize(next.input)) return;
  const { input: _a, scenario: _b, ...before } = previous;
  const { input: _c, scenario: _d, ...after } = next;
  void [_a, _b, _c, _d];
  if (canonicalize(before) !== canonicalize(after)) {
    throw new GoldenMismatchError(
      `${next.scenario}: 같은 코드 버전(${next.record.codeVersion})·같은 입력 정의에서 결과가 달라짐 = 회귀 (endTick ${previous.record.endTick} → ${next.record.endTick}). 골든 갱신으로 덮지 않습니다.`,
    );
  }
}

export interface GoldenIo {
  read(id: ScenarioId): Golden | null;
  write(id: ScenarioId, text: string): void;
}

/**
 * 원자적 갱신(15.2): 모든 시나리오의 골든 생성·가드 검사를 먼저 끝내고, 하나라도 거부되면 어떤 파일도 쓰지 않는다.
 * `build` 는 테스트가 후보 골든을 주입할 수 있게 열어 둔 것이다(기본 buildGolden).
 */
export function updateGoldens(scenarios: readonly Scenario[], io: GoldenIo, build: (sc: Scenario) => Golden = buildGolden): void {
  const planned = scenarios.map((sc) => {
    const next = build(sc);
    assertUpdateAllowed(io.read(sc.id), next);
    return { id: sc.id, text: serializeGolden(next) };
  });
  for (const p of planned) io.write(p.id, p.text);
}
