// 스테이지 진행 상태·영구 저장 (UI-CONTRACT 4·10절, SPEC 10절, SAVE-01).
import type { ContentValidation } from "../core/content/types";

/** 저장소 읽기 결과(UI-CONTRACT 10절). ok=저장 값 읽음, empty=저장 값 없음, unreadable=깨짐·형식 불일치·모르는 version(원문은 corrupt 키로 보존), unavailable=저장소를 쓸 수 없음. */
export type LoadStatus = "ok" | "empty" | "unreadable" | "unavailable";
/** 저장 상태(SPEC 9절). localStorage 는 동기라 pending 은 화면에 거의 안 보인다. */
export type SaveStatus = "pending" | "saved" | "failed";

export interface ProgressStore {
  /** 시작 시 1회 읽는다(세션 생성자). 실패해도 던지지 않고 빈 기록으로 시작한다. */
  load(): LoadStatus;
  /** 메모리 기준 클리어 stageId 목록(해금은 여기서 파생). 저장 성공과 무관하다. 모르는 id 도 포함한다. */
  getCleared(): readonly string[];
  /** 메모리에 즉시 반영하고 저장을 시도한다. */
  markCleared(stageId: string): SaveStatus;
  /** 메모리의 전체 기록을 다시 저장한다. */
  retrySave(): SaveStatus;
  /** 마지막 저장 시도 결과(시도 전에는 saved). */
  getSaveStatus(): SaveStatus;
}

export interface StorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const PROGRESS_KEY = "ddooby-defence.progress";
export const PROGRESS_CORRUPT_KEY = "ddooby-defence.progress.corrupt";
/** 읽을 수 없는 원문 백업 슬롯(먼저 보존한 것을 지키며 다른 원문은 다음 빈 칸). */
const BACKUP_KEYS = [PROGRESS_CORRUPT_KEY, ...[2, 3, 4, 5].map((n) => `${PROGRESS_CORRUPT_KEY}.${n}`)];
const PROGRESS_VERSION = 1;

/** 테스트·대체용 메모리 저장소(항상 저장 성공). */
export class MemoryProgressStore implements ProgressStore {
  private readonly cleared = new Set<string>();
  load(): LoadStatus {
    return "empty";
  }
  getCleared(): readonly string[] {
    return [...this.cleared].sort();
  }
  markCleared(stageId: string): SaveStatus {
    this.cleared.add(stageId);
    return "saved";
  }
  retrySave(): SaveStatus {
    return "saved";
  }
  getSaveStatus(): SaveStatus {
    return "saved";
  }
}

/**
 * 브라우저 localStorage 백엔드. 서버(정적 export 빌드·SSR)에는 window 가 없고, 접근 자체가 SecurityError 를 던질 수도 있어 null 을 돌려준다.
 * 호출은 클라이언트에서만 의미가 있다(서버에서는 사용 불가로 취급될 뿐 아무것도 쓰지 않는다).
 */
export function browserStorageBackend(): StorageBackend | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

type Parsed = { ok: true; cleared: string[] } | { ok: false };

/** `{"version":1,"cleared":[...]}` 만 읽는다. 그 외(JSON 깨짐·객체 아님·모르는 version·cleared 가 배열 아님)는 읽기 실패. 문자열이 아닌 항목만 버린다. */
function parseProgress(raw: string): Parsed {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return { ok: false };
  }
  if (typeof v !== "object" || v === null || Array.isArray(v)) return { ok: false };
  const o = v as { version?: unknown; cleared?: unknown };
  if (o.version !== PROGRESS_VERSION || !Array.isArray(o.cleared)) return { ok: false };
  return { ok: true, cleared: o.cleared.filter((x): x is string => typeof x === "string") };
}

/** 영구 저장소(UI-CONTRACT 10절). 클리어는 저장 성공과 무관하게 메모리에 즉시 반영된다. */
export class LocalStorageProgressStore implements ProgressStore {
  private readonly cleared = new Set<string>();
  private saveStatus: SaveStatus = "saved";
  constructor(private readonly backend: StorageBackend | null) {}

  load(): LoadStatus {
    const backend = this.backend;
    if (backend === null) return "unavailable";
    let raw: string | null;
    try {
      raw = backend.getItem(PROGRESS_KEY);
    } catch {
      return "unavailable";
    }
    if (raw === null) return "empty";
    const parsed = parseProgress(raw);
    if (!parsed.ok) {
      this.preserveCorrupt(backend, raw);
      return "unreadable";
    }
    for (const id of parsed.cleared) this.cleared.add(id);
    return "ok";
  }

  /** 읽지 못한 원문 보존(load 용): 실패해도 던지지 않는다. 쓰기 전에는 `ensureBackup` 이 다시 확인한다. */
  private preserveCorrupt(backend: StorageBackend, raw: string): void {
    try {
      this.ensureBackup(backend, raw);
    } catch {
      // 보존 실패는 읽기 결과에 영향을 주지 않는다(빈 기록으로 계속). 본 키는 보존이 확인되기 전에는 덮어쓰지 않는다(write).
    }
  }

  /** 원문이 백업 슬롯 중 하나에 똑같이 있도록 보장한다. 같은 원문이 있으면 그대로, 없으면 빈 첫 슬롯에 쓰고 다시 읽어 확인. 빈 슬롯이 없거나 실패하면 던진다. */
  private ensureBackup(backend: StorageBackend, raw: string): void {
    const values = BACKUP_KEYS.map((k) => backend.getItem(k));
    if (values.includes(raw)) return;
    const i = values.indexOf(null);
    if (i === -1) throw new Error("no free backup slot");
    backend.setItem(BACKUP_KEYS[i], raw);
    if (backend.getItem(BACKUP_KEYS[i]) !== raw) throw new Error("backup not verified");
  }

  getCleared(): readonly string[] {
    return [...this.cleared].sort();
  }

  markCleared(stageId: string): SaveStatus {
    const had = this.cleared.has(stageId);
    this.cleared.add(stageId);
    if (had && this.saveStatus === "saved") return "saved";
    return this.write();
  }

  retrySave(): SaveStatus {
    return this.write();
  }

  getSaveStatus(): SaveStatus {
    return this.saveStatus;
  }

  /**
   * 본 키 쓰기. 매번 먼저 본 키를 다시 읽는다(UI-CONTRACT 10절, 리뷰 F1·F2):
   * 정상 기록이면 메모리에 합친 합집합을 쓰고, 읽을 수 없는 원문이면 백업 보존을 확인한 뒤에만 덮어쓴다. 재읽기·백업이 실패하면 쓰지 않고 failed.
   */
  private write(): SaveStatus {
    this.saveStatus = "pending";
    try {
      const backend = this.backend;
      if (backend === null) throw new Error("storage unavailable");
      const raw = backend.getItem(PROGRESS_KEY);
      if (raw !== null) {
        const parsed = parseProgress(raw);
        if (parsed.ok) for (const id of parsed.cleared) this.cleared.add(id);
        else this.ensureBackup(backend, raw);
      }
      backend.setItem(PROGRESS_KEY, JSON.stringify({ version: PROGRESS_VERSION, cleared: this.getCleared() }));
      this.saveStatus = "saved";
    } catch {
      this.saveStatus = "failed";
    }
    return this.saveStatus;
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
