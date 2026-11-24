// TEST_ONLY — 제품 코드에서 import 금지. 동시 사건을 만들기 위한 주입 훅(SIM-02·ECON-01 이 실제 처리기로 대체한다).
import type { AttemptHooks } from "../types";

/** 지정한 틱의 4단계에서 해당 적의 HP 를 0 으로 만든다. 살아 있지 않으면 무시한다(중복 주입 안전). */
export function killAt(...targets: readonly { readonly tick: number; readonly enemyId: number }[]): AttemptHooks {
  return {
    fire(ctx) {
      for (const t of targets) {
        if (t.tick !== ctx.tick) continue;
        const e = ctx.enemies.find((x) => x.id === t.enemyId);
        if (e !== undefined) ctx.damage(t.enemyId, e.hp);
      }
    },
  };
}

/** 여러 훅 객체를 합친다. 같은 훅은 인자 순서대로 모두 실행한다(enemySpeed 는 첫 정의만 사용). */
export function combineHooks(...parts: readonly AttemptHooks[]): AttemptHooks {
  return {
    enemySpeed: parts.find((p) => p.enemySpeed)?.enemySpeed,
    expireSlows(ctx) {
      for (const p of parts) p.expireSlows?.(ctx);
    },
    fire(ctx) {
      for (const p of parts) p.fire?.(ctx);
    },
  };
}
