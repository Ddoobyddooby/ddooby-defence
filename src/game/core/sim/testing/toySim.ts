// TEST_ONLY — 제품 코드에서 import 금지. TECH-02 결정성 증거를 위한 장난감 시뮬레이션.
// 준비 단계만 구현한다: build / sell / setTargeting / startWave, 골드·타워·경제 원장·소비 키, 준비 타이머.
// 전투(타깃·투사체·둔화)·맵·UI는 없다. 수치는 모두 테스트용이며 밸런스 후보가 아니다.
// 8단계 중 해당 단계만 실행: 1 명령 → 5 정산(스크립트된 경제 이벤트) → 7·8 결과·전환·정리.
import { cloneCanonical, sortByNumber, sortCodeUnit } from "../canonical";
import { drainCommands, submitCommand, type Command, type SubmitResult, type TargetingMode } from "../commands";
import { SimStateError } from "../errors";
import { EVENT_TYPE, REJECT_REASON, type EventType, type RejectReason } from "../events";
import { refundFor } from "../formulas";
import { createIdCounters, takeId, type IdCounters } from "../ids";
import { addSafe, assertSafeInteger } from "../intmath";
import { durationMsToTicks } from "../time";
import { isInsideGrid } from "../../grid";

export const TOY_CODE_VERSION = "toy-sim-v1";

export interface ToySettlement {
  readonly tick: number;
  /** 정산이 속한 시도. 현재 시도와 다르면 유입 차단(무시). */
  readonly attemptId: number;
  /** 시도 로컬 키(`kill:e1`, `waveClear:w1` 등). */
  readonly key: string;
  readonly delta: number;
}

export interface ToyContent {
  readonly contentVersion: string;
  readonly initialGold: number;
  readonly buildCost: number;
  readonly refundRateBp: number;
  readonly prepMs: number;
  readonly script?: {
    /** 이 틱 8단계에서 결과(승리)가 확정된다. */
    readonly resultAtTick?: number;
    /** 이 틱 8단계에서 전투 → 준비로 진입한다(진입 틱은 준비 카운트를 소비하지 않음). */
    readonly reenterPrepAtTick?: number;
    readonly settlements?: readonly ToySettlement[];
  };
}

export interface ToyOptions {
  /** "reversed"면 타워·소비 키·큐를 역순으로 저장해 정규화가 저장 순서에 의존하지 않음을 시험한다. */
  readonly storageOrder?: "natural" | "reversed";
  /** 카운터 한계(Q12) 시험용으로 다음 ID·seq·eventSeq 시작값을 덮어쓴다. */
  readonly initialCounters?: Partial<IdCounters>;
}

export type ToyPhase = "prep" | "combat" | "result";

export type ToyEvent = Readonly<Record<string, unknown>> & {
  readonly eventSeq: number;
  readonly tick: number;
  readonly type: EventType;
};

interface Tower {
  id: number;
  tile: { col: number; row: number };
  actuallyPaid: number;
  targeting: TargetingMode;
}

export interface LedgerEntry {
  readonly tick: number;
  readonly eventSeq: number;
  readonly key: string;
  readonly delta: number;
  readonly goldAfter: number;
}

interface ToyState {
  attemptId: number;
  stageId: string;
  tick: number;
  phase: ToyPhase;
  paused: boolean;
  outcome: string | null;
  prepTicksRemaining: number;
  waveStartTick: number | null;
  gold: number;
  counters: IdCounters;
  towers: Tower[];
  queue: Command[];
  consumed: string[];
  ledger: LedgerEntry[];
}

function validateContent(content: ToyContent): number {
  assertSafeInteger(content.initialGold, "initialGold");
  assertSafeInteger(content.buildCost, "buildCost");
  assertSafeInteger(content.refundRateBp, "refundRateBp");
  if (content.initialGold < 0 || content.buildCost < 0) throw new RangeError("골드·비용은 0 이상");
  if (content.refundRateBp < 0 || content.refundRateBp > 10000) throw new RangeError("refundRateBp: 0..10000");
  return durationMsToTicks(content.prepMs, "prepMs");
}

export class ToySim {
  private s: ToyState;
  private stepping = false;
  private readonly content: ToyContent;
  private readonly prepTicks: number;
  private readonly reversed: boolean;

