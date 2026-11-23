"use client";

import { useEffect, useRef } from "react";

// Phaser 인스턴스를 클라이언트에서만 생성하고 unmount 시 정리한다 (PLAN 2.1 라이프사이클).
// StrictMode의 이중 effect나 import 완료 전 unmount에도 인스턴스가 중복되지 않게 한다.
export function GameCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let game: { destroy(removeCanvas: boolean): void } | undefined;

    import("./createGame").then(async ({ createGame }) => {
      const created = await createGame(host);
      if (disposed) created.destroy(true);
      else game = created;
    });

    return () => {
      disposed = true;
      game?.destroy(true);
    };
  }, []);

  return <div ref={hostRef} className="h-full w-full" />;
}
