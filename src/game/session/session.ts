// 게임 세션 (UI-CONTRACT 1·4·5·6절): 시도 생성·재도전, 벽시계(주입된 elapsedMs) → step(), 명령 제출, UI 선택 상태, 거부 피드백, 진행 상태.
// 순수 TS(React·Phaser·DOM 금지). 게임 규칙은 코어가 유일한 진실 원천이며 세션은 코어 명령을 보내고 스냅샷·이벤트를 읽는다.
import type { Cell } from "../core/grid";
import { validateContent, validateStageForEntry } from "../core/content/validate";
import type { ContentValidation, StageContent, TowerType } from "../core/content/types";
import { createRecordedAttempt, type RecordedAttempt } from "../core/attempt/record";
import type { AttemptEvent } from "../core/attempt/types";
import type { TargetingMode } from "../core/sim/commands";
import { rejectText, STAGE_NAMES, STR } from "../ui/strings.ko";
import { hudView, type HudView } from "./hudView";
import { deriveStageCards, isEnterable, type ProgressStore, type StageCard } from "./progress";
import { EMPTY_UI, type Snapshot, type UiState } from "./types";

export const TICK_MS = 50;
export const MAX_TICKS_PER_ADVANCE = 5;
export const FEEDBACK_MS = 2000;
const EVENT_BUFFER_MAX = 500;

export interface ResultView {
  readonly outcome: "victory" | "defeat";
  readonly stageName: string;
  readonly reachedWave: number;
  readonly baseHp: number;
  readonly maxBaseHp: number;
  readonly hasNext: boolean;
  readonly nextEnabled: boolean;
}

export interface BattleState {
  readonly stageIndex: number;
  readonly attemptId: number;
  readonly hud: HudView;
  readonly ui: UiState;
  readonly feedback: string | null;
  readonly result: ResultView | null;
}

export interface SessionState {
  readonly version: number;
  readonly screen: "stageSelect" | "battle";
  readonly cards: readonly StageCard[];
  readonly battle: BattleState | null;
}

export type CommandOutcome = { readonly ok: true } | { readonly ok: false; readonly reason: "notBattle" | "paused" | "result" | "invalid" };

/** 렌더러가 매 프레임 읽는 값. alpha = 틱 사이 보간 비율(시각 전용). */
export interface RenderFrame {
  readonly stageIndex: number;
  readonly attemptId: number;
  readonly content: StageContent;
  readonly prev: Snapshot | null;
  readonly curr: Snapshot;
  readonly alpha: number;
  /** 시뮬레이션·VFX 가 진행 중(일시정지·결과·숨김이 아님). */
  readonly running: boolean;
  readonly ui: UiState;
}

export interface SessionOptions {
  readonly bundle: unknown;
  readonly store: ProgressStore;
}

interface Battle {
  readonly stageIndex: number;
  readonly rec: RecordedAttempt;
  prev: Snapshot | null;
  curr: Snapshot;
  ui: UiState;
  feedback: { text: string; until: number } | null;
  markedClear: boolean;
}

export class GameSession {
  private readonly bundle: unknown;
  private readonly store: ProgressStore;
  private readonly validation: ContentValidation;
  private readonly stageIds: (string | null)[];
  private readonly entryErrors = new Map<number, string[]>();
  private readonly listeners = new Set<() => void>();
  private battle: Battle | null = null;
  private version = 0;
  private cached: SessionState | null = null;
  private attemptCounter = 0;
  /** 50ms 누적. 일시정지·결과·숨김에서는 쌓지 않는다. */
  private acc = 0;
  /** UI 시계(피드백 만료용). 일시정지 중에도 흐르지만 숨김 중에는 멈춘다. */
  private uiClock = 0;
  private hidden = false;
  private events: AttemptEvent[] = [];

  constructor(options: SessionOptions) {
    this.bundle = options.bundle;
    this.store = options.store;
    this.validation = validateContent(options.bundle);
    this.stageIds = this.validation.stages.map((s) => s.stageId);
  }

  // ───────── 구독(useSyncExternalStore) ─────────

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private emit(): void {
    this.version += 1;
    this.cached = null;
    for (const l of [...this.listeners]) l();
  }

