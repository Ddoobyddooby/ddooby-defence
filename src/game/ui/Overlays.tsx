"use client";

import type { BattleState } from "../session/session";
import type { GameSession } from "../session/session";
import { STR } from "./strings.ko";

const BTN = "min-h-10 min-w-24 rounded border px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40";
const BACKDROP = "absolute inset-0 z-10 flex items-center justify-center bg-black/55 p-3";
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

export function PauseOverlay({ session }: { session: GameSession }) {
  return (
    <div className={BACKDROP} data-testid="pause-overlay">
      <div className={PANEL}>
        <h2 className="text-xl font-bold">{STR.pauseOverlayTitle}</h2>
        <p className="mt-1 text-xs text-neutral-400">{STR.pauseOverlayHint}</p>
        <button type="button" className={`${BTN} mt-3 border-emerald-500 bg-emerald-700 hover:bg-emerald-600`} onClick={() => session.resume()} data-testid="resume-button">
          {STR.hud.resume}
        </button>
      </div>
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
      <div className={PANEL}>
        <h2 className={`text-2xl font-bold ${r.outcome === "victory" ? "text-amber-300" : "text-red-300"}`} data-testid="result-title">
          {r.outcome === "victory" ? STR.result.victory : STR.result.defeat}
        </h2>
        <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-0.5 text-sm text-neutral-300">
          <dt>{STR.result.stage}</dt>
          <dd data-testid="result-stage">{r.stageName}</dd>
          <dt>{STR.result.reachedWave}</dt>
          <dd data-testid="result-wave">{r.reachedWave} / 5</dd>
          <dt>{STR.result.baseHp}</dt>
          <dd data-testid="result-hp">{r.baseHp} / {r.maxBaseHp}</dd>
        </dl>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
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
