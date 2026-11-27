"use client";

import type { GameSession } from "../session/session";
import { STR } from "./strings.ko";

/** 크레딧 패널(AUDIO-SPEC 5절): CC-BY 음원이 요구하는 제목·저작자·라이선스 링크·변경 여부. 뒤로가기(세션 handleBack)가 먼저 닫는다. */
export function Credits({ session }: { session: GameSession }) {
  const c = STR.credits;
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 p-3" data-testid="credits-panel" role="dialog" aria-label={c.title}>
      <div className="w-full max-w-md rounded-lg border border-neutral-600 bg-neutral-900 p-3 text-xs text-neutral-100 shadow-xl">
        <h2 className="mb-1 text-base font-bold">{c.title}</h2>
        <dl className="space-y-1.5">
          <div>
            <dt className="text-neutral-400">{c.music}</dt>
            <dd>
              {c.musicLine} (
              <a className="underline" href={c.musicLicenseUrl} target="_blank" rel="noreferrer">
                {c.musicLicense}
              </a>
              , <span className="break-all">{c.musicSource.replace("https://", "")}</span>)
            </dd>
            <dd className="text-neutral-400">{c.musicChanged}</dd>
          </div>
          <div>
            <dt className="text-neutral-400">{c.sfx}</dt>
            <dd>
              {c.sfxLine} ({c.sfxLicense})
            </dd>
          </div>
        </dl>
        <div className="mt-2 text-center">
          <button type="button" className="min-h-10 min-w-24 rounded border border-neutral-500 bg-neutral-800 px-3 text-sm font-semibold hover:bg-neutral-700" onClick={() => session.closeCredits()} data-testid="credits-close">
            {c.close}
          </button>
        </div>
      </div>
    </div>
  );
}
