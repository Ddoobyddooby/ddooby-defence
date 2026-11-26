"use client";

import type { GameSession } from "../session/session";
import type { StageCard } from "../session/progress";
import { STAGE_NAMES, STR } from "./strings.ko";

const STATE_STYLE: Record<StageCard["state"], string> = {
  locked: "border-neutral-700 bg-neutral-900 text-neutral-500",
  available: "border-emerald-500 bg-neutral-900 text-neutral-100 hover:bg-neutral-800",
  cleared: "border-amber-400 bg-neutral-900 text-neutral-100 hover:bg-neutral-800",
  contentError: "border-red-500 bg-red-950/40 text-red-200",
};

export function StageSelect({ session, cards, notice }: { session: GameSession; cards: readonly StageCard[]; notice: "unreadable" | "unavailable" | null }) {
  return (
    <main className="flex h-dvh w-full flex-col overflow-auto bg-neutral-950 p-4 text-neutral-100">
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold">{STR.title}</h1>
        <span className="rounded bg-yellow-500/20 px-2 py-0.5 text-xs font-semibold text-yellow-300" data-testid="placeholder-badge">
          {STR.placeholderBadge}
        </span>
      </header>
      <p className="mb-3 text-sm text-neutral-400">{STR.pickStage}</p>
      <div className="grid flex-1 grid-cols-3 content-start gap-3" data-testid="stage-cards">
        {cards.map((card) => {
          const enterable = card.state === "available" || card.state === "cleared";
          return (
            <button
              key={card.index}
              type="button"
              disabled={!enterable}
              onClick={() => session.startStage(card.index)}
              data-testid={`stage-card-${card.index}`}
              data-state={card.state}
              className={`flex min-h-24 flex-col items-start gap-1 rounded-lg border-2 p-3 text-left disabled:cursor-not-allowed ${STATE_STYLE[card.state]}`}
            >
              <span className="text-xs text-neutral-400">Stage {card.index + 1}</span>
              <span className="text-lg font-semibold">{STAGE_NAMES[card.index]}</span>
              <span className="text-sm font-semibold">{STR.card[card.state]}</span>
              {card.state === "locked" && <span className="text-xs">{STR.cardHintLocked}</span>}
              {card.state === "contentError" && (
                <span className="text-xs">
                  {STR.cardHintError}
                  <ul className="mt-1 list-disc pl-4 text-[11px] opacity-90">
                    {card.diagnostics.slice(0, 3).map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                </span>
              )}
            </button>
          );
        })}
      </div>
      {notice === null ? (
        <p className="mt-3 text-xs text-neutral-500">{STR.progressNote}</p>
      ) : (
        <p className="mt-3 rounded border border-amber-500/60 bg-amber-950/40 px-2 py-1 text-xs text-amber-200" role="status" data-testid="progress-notice" data-notice={notice}>
          {STR.progressNotice[notice]}
        </p>
      )}
    </main>
  );
}
