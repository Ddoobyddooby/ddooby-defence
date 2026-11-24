// SIM-01 — 시도 코어 공개 타입 (SIM-CONTRACT 12절). 12.4 확장 지점은 SIM-02·ECON-01이 채운다.
import type { StageContent, EnemyType, TraitType } from "../content/types";
import type { Command } from "../sim/commands";
import type { EventType, RejectReason } from "../sim/events";

export type AttemptPhase = "preparation" | "combat" | "victory" | "defeat";
export type AttemptOutcome = "victory" | "defeat";

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

/** 1단계 명령 처리기가 쓰는 문맥. 상태는 emit·settle 로만 바꾼다. */
export interface CommandHookContext {
  readonly tick: number;
  readonly phase: AttemptPhase;
  readonly gold: number;
  readonly stage: StageContent;
  /** 이벤트를 남긴다(eventSeq 소비). */
  emit(type: EventType, fields: Readonly<Record<string, unknown>>): void;
  /** 경제 정산: 키 `localKey`가 이미 소비됐으면 false(아무것도 하지 않음). 정산 뒤 골드가 음수면 RangeError. */
  settle(localKey: string, delta: number, type: EventType, fields: Readonly<Record<string, unknown>>): boolean;
}

/** 2단계(둔화 만료) 문맥 — SIM-01에는 바꿀 상태가 없다. */
export interface SlowHookContext {
  readonly tick: number;
  readonly enemies: readonly EnemyView[];
}

/** 4단계(발사·충돌) 문맥 — 적 HP를 줄일 수만 있고 제거·골드·결과는 SIM-01 단계가 한다. */
export interface FireHookContext {
  readonly tick: number;
  readonly enemies: readonly EnemyView[];
  /** 살아 있는 적의 HP를 amount 만큼 줄인다(0 미만이면 0). 없는 적 id·amount < 0 은 오류. */
  damage(enemyId: number, amount: number): void;
}

export interface AttemptHooks {
  /** build·upgrade·sell·setTargeting 처리. 거부 사유를 돌려주거나 null(처리 완료). 기본: unsupportedKind. */
  handleCommand?(ctx: CommandHookContext, command: Command): RejectReason | null;
  /** 2단계. */
  expireSlows?(ctx: SlowHookContext): void;
  /** 4단계. */
  fire?(ctx: FireHookContext): void;
  /** 6단계 이동 속도(mt/틱, ≥ 1 안전 정수). 기본: 적의 speedPerTick. */
  enemySpeed?(enemy: EnemyView): number;
}