  /** 변경이 없으면 같은 객체를 돌려준다(useSyncExternalStore 요구). */
  getState = (): SessionState => {
    if (this.cached !== null) return this.cached;
    const cards = this.cards();
    const state: SessionState = { version: this.version, screen: this.battle === null ? "stageSelect" : "battle", cards, battle: this.battle === null ? null : this.battleState(this.battle, cards) };
    this.cached = state;
    return state;
  };

  private cards(): StageCard[] {
    return deriveStageCards(this.validation, this.stageIds, this.store.getCleared()).map((c) => {
      const entry = this.entryErrors.get(c.index);
      return entry === undefined ? c : { ...c, state: "contentError", diagnostics: entry };
    });
  }

  private battleState(b: Battle, cards: readonly StageCard[]): BattleState {
    const core = b.rec.core;
    const content = core.stageContent;
    const name = STAGE_NAMES[b.stageIndex] ?? content.stage.stageId;
    const hud = hudView(b.curr, content, b.ui, name);
    const feedback = b.feedback !== null && this.uiClock < b.feedback.until ? b.feedback.text : null;
    let result: ResultView | null = null;
    if (b.curr.outcome !== null) {
      const next = cards[b.stageIndex + 1];
      result = {
        outcome: b.curr.outcome,
        stageName: name,
        reachedWave: b.curr.waveIndex,
        baseHp: b.curr.baseHp,
        maxBaseHp: content.stage.baseHp,
        hasNext: next !== undefined,
        nextEnabled: next !== undefined && isEnterable(next),
      };
    }
    return { stageIndex: b.stageIndex, attemptId: b.curr.attemptId, hud, ui: b.ui, feedback, result };
  }

  // ───────── 화면 흐름 ─────────

  /** 스테이지 시작(진입 재검증 포함). 실패하면 시작하지 않고 카드를 콘텐츠 오류로 표시한다. */
  startStage(index: number): boolean {
    const card = this.cards()[index];
    if (card === undefined || !isEnterable(card) || card.stageId === null) return false;
    const entry = validateStageForEntry(this.bundle, card.stageId);
    if (!entry.ok) {
      this.entryErrors.set(index, entry.errors.map((e) => `${e.path}: ${e.message}`));
      this.battle = null;
      this.emit();
      return false;
    }
    this.attemptCounter += 1;
    const rec = createRecordedAttempt(this.bundle, card.stageId, this.attemptCounter);
    const curr = rec.core.snapshot() as unknown as Snapshot;
    this.battle = { stageIndex: index, rec, prev: null, curr, ui: EMPTY_UI, feedback: null, markedClear: false };
    this.acc = 0;
    this.events = [];
    this.emit();
    return true;
  }

  /** 재도전: 같은 스테이지, 새 attemptId, 이전 시도 상태를 넘기지 않는다. 클리어 플래그는 유지된다. */
  retry(): boolean {
    return this.battle === null ? false : this.startStage(this.battle.stageIndex);
  }

  toStageSelect(): void {
    this.battle = null;
    this.acc = 0;
    this.events = [];
    this.emit();
  }

  nextStage(): boolean {
    return this.battle === null ? false : this.startStage(this.battle.stageIndex + 1);
  }

  // ───────── 시간 ─────────

