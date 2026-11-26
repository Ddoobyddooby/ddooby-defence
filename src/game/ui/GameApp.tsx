"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { GAME_CONTENT } from "../content/gameContent";
import { BattleCanvas } from "../phaser/BattleCanvas";
import { computeLayout, type Layout } from "../session/layout";
import { browserStorageBackend, LocalStorageProgressStore } from "../session/progress";
import { GameSession } from "../session/session";
import { Hud } from "./Hud";
import { OrientationNotice } from "./Orientation";
import { FeedbackToast, InfoWindow, MenuOverlay, ResultOverlay, SellConfirm } from "./Overlays";
import { StageSelect } from "./StageSelect";
import { useBackButton } from "./useBackButton";

/**
 * 창 크기(회전 포함). 마운트 전에는 null(서버 렌더와 첫 클라이언트 렌더가 같도록).
 * resize 이벤트 시점에 innerWidth 가 아직 갱신 전인 환경(에뮬레이션·회전 직후)이 있어, 이벤트 직후 rAF 로 한 번 더 읽고
 * ResizeObserver·visualViewport 도 함께 구독한다.
 */
function useViewport(): { w: number; h: number } | null {
  const [vp, setVp] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const read = () => setVp((prev) => (prev !== null && prev.w === window.innerWidth && prev.h === window.innerHeight ? prev : { w: window.innerWidth, h: window.innerHeight }));
    const readSoon = () => {
      read();
      requestAnimationFrame(read);
    };
    read();
    window.addEventListener("resize", readSoon);
    window.addEventListener("orientationchange", readSoon);
    window.visualViewport?.addEventListener("resize", readSoon);
    const ro = new ResizeObserver(readSoon);
    ro.observe(document.documentElement);
    return () => {
      window.removeEventListener("resize", readSoon);
      window.removeEventListener("orientationchange", readSoon);
      window.visualViewport?.removeEventListener("resize", readSoon);
      ro.disconnect();
    };
  }, []);
  return vp;
}

export function GameApp() {
  // 세션은 이 컴포넌트가 만든 단일 인스턴스. HUD 는 세션 스냅샷의 구독 결과만 그린다(단일 진실 원천).
  const [session] = useState(() => new GameSession({ bundle: GAME_CONTENT, store: new LocalStorageProgressStore(browserStorageBackend()) }));
  const state = useSyncExternalStore(session.subscribe, session.getState, session.getState);
  const viewport = useViewport();
  useBackButton(session);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "KeyP") {
        e.preventDefault();
        if (!e.repeat) session.togglePause();
      } else if (e.code === "KeyF" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        // 웹 개발 편의: 배속 순환(1×→2×→5×). Ctrl/⌘+F 등 브라우저 단축키는 건드리지 않는다(리뷰 UI-02 L1).
        if (!e.repeat) session.cycleSpeed();
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

  // 지원 크기 미달·세로로 바뀌면 안내 화면이 되어 전투 캔버스가 내려가고(Phaser 재생성 허용) 그동안 시간이 흐르지 않는다.
  // 돌아왔을 때 갑자기 진행되지 않도록 안내로 바뀌는 순간 일시정지한다(재개는 사용자가, 리뷰 F2).
  const unsupported = viewport !== null && !computeLayout(viewport.w, viewport.h).supported;
  useEffect(() => {
    if (unsupported) session.pause();
  }, [unsupported, session]);

  if (viewport === null) return <div className="h-dvh w-full bg-neutral-950" />;
  const layout: Layout = computeLayout(viewport.w, viewport.h);
  if (!layout.supported) return <OrientationNotice problem={layout.problem!} />;
  if (state.screen === "stageSelect" || state.battle === null) return <StageSelect session={session} cards={state.cards} notice={state.notice} />;

  const battle = state.battle;
  const detail = battle.hud.detail;
  return (
    <main className="flex h-dvh w-full overflow-hidden bg-neutral-950 text-neutral-100">
      <section className="relative h-full min-w-0 flex-1" data-testid="map-area">
        <BattleCanvas session={session} />
        <FeedbackToast text={battle.feedback} />
        {battle.result === null && battle.hud.infoOpen && detail !== null && <InfoWindow session={session} detail={detail} hud={battle.hud} />}
        {battle.result === null && battle.hud.paused && <MenuOverlay session={session} hud={battle.hud} />}
        {battle.result === null && battle.ui.sellConfirmId !== null && detail !== null && detail.towerId === battle.ui.sellConfirmId && <SellConfirm session={session} name={detail.name} refund={detail.refund} />}
        {battle.result !== null && <ResultOverlay session={session} battle={battle} />}
      </section>
      <Hud session={session} hud={battle.hud} width={layout.hudW} />
    </main>
  );
}
