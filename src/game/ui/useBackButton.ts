"use client";

import { useEffect } from "react";
import type { GameSession } from "../session/session";

/**
 * Android 뒤로가기(UI-CONTRACT 8.1절): 네이티브 앱에서만 `@capacitor/app` backButton 을 구독한다.
 * 세션의 handleBack() 이 "exit" 를 돌려줄 때(스테이지 선택 화면)만 앱을 종료한다. 웹 브라우저에서는 플러그인을 불러오지 않으므로 아무 일도 하지 않는다.
 */
export function useBackButton(session: GameSession): void {
  useEffect(() => {
    let cancelled = false;
    let remove: (() => void) | null = null;
    void (async () => {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) return;
      const { App } = await import("@capacitor/app");
      const handle = await App.addListener("backButton", () => {
        if (session.handleBack() === "exit") void App.exitApp();
      });
      if (cancelled) void handle.remove();
      else remove = () => void handle.remove();
    })().catch(() => {
      // 플러그인을 쓸 수 없으면 기본 동작(앱 종료)으로 남는다.
    });
    return () => {
      cancelled = true;
      remove?.();
    };
  }, [session]);
}