  /** 숨김(visibilitychange hidden) 동안은 누적하지 않고, 복귀 시 누적은 0부터 시작한다. 자동 일시정지는 하지 않는다. */
  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    this.acc = 0;
  }

  get isRunning(): boolean {
    const b = this.battle;
    return b !== null && !this.hidden && !b.rec.core.paused && !b.rec.core.isResult();
  }

  /**
   * 벽시계 연결(SIM-CONTRACT 2절): 누적 후 50ms 마다 step() 1회, 한 번에 최대 5틱. 한도에 걸리면 남은 누적을 버린다.
   * 일시정지·결과·숨김에서는 0틱. 반환값은 실행한 틱 수.
   */
  advance(elapsedMs: number): number {
    if (this.hidden || !Number.isFinite(elapsedMs) || elapsedMs < 0) return 0;
    const before = this.visibleFeedback();
    this.uiClock += elapsedMs;
    let changed = before !== this.visibleFeedback();
    let ticks = 0;
    const b = this.battle;
    if (b !== null && this.isRunning) {
      this.acc += elapsedMs;
      while (this.acc >= TICK_MS && ticks < MAX_TICKS_PER_ADVANCE && !b.rec.core.isResult()) {
        this.acc -= TICK_MS;
        this.stepOnce(b);
        ticks += 1;
      }
      if (this.acc >= TICK_MS) this.acc = 0; // 한 번에 따라잡을 수 있는 한도 초과분은 버린다
      if (b.rec.core.isResult()) this.acc = 0;
    }
    if (ticks > 0) changed = true;
    if (changed) this.emit();
    return ticks;
  }

  private visibleFeedback(): string | null {
    const f = this.battle?.feedback ?? null;
    return f !== null && this.uiClock < f.until ? f.text : null;
  }

  private stepOnce(b: Battle): void {
    const events = b.rec.core.step();
    b.prev = b.curr;
    b.curr = b.rec.core.snapshot() as unknown as Snapshot;
    for (const e of events) {
      if (e.type === "commandRejected") this.setFeedback(b, rejectText(String(e.reason)));
    }
    this.events.push(...events);
    if (this.events.length > EVENT_BUFFER_MAX) this.events.splice(0, this.events.length - EVENT_BUFFER_MAX);
    this.reconcileUi(b);
    if (b.curr.outcome === "victory" && !b.markedClear) {
      b.markedClear = true;
      const id = b.rec.core.stageContent.stage.stageId;
      this.store.markCleared(id);
    }
  }

  // ───────── 렌더 연결 ─────────

  getRenderFrame(): RenderFrame | null {
    const b = this.battle;
    if (b === null) return null;
    return { stageIndex: b.stageIndex, attemptId: b.curr.attemptId, content: b.rec.core.stageContent, prev: b.prev, curr: b.curr, alpha: Math.min(1, this.acc / TICK_MS), running: this.isRunning, ui: b.ui };
  }

  /** 렌더러가 VFX 용으로 이벤트를 가져간다(가져가면 비운다). */
  drainEvents(): AttemptEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  // ───────── 일시정지 ─────────

  pause(): void {
    const b = this.battle;
    if (b === null || b.rec.core.isResult() || b.rec.core.paused) return;
    b.rec.core.pause();
    this.refresh(b);
  }

  resume(): void {
    const b = this.battle;
    if (b === null || !b.rec.core.paused) return;
    b.rec.core.resume();
    this.refresh(b);
  }

  togglePause(): void {
    if (this.battle?.rec.core.paused) this.resume();
    else this.pause();
  }

  /** 코어 상태(paused)가 스냅샷에 들어 있으므로 다시 읽어 알린다. */
  private refresh(b: Battle): void {
    b.curr = b.rec.core.snapshot() as unknown as Snapshot;
    this.emit();
  }

  // ───────── 명령 ─────────

  private gate(): { b: Battle } | { fail: CommandOutcome } {
    const b = this.battle;
    if (b === null) return { fail: { ok: false, reason: "notBattle" } };
    if (b.rec.core.isResult()) return { fail: { ok: false, reason: "result" } };
    if (b.rec.core.paused) {
      this.setFeedback(b, STR.paused_blocked);
      this.emit();
      return { fail: { ok: false, reason: "paused" } };
    }
    return { b };
  }

  private send(kind: string, payload: unknown): CommandOutcome {
    const g = this.gate();
    if ("fail" in g) return g.fail;
    try {
      const r = g.b.rec.core.submit(kind, payload);
      if (!r.ok) return { ok: false, reason: r.reason === "paused" ? "paused" : "result" };
    } catch {
      this.setFeedback(g.b, rejectText("invalid"));
      this.emit();
      return { ok: false, reason: "invalid" };
    }
    return { ok: true };
  }

  build(type: TowerType, cell: Cell): CommandOutcome {
    return this.send("build", { towerType: type, tile: { col: cell.col, row: cell.row } });
  }
  upgrade(towerId: number): CommandOutcome {
    return this.send("upgrade", { towerId });
  }
  sell(towerId: number): CommandOutcome {
    return this.send("sell", { towerId });
  }
  setTargeting(towerId: number, mode: TargetingMode): CommandOutcome {
    return this.send("setTargeting", { towerId, mode });
  }
  startWave(): CommandOutcome {
    return this.send("startWave", {});
  }

  // ───────── UI 선택 상태 (코어 밖, UI-CONTRACT 6절) ─────────

  private setUi(b: Battle, ui: UiState): void {
    b.ui = ui;
    this.emit();
  }

  private setFeedback(b: Battle, text: string): void {
    b.feedback = { text, until: this.uiClock + FEEDBACK_MS };
  }

  /** HUD 타워 목록에서 종류 탭: 같은 항목을 다시 탭하면 해제. 선택·판매 확인은 해제된다. */
  togglePlaceMode(type: TowerType): void {
    const b = this.battle;
    if (b === null || b.rec.core.isResult()) return;
    if (b.rec.core.paused) {
      this.setFeedback(b, STR.paused_blocked);
      this.emit();
      return;
    }
    this.setUi(b, b.ui.placeType === type ? { ...EMPTY_UI } : { placeType: type, selectedTowerId: null, sellConfirmId: null });
  }

  /** Esc: 판매 확인 → 설치 모드 → 선택 순으로 한 단계 해제. */
  cancel(): void {
    const b = this.battle;
    if (b === null) return;
    if (b.ui.sellConfirmId !== null) this.setUi(b, { ...b.ui, sellConfirmId: null });
    else if (b.ui.placeType !== null) this.setUi(b, { ...b.ui, placeType: null });
    else if (b.ui.selectedTowerId !== null) this.setUi(b, { ...b.ui, selectedTowerId: null });
  }

  /**
   * 맵 탭(칸 또는 null=맵 밖). 설치 모드: 칸 → build 제출 후 설치 모드 종료(성공·실패 무관), 맵 밖 → 모드 해제.
   * 기본: 타워 있는 칸 → 선택, 빈 칸 → 선택 해제. 판매 확인 중에는 무시. 결과 단계에서는 무시.
   */
  tapCell(cell: Cell | null): void {
    const b = this.battle;
    if (b === null || b.rec.core.isResult()) return;
    if (b.ui.sellConfirmId !== null) return;
    if (b.ui.placeType !== null) {
      if (cell === null) return this.setUi(b, { ...b.ui, placeType: null });
      const out = this.build(b.ui.placeType, cell);
      if (out.ok) this.setUi(b, { ...b.ui, placeType: null });
      return;
    }
    const tower = cell === null ? undefined : b.curr.towers.find((t) => t.cell.col === cell.col && t.cell.row === cell.row);
    this.setUi(b, { ...b.ui, selectedTowerId: tower === undefined ? null : tower.towerId });
  }

  selectTower(towerId: number | null): void {
    const b = this.battle;
    if (b === null || b.rec.core.isResult()) return;
    this.setUi(b, { placeType: null, selectedTowerId: towerId, sellConfirmId: null });
  }

  /** 판매 확인창 열기: 준비 단계에서만(전투 중에는 안내 피드백). */
  requestSell(towerId: number): void {
    const b = this.battle;
    if (b === null || b.rec.core.isResult()) return;
    if (b.rec.core.paused) {
      this.setFeedback(b, STR.paused_blocked);
      return this.emit();
    }
    if (b.curr.phase !== "preparation") {
      this.setFeedback(b, STR.sellPrepOnly);
      return this.emit();
    }
    if (!b.curr.towers.some((t) => t.towerId === towerId)) return;
    this.setUi(b, { ...b.ui, selectedTowerId: towerId, sellConfirmId: towerId });
  }

  confirmSell(): void {
    const b = this.battle;
    if (b === null || b.ui.sellConfirmId === null) return;
    const id = b.ui.sellConfirmId;
    const out = this.sell(id);
    if (out.ok) this.setUi(b, { ...b.ui, sellConfirmId: null });
  }

  cancelSell(): void {
    const b = this.battle;
    if (b !== null && b.ui.sellConfirmId !== null) this.setUi(b, { ...b.ui, sellConfirmId: null });
  }

  /** 틱 뒤 UI 상태 정리: 사라진 타워 선택·판매 확인 해제, 준비→전투 전환 시 판매 확인 자동 취소, 결과 단계에서는 전부 해제. */
  private reconcileUi(b: Battle): void {
    let ui = b.ui;
    const exists = (id: number | null): boolean => id !== null && b.curr.towers.some((t) => t.towerId === id);
    if (ui.selectedTowerId !== null && !exists(ui.selectedTowerId)) ui = { ...ui, selectedTowerId: null };
    if (ui.sellConfirmId !== null && (!exists(ui.sellConfirmId) || b.curr.phase !== "preparation")) ui = { ...ui, sellConfirmId: null };
    if (b.curr.outcome !== null) ui = EMPTY_UI;
    b.ui = ui;
  }
}
