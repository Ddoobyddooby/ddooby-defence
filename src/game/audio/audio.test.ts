// SND-01 — 이벤트 → 소리 매핑, 과다 재생 제한, 일시정지·숨김 규칙, 설정 저장/실패.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUDIO_KEY, loadAudioSettings, saveAudioSettings, type StorageLike } from "./audioSettings";
import { BGM_DUCKED_VOLUME, BGM_VOLUME, type AudioBackend, RESULT_DUCK_MS, SoundEngine } from "./soundEngine";
import { GLOBAL_MAX_CONCURRENT, SFX_CONFIG, SFX_NAMES, type SfxName, soundsForEvent } from "./soundMap";

class FakeBackend implements AudioBackend {
  played: SfxName[] = [];
  ends: (() => void)[] = [];
  calls: string[] = [];
  bgmVolume = -1;
  unlock() { this.calls.push("unlock"); }
  play(name: SfxName, _v: number, onEnded: () => void) { this.played.push(name); this.ends.push(onEnded); }
  stopAllSfx() { this.calls.push("stopAll"); }
  startBgm() { this.calls.push("startBgm"); }
  stopBgm() { this.calls.push("stopBgm"); }
  setBgmVolume(v: number) { this.bgmVolume = v; }
  suspend() { this.calls.push("suspend"); }
  resume() { this.calls.push("resume"); }
}
const mem = (init: Record<string, string> = {}): StorageLike & { data: Record<string, string> } => {
  const data = { ...init };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
};
const ev = (type: string, extra: Record<string, unknown> = {}) => ({ type, eventSeq: 0, tick: 0, ...extra });
const types = { 1: "archer", 2: "ballista", 3: "mage", 4: "frost" } as const;
const towerTypeOf = (id: number) => types[id as keyof typeof types];

describe("soundsForEvent 매핑", () => {
  it("이벤트별 소리", () => {
    const m = (e: ReturnType<typeof ev>) => soundsForEvent(e, towerTypeOf);
    expect(m(ev("towerBuilt"))).toEqual(["build"]);
    expect(m(ev("towerUpgraded"))).toEqual(["upgrade"]);
    expect(m(ev("towerSold"))).toEqual(["sell"]);
    expect(m(ev("waveStarted"))).toEqual(["wave-start"]);
    expect(m(ev("commandRejected"))).toEqual(["error"]);
    expect(m(ev("projectileFired", { towerId: 1 }))).toEqual(["arrow"]);
    expect(m(ev("projectileFired", { towerId: 2 }))).toEqual(["bolt"]);
    expect(m(ev("projectileFired", { towerId: 3 }))).toEqual(["fire"]);
    expect(m(ev("projectileFired", { towerId: 4 }))).toEqual([]);
    expect(m(ev("projectileFired", { towerId: 99 }))).toEqual([]);
    expect(m(ev("projectileExploded"))).toEqual(["explode"]);
    expect(m(ev("slowApplied"))).toEqual(["frost"]);
    expect(m(ev("enemyKilled"))).toEqual(["enemy-die"]);
    expect(m(ev("enemyReachedBase"))).toEqual(["base-hit"]);
    expect(m(ev("resultReached", { outcome: "victory" }))).toEqual(["victory"]);
    expect(m(ev("resultReached", { outcome: "defeat" }))).toEqual(["defeat"]);
    for (const t of ["enemySpawned", "enemyDamaged", "economySettled", "waveCleared", "projectileCancelled", "targetingChanged"]) expect(m(ev(t))).toEqual([]);
  });
  it("15종 모두 설정이 있고 재생 제한 값이 합리적(승리·패배가 가장 크고 발사음이 작다)", () => {
    expect(SFX_NAMES).toHaveLength(15);
    for (const n of SFX_NAMES) {
      const c = SFX_CONFIG[n];
      expect(c.volume).toBeGreaterThan(0);
      expect(c.volume).toBeLessThanOrEqual(1);
      expect(c.maxConcurrent).toBeGreaterThanOrEqual(1);
    }
    expect(SFX_CONFIG.victory.volume).toBeGreaterThan(SFX_CONFIG.arrow.volume);
    for (const n of ["arrow", "bolt", "fire", "enemy-die"] as const) expect(SFX_CONFIG[n].minIntervalMs).toBeGreaterThanOrEqual(60);
  });
});

