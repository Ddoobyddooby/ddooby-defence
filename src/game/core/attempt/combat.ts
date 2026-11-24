// SIM-02 — 전투 순수 helper (SIM-CONTRACT 14.6). 상태를 바꾸지 않는다. 비교는 모두 정수.
import type { TargetingMode } from "../sim/commands";

/** 사거리 안 후보 한 명. d2 = 타워 중심~적 위치 거리². */
export interface TargetCandidate {
  readonly id: number;
  readonly pathProgress: number;
  readonly hp: number;
  readonly d2: number;
}

/** a 가 b 보다 우선이면 음수. 동률 규칙: 진행도는 큰 쪽, 순번(=enemyId)은 작은 쪽(14.6). 저장 순서에 의존하지 않는다. */
function compare(mode: TargetingMode, a: TargetCandidate, b: TargetCandidate): number {
  switch (mode) {
    case "first":
      return b.pathProgress - a.pathProgress || a.id - b.id;
    case "last":
      return a.pathProgress - b.pathProgress || a.id - b.id;
    case "close":
      return a.d2 - b.d2 || b.pathProgress - a.pathProgress || a.id - b.id;
    case "strong":
      return b.hp - a.hp || b.pathProgress - a.pathProgress || a.id - b.id;
  }
}

export function pickTarget(mode: TargetingMode, candidates: readonly TargetCandidate[]): TargetCandidate | undefined {
  let best: TargetCandidate | undefined;
  for (const c of candidates) if (best === undefined || compare(mode, c, best) < 0) best = c;
  return best;
}
