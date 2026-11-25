"use client";

import { useEffect, useRef } from "react";
import type { GameSession } from "../session/session";

// Phaser 인스턴스를 클라이언트에서만 생성하고 unmount 시 정리한다 (PLAN 2.1 라이프사이클).
// StrictMode 의 이중 effect 나 import 완료 전 unmount 에도 인스턴스가 중복되지 않게 한다. 맵 영역에 touch-action: none (UI-CONTRACT 3절).
export function BattleCanvas({ session }: { session: GameSession }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let game: { destroy(removeCanvas: boolean): void } | undefined;

    import("./createGame").then(async ({ createGame }) => {
      const created = await createGame(host, session);
      if (disposed) created.destroy(true);
      else game = created;
    });

    return () => {
      disposed = true;
      game?.destroy(true);
    };
  }, [session]);

  return <div ref={hostRef} data-testid="battle-canvas" className="h-full w-full touch-none select-none" />;
}