describe("SoundEngine 재생 규칙", () => {
  let now = 1000;
  let b: FakeBackend;
  let e: SoundEngine;
  beforeEach(() => {
    now = 1000;
    b = new FakeBackend();
    e = new SoundEngine(b, mem(), () => now);
  });
  afterEach(() => vi.useRealTimers());
  const events = (...es: ReturnType<typeof ev>[]) => e.onEvents(es, towerTypeOf);

  it("같은 소리는 실제 시간 최소 간격 안에서는 한 번만(5× 틱 몰림 방지), 간격이 지나면 다시", () => {
    events(ev("enemyKilled"), ev("enemyKilled"), ev("enemyKilled"));
    expect(b.played).toEqual(["enemy-die"]);
    now += 69;
    events(ev("enemyKilled"));
    expect(b.played).toHaveLength(1);
    now += 2;
    events(ev("enemyKilled"));
    expect(b.played).toHaveLength(2);
  });
  it("다른 소리는 서로 막지 않는다", () => {
    events(ev("enemyKilled"), ev("projectileFired", { towerId: 1 }), ev("towerBuilt"));
    expect(b.played).toEqual(["enemy-die", "arrow", "build"]);
  });
  it("같은 소리 동시 재생 상한: 끝나지 않은 소리가 상한이면 막고, 끝나면 다시 허용", () => {
    const max = SFX_CONFIG.arrow.maxConcurrent;
    for (let i = 0; i < max + 2; i++) {
      now += 100;
      events(ev("projectileFired", { towerId: 1 }));
    }
    expect(b.played.filter((n) => n === "arrow")).toHaveLength(max);
    b.ends[0]();
    now += 100;
    events(ev("projectileFired", { towerId: 1 }));
    expect(b.played.filter((n) => n === "arrow")).toHaveLength(max + 1);
  });
  it("모든 소리 합친 동시 상한", () => {
    const names = ["arrow", "bolt", "fire", "explode", "frost", "enemy-die", "build", "upgrade", "sell", "base-hit", "tap", "error"] as const;
    let n = 0;
    for (const name of names) {
      for (let k = 0; k < 4; k++) {
        now += 1000;
        if (e.playUi(name)) n++;
      }
    }
    expect(n).toBeLessThanOrEqual(GLOBAL_MAX_CONCURRENT + 0);
    expect(b.played.length).toBe(GLOBAL_MAX_CONCURRENT);
  });
  it("재생 끝 콜백은 여러 번 불려도 한 번만 센다", () => {
    events(ev("towerBuilt"));
    b.ends[0]();
    b.ends[0]();
    now += 100;
    events(ev("towerBuilt"));
    now += 100;
    events(ev("towerBuilt"));
    expect(b.played).toHaveLength(3); // build 상한 2: 첫 번째 끝남 → 2·3번째 가능(중복 감소로 상한이 깨지지 않음)
    now += 100;
    events(ev("towerBuilt"));
    expect(b.played).toHaveLength(3);
  });
  it("효과음 끄면 아무 소리도 안 나고 재생 중 소리를 멈춘다. 다시 켜면 난다", () => {
    e.setSfx(false);
    expect(b.calls).toContain("stopAll");
    events(ev("towerBuilt"));
    expect(e.playUi("tap")).toBe(false);
    expect(b.played).toEqual([]);
    e.setSfx(true);
    expect(e.playUi("tap")).toBe(true);
  });
  it("일시정지 중에는 게임 이벤트 소리가 없고 버튼 소리는 난다", () => {
    e.setPaused(true);
    events(ev("projectileFired", { towerId: 1 }), ev("enemyKilled"), ev("waveStarted"));
    expect(b.played).toEqual([]);
    expect(e.playUi("tap")).toBe(true);
    e.setPaused(false);
    now += 100;
    events(ev("enemyKilled"));
    expect(b.played).toEqual(["tap", "enemy-die"]);
  });
  it("숨기면 모든 소리·배경음 정지(재생 요청 무시), 복귀하면 재개", () => {
    e.unlock();
    b.calls.length = 0;
    e.setHidden(true);
    expect(b.calls).toEqual(["stopAll", "suspend", "stopBgm"]);
    events(ev("towerBuilt"));
    expect(e.playUi("tap")).toBe(false);
    b.calls.length = 0;
    e.setHidden(false);
    expect(b.calls).toEqual(["resume", "startBgm"]);
    expect(e.playUi("tap")).toBe(true);
  });
  it("배경음: 첫 입력(unlock) 전에는 시작하지 않고, 끄면 정지·켜면 시작", () => {
    e.setBgm(false);
    e.setBgm(true);
    expect(b.calls).not.toContain("startBgm");
    e.unlock();
    expect(b.calls.slice(-2)).toEqual(["unlock", "startBgm"]);
    b.calls.length = 0;
    e.setBgm(false);
    expect(b.calls).toEqual(["stopBgm"]);
    e.setBgm(true);
    expect(b.calls).toEqual(["stopBgm", "startBgm"]);
  });
  it("배경음 볼륨: 일시정지 중 낮춤, 결과 효과음 뒤 잠깐 낮췄다가 복귀", () => {
    vi.useFakeTimers();
    e.unlock();
    expect(b.bgmVolume).toBe(BGM_VOLUME);
    e.setPaused(true);
    expect(b.bgmVolume).toBe(BGM_DUCKED_VOLUME);
    e.setPaused(false);
    expect(b.bgmVolume).toBe(BGM_VOLUME);
    events(ev("resultReached", { outcome: "victory" }));
    expect(b.played).toEqual(["victory"]);
    expect(b.bgmVolume).toBe(BGM_DUCKED_VOLUME);
    now += RESULT_DUCK_MS + 20;
    vi.advanceTimersByTime(RESULT_DUCK_MS + 20);
    expect(b.bgmVolume).toBe(BGM_VOLUME);
  });
});

