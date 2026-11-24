// SIM-CONTRACT 5절: 시도별 ID 카운터(1부터, 성공 시에만 소비, 재사용·wrap 금지, 증가는 addSafe).
import { addSafe, assertSafeInteger } from "./intmath";

export interface IdCounters {
  nextCommandSeq: number;
  nextEnemyId: number;
  nextEventSeq: number;
  nextProjectileId: number;
  nextTowerId: number;
}

export type IdKind = "command" | "enemy" | "event" | "projectile" | "tower";

const FIELD: Record<IdKind, keyof IdCounters> = {
  command: "nextCommandSeq",
  enemy: "nextEnemyId",
  event: "nextEventSeq",
  projectile: "nextProjectileId",
  tower: "nextTowerId",
};

export function createIdCounters(): IdCounters {
  return { nextCommandSeq: 1, nextEnemyId: 1, nextEventSeq: 1, nextProjectileId: 1, nextTowerId: 1 };
}

/**
 * ID 하나를 발급하고 카운터를 올린다. 다음 값이 안전 정수를 벗어나면(= 카운터가 한계) RangeError이고
 * 카운터는 변하지 않는다(부분 변경 없음).
 */
export function takeId(counters: IdCounters, kind: IdKind): number {
  const field = FIELD[kind];
  const current = assertSafeInteger(counters[field], field);
  const next = addSafe(current, 1);
  counters[field] = next;
  return current;
}

/** 세션 안에서 새 시도(진입·재도전)마다 1씩 증가하는 attemptId 발급기. 저장하지 않는다. */
export interface AttemptIdSource {
  next(): number;
}

export function createAttemptIdSource(start = 1): AttemptIdSource {
  let nextId = assertSafeInteger(start, "attemptId start");
  if (nextId < 1) throw new RangeError(`attemptId start: 1 이상이어야 함 (${nextId})`);
  return {
    next() {
      const following = addSafe(nextId, 1);
      const issued = nextId;
      nextId = following;
      return issued;
    },
  };
}
