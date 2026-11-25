// TEST_ONLY — 골든 회귀 지원 (SIM-CONTRACT 15.2). 골든 생성·직렬화·검증과 갱신 가드.
import { fileURLToPath } from "node:url";
import { canonicalize, cloneCanonical } from "../../sim/canonical";
import { firstMismatch, runReplay, type ReplayRecord, type ReplayTrace } from "../../sim/replay";
import { ATTEMPT_CODE_VERSION, createAttempt } from "../attempt";
import { REPLAY_FORMAT_VERSION, createRecordedAttempt } from "../record";
import type { LedgerEntry } from "../types";
import { InvariantChecker } from "../testing/invariants";
import type { Scenario, ScenarioId } from "./scenarios";

export interface Golden {
  readonly scenario: ScenarioId;
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

export function buildGolden(sc: Scenario): Golden {
  const played = playScenario(sc);
  const derived = ledgerFromTrace(played.trace);
  if (canonicalize(derived) !== canonicalize(played.ledger)) throw new Error(`${sc.id}: 이벤트에서 도출한 원장이 코어 ledger() 와 다름`);
  const f = finalState(played.trace);
  return cloneCanonical(
    {
      scenario: sc.id,
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

/**
 * 갱신 가드: 같은 코드 버전에서 같은 시나리오(record 동일)인데 틱 해시가 달라졌다면 코어 회귀이므로 덮어쓰지 않는다.
 * 코드 버전이 오르거나 시나리오(record)가 바뀐 경우에만 갱신을 허용한다.
 */
export function assertUpdateAllowed(previous: Golden | null, next: Golden): void {
  if (previous === null) return;
  if (previous.record.codeVersion !== next.record.codeVersion) return;
  if (canonicalize(previous.record) !== canonicalize(next.record)) return;
  if (canonicalize(previous.tickHashes) !== canonicalize(next.tickHashes)) {
    throw new GoldenMismatchError(`${next.scenario}: 같은 코드 버전(${next.record.codeVersion})·같은 시나리오에서 틱 해시가 달라짐 = 회귀. 골든 갱신으로 덮지 않습니다.`);
  }
}
