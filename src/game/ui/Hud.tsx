"use client";

import type { TowerType } from "../core/content/types";
import type { TargetingMode } from "../core/sim/commands";
import { DEV_PLACEHOLDER_LABEL } from "../content/devBundle";
import type { HudView, TowerDetail } from "../session/hudView";
import type { GameSession } from "../session/session";
import { TARGETING_NAMES, STR } from "./strings.ko";

const TOWER_COLOR: Record<TowerType, string> = { archer: "#e0b341", ballista: "#c8473d", mage: "#8e5fd0", frost: "#6cc4e8" };
const TARGET_MODES: readonly TargetingMode[] = ["first", "last", "close", "strong"];
const BTN = "min-h-10 min-w-10 rounded border px-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40";

/** 상단 고정 영역(골드·기지 HP·웨이브·단계·일시정지, SPEC 9절) + 아래 스크롤 영역(단계 정보·타워 목록·상세). */
export function Hud({ session, hud, width }: { session: GameSession; hud: HudView; width: number }) {
  return (
    <aside style={{ width }} className="flex h-full shrink-0 touch-manipulation flex-col border-l border-neutral-800 bg-neutral-900 text-neutral-100" data-testid="hud">
      <div className="shrink-0 border-b border-neutral-800 p-2" data-testid="hud-top">
        <div className="flex items-center justify-between gap-1">
          <span className="truncate text-sm font-semibold" data-testid="hud-stage">
            {hud.stageName}
          </span>
          <span className="shrink-0 rounded bg-yellow-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-300" data-testid="placeholder-badge">
            {DEV_PLACEHOLDER_LABEL}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between text-xs">
          <span data-testid="hud-wave">
            {STR.hud.wave} {hud.waveIndex} / {hud.waveTotal}
          </span>
          <span className="font-semibold" data-testid="hud-phase">
            {hud.phaseLabel}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between text-sm">
          <span data-testid="hud-gold">
            {STR.hud.gold} <b className="text-yellow-300">{hud.gold}</b>
          </span>
          <span data-testid="hud-basehp">
            {STR.hud.baseHp} <b className={hud.baseHp <= hud.maxBaseHp * 0.3 ? "text-red-400" : "text-emerald-300"}>{hud.baseHp}</b> / {hud.maxBaseHp}
          </span>
        </div>
        <button type="button" className={`${BTN} mt-1 w-full border-neutral-600 bg-neutral-800 hover:bg-neutral-700`} disabled={hud.isResult} onClick={() => session.togglePause()} data-testid="pause-button">
          {hud.paused ? STR.hud.resume : STR.hud.pause}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2" data-testid="hud-scroll">
        {hud.prep && (
          <section className="mb-2 rounded border border-neutral-700 p-2 text-xs" data-testid="hud-prep">
            <div>
              {STR.hud.prepRemaining}: <b data-testid="hud-prep-time">{hud.prep.remainingText}</b>
              {STR.hud.seconds}
            </div>
            <button type="button" className={`${BTN} mt-1 w-full border-emerald-500 bg-emerald-700 hover:bg-emerald-600`} disabled={!hud.prep.canStartNow} onClick={() => session.startWave()} data-testid="start-wave">
              {STR.hud.startNow}
            </button>
          </section>
        )}
        {hud.combat && (
          <section className="mb-2 rounded border border-neutral-700 p-2 text-xs" data-testid="hud-combat">
            <div>
              {STR.hud.spawnProgress} <b data-testid="hud-spawn">{hud.combat.spawned} / {hud.combat.totalSpawn}</b>
            </div>
            <div>
              {STR.hud.aliveEnemies} <b data-testid="hud-alive">{hud.combat.alive}</b>
            </div>
          </section>
        )}

        <section className="mb-2" data-testid="tower-list">
          <h2 className="mb-1 text-xs text-neutral-400">{STR.hud.towers}</h2>
          <div className="grid grid-cols-2 gap-1">
            {hud.towers.map((t) => (
              <button
                key={t.type}
                type="button"
                disabled={!hud.controlsEnabled}
                onClick={() => session.togglePlaceMode(t.type)}
                data-testid={`tower-${t.type}`}
                aria-pressed={t.selected}
                className={`${BTN} flex flex-col items-start justify-center text-left ${t.selected ? "border-yellow-300 bg-neutral-700" : "border-neutral-600 bg-neutral-800 hover:bg-neutral-700"} ${t.affordable ? "" : "opacity-50"}`}
              >
                <span className="flex items-center gap-1">
                  <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: TOWER_COLOR[t.type] }} />
                  {t.name}
                </span>
                <span className="text-xs text-yellow-300">{t.cost}</span>
              </button>
            ))}
          </div>
          {hud.mode === "place" && (
            <p className="mt-1 text-xs text-yellow-200" data-testid="place-hint">
              {STR.hud.placeHint}
            </p>
          )}
        </section>

        {hud.detail ? <Detail session={session} detail={hud.detail} hud={hud} /> : hud.mode !== "place" && <p className="text-xs text-neutral-500">{STR.hud.selectHint}</p>}
      </div>
    </aside>
  );
}

