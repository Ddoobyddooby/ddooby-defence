"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { DEV_PLACEHOLDER } from "../content/devBundle";
import { BattleCanvas } from "../phaser/BattleCanvas";
import { computeLayout, type Layout } from "../session/layout";
import { MemoryProgressStore } from "../session/progress";
import { GameSession } from "../session/session";
import { Hud } from "./Hud";
import { OrientationNotice } from "./Orientation";
import { FeedbackToast, PauseOverlay, ResultOverlay, SellConfirm } from "./Overlays";
import { StageSelect } from "./StageSelect";

/** 창 크기(회전 포함). 마운트 전에는 null(서버 렌더와 첫 클라이언트 렌더가 같도록). */
function useViewport(): { w: number; h: number } | null {
  const [vp, setVp] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const read = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    read();
    window.addEventListener("resize", read);
    window.addEventListener("orientationchange", read);
    return () => {
      window.removeEventListener("resize", read);
      window.removeEventListener("orientationchange", read);
    };
  }, []);
  return vp;
}

export function GameApp() {
  // 세션은 이 컴포넌트가 만든 단일 인스턴스. HUD 는 세션 스냅샷의 구독 결과만 그린다(단일 진실 원천).
  const [session] = useState(() => new GameSession({ bundle: DEV_PLACEHOLDER, store: new MemoryProgressStore() }));
  const state = useSyncExternalStore(session.subscribe, session.getState, session.getState);
  const viewport = useViewport();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "KeyP") {
        e.preventDefault();
        if (!e.repeat) session.togglePause();
      } else if (e.code === "Escape") session.cancel();
    };
    const onVisibility = () => session.setHidden(document.hidden);
    window.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [session]);

  if (viewport === null) return <div className="h-dvh w-full bg-neutral-950" />;
  const layout: Layout = computeLayout(viewport.w, viewport.h);
  if (!layout.supported) return <OrientationNotice problem={layout.problem!} />;
  if (state.screen === "stageSelect" || state.battle === null) return <StageSelect session={session} cards={state.cards} />;

  const battle = state.battle;
  const detail = battle.hud.detail;
  return (
    <main className="flex h-dvh w-full overflow-hidden bg-neutral-950 text-neutral-100">
      <section className="relative h-full min-w-0 flex-1" data-testid="map-area">
        <BattleCanvas session={session} />
        <FeedbackToast text={battle.feedback} />
        {battle.result === null && battle.hud.paused && <PauseOverlay session={session} />}
        {battle.result === null && battle.ui.sellConfirmId !== null && detail !== null && detail.towerId === battle.ui.sellConfirmId && <SellConfirm session={session} name={detail.name} refund={detail.refund} />}
        {battle.result !== null && <ResultOverlay session={session} battle={battle} />}
      </section>
      <Hud session={session} hud={battle.hud} width={layout.hudW} />
    </main>
  );
}
