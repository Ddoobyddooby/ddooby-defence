// SND-01: Web Audio 백엔드. public/assets/audio/<이름>.ogg 를 처음 쓸 때 불러 디코딩하고, 없거나 실패한 소리는 조용히 생략한다.
import type { AudioBackend } from "./soundEngine";
import type { SfxName } from "./soundMap";

const BASE = "/assets/audio/";
const BGM_FILE = "bgm-main";
const SFX_MASTER = 0.8;

type Ctx = AudioContext;

export class WebAudioBackend implements AudioBackend {
  private ctx: Ctx | null = null;
  private readonly buffers = new Map<string, AudioBuffer | null>();
  private readonly loading = new Map<string, Promise<AudioBuffer | null>>();
  private readonly playing = new Set<AudioBufferSourceNode>();
  private bgmGain: GainNode | null = null;
  private bgmSource: AudioBufferSourceNode | null = null;
  private bgmVolume = 0.25;
  private bgmWanted = false;

  /** 검증용 상태(개발 빌드 콘솔에서 읽는다). */
  debugState(): { bgmPlaying: boolean; bgmLoop: boolean; bgmVolume: number; ctx: string } {
    return { bgmPlaying: this.bgmSource !== null, bgmLoop: this.bgmSource?.loop ?? false, bgmVolume: this.bgmGain?.gain.value ?? -1, ctx: this.ctx?.state ?? "none" };
  }

  private context(): Ctx | null {
    if (this.ctx !== null) return this.ctx;
    try {
      const C = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as typeof AudioContext | undefined;
      if (C === undefined) return null;
      this.ctx = new C();
      return this.ctx;
    } catch {
      return null;
    }
  }

  private load(name: string): Promise<AudioBuffer | null> {
    const have = this.buffers.get(name);
    if (have !== undefined) return Promise.resolve(have);
    const pending = this.loading.get(name);
    if (pending !== undefined) return pending;
    const ctx = this.context();
    if (ctx === null) return Promise.resolve(null);
    const p = fetch(`${BASE}${name}.ogg`)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((data) => ctx.decodeAudioData(data))
      .catch(() => null)
      .then((b) => {
        this.buffers.set(name, b);
        this.loading.delete(name);
        return b;
      });
    this.loading.set(name, p);
    return p;
  }

  unlock(): void {
    const ctx = this.context();
    if (ctx !== null && ctx.state === "suspended") void ctx.resume().catch(() => undefined);
  }

  play(name: SfxName, volume: number, onEnded: () => void): void {
    const ctx = this.context();
    if (ctx === null) return onEnded();
    void this.load(`sfx-${name}`).then((buf) => {
      if (buf === null || ctx.state === "closed") return onEnded();
      const src = ctx.createBufferSource();
      const gain = ctx.createGain();
      gain.gain.value = volume * SFX_MASTER;
      src.buffer = buf;
      src.connect(gain).connect(ctx.destination);
      src.onended = () => {
        this.playing.delete(src);
        onEnded();
      };
      this.playing.add(src);
      src.start();
    });
  }

  stopAllSfx(): void {
    for (const s of [...this.playing]) {
      try {
        s.stop();
      } catch {
        /* 이미 끝남 */
      }
    }
  }

  startBgm(): void {
    this.bgmWanted = true;
    if (this.bgmSource !== null) return;
    const ctx = this.context();
    if (ctx === null) return;
    void this.load(BGM_FILE).then((buf) => {
      if (buf === null || !this.bgmWanted || this.bgmSource !== null) return;
      const gain = ctx.createGain();
      gain.gain.value = this.bgmVolume;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(gain).connect(ctx.destination);
      src.start();
      this.bgmGain = gain;
      this.bgmSource = src;
    });
  }

  stopBgm(): void {
    this.bgmWanted = false;
    if (this.bgmSource !== null) {
      try {
        this.bgmSource.stop();
      } catch {
        /* 이미 끝남 */
      }
      this.bgmSource = null;
      this.bgmGain = null;
    }
  }

  setBgmVolume(volume: number): void {
    this.bgmVolume = volume;
    if (this.bgmGain !== null) this.bgmGain.gain.value = volume;
  }

  suspend(): void {
    if (this.ctx !== null && this.ctx.state === "running") void this.ctx.suspend().catch(() => undefined);
  }
  resume(): void {
    if (this.ctx !== null && this.ctx.state === "suspended") void this.ctx.resume().catch(() => undefined);
  }
}
