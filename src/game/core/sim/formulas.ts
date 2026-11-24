// SIM-CONTRACT 3.3: 파생 능력치 정수 식. 속도는 먼저 mt/틱으로 변환한 뒤 특성·둔화를 적용한다.
// 입력 수치는 전부 호출자 책임이며 이 파일은 게임 수치를 정하지 않는다.
import { BP_ONE, addSafe, applyBp, assertSafeInteger, floorBp } from "./intmath";

/** maxHp = max(1, applyBp(baseHp, 10000 + hpBoostBp)). */
export function boostedMaxHp(baseHp: number, hpBoostBp: number): number {
  return Math.max(1, applyBp(baseHp, addSafe(BP_ONE, hpBoostBp)));
}

/** effectiveSlowBp = applyBp(baseSlowBp, 10000 − controlResistanceBp), controlResistanceBp ∈ [0, 10000]. */
export function effectiveSlowBp(baseSlowBp: number, controlResistanceBp: number): number {
  const r = assertSafeInteger(controlResistanceBp, "controlResistanceBp");
  if (r < 0 || r > BP_ONE) throw new RangeError(`controlResistanceBp: 0..10000 범위 밖 (${r})`);
  return applyBp(baseSlowBp, BP_ONE - r);
}

/** 데이터 속도(mt/초)는 20의 배수여야 한다. 반환은 mt/틱. */
export function baseSpeedPerTick(speedMtPerSec: number): number {
  const v = assertSafeInteger(speedMtPerSec, "speedMtPerSec");
  if (v < 0 || v % 20 !== 0) throw new RangeError(`speedMtPerSec: 0 이상 20의 배수여야 함 (${v})`);
  return v / 20;
}

/** boostedSpeedPerTick = max(1, applyBp(baseSpeedPerTick, 10000 + speedBoostBp)). */
export function boostedSpeedPerTick(baseSpeed: number, speedBoostBp: number): number {
  return Math.max(1, applyBp(baseSpeed, addSafe(BP_ONE, speedBoostBp)));
}

/** speedPerTick = max(1, applyBp(boostedSpeedPerTick, 10000 − 가장 큰 effectiveSlowBp)), 둔화 bp ≤ 10000. */
export function slowedSpeedPerTick(boostedSpeed: number, largestEffectiveSlowBp: number): number {
  const s = assertSafeInteger(largestEffectiveSlowBp, "largestEffectiveSlowBp");
  if (s < 0 || s > BP_ONE) throw new RangeError(`largestEffectiveSlowBp: 0..10000 범위 밖 (${s})`);
  return Math.max(1, applyBp(boostedSpeed, BP_ONE - s));
}

/** SPEC 8절: refund = floor(실제 누적 지출 × 환급률). 거래별 floor 합이 아니라 최종 한 번 내림. */
export function refundFor(actuallyPaid: number, refundRateBp: number): number {
  return floorBp(actuallyPaid, refundRateBp);
}