  constructor(content: ToyContent, stageId: string, attemptId: number, options: ToyOptions = {}) {
    this.prepTicks = validateContent(content);
    assertSafeInteger(attemptId, "attemptId");
    if (attemptId < 1) throw new RangeError(`attemptId: 1 이상이어야 함 (${attemptId})`);
    this.content = content;
    this.reversed = options.storageOrder === "reversed";
    this.s = {
      attemptId,
      stageId,
      tick: 0,
      phase: "prep",
      paused: false,
      outcome: null,
      prepTicksRemaining: this.prepTicks,
      waveStartTick: null,
      gold: content.initialGold,
      counters: { ...createIdCounters(), ...options.initialCounters },
      towers: [],
      queue: [],
      consumed: [],
      ledger: [],
    };
  }

  get completedTick(): number {
    return this.s.tick;
  }
  get phase(): ToyPhase {
    return this.s.phase;
  }
  get paused(): boolean {
    return this.s.paused;
  }
  isResult(): boolean {
    return this.s.phase === "result";
  }
  /** 경제 원장(추가 전용). 상태 해시에는 들어가지 않고 각 틱 이벤트로 비교한다. */
  ledger(): readonly LedgerEntry[] {
    return this.s.ledger.map((e) => ({ ...e }));
  }

  pause(): void {
    this.s.paused = true;
  }
  resume(): void {
    this.s.paused = false;
  }

  submit(kind: unknown, payload: unknown): SubmitResult {
    const result = submitCommand(this.s.queue, this.s.counters, kind, payload, {
      completedTick: this.s.tick,
      phase: this.s.phase,
      paused: this.s.paused,
      stepping: this.stepping,
    });
    if (result.ok && this.reversed) this.s.queue.reverse();
    return result;
  }

  /** 스냅샷 `tick`(=completedTick) 시점의 정규 검증을 거친 상태 사본. */
  snapshot(): Record<string, unknown> {
    const s = this.s;
    return cloneCanonical(
      {
        attemptId: s.attemptId,
        consumedEconomyEvents: sortCodeUnit(s.consumed),
        counters: { ...s.counters },
        gold: s.gold,
        outcome: s.outcome,
        paused: s.paused,
        phase: s.phase,
        prepTicksRemaining: s.prepTicksRemaining,
        queue: sortByNumber(s.queue, (c) => c.seq).map((c) => ({
          applyTick: c.applyTick,
          kind: c.kind,
          payload: c.payload,
          seq: c.seq,
        })),
        stageId: s.stageId,
        tick: s.tick,
        towers: sortByNumber(s.towers, (t) => t.id).map((t) => ({
          actuallyPaid: t.actuallyPaid,
          id: t.id,
          targeting: t.targeting,
          tile: { col: t.tile.col, row: t.tile.row },
        })),
        waveStartTick: s.waveStartTick,
      },
      "state",
    );
  }

  /** 틱 T = completedTick + 1을 실행하고 그 틱의 이벤트를 돌려준다. 오류 시 상태는 변하지 않는다. */
  step(): ToyEvent[] {
    if (this.stepping) throw new SimStateError("step()은 재진입할 수 없음");
    if (this.s.phase === "result") throw new SimStateError("결과 단계에서는 step() 불가");
    if (this.s.paused) throw new SimStateError("일시정지 중에는 step() 불가");
    this.stepping = true;
    try {
      const w = structuredClone(this.s);
      const T = addSafe(w.tick, 1);
      const out: ToyEvent[] = [];

      // 1단계: 명령 — seq 숫자순, 앞 명령까지 반영된 상태로 순차 재검증.
      for (const c of drainCommands(w.queue, T)) this.applyCommand(w, c, T, out);

      // 5단계: 정산 — 스크립트된 외부 경제 이벤트(kill/waveClear 모사). 이미 정산된 키·다른 시도는 무시.
      for (const st of this.content.script?.settlements ?? []) {
        if (st.tick !== T || st.attemptId !== w.attemptId) continue;
        this.settle(w, out, T, EVENT_TYPE.economySettled, st.key, st.delta, {});
      }

      // 8단계: 정리 — 준비 타이머, 전투→준비 진입, 결과 전환.
      if (w.phase === "prep") {
        w.prepTicksRemaining = addSafe(w.prepTicksRemaining, -1);
        if (w.prepTicksRemaining === 0) {
          w.phase = "combat";
          w.waveStartTick = addSafe(T, 1);
          this.emit(w, out, T, EVENT_TYPE.waveStarted, { trigger: "timer", waveStartTick: w.waveStartTick });
        }
      } else if (w.phase === "combat" && this.content.script?.reenterPrepAtTick === T) {
        w.phase = "prep";
        w.prepTicksRemaining = this.prepTicks;
        w.waveStartTick = null;
        this.emit(w, out, T, EVENT_TYPE.prepEntered, { prepTicks: this.prepTicks });
      }
      if (this.content.script?.resultAtTick === T) {
        w.phase = "result";
        w.outcome = "victory";
        this.emit(w, out, T, EVENT_TYPE.resultReached, { outcome: "victory" });
      }

      w.tick = T;
      const events = cloneCanonical(out, "events");
      this.s = w;
      return events;
    } finally {
      this.stepping = false;
    }
  }

