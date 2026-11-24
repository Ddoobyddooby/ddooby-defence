// SIM-CONTRACT 2절: 논리 틱 50ms, 데이터의 모든 시간은 정수 ms·50의 배수, 시각 비교는 정수 틱.
import { addSafe, assertSafeInteger, mulSafe } from "./intmath";

export const TICK_MS = 50;

/** 0 이상 50의 배수인 ms를 틱으로. 0 허용(예: Segment startMs). 지속시간 필드는 durationMsToTicks를 쓴다. */
export function msToTicks(ms: unknown, name = "ms"): number {
  const v = assertSafeInteger(ms, name);
  if (v < 0) throw new RangeError(`${name}: 음수 불가 (${v})`);
  if (v % TICK_MS !== 0) throw new RangeError(`${name}: ${TICK_MS}의 배수가 아님 (${v})`);
  return v / TICK_MS;
}

/** 준비 시간·둔화 지속·공격 주기·TTL: 하한 50ms(1틱). 0은 오류이며 몰래 1틱으로 보정하지 않는다. */
export function durationMsToTicks(ms: unknown, name = "durationMs"): number {
  const ticks = msToTicks(ms, name);
  if (ticks < 1) throw new RangeError(`${name}: 최소 ${TICK_MS}ms(1틱) 필요 (${String(ms)})`);
  return ticks;
}

export function ticksToMs(ticks: number): number {
  return mulSafe(assertSafeInteger(ticks, "ticks"), TICK_MS);
}

/** 둔화: 틱 T 4단계 명중 시 expireTick = T + durationTicks. */
export function expireTickFor(hitTick: number, durationMs: unknown): number {
  return addSafe(assertSafeInteger(hitTick, "hitTick"), durationMsToTicks(durationMs, "slowDurationMs"));
}

/** 만료 판정은 항상 `tick >= expireTick`. */
export function isExpired(tick: number, expireTick: number): boolean {
  return assertSafeInteger(tick, "tick") >= assertSafeInteger(expireTick, "expireTick");
}

export interface SpawnSegment {
  readonly startMs: number;
  readonly count: number;
  readonly intervalMs: number;
}

export interface PlannedSpawn {
  readonly tick: number;
  readonly segmentIndex: number;
  readonly index: number;
}

/**
 * Segment 생성 틱 = waveStartTick + (startMs + i × intervalMs) / 50. 반환은 enemyId 부여 순서
 * (생성 틱, Segment 원본 순서, Segment 내 순번) 오름차순. count ≥ 1, count > 1이면 intervalMs ≥ 50,
 * count == 1이면 intervalMs는 0 또는 유효한 50 배수.
 */
export function planSpawns(waveStartTick: number, segments: readonly SpawnSegment[]): PlannedSpawn[] {
  assertSafeInteger(waveStartTick, "waveStartTick");
  const plan: PlannedSpawn[] = [];
  segments.forEach((seg, segmentIndex) => {
    const where = `segments[${segmentIndex}]`;
    const count = assertSafeInteger(seg.count, `${where}.count`);
    if (count < 1) throw new RangeError(`${where}.count: 1 이상이어야 함 (${count})`);
    const startTicks = msToTicks(seg.startMs, `${where}.startMs`);
    const intervalTicks =
      count > 1 ? durationMsToTicks(seg.intervalMs, `${where}.intervalMs`) : msToTicks(seg.intervalMs, `${where}.intervalMs`);
    for (let index = 0; index < count; index += 1) {
      const offset = addSafe(startTicks, mulSafe(index, intervalTicks));
      plan.push({ tick: addSafe(waveStartTick, offset), segmentIndex, index });
    }
  });
  return plan.sort((a, b) => a.tick - b.tick || a.segmentIndex - b.segmentIndex || a.index - b.index);
}