describe("오디오 설정 저장", () => {
  it("기본값 켜짐, 저장 후 다시 읽으면 유지, 키는 진행 저장과 분리", () => {
    const st = mem();
    const e1 = new SoundEngine(new FakeBackend(), st);
    expect(e1.getSettings()).toEqual({ sfx: true, bgm: true });
    e1.setSfx(false);
    expect(AUDIO_KEY).toBe("ddooby-defence.audio");
    expect(Object.keys(st.data)).toEqual(["ddooby-defence.audio"]);
    expect(new SoundEngine(new FakeBackend(), st).getSettings()).toEqual({ sfx: false, bgm: true });
  });
  it("깨진 값·모르는 version·저장소 없음은 기본값", () => {
    expect(loadAudioSettings(mem({ [AUDIO_KEY]: "{깨짐" }))).toEqual({ sfx: true, bgm: true });
    expect(loadAudioSettings(mem({ [AUDIO_KEY]: JSON.stringify({ version: 9, sfx: false }) }))).toEqual({ sfx: true, bgm: true });
    expect(loadAudioSettings(null)).toEqual({ sfx: true, bgm: true });
    expect(loadAudioSettings(mem({ [AUDIO_KEY]: JSON.stringify({ version: 1, sfx: "x", bgm: false }) }))).toEqual({ sfx: true, bgm: false });
  });
  it("저장·읽기가 던져도 예외 없이 이번 실행 동안 유지", () => {
    const bad: StorageLike = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("quota"); } };
    expect(saveAudioSettings(bad, { sfx: false, bgm: false })).toBe(false);
    const e = new SoundEngine(new FakeBackend(), bad);
    expect(e.getSettings()).toEqual({ sfx: true, bgm: true });
    expect(() => e.setBgm(false)).not.toThrow();
    expect(e.getSettings()).toEqual({ sfx: true, bgm: false });
  });
  it("설정 변경은 구독자에게 알린다", () => {
    const e = new SoundEngine(new FakeBackend(), mem());
    const fn = vi.fn();
    const un = e.subscribe(fn);
    e.setSfx(false);
    e.setSfx(false);
    expect(fn).toHaveBeenCalledTimes(1);
    un();
    e.setBgm(false);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
