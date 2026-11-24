// SIM-CONTRACT 11.5 — 검증된 웨이브의 Segment 를 planSpawns 로 일정에 전개한다(enemyType·trait 포함).
import { planSpawns } from "../sim/time";
import type { EnemyType, TraitType, WaveDef } from "./types";

export interface ExpandedSpawn {
  readonly tick: number;
  readonly segmentIndex: number;
  readonly index: number;
  readonly enemyType: EnemyType;
  readonly trait: TraitType | null;
}

/** 순서: (생성 틱, Segment 원본 순서, Segment 내 순번). 같은 웨이브 안 Segment 겹침은 허용. */
export function expandWave(wave: WaveDef, waveStartTick: number): ExpandedSpawn[] {
  return planSpawns(waveStartTick, wave.segments).map((p) => ({
    ...p,
    enemyType: wave.segments[p.segmentIndex].enemyType,
    trait: wave.segments[p.segmentIndex].trait,
  }));
}
