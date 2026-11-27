// SND-01 (AUDIO-SPEC 5절): 효과음·배경음 켜기/끄기. 진행 저장과 분리된 키에 저장하고, 저장·읽기 실패는 이번 실행 동안만 유지(게임 영향 없음).
export const AUDIO_KEY = "ddooby-defence.audio";
export interface AudioSettings {
  readonly sfx: boolean;
  readonly bgm: boolean;
}
export const DEFAULT_AUDIO_SETTINGS: AudioSettings = { sfx: true, bgm: true };
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadAudioSettings(storage: StorageLike | null): AudioSettings {
  try {
    const raw = storage?.getItem(AUDIO_KEY) ?? null;
    if (raw === null) return DEFAULT_AUDIO_SETTINGS;
    const v = JSON.parse(raw) as { version?: unknown; sfx?: unknown; bgm?: unknown };
    if (v === null || typeof v !== "object" || v.version !== 1) return DEFAULT_AUDIO_SETTINGS;
    return { sfx: typeof v.sfx === "boolean" ? v.sfx : true, bgm: typeof v.bgm === "boolean" ? v.bgm : true };
  } catch {
    return DEFAULT_AUDIO_SETTINGS;
  }
}

/** 저장에 성공하면 true. 실패해도 예외를 내지 않는다. */
export function saveAudioSettings(storage: StorageLike | null, s: AudioSettings): boolean {
  try {
    if (storage === null) return false;
    storage.setItem(AUDIO_KEY, JSON.stringify({ version: 1, sfx: s.sfx, bgm: s.bgm }));
    return true;
  } catch {
    return false;
  }
}

export function browserStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
