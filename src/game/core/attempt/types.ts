// SIM-01 — 시도 코어 공개 타입 (SIM-CONTRACT 12절). 12.4 확장 지점은 SIM-02·ECON-01이 채운다.
import type { EnemyType, TowerType, TraitType } from "../content/types";
import type { TargetingMode } from "../sim/commands";
import type { EventType } from "../sim/events";

export type AttemptPhase = "preparation" | "combat" | "victory" | "defeat";
export type AttemptOutcome = "victory" | "defeat";

export interface SlowView {
  readonly sourceTowerId: number;
  /** 저항 반영 후 실효 bp. */
  readonly slowBp: number;
  readonly expireTick: number;
}

export interface EnemyView {
  readonly id: number;
  readonly enemyType: EnemyType;
  readonly trait: TraitType | null;
  readonly hp: number;
  readonly maxHp: number;
  /** 둔화 전 기본 속도(속도 강화 반영, mt/틱). 생성 시 고정. */
  readonly speedPerTick: number;
  readonly pathProgress: number;
  readonly baseDamage: number;
  /** 유형 killReward + 특성 killRewardBonus. */
  readonly killReward: number;
  /** 활성 둔화(sourceTowerId 오름차순, 14.2). */
  readonly slows: readonly SlowView[];
}

export type AttemptEvent = Readonly<Record<string, unknown>> & {
  readonly eventSeq: number;
  readonly tick: number;
  readonly type: EventType;
};

export interface LedgerEntry {
  readonly tick: number;
  readonly eventSeq: number;
  readonly key: string;
  readonly delta: number;
  readonly goldAfter: number;
}

/** 4단계(발사·충돌) 문맥 — 적 HP를 줄일 수만 있고 제거·골드·결과는 SIM-01 단계가 한다. */
export interface FireHookContext {
  readonly tick: number;
  readonly enemies: readonly EnemyView[];
  /** 살아 있는 적의 HP를 amount 만큼 줄인다(0 미만이면 0). 없는 적 id·amount < 0 은 오류. */
  damage(enemyId: number, amount: number): void;
}

export interface AttemptHooks {
  // 훅은 동기 함수다(Promise 반환은 프로토콜 오류). 쓰기 함수(damage)는 그 훅 호출 동안만 유효하다.
  // 2단계(둔화 만료)·6단계(속도)는 SIM-02 부터 코어가 직접 처리한다(14절). 제품 코드는 훅을 넘기지 않는다.
  /** TEST_ONLY 4단계. 코어 발사·투사체 처리(b) 뒤에 실행된다(14.7). */
  fire?(ctx: FireHookContext): undefined;
}

/** 스냅샷 `towers` 항목과 같은 모양(13.1). */
export interface TowerView {
  readonly towerId: number;
  readonly type: TowerType;
  readonly cell: { readonly col: number; readonly row: number };
  readonly level: number;
  readonly targetingMode: TargetingMode;
  readonly actuallyPaid: number;
  /** 이 틱 이상이면 발사 가능(14.2). */
  readonly nextFireTick: number;
}
