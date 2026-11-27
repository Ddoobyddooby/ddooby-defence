"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_AUDIO_SETTINGS } from "../audio/audioSettings";
import { getSoundEngine } from "../audio";
import { STR } from "./strings.ko";

/** 효과음·배경음 켜기/끄기(AUDIO-SPEC 5절). ⚙ 메뉴와 스테이지 선택 화면에서 같이 쓴다. */
export function AudioToggles() {
  const engine = typeof window === "undefined" ? null : getSoundEngine();
  const settings = useSyncExternalStore(
    (l) => (engine === null ? () => undefined : engine.subscribe(l)),
    () => (engine === null ? DEFAULT_AUDIO_SETTINGS : engine.getSettings()),
    () => DEFAULT_AUDIO_SETTINGS,
  );
  const btn = (label: string, on: boolean, toggle: () => void, testId: string) => (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={toggle}
      data-testid={testId}
      className={`min-h-10 rounded border px-3 text-sm font-semibold ${on ? "border-emerald-500 bg-emerald-800 text-neutral-100" : "border-neutral-600 bg-neutral-800 text-neutral-400"}`}
    >
      {label} {on ? STR.audio.on : STR.audio.off}
    </button>
  );
  return (
    <div className="flex flex-wrap items-center justify-center gap-2" data-testid="audio-toggles">
      {btn(STR.audio.sfx, settings.sfx, () => engine?.setSfx(!settings.sfx), "toggle-sfx")}
      {btn(STR.audio.bgm, settings.bgm, () => engine?.setBgm(!settings.bgm), "toggle-bgm")}
    </div>
  );
}
