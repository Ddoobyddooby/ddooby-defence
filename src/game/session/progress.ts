// 스테이지 진행 상태 (UI-CONTRACT 4절, SPEC 10절). UI-01 은 세션 메모리 구현만 둔다. SAVE-01 이 같은 인터페이스로 영구 저장을 붙인다.
import type { ContentValidation } from "../core/content/types";

export interface ProgressStore {
  /** 클리어한 stageId 목록(해금은 여기서 파생). */
  getCleared(): readonly string[];
  markCleared(stageId: string): void;
}

export class MemoryProgressStore implements ProgressStore {
  private readonly cleared = new Set<string>();
  getCleared(): readonly string[] {
    return [...this.cleared].sort();
  }
  markCleared(stageId: string): void {
    this.cleared.add(stageId);
  }
}

export type StageCardState = "locked" | "available" | "cleared" | "contentError";

export interface StageCard {
  readonly index: number;
  readonly stageId: string | null;
  readonly state: StageCardState;
  /** 콘텐츠 오류일 때 진단 문구("경로: 사유"). */
  readonly diagnostics: readonly string[];
}

/**
 * 카드 상태 파생. 우선순위: 콘텐츠 오류(전역 오류면 모든 스테이지) > 클리어 > (Stage 1 이거나 이전 스테이지 클리어면) 선택 가능 > 잠김.
 * 클리어 플래그가 있어도 콘텐츠가 깨졌으면 오류로 보인다(진입 불가, SPEC 10절 "가짜 데이터로 대체하지 않음").
 */
export function deriveStageCards(validation: ContentValidation, stageIds: readonly (string | null)[], cleared: readonly string[]): StageCard[] {
  const clearedSet = new Set(cleared);
  const global = validation.globalErrors.map((e) => `${e.path}: ${e.message}`);
  return stageIds.map((stageId, index): StageCard => {
    const own = (validation.stages[index]?.errors ?? []).map((e) => `${e.path}: ${e.message}`);
    const diagnostics = [...global, ...own];
    if (diagnostics.length > 0) return { index, stageId, state: "contentError", diagnostics };
    if (stageId !== null && clearedSet.has(stageId)) return { index, stageId, state: "cleared", diagnostics: [] };
    const prev = index === 0 ? true : stageIds[index - 1] !== null && clearedSet.has(stageIds[index - 1] as string);
    return { index, stageId, state: prev ? "available" : "locked", diagnostics: [] };
  });
}

export const isEnterable = (card: StageCard): boolean => card.state === "available" || card.state === "cleared";
