"use client";

import type { TargetingMode } from "../core/sim/commands";
import { menuView, type HudView, type TowerDetail } from "../session/hudView";
import type { BattleState } from "../session/session";
import type { GameSession } from "../session/session";
import { STR, TARGETING_NAMES } from "./strings.ko";

const BTN = "min-h-10 min-w-24 rounded border px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40";
// 정보 창·작은 버튼용(오버레이 버튼의 min-w-24 는 4열 타깃 버튼이 넘치게 한다). 터치 영역은 최소 40×40 유지.
const SMALL_BTN = "min-h-10 min-w-10 rounded border px-1 text-xs font-medium leading-tight disabled:cursor-not-allowed disabled:opacity-40";
const BACKDROP = "absolute inset-0 z-10 touch-manipulation flex items-center justify-center bg-black/55 p-3";
// 결과 패널은 저장 실패 안내(2줄+버튼)까지 640×320 안에 들어가도록 여백을 줄인다.
const RESULT_PANEL = "w-full max-w-xs rounded-lg border border-neutral-600 bg-neutral-900 p-3 text-center text-neutral-100 shadow-xl";
const PANEL = "w-full max-w-xs rounded-lg border border-neutral-600 bg-neutral-900 p-4 text-center text-neutral-100 shadow-xl";

/** 맵 영역 위에 얹는 거부 피드백(2초). 맵 입력을 막지 않는다. */
export function FeedbackToast({ text }: { text: string | null }) {
  if (text === null) return null;
  return (
    <div className="pointer-events-none absolute left-1/2 top-2 z-20 -translate-x-1/2 rounded bg-red-900/90 px-3 py-1 text-sm text-red-50 shadow" role="status" data-testid="feedback">
      {text}
    </div>
  );
}

/** ⚙ 메뉴(일시정지 화면 겸용, UI-CONTRACT 7절): 스테이지 이름·임시 수치 배지·단계·전투 중 생성 진행·생존 적 수 + `계속하기`·`스테이지 선택`(확인 1회). */
export function MenuOverlay({ session, hud }: { session: GameSession; hud: HudView }) {
  const m = menuView(hud);
  return (
    <div className={BACKDROP} data-testid="menu-overlay">
      <div className={PANEL}>
        {hud.leaveConfirm ? (
          <div data-testid="leave-confirm">
            <h2 className="text-lg font-bold">{STR.menu.leaveTitle}</h2>
            <p className="mt-1 text-sm text-neutral-300">{STR.menu.leaveBody}</p>
            <div className="mt-3 flex justify-center gap-2">
              <button type="button" className={`${BTN} border-neutral-500 bg-neutral-800 hover:bg-neutral-700`} onClick={() => session.cancelLeave()} data-testid="leave-cancel">
                {STR.hud.cancel}
              </button>
              <button type="button" className={`${BTN} border-red-500 bg-red-800 hover:bg-red-700`} onClick={() => session.confirmLeave()} data-testid="leave-ok">
                {STR.menu.leaveConfirm}
              </button>
            </div>
          </div>
        ) : (
          <>
            <h2 className="text-lg font-bold">{STR.menu.title}</h2>
            <div className="mt-1 flex items-center justify-center gap-2 text-sm">
              <span className="font-semibold" data-testid="menu-stage">
                {m.stageName}
              </span>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-0.5 text-sm text-neutral-300" data-testid="menu-info">
              <dt>{STR.hud.phase}</dt>
              <dd data-testid="menu-phase">{m.phaseLabel}</dd>
              {m.spawnText !== null && (
                <>
                  <dt>{STR.hud.spawnProgress}</dt>
                  <dd data-testid="menu-spawn">{m.spawnText}</dd>
                  <dt>{STR.hud.aliveEnemies}</dt>
                  <dd data-testid="menu-alive">{m.alive}</dd>
                </>
              )}
            </dl>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <button type="button" className={`${BTN} border-emerald-500 bg-emerald-700 hover:bg-emerald-600`} onClick={() => session.closeMenu()} data-testid="resume-button">
                {STR.menu.resume}
              </button>
              <button type="button" className={`${BTN} border-neutral-500 bg-neutral-800 hover:bg-neutral-700`} onClick={() => session.requestLeave()} data-testid="leave-button">
                {STR.menu.toSelect}
              </button>
            </div>
            <p className="mt-2 text-[11px] text-neutral-500">{STR.menu.hint}</p>
          </>
        )}
      </div>
    </div>
  );
}

const TARGET_MODES: readonly TargetingMode[] = ["first", "last", "close", "strong"];

/**
 * 타워 정보 창(UI-CONTRACT 7절): 일시정지하지 않는 작은 창. 능력치·타깃 4버튼·판매 조건 안내·닫기.
 * 맵 영역 위에 얹으며 열려 있는 동안 세션이 맵 입력을 무시한다. 선택 타워가 사라지면 세션이 닫는다.
 */
