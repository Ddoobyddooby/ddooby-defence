// 게임 세션 (UI-CONTRACT 1·4·5·6절): 시도 생성·재도전, 벽시계(주입된 elapsedMs) → step(), 명령 제출, UI 선택 상태, 거부 피드백, 진행 상태.
// 순수 TS(React·Phaser·DOM 금지). 게임 규칙은 코어가 유일한 진실 원천이며 세션은 코어 명령을 보내고 스냅샷·이벤트를 읽는다.
import type { Cell } from "../core/grid";
import { validateContent, validateStageForEntry } from "../core/content/validate";
import type { ContentValidation, StageContent, TowerType } from "../core/content/types";
import { createRecordedAttempt, type RecordedAttempt } from "../core/attempt/record";
import type { AttemptEvent } from "../core/attempt/types";
import type { TargetingMode } from "../core/sim/commands";
import { rejectText, STAGE_NAMES, STR } from "../ui/strings.ko";
import { hudView, pendingKey, type HudView } from "./hudView";
import { deriveStageCards, isEnterable, type LoadStatus, type ProgressStore, type SaveStatus, type StageCard } from "./progress";
import { EMPTY_UI, SPEEDS, type Snapshot, type Speed, type UiState } from "./types";

export type { Speed };

export const TICK_MS = 50;
export const MAX_TICKS_PER_ADVANCE = 5;
/** 배속(UI-CONTRACT 5절, UI-02): 게임 누적에 elapsedMs × 배속을 더하고 한 번의 최대 틱도 같은 배수로 늘린다. */
export const FEEDBACK_MS = 2000;
const EVENT_BUFFER_MAX = 500;

export interface ResultView {
  readonly outcome: "victory" | "defeat";
  readonly stageName: string;
  readonly reachedWave: number;
  readonly waveTotal: number;
  readonly baseHp: number;
  readonly maxBaseHp: number;
  readonly hasNext: boolean;
  readonly nextEnabled: boolean;
  /** 승리 결과의 클리어 기록 저장 상태(패배는 기록을 건드리지 않으므로 null, UI-CONTRACT 10절). */
  readonly save: SaveStatus | null;
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
  /** 현재 배속(세션 설정: 재도전·스테이지 변경에도 유지, 새 세션은 1×). */
  readonly speed: Speed;
  /** 스테이지 선택 화면 저장 안내(UI-CONTRACT 10절): 읽기 실패로 새로 시작 / 저장소 사용 불가로 기록이 저장되지 않음. */
  readonly notice: "unreadable" | "unavailable" | null;
}

export type CommandOutcome = { readonly ok: true } | { readonly ok: false; readonly reason: "notBattle" | "paused" | "result" | "invalid" | "pending" };

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
  /** 제출했지만 아직 적용 틱이 오지 않은 명령 키(startWave·upgrade:id·sell:id). 다음 step 뒤에 비운다(명령은 항상 다음 틱에 적용). */
  pending: Set<string>;
}

/** 정보 창은 선택한 타워가 있을 때만 열려 있을 수 있다(타워가 사라지거나 선택이 해제되면 닫힘). */
function normalizeUi(ui: UiState): UiState {
  return ui.infoOpen && ui.selectedTowerId === null ? { ...ui, infoOpen: false } : ui;
}

export class GameSession {
  private readonly bundle: unknown;
  private readonly store: ProgressStore;
  private readonly loadStatus: LoadStatus;
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
  private speed: Speed = 1;
  /** 숨김에서 복귀한 직후 첫 advance 입력(숨김·정지 시간이 섞였을 수 있음)은 버리고 기준만 다시 잡는다(UI-CONTRACT 5절, 리뷰 F1). */
  private skipNextAdvance = false;
  private events: AttemptEvent[] = [];

