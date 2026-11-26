// UI-03 — 웨이브 미리보기 파생(UI-CONTRACT 7.1).
import { describe, expect, it } from "vitest";
import { GAME_CONTENT } from "../content/gameContent";
import { DEV_PLACEHOLDER } from "../content/devBundle";
import { expandWave } from "../core/content/expandWave";
import type { SegmentDef, WaveDef } from "../core/content/types";
import { MemoryProgressStore } from "./progress";
import { GameSession } from "./session";
import { wavePreview } from "./wavePreview";

const seg = (enemyType: SegmentDef["enemyType"], trait: SegmentDef["trait"], count: number): SegmentDef => ({ enemyType, trait, count, startMs: 0, intervalMs: 500 });
const wave = (segments: SegmentDef[]): WaveDef => ({ segments }) as unknown as WaveDef;

describe("wavePreview", () => {
  it("같은 (종류, 특성) 구간은 합산하고 처음 등장 순서를 지킨다", () => {
    const g = wavePreview(wave([seg("fast", null, 3), seg("normal", null, 4), seg("fast", null, 2)]));
    expect(g).toEqual([
      { enemyType: "fast", trait: null, count: 5 },
      { enemyType: "normal", trait: null, count: 4 },
    ]);
  });
  it("같은 종류라도 특성이 다르면 다른 묶음", () => {
    const g = wavePreview(wave([seg("heavy", null, 2), seg("heavy", "hpBoost", 1), seg("heavy", null, 1), seg("heavy", "hpBoost", 2)]));
    expect(g).toEqual([
      { enemyType: "heavy", trait: null, count: 3 },
      { enemyType: "heavy", trait: "hpBoost", count: 3 },
    ]);
  });
});

describe("hudView.preview (세션 경유)", () => {
  const battle = (s: GameSession) => s.getState().battle!;
  it("준비 단계(일시정지 중 포함)에는 현재 웨이브 구성, 전투 단계에는 null, 다음 준비 단계에는 다음 웨이브 구성", () => {
    const s = new GameSession({ bundle: DEV_PLACEHOLDER, store: new MemoryProgressStore() });
    s.startStage(0);
    s.advance(0);
    const p = battle(s).hud.preview;
    expect(p).not.toBeNull();
    expect(p!.length).toBeGreaterThanOrEqual(1);
    s.pause();
    expect(battle(s).hud.preview).toEqual(p);
    s.resume();
    s.startWave();
    s.advance(100);
    expect(battle(s).hud.phase).toBe("combat");
    expect(battle(s).hud.preview).toBeNull();
    s.pause();
    expect(battle(s).hud.preview).toBeNull();
  });
  it("결과 단계에는 null", () => {
    const b = structuredClone(DEV_PLACEHOLDER) as unknown as { enemies: { speedMtPerSec: number }[]; stages: { baseHp: number }[] };
    for (const e of b.enemies) e.speedMtPerSec = 100000;
    for (const st of b.stages) st.baseHp = 1;
    const s = new GameSession({ bundle: b, store: new MemoryProgressStore() });
    s.startStage(0);
    s.startWave();
    for (let i = 0; i < 400 && battle(s).result === null; i++) s.advance(50);
    expect(battle(s).result).not.toBeNull();
    expect(battle(s).hud.preview).toBeNull();
  });
});

describe("GAME_CONTENT 전 스테이지·웨이브", () => {
  it("모든 웨이브에서 묶음 ≥1, 합계 = 웨이브 총 마릿수(expandWave 길이)", () => {
    let n = 0;
    for (const st of GAME_CONTENT.stages) {
      st.waves.forEach((w, i) => {
        const g = wavePreview(w);
        expect(g.length, `${st.stageId} 웨이브${i + 1}`).toBeGreaterThanOrEqual(1);
        expect(g.reduce((a, x) => a + x.count, 0)).toBe(expandWave(w, 0).length);
        n++;
      });
    }
    expect(n).toBe(25);
  });
});
