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
    let game: { destroy(removeCanvas: boolean): void; scale: { resize(w: number, h: number): void; width: number; height: number } } | undefined;
    // RESIZE 모드의 Phaser 는 window resize 시점에 부모 크기를 읽는데, React 레이아웃(HUD 폭)이 그 뒤에 바뀌면 낡은 크기가 남는다.
    // 호스트 요소 자체의 크기 변화를 관찰해 다시 읽게 한다(인스턴스 재생성 없이 재배치만).
    const fit = () => {
      const w = Math.max(1, host.clientWidth);
      const h = Math.max(1, host.clientHeight);
      if (game !== undefined && (game.scale.width !== w || game.scale.height !== h)) game.scale.resize(w, h);
    };
    const observer = new ResizeObserver(fit);
    observer.observe(host);

    import("./createGame").then(async ({ createGame }) => {
      const created = await createGame(host, session);
      if (disposed) created.destroy(true);
      else {
        game = created;
        fit();
      }
    });

    return () => {
      disposed = true;
      observer.disconnect();
      game?.destroy(true);
    };
  }, [session]);

  return <div ref={hostRef} data-testid="battle-canvas" className="h-full w-full touch-none select-none" />;
}
