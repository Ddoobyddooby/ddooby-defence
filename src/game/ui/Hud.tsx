"use client";

import { useState } from "react";
import type { TowerType } from "../core/content/types";
import { assetUrl, towerKey } from "../phaser/assets";
import type { HudView, TowerDetail } from "../session/hudView";
import type { GameSession } from "../session/session";
import { STR } from "./strings.ko";

const TOWER_COLOR: Record<TowerType, string> = { archer: "#e0b341", ballista: "#c8473d", mage: "#8e5fd0", frost: "#6cc4e8" };

/** HUD 타워 버튼 아이콘: Lv1 그림(ART-03)이 있으면 쓰고, 없거나 로드에 실패하면 색 표식으로 바꾼다(실패해도 다시 요청하지 않는다). */
function TowerIcon({ type }: { type: TowerType }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <i className="inline-block h-2 w-2 shrink-0 rounded-sm" style={{ background: TOWER_COLOR[type] }} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={assetUrl(towerKey(type, 1))} alt="" width={14} height={14} className="h-[14px] w-[14px] shrink-0 object-contain" onError={() => setFailed(true)} data-testid={`tower-icon-${type}`} />;
}
// 터치 영역 최소 40×40(UI-CONTRACT 3절). 폭 136px HUD 에서도 글자가 잘리지 않게 text-xs·좁은 패딩.
const BTN = "min-h-10 min-w-10 rounded border px-1 text-xs font-medium leading-tight disabled:cursor-not-allowed disabled:opacity-40";

/**
 * 오른쪽 HUD(UI-CONTRACT 7절, MOB-02). 상시 항목만: 골드·기지 HP / 웨이브·단계·⚙ / 준비 단계 `▶ 시작` / 타워 4종 / 선택 타워 패널.
 * 640×320 에서도 스크롤 없이 모두 보여야 한다(스테이지 이름·배지·생성 진행·능력치·타깃은 메뉴·정보 창으로).
 */
export function Hud({ session, hud, width }: { session: GameSession; hud: HudView; width: number }) {
  return (
    <aside style={{ width }} className="flex h-full shrink-0 touch-manipulation flex-col justify-between gap-1 overflow-y-auto border-l border-neutral-800 bg-neutral-900 px-1 pb-2 pt-[clamp(12px,5vh,24px)] text-neutral-100" data-testid="hud">
      <div className="flex items-center justify-between gap-1 pl-0.5 pr-2 text-xs" data-testid="hud-resources">
        <span className="whitespace-nowrap" data-testid="hud-gold">
          {STR.hud.gold} <b className="text-yellow-300">{hud.gold}</b>
        </span>
        <span className="whitespace-nowrap" data-testid="hud-basehp">
          {STR.hud.baseHp} <b className={hud.baseHp <= hud.maxBaseHp * 0.3 ? "text-red-400" : "text-emerald-300"}>{hud.baseHp}</b>/{hud.maxBaseHp}
        </span>
      </div>

      <div className="flex items-center justify-between gap-1 px-0.5">
        <div className="text-xs leading-tight">
          <div data-testid="hud-wave">
            {STR.hud.wave} {hud.waveIndex}/{hud.waveTotal}
          </div>
          <div className="font-semibold text-neutral-300" data-testid="hud-phase">
            {hud.phaseLabel}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            className={`${BTN} h-10 w-10 shrink-0 text-sm font-bold ${hud.speed > 1 ? "border-yellow-300 bg-yellow-600 text-neutral-950 hover:bg-yellow-500" : "border-neutral-600 bg-neutral-800 hover:bg-neutral-700"}`}
            onClick={() => session.cycleSpeed()}
            aria-label={`${STR.hud.speed} ${hud.speed}×`}
            data-testid="speed-button"
          >
            {hud.speed}×
          </button>
          <button
            type="button"
            className={`${BTN} h-10 w-10 shrink-0 border-neutral-600 bg-neutral-800 text-base hover:bg-neutral-700`}
            disabled={hud.isResult}
            onClick={() => (hud.paused ? session.closeMenu() : session.openMenu())}
            aria-label={STR.hud.menu}
            aria-pressed={hud.paused && !hud.isResult}
            data-testid="menu-button"
          >
            ⚙
          </button>
        </div>
      </div>

      {hud.prep && (
        <button type="button" className={`${BTN} w-full border-emerald-500 bg-emerald-700 hover:bg-emerald-600`} disabled={!hud.prep.canStartNow} onClick={() => session.startWave()} data-testid="start-wave">
          {STR.hud.startNow} <span data-testid="hud-prep-time">{hud.prep.remainingText}</span>
          {STR.hud.seconds}
        </button>
      )}

      <section data-testid="tower-list">
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
              <span className="flex items-center gap-0.5 whitespace-nowrap">
                <TowerIcon type={t.type} />
                {t.name}
              </span>
              <span className="text-yellow-300">{t.cost}</span>
            </button>
          ))}
        </div>
      </section>

      {hud.detail ? (
        <Detail session={session} detail={hud.detail} hud={hud} />
      ) : (
        <p className="px-0.5 text-[11px] leading-tight text-neutral-400" data-testid={hud.mode === "place" ? "place-hint" : "select-hint"}>
          {hud.mode === "place" ? STR.hud.placeHint : STR.hud.selectHint}
        </p>
      )}
    </aside>
  );
}

/** 선택한 타워 패널: `이름 Lv`+`정보` 1줄, `강화 가격`·`판매 +환급` 2버튼 1줄. 능력치·타깃은 정보 창. */
function Detail({ session, detail, hud }: { session: GameSession; detail: TowerDetail; hud: HudView }) {
  return (
    <section className="rounded border border-neutral-700 p-1" data-testid="tower-detail">
      <div className="flex items-center justify-between gap-1">
        <h2 className="min-w-0 truncate text-xs font-semibold leading-tight">
          {detail.name}
          <span className="ml-0.5 text-neutral-400">
            {STR.hud.level}
            {detail.level}
          </span>
        </h2>
        <button
          type="button"
          disabled={hud.paused}
          onClick={() => session.openInfo()}
          aria-pressed={hud.infoOpen}
          data-testid="info-button"
          className={`${BTN} shrink-0 border-neutral-600 bg-neutral-800 hover:bg-neutral-700`}
        >
          {STR.hud.info}
        </button>
      </div>
      <div className="mt-1 grid grid-cols-2 gap-1">
        <button
          type="button"
          disabled={!detail.canUpgrade}
          onClick={() => session.upgrade(detail.towerId)}
          data-testid="upgrade-button"
          className={`${BTN} flex flex-col items-center justify-center border-emerald-500 bg-emerald-800 hover:bg-emerald-700 ${detail.canAffordUpgrade ? "" : "opacity-60"}`}
        >
          {detail.upgradeCost === null ? (
            STR.hud.maxLevel
          ) : (
            <>
              <span>{STR.hud.upgrade}</span>
              <span className="text-yellow-200">{detail.upgradeCost}</span>
            </>
          )}
        </button>
        <button type="button" disabled={!detail.canSell} onClick={() => session.requestSell(detail.towerId)} data-testid="sell-button" className={`${BTN} flex flex-col items-center justify-center border-red-500 bg-red-900 hover:bg-red-800`}>
          <span>{STR.hud.sell}</span>
          <span className="text-yellow-200">+{detail.refund}</span>
        </button>
      </div>
    </section>
  );
}
