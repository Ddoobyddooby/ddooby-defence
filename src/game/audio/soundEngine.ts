// SND-01: 재생 규칙(켜기/끄기·과다 재생 제한·일시정지·숨김)만 담은 엔진. 실제 소리는 AudioBackend 가 낸다(테스트는 가짜 백엔드).
import type { TowerType } from "../core/content/types";
import { type AudioSettings, DEFAULT_AUDIO_SETTINGS, loadAudioSettings, saveAudioSettings, type StorageLike } from "./audioSettings";
import { GLOBAL_MAX_CONCURRENT, SFX_CONFIG, type SfxName, soundsForEvent } from "./soundMap";

export interface AudioBackend {
  /** 첫 사용자 입력 때 호출: 브라우저가 막은 오디오를 풀어 준다. */
  unlock(): void;
  /** 효과음 1회 재생. 끝나면(또는 파일이 없거나 실패하면 즉시) onEnded 를 부른다. */
  play(name: SfxName, volume: number, onEnded: () => void): void;
  stopAllSfx(): void;
  /** 배경음(`bgm-main`)이 있으면 반복 재생, 없으면 아무 일 없음. */
  startBgm(): void;
  stopBgm(): void;
  setBgmVolume(volume: number): void;
  suspend(): void;
  resume(): void;
}

export const BGM_VOLUME = 0.25;
/** 메뉴(일시정지)·결과 직후에는 배경음을 낮춘다. */
export const BGM_DUCKED_VOLUME = 0.09;
export const RESULT_DUCK_MS = 2500;

export interface PlayRecord {
  readonly name: SfxName;
  readonly atMs: number;
}

export class SoundEngine {
  private settings: AudioSettings;
  private hidden = false;
  private paused = false;
  private menuDuck = false;
  private resultDuckUntil = 0;
  private duckTimer: ReturnType<typeof setTimeout> | null = null;
  private bgmWanted = false;
  private readonly last = new Map<SfxName, number>();
  private readonly active = new Map<SfxName, number>();
  private activeTotal = 0;
  private readonly listeners = new Set<() => void>();
  /** 최근 재생 기록(검증용, 최대 200개). */
  readonly log: PlayRecord[] = [];

  constructor(
    private readonly backend: AudioBackend,
    private readonly storage: StorageLike | null = null,
    private readonly now: () => number = () => Date.now(),
  ) {
    this.settings = loadAudioSettings(storage);
  }

  // ───────── 설정(useSyncExternalStore) ─────────
  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };
  getSettings = (): AudioSettings => this.settings;
  private set(next: AudioSettings): void {
    this.settings = next;
    saveAudioSettings(this.storage, next);
    for (const l of [...this.listeners]) l();
  }
  setSfx(on: boolean): void {
    if (on === this.settings.sfx) return;
    this.set({ ...this.settings, sfx: on });
    if (!on) this.backend.stopAllSfx();
  }
  setBgm(on: boolean): void {
    if (on === this.settings.bgm) return;
    this.set({ ...this.settings, bgm: on });
    this.syncBgm();
  }

  // ───────── 상태 ─────────
  /** 첫 사용자 입력(터치·클릭·키). 배경음도 이때부터 시작할 수 있다. */
  unlock(): void {
    this.backend.unlock();
    this.bgmWanted = true;
    this.syncBgm();
  }
  /** 앱 숨김(백그라운드·화면 꺼짐): 모든 소리 정지, 복귀 시 재개(UI-CONTRACT 5절과 같은 신호). */
  setHidden(hidden: boolean): void {
    if (hidden === this.hidden) return;
    this.hidden = hidden;
    if (hidden) {
      this.backend.stopAllSfx();
      this.backend.suspend();
    } else {
      this.backend.resume();
    }
    this.syncBgm();
  }
  /** 일시정지(메뉴) 중에는 게임 이벤트 소리가 없고 배경음은 낮춘다. 버튼 소리는 계속 난다. */
  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    this.menuDuck = paused;
    this.applyBgmVolume();
  }
  private duckNow(): boolean {
    return this.menuDuck || this.now() < this.resultDuckUntil;
  }
  private applyBgmVolume(): void {
    this.backend.setBgmVolume(this.duckNow() ? BGM_DUCKED_VOLUME : BGM_VOLUME);
  }
  private syncBgm(): void {
    if (this.bgmWanted && this.settings.bgm && !this.hidden) {
      this.backend.startBgm();
      this.applyBgmVolume();
    } else this.backend.stopBgm();
  }

  // ───────── 재생 ─────────
  /** 버튼·거부 등 UI 소리. 일시정지 중에도 난다. */
  playUi(name: SfxName): boolean {
    return this.request(name);
  }
  /** 세션이 한 틱에서 낸 이벤트 묶음. 일시정지 중에는 무시. */
  onEvents(events: readonly ({ readonly type: string } & Readonly<Record<string, unknown>>)[], towerTypeOf: (towerId: number) => TowerType | undefined): void {
    if (this.paused) return;
    for (const e of events) {
      for (const name of soundsForEvent(e, towerTypeOf)) {
        this.request(name);
        if (name === "victory" || name === "defeat") this.duckAfterResult();
      }
    }
  }
  private duckAfterResult(): void {
    this.resultDuckUntil = this.now() + RESULT_DUCK_MS;
    this.applyBgmVolume();
    if (this.duckTimer !== null) clearTimeout(this.duckTimer);
    this.duckTimer = setTimeout(() => {
      this.duckTimer = null;
      this.applyBgmVolume();
    }, RESULT_DUCK_MS + 10);
  }

  private request(name: SfxName): boolean {
    if (!this.settings.sfx || this.hidden) return false;
    const cfg = SFX_CONFIG[name];
    const t = this.now();
    const prev = this.last.get(name);
    if (prev !== undefined && t - prev < cfg.minIntervalMs) return false;
    if ((this.active.get(name) ?? 0) >= cfg.maxConcurrent || this.activeTotal >= GLOBAL_MAX_CONCURRENT) return false;
    this.last.set(name, t);
    this.active.set(name, (this.active.get(name) ?? 0) + 1);
    this.activeTotal += 1;
    this.log.push({ name, atMs: t });
    if (this.log.length > 200) this.log.splice(0, this.log.length - 200);
    let ended = false;
    this.backend.play(name, cfg.volume, () => {
      if (ended) return;
      ended = true;
      this.active.set(name, Math.max(0, (this.active.get(name) ?? 1) - 1));
      this.activeTotal = Math.max(0, this.activeTotal - 1);
    });
    return true;
  }
}

export { DEFAULT_AUDIO_SETTINGS };
