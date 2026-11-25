// SIM-03 — 기록 생성기 (SIM-CONTRACT 15.1). 시도 코어를 감싸 접수 성공(ok) 명령만 기록하고, 틱마다 trace 를 모은다.
// 제품 경로이므로 훅을 받지 않는다. 기록은 7.3절 ReplayRecord 이며 validateReplayRecord·runReplay 를 그대로 통과한다.
import { cloneCanonical } from "../sim/canonical";
import type { SubmitResult } from "../sim/commands";
import { SimStateError } from "../sim/errors";
import { fnv1a64, tickEnvelope } from "../sim/hash";
import { initialStateHashOf, type ReplayCommand, type ReplayRecord, type ReplayTrace, type TickTrace } from "../sim/replay";
import { ATTEMPT_CODE_VERSION, createAttempt, type AttemptCore } from "./attempt";
import type { AttemptEvent } from "./types";

export const REPLAY_FORMAT_VERSION = 1;

/** 기록기가 돌려주는 코어: `AttemptCore` 의 공개 면에서 접수·진행만 기록을 거치게 바꾼 것. */
export type RecordedCore = Pick<
  AttemptCore,
  "completedTick" | "phase" | "paused" | "attemptId" | "stageContent" | "contentHash" | "isResult" | "ledger" | "pause" | "resume" | "snapshot" | "submit" | "step"
>;

export interface RecordedAttempt {
  readonly core: RecordedCore;
  /** 지금까지의 기록(endTick = 현재 completedTick, applyTick ≤ endTick 명령만). 깊은 복사·동결. step() 실행 중 호출은 오류. */
  finish(): ReplayRecord;
  /** 원 실행의 틱 0..completedTick 상태·이벤트·해시(7.4절 비교 대상). */
  trace(): ReplayTrace;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

function makeTrace(tick: number, state: unknown, events: readonly unknown[]): TickTrace {
  const envelope = tickEnvelope(events, state);
  return { tick, state, events: cloneCanonical(events, "events"), envelope, hash: fnv1a64(envelope) };
}

/** 이미 만든 코어를 기록한다(테스트가 훅 달린 코어로 재진입을 시험할 때도 쓴다). 제품 코드는 createRecordedAttempt 를 쓴다. */
export function recordAttempt(core: AttemptCore): RecordedAttempt {
  if (core.completedTick !== 0) throw new SimStateError("기록은 completedTick 0 인 새 시도에서만 시작할 수 있음");
  const first = core.snapshot();
  const initialStateHash = initialStateHashOf(first);
  const ticks: TickTrace[] = [makeTrace(0, first, [])];
  const commands: ReplayCommand[] = [];
  let stepping = false;

  const recorded: RecordedCore = {
    get completedTick() {
      return core.completedTick;
    },
    get phase() {
      return core.phase;
    },
    get paused() {
      return core.paused;
    },
    get attemptId() {
      return core.attemptId;
    },
    get stageContent() {
      return core.stageContent;
    },
    get contentHash() {
      return core.contentHash;
    },
    isResult: () => core.isResult(),
    ledger: () => core.ledger(),
    pause: () => core.pause(),
    resume: () => core.resume(),
    snapshot: () => core.snapshot(),
    submit(kind: unknown, payload: unknown): SubmitResult {
      const result = core.submit(kind, payload);
      if (result.ok) {
        const c = result.command;
        commands.push({ applyTick: c.applyTick, seq: c.seq, kind: c.kind, payload: cloneCanonical(c.payload, "payload") });
      }
      return result;
    },
    step(): AttemptEvent[] {
      stepping = true;
      try {
        const events = core.step();
        ticks.push(makeTrace(core.completedTick, core.snapshot(), events));
        return events;
      } finally {
        stepping = false;
      }
    },
  };

  return {
    core: recorded,
    finish(): ReplayRecord {
      if (stepping) throw new SimStateError("step() 실행 중에는 finish() 불가");
      return deepFreeze({
        formatVersion: REPLAY_FORMAT_VERSION,
        codeVersion: ATTEMPT_CODE_VERSION,
        contentHash: core.contentHash,
        stageId: core.stageContent.stage.stageId,
        attemptId: core.attemptId,
        initialStateHash,
        endTick: core.completedTick,
        // 15.1 미적용 명령: applyTick ≤ completedTick 인 명령만 낸다. 아직 적용 전인 명령(접수 직후·일시정지 중·step 실패 후)은
        // 내부 목록과 코어 큐에 남겨 두었다가 그 틱이 실행된 뒤의 finish() 에 포함한다. finish() 는 step 도 endTick 증가도 하지 않는다.
        commands: commands
          .filter((c) => c.applyTick <= core.completedTick)
          .map((c) => ({ applyTick: c.applyTick, seq: c.seq, kind: c.kind, payload: cloneCanonical(c.payload, "payload") })),
      });
    },
    trace(): ReplayTrace {
      return { ticks: [...ticks] };
    },
  };
}

/** 시도를 만들고(진입 재검증 포함) 기록을 시작한다. 훅은 받지 않는다. */
export function createRecordedAttempt(bundle: unknown, stageId: string, attemptId: number): RecordedAttempt {
  return recordAttempt(createAttempt(bundle, stageId, attemptId));
}