function Detail({ session, detail, hud }: { session: GameSession; detail: TowerDetail; hud: HudView }) {
  return (
    <section className="rounded border border-neutral-700 p-2 text-xs" data-testid="tower-detail">
      <h2 className="text-sm font-semibold">
        {detail.name} <span className="text-neutral-400">{STR.hud.level}{detail.level}</span>
      </h2>
      <dl className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-neutral-300">
        <dt>{STR.hud.damage}</dt>
        <dd data-testid="detail-damage">{detail.damage}</dd>
        <dt>{STR.hud.period}</dt>
        <dd>{detail.periodText}{STR.hud.seconds}</dd>
        <dt>{STR.hud.range}</dt>
        <dd>{detail.rangeText}</dd>
        {detail.aoeText !== null && (
          <>
            <dt>{STR.hud.aoe}</dt>
            <dd>{detail.aoeText}</dd>
          </>
        )}
        {detail.slowText !== null && (
          <>
            <dt>{STR.hud.slow}</dt>
            <dd>{detail.slowText}</dd>
          </>
        )}
      </dl>
      <div className="mt-2">
        <div className="mb-1 text-neutral-400">{STR.hud.targeting}</div>
        <div className="grid grid-cols-2 gap-1">
          {TARGET_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              disabled={!hud.controlsEnabled}
              onClick={() => session.setTargeting(detail.towerId, mode)}
              aria-pressed={detail.targetingMode === mode}
              data-testid={`target-${mode}`}
              className={`${BTN} ${detail.targetingMode === mode ? "border-yellow-300 bg-neutral-700" : "border-neutral-600 bg-neutral-800 hover:bg-neutral-700"}`}
            >
              {TARGETING_NAMES[mode]}
            </button>
          ))}
        </div>
      </div>
      <button
        type="button"
        disabled={!detail.canUpgrade}
        onClick={() => session.upgrade(detail.towerId)}
        data-testid="upgrade-button"
        className={`${BTN} mt-2 w-full border-emerald-500 bg-emerald-800 hover:bg-emerald-700 ${detail.canAffordUpgrade ? "" : "opacity-60"}`}
      >
        {detail.upgradeCost === null ? STR.hud.maxLevel : `${STR.hud.upgrade} ${detail.upgradeCost}`}
      </button>
      <button type="button" disabled={!detail.canSell} onClick={() => session.requestSell(detail.towerId)} data-testid="sell-button" className={`${BTN} mt-1 w-full border-red-500 bg-red-900 hover:bg-red-800`}>
        {STR.hud.sell} +{detail.refund}
      </button>
      {hud.phase === "combat" && <p className="mt-1 text-neutral-500">{STR.hud.sellOnlyPrep}</p>}
    </section>
  );
}