  constructor(options: SessionOptions) {
    this.bundle = options.bundle;
    this.store = options.store;
    this.loadStatus = options.store.load();
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
    const notice = this.loadStatus === "unreadable" || this.loadStatus === "unavailable" ? this.loadStatus : null;
    const state: SessionState = { version: this.version, screen: this.battle === null ? "stageSelect" : "battle", cards, battle: this.battle === null ? null : this.battleState(this.battle, cards), speed: this.speed, notice };
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
    const hud = hudView(b.curr, content, b.ui, name, b.pending, this.speed);
    const feedback = b.feedback !== null && this.uiClock < b.feedback.until ? b.feedback.text : null;
    let result: ResultView | null = null;
    if (b.curr.outcome !== null) {
      const next = cards[b.stageIndex + 1];
      result = {
        outcome: b.curr.outcome,
        stageName: name,
        reachedWave: b.curr.waveIndex,
        waveTotal: content.stage.waves.length,
        baseHp: b.curr.baseHp,
        maxBaseHp: content.stage.baseHp,
        hasNext: next !== undefined,
        nextEnabled: next !== undefined && isEnterable(next),
        save: b.curr.outcome === "victory" ? this.store.getSaveStatus() : null,
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
    this.battle = { stageIndex: index, rec, prev: null, curr, ui: EMPTY_UI, feedback: null, markedClear: false, pending: new Set() };
    this.acc = 0;
    this.events = [];
    this.speed = 1; // 새 시도(새 스테이지·재도전·다음 스테이지)는 1×로 시작(QA-01 L2, 사용자 결정 2026-11-27)
    this.emit();
    return true;
  }

  /** 재도전: 같은 스테이지, 새 attemptId, 이전 시도 상태를 넘기지 않는다. 클리어 플래그는 유지되고 배속은 1×로 돌아간다. */
  retry(): boolean {
    return this.battle === null ? false : this.startStage(this.battle.stageIndex);
  }

  /** 저장 실패 뒤 `다시 저장`(UI-CONTRACT 10절). 메모리의 전체 클리어 기록을 다시 쓴다. */
  retrySave(): void {
    this.store.retrySave();
    this.emit();
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

  /**
   * 숨김(visibilitychange hidden) 동안은 누적하지 않고, 복귀 시 누적은 0부터 시작한다.
   * 숨겨질 때 진행 중 시도(준비·전투, 아직 일시정지 아님)는 자동 일시정지한다(UI-CONTRACT 5절, MOB-02). 결과 단계는 코어가 pause 를 오류로 보므로 건드리지 않는다.
   */
  setHidden(hidden: boolean): void {
    if (!hidden && this.hidden) this.skipNextAdvance = true;
    this.hidden = hidden;
    this.acc = 0;
    if (hidden) this.pause();
  }

  /** 배속 지정(1·2·5 외에는 무시). 일시정지·결과 중에도 바꿀 수 있다(시간이 흐르지 않을 뿐). 누적(acc)은 게임 시간이라 그대로 둔다. */
  setSpeed(speed: Speed): void {
    if (!SPEEDS.includes(speed) || speed === this.speed) return;
    this.speed = speed;
    this.emit();
  }
  /** 1×→2×→5×→1× 순환. */
  cycleSpeed(): void {
    this.setSpeed(SPEEDS[(SPEEDS.indexOf(this.speed) + 1) % SPEEDS.length]);
  }
  getSpeed(): Speed {
    return this.speed;
  }

  get isRunning(): boolean {
    const b = this.battle;
    return b !== null && !this.hidden && !b.rec.core.paused && !b.rec.core.isResult();
  }

  /**
   * 벽시계 연결(SIM-CONTRACT 2절): 누적(실제 시간 × 배속) 후 50ms 마다 step() 1회, 한 번에 최대 5 × 배속 틱. 한도에 걸리면 남은 누적을 버린다.
   * UI 시계(피드백 만료)는 실제 시간 그대로.
   * 일시정지·결과·숨김에서는 0틱. 반환값은 실행한 틱 수.
   */
  advance(elapsedMs: number): number {
    if (this.hidden || !Number.isFinite(elapsedMs) || elapsedMs < 0) return 0;
    if (this.skipNextAdvance) {
      this.skipNextAdvance = false;
      return 0;
    }
    const before = this.visibleFeedback();
    this.uiClock += elapsedMs;
    let changed = before !== this.visibleFeedback();
    let ticks = 0;
    const b = this.battle;
    if (b !== null && this.isRunning) {
      this.acc += elapsedMs * this.speed;
      const maxTicks = MAX_TICKS_PER_ADVANCE * this.speed;
      while (this.acc >= TICK_MS && ticks < maxTicks && !b.rec.core.isResult()) {
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
    b.pending.clear();
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

  /** 일시정지 = 메뉴 열림(UI-CONTRACT 7절). 메뉴가 판매 확인창·정보 창과 겹치지 않게 둘 다 닫는다. 결과 단계에서는 하지 않는다(코어 오류). */
  pause(): void {
    const b = this.battle;
    if (b === null || b.rec.core.isResult() || b.rec.core.paused) return;
    b.rec.core.pause();
    b.ui = { ...b.ui, sellConfirmId: null, infoOpen: false }; // 메뉴가 열리면 정보 창도 닫는다(재개해도 다시 열지 않음, 선택은 유지)
    this.refresh(b);
  }

  /** 재개 = 메뉴 닫기. 메뉴 안 확인창(스테이지 선택)은 닫는다. */
  resume(): void {
    const b = this.battle;
    if (b === null || !b.rec.core.paused) return;
    b.rec.core.resume();
    b.ui = { ...b.ui, leaveConfirm: false };
    this.refresh(b);
  }

  togglePause(): void {
    if (this.battle?.rec.core.paused) this.resume();
    else this.pause();
  }

  /** `⚙` 메뉴 열기/닫기(= 일시정지/재개). 결과 단계에서는 열 수 없다. */
  openMenu(): void {
    this.pause();
  }
  closeMenu(): void {
    this.resume();
  }

  /** 메뉴의 `스테이지 선택`: 확인창을 연다(메뉴가 열려 있을 때만). */
  requestLeave(): void {
    const b = this.battle;
    if (b === null || !b.rec.core.paused || b.rec.core.isResult()) return;
    this.setUi(b, { ...b.ui, leaveConfirm: true });
  }
  cancelLeave(): void {
    const b = this.battle;
    if (b !== null && b.ui.leaveConfirm) this.setUi(b, { ...b.ui, leaveConfirm: false });
  }
  /** 확인 1회 뒤 현재 시도를 버리고 스테이지 선택으로(클리어 플래그는 그대로). */
  confirmLeave(): void {
    const b = this.battle;
    if (b !== null && b.ui.leaveConfirm) this.toStageSelect();
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

  private send(kind: string, payload: unknown, pendingKeyOf: string | null = null): CommandOutcome {
    const g = this.gate();
    if ("fail" in g) return g.fail;
    // 같은 명령이 아직 적용 전이면 다시 보내지 않는다(이중 제출·두 번째 거부 문구 방지, 리뷰 F6). 최종 판정은 항상 코어.
    if (pendingKeyOf !== null && g.b.pending.has(pendingKeyOf)) return { ok: false, reason: "pending" };
    try {
      const r = g.b.rec.core.submit(kind, payload);
      if (!r.ok) return { ok: false, reason: r.reason === "paused" ? "paused" : "result" };
      if (pendingKeyOf !== null) {
        g.b.pending.add(pendingKeyOf);
        this.emit();
      }
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
    return this.send("upgrade", { towerId }, pendingKey.upgrade(towerId));
  }
  sell(towerId: number): CommandOutcome {
    return this.send("sell", { towerId }, pendingKey.sell(towerId));
  }
  setTargeting(towerId: number, mode: TargetingMode): CommandOutcome {
    return this.send("setTargeting", { towerId, mode });
  }
  startWave(): CommandOutcome {
    return this.send("startWave", {}, pendingKey.startWave);
  }

  // ───────── UI 선택 상태 (코어 밖, UI-CONTRACT 6절) ─────────

  private setUi(b: Battle, ui: UiState): void {
    b.ui = normalizeUi(ui);
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
    this.setUi(b, b.ui.placeType === type ? { ...EMPTY_UI } : { ...EMPTY_UI, placeType: type });
  }

  /**
   * Android 뒤로가기(UI-CONTRACT 8.1절). 우선순위: 판매 확인 취소 → 정보 창 닫기 → 메뉴 닫고 재개(메뉴 안 확인창이 있으면 그것부터 닫음)
   * → 전투 화면이면 메뉴 열기 → 결과면 스테이지 선택 → 스테이지 선택 화면이면 "exit"(앱 종료는 호출한 쪽이 한다).
   */
  handleBack(): "handled" | "exit" {
    const b = this.battle;
    if (b === null) return "exit";
    if (b.rec.core.isResult()) {
      this.toStageSelect();
      return "handled";
    }
    // 보이는 최상위부터: 판매 확인 → (메뉴 열림이면) 스테이지 선택 확인창 → 메뉴 닫고 재개 → 정보 창 → 메뉴 열기.
    if (b.ui.sellConfirmId !== null) this.setUi(b, { ...b.ui, sellConfirmId: null });
    else if (b.rec.core.paused) {
      if (b.ui.leaveConfirm) this.setUi(b, { ...b.ui, leaveConfirm: false });
      else this.resume();
    } else if (b.ui.infoOpen) this.setUi(b, { ...b.ui, infoOpen: false });
    else this.pause();
    return "handled";
  }

  /**
   * Esc: 뒤로가기와 같은 순서이되, 메뉴·판매 확인·정보 창이 없을 때는 기존대로 설치 모드 → 선택 해제가 먼저다.
   * 스테이지 선택 화면의 "exit" 는 웹에서는 아무 일도 하지 않는다.
   */
  cancel(): void {
    const b = this.battle;
    if (b !== null && !b.rec.core.isResult() && !b.rec.core.paused && b.ui.sellConfirmId === null && !b.ui.infoOpen) {
      if (b.ui.placeType !== null) return this.setUi(b, { ...b.ui, placeType: null });
      if (b.ui.selectedTowerId !== null) return this.setUi(b, { ...b.ui, selectedTowerId: null });
    }
    this.handleBack();
  }

  /** 타워 정보 창 열기(일시정지 없음). 선택한 타워가 있고 메뉴·결과가 아닐 때만. */
  openInfo(): void {
    const b = this.battle;
    if (b === null || b.rec.core.isResult() || b.rec.core.paused || b.ui.selectedTowerId === null) return;
    this.setUi(b, { ...b.ui, infoOpen: true });
  }
  closeInfo(): void {
    const b = this.battle;
    if (b !== null && b.ui.infoOpen) this.setUi(b, { ...b.ui, infoOpen: false });
  }

  /**
   * 맵 탭(칸 또는 null=맵 밖). 설치 모드: 칸 → build 제출 후 설치 모드 종료(성공·실패 무관), 맵 밖 → 모드 해제.
   * 기본: 타워 있는 칸 → 선택, 빈 칸 → 선택 해제. 판매 확인 중에는 무시. 결과 단계에서는 무시.
   */
  tapCell(cell: Cell | null): void {
    const b = this.battle;
    if (b === null || b.rec.core.isResult()) return;
    if (b.ui.sellConfirmId !== null || b.ui.infoOpen) return; // 판매 확인·정보 창이 열린 동안 맵 입력 무시
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
    this.setUi(b, { ...EMPTY_UI, selectedTowerId: towerId });
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
    b.ui = normalizeUi(ui);
  }
}
