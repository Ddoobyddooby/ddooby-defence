import { describe, expect, it } from "vitest";
import { expandWave } from "./expandWave";
import type { WaveDef } from "./types";

const wave: WaveDef = {
  waveIndex: 1,
  role: "basic",
  prepMs: 5000,
  clearReward: 20,
  segments: [
    { startMs: 0, intervalMs: 100, count: 3, enemyType: "normal", trait: null },
    { startMs: 100, intervalMs: 100, count: 2, enemyType: "fast", trait: "hpBoost" },
  ],
};

describe("expandWave (11.5)", () => {
  it("겹치는 Segment 2개: (틱, Segment 순서, 순번) 일정과 enemyType·trait", () => {
    // waveStartTick 10: s0 → 10,12,14 / s1 → 10+2=12, 14
    expect(expandWave(wave, 10)).toEqual([
      { tick: 10, segmentIndex: 0, index: 0, enemyType: "normal", trait: null },
      { tick: 12, segmentIndex: 0, index: 1, enemyType: "normal", trait: null },
      { tick: 12, segmentIndex: 1, index: 0, enemyType: "fast", trait: "hpBoost" },
      { tick: 14, segmentIndex: 0, index: 2, enemyType: "normal", trait: null },
      { tick: 14, segmentIndex: 1, index: 1, enemyType: "fast", trait: "hpBoost" },
    ]);
  });
  it("count 1 + intervalMs 0 은 한 마리, 입력은 바뀌지 않는다", () => {
    const one: WaveDef = { ...wave, segments: [{ startMs: 50, intervalMs: 0, count: 1, enemyType: "heavy", trait: "speedBoost" }] };
    const before = JSON.stringify(one);
    expect(expandWave(one, 0)).toEqual([{ tick: 1, segmentIndex: 0, index: 0, enemyType: "heavy", trait: "speedBoost" }]);
    expect(JSON.stringify(one)).toBe(before);
  });
});
