// TEST_ONLY — 시도 테스트용 콘텐츠 묶음. 검증된 DATA-01 fixture 위에 시나리오에 맞춰 값을 바꾼다. 수치는 밸런스 후보가 아니다.
import { seg, validBundle, withValue, withValues } from "../../content/testing/fixtures";
import { WAVE_ROLES } from "../../content/types";

export const STAGE2_ID = "stage-2-snowfall-pass"; // 경로 37칸 → pathLengthMt 36000, initialGold 350, baseHp 25
export const STAGE1_ID = "stage-1-meadow-outpost"; // 경로 50칸 → pathLengthMt 49000

export interface WaveSpec {
  readonly prepMs: number;
  readonly clearReward: number;
  readonly segments: readonly unknown[];
}

/** 스테이지 2 의 웨이브를 spec 5개로 바꾼다. normal 은 100000mt/s(5000mt/틱)로 빠르고 baseDamage 는 `normalDamage`. */
export function stage2Bundle(waves: readonly WaveSpec[], options: { readonly normalDamage?: number } = {}): unknown {
  if (waves.length !== 5) throw new Error("웨이브 5개 필요");
  return withValues([
    ["enemies[0].speedMtPerSec", 100_000],
    ["enemies[0].baseDamage", options.normalDamage ?? 1],
    ["stages[1].waves", waves.map((w, i) => ({ waveIndex: i + 1, role: WAVE_ROLES[i], prepMs: w.prepMs, clearReward: w.clearReward, segments: w.segments }))],
  ]);
}

/** 5개 웨이브 모두 같은 spec. */
export function uniformStage2(spec: WaveSpec, options: { readonly normalDamage?: number } = {}): unknown {
  return stage2Bundle([spec, spec, spec, spec, spec], options);
}

export { seg, validBundle, withValue, withValues };