export function InfoWindow({ session, detail, hud }: { session: GameSession; detail: TowerDetail; hud: HudView }) {
  const row = (label: string, value: string, testId?: string) => (
    <>
      <dt className="text-neutral-400">{label}</dt>
      <dd data-testid={testId}>{value}</dd>
    </>
  );
  return (
    <div className="absolute left-2 top-2 z-[5] w-[min(300px,calc(100%-1rem))] touch-manipulation rounded-lg border border-neutral-600 bg-neutral-900/95 p-2 text-xs text-neutral-100 shadow-xl" data-testid="info-window">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold">
          {detail.name} <span className="text-neutral-400">{STR.hud.level}{detail.level}</span>
        </h2>
        <button type="button" className={`${SMALL_BTN} border-neutral-500 bg-neutral-800 hover:bg-neutral-700`} onClick={() => session.closeInfo()} data-testid="info-close">
          {STR.hud.close}
        </button>
      </div>
      <dl className="mt-1 grid grid-cols-[auto_1fr_auto_1fr] gap-x-2 gap-y-0.5" data-testid="info-stats">
        {row(STR.hud.damage, String(detail.damage), "detail-damage")}
        {row(STR.hud.period, `${detail.periodText}${STR.hud.seconds}`, "detail-period")}
        {row(STR.hud.range, detail.rangeText, "detail-range")}
        {detail.aoeText !== null && row(STR.hud.aoe, detail.aoeText, "detail-aoe")}
        {detail.slowText !== null && row(STR.hud.slow, detail.slowText, "detail-slow")}
      </dl>
      <div className="mt-1 text-neutral-400">{STR.hud.targeting}</div>
      <div className="mt-0.5 grid grid-cols-4 gap-1">
        {TARGET_MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            disabled={!hud.controlsEnabled}
            onClick={() => session.setTargeting(detail.towerId, mode)}
            aria-pressed={detail.targetingMode === mode}
            data-testid={`target-${mode}`}
            className={`${SMALL_BTN} ${detail.targetingMode === mode ? "border-yellow-300 bg-neutral-700" : "border-neutral-600 bg-neutral-800 hover:bg-neutral-700"}`}
          >
            {TARGETING_NAMES[mode]}
          </button>
        ))}
      </div>
      <p className="mt-1 text-neutral-500" data-testid="info-sell-note">
        {STR.hud.sellOnlyPrep}
      </p>
    </div>
  );
}

export function SellConfirm({ session, name, refund }: { session: GameSession; name: string; refund: number }) {
  return (
    <div className={BACKDROP} data-testid="sell-confirm">
      <div className={PANEL}>
        <h2 className="text-lg font-bold">{STR.sellConfirmTitle}</h2>
        <p className="mt-1 text-sm text-neutral-300">{STR.sellConfirmBody(name, refund)}</p>
        <div className="mt-3 flex justify-center gap-2">
          <button type="button" className={`${BTN} border-neutral-500 bg-neutral-800 hover:bg-neutral-700`} onClick={() => session.cancelSell()} data-testid="sell-cancel">
            {STR.hud.cancel}
          </button>
          <button type="button" className={`${BTN} border-red-500 bg-red-800 hover:bg-red-700`} onClick={() => session.confirmSell()} data-testid="sell-ok">
            {STR.sellConfirm}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ResultOverlay({ session, battle }: { session: GameSession; battle: BattleState }) {
  const r = battle.result!;
  return (
    <div className={BACKDROP} data-testid="result-overlay">
      <div className={RESULT_PANEL}>
        <h2 className={`text-2xl font-bold ${r.outcome === "victory" ? "text-amber-300" : "text-red-300"}`} data-testid="result-title">
          {r.outcome === "victory" ? STR.result.victory : STR.result.defeat}
        </h2>
        <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-0.5 text-sm text-neutral-300">
          <dt>{STR.result.stage}</dt>
          <dd data-testid="result-stage">{r.stageName}</dd>
          <dt>{STR.result.reachedWave}</dt>
          <dd data-testid="result-wave">{r.reachedWave} / {r.waveTotal}</dd>
          <dt>{STR.result.baseHp}</dt>
          <dd data-testid="result-hp">{r.baseHp} / {r.maxBaseHp}</dd>
        </dl>
        {r.save === "saved" && (
          <p className="mt-1 text-xs text-emerald-300" data-testid="save-status" data-save="saved">
            {STR.result.saved}
          </p>
        )}
        {r.save === "failed" && (
          <div className="mt-1 text-xs text-red-300" data-testid="save-status" data-save="failed">
            <span className="font-semibold">{STR.result.saveFailed}.</span> {STR.result.saveLossNote}
            <div>
              <button type="button" className={`${SMALL_BTN} mt-1 min-w-24 border-red-400 bg-red-900 text-sm text-neutral-100 hover:bg-red-800`} onClick={() => session.retrySave()} data-testid="retry-save-button">
                {STR.result.retrySave}
              </button>
            </div>
          </div>
        )}
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <button type="button" className={`${BTN} border-emerald-500 bg-emerald-700 hover:bg-emerald-600`} onClick={() => session.retry()} data-testid="retry-button">
            {STR.result.retry}
          </button>
          <button type="button" className={`${BTN} border-neutral-500 bg-neutral-800 hover:bg-neutral-700`} onClick={() => session.toStageSelect()} data-testid="to-select-button">
            {STR.result.toSelect}
          </button>
          {r.hasNext && (
            <button type="button" disabled={!r.nextEnabled} className={`${BTN} border-amber-400 bg-amber-700 hover:bg-amber-600`} onClick={() => session.nextStage()} data-testid="next-button">
              {STR.result.next}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