  private emit(w: ToyState, out: ToyEvent[], T: number, type: EventType, fields: Record<string, unknown>): number {
    const eventSeq = takeId(w.counters, "event");
    out.push({ ...fields, eventSeq, tick: T, type });
    return eventSeq;
  }

  /** 경제 정산: 키가 이미 소비됐으면 아무것도 하지 않는다(정확히 한 번). 출력 키에는 `a{attemptId}:` 접두어. */
  private settle(
    w: ToyState,
    out: ToyEvent[],
    T: number,
    type: EventType,
    localKey: string,
    delta: number,
    fields: Record<string, unknown>,
  ): boolean {
    if (w.consumed.includes(localKey)) return false;
    const goldAfter = addSafe(w.gold, delta);
    if (goldAfter < 0) throw new RangeError(`정산 후 골드가 음수 (${goldAfter})`);
    const key = `a${w.attemptId}:${localKey}`;
    const eventSeq = this.emit(w, out, T, type, { ...fields, delta, goldAfter, key });
    w.gold = goldAfter;
    if (this.reversed) w.consumed.unshift(localKey);
    else w.consumed.push(localKey);
    w.ledger.push({ tick: T, eventSeq, key, delta, goldAfter });
    return true;
  }

  private applyCommand(w: ToyState, c: Command, T: number, out: ToyEvent[]): void {
    const reject = (reason: RejectReason): void => {
      this.emit(w, out, T, EVENT_TYPE.commandRejected, { kind: c.kind, reason, seq: c.seq });
    };
    switch (c.kind) {
      case "startWave": {
        if (w.phase !== "prep") return reject(REJECT_REASON.wrongPhase);
        w.phase = "combat";
        w.prepTicksRemaining = 0;
        w.waveStartTick = T;
        this.emit(w, out, T, EVENT_TYPE.waveStarted, { seq: c.seq, trigger: "command", waveStartTick: T });
        return;
      }
      case "build": {
        const { tile } = c.payload;
        if (!isInsideGrid(tile)) return reject(REJECT_REASON.outOfGrid);
        if (w.towers.some((t) => t.tile.col === tile.col && t.tile.row === tile.row)) {
          return reject(REJECT_REASON.occupied);
        }
        const cost = this.content.buildCost;
        if (w.gold < cost) return reject(REJECT_REASON.insufficientGold);
        const towerId = takeId(w.counters, "tower");
        const ok = this.settle(w, out, T, EVENT_TYPE.towerBuilt, `build:c${c.seq}`, -cost, {
          seq: c.seq,
          towerId,
          tile: { col: tile.col, row: tile.row },
        });
        if (!ok) throw new SimStateError(`build:c${c.seq} 중복 정산(불변식 위반)`);
        const tower: Tower = { id: towerId, tile: { col: tile.col, row: tile.row }, actuallyPaid: cost, targeting: "first" };
        if (this.reversed) w.towers.unshift(tower);
        else w.towers.push(tower);
        return;
      }
      case "sell": {
        if (w.phase !== "prep") return reject(REJECT_REASON.wrongPhase);
        const index = w.towers.findIndex((t) => t.id === c.payload.towerId);
        if (index < 0) return reject(REJECT_REASON.towerNotFound);
        const tower = w.towers[index];
        const localKey = `sell:t${tower.id}`;
        if (w.consumed.includes(localKey)) return reject(REJECT_REASON.alreadySettled);
        const refund = refundFor(tower.actuallyPaid, this.content.refundRateBp);
        this.settle(w, out, T, EVENT_TYPE.towerSold, localKey, refund, { seq: c.seq, towerId: tower.id });
        w.towers.splice(index, 1);
        return;
      }
      case "setTargeting": {
        const tower = w.towers.find((t) => t.id === c.payload.towerId);
        if (!tower) return reject(REJECT_REASON.towerNotFound);
        tower.targeting = c.payload.mode;
        this.emit(w, out, T, EVENT_TYPE.targetingChanged, { mode: c.payload.mode, seq: c.seq, towerId: tower.id });
        return;
      }
      case "upgrade":
        return reject(REJECT_REASON.unsupportedKind);
    }
  }
}
