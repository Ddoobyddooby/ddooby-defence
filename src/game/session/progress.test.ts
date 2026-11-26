import { describe, expect, it } from "vitest";
import { validateContent } from "../core/content/validate";
import { DEV_PLACEHOLDER } from "../content/devBundle";
import { browserStorageBackend, deriveStageCards, isEnterable, LocalStorageProgressStore, MemoryProgressStore, PROGRESS_CORRUPT_KEY, PROGRESS_KEY, type StorageBackend } from "./progress";

const ids = DEV_PLACEHOLDER.stages.map((s) => s.stageId);
const ok = validateContent(DEV_PLACEHOLDER);

describe("deriveStageCards (SPEC 10절·UI-CONTRACT 4절)", () => {
  it("처음: Stage 1 선택 가능, 2·3 잠김", () => {
    expect(deriveStageCards(ok, ids, []).map((c) => c.state)).toEqual(["available", "locked", "locked"]);
  });
  it("Stage 1 클리어 → 1 클리어, 2 선택 가능, 3 잠김. 2 도 클리어 → 3 선택 가능", () => {
    expect(deriveStageCards(ok, ids, [ids[0]]).map((c) => c.state)).toEqual(["cleared", "available", "locked"]);
    expect(deriveStageCards(ok, ids, [ids[0], ids[1]]).map((c) => c.state)).toEqual(["cleared", "cleared", "available"]);
  });
  it("앞 스테이지가 클리어 안 됐으면 뒤 스테이지 클리어 플래그가 있어도 해금 파생은 '클리어'로 보인다(플래그 우선), 3 은 2 클리어 필요", () => {
    expect(deriveStageCards(ok, ids, [ids[2]]).map((c) => c.state)).toEqual(["available", "locked", "cleared"]);
  });
  it("그 스테이지만 콘텐츠 오류: 해당 카드만 contentError + 진단, 다른 카드는 정상 파생", () => {
    const bad = structuredClone(DEV_PLACEHOLDER) as unknown as { stages: { baseHp: number }[] };
    bad.stages[1].baseHp = 0;
    const cards = deriveStageCards(validateContent(bad), ids, [ids[0]]);
    expect(cards.map((c) => c.state)).toEqual(["cleared", "contentError", "locked"]);
    expect(cards[1].diagnostics[0]).toContain("stages[1].baseHp");
    expect(isEnterable(cards[1])).toBe(false);
    expect(isEnterable(cards[0])).toBe(true);
  });
  it("전역 오류는 모든 카드가 contentError, 클리어 플래그가 있어도 오류가 우선", () => {
    const bad = structuredClone(DEV_PLACEHOLDER) as unknown as { economy: { refundRateBp: number } };
    bad.economy.refundRateBp = 10001;
    const cards = deriveStageCards(validateContent(bad), ids, [ids[0]]);
    expect(cards.map((c) => c.state)).toEqual(["contentError", "contentError", "contentError"]);
  });
  it("stageId 를 알 수 없는 자리(null)는 클리어로 보이지 않는다", () => {
    expect(deriveStageCards(ok, [null, ids[1], ids[2]], []).map((c) => c.state)).toEqual(["available", "locked", "locked"]);
  });
});

describe("MemoryProgressStore", () => {
  it("markCleared 는 멱등이고 정렬된 목록을 준다", () => {
    const s = new MemoryProgressStore();
    s.markCleared("b");
    s.markCleared("a");
    s.markCleared("b");
    expect(s.getCleared()).toEqual(["a", "b"]);
  });
});

/** 가짜 저장 백엔드: 맵 + 실패 스위치. */
function fakeBackend(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const flags = { failGet: false, failSet: false };
  const backend: StorageBackend = {
    getItem: (k) => {
      if (flags.failGet) throw new Error("denied");
      return data.get(k) ?? null;
    },
    setItem: (k, v) => {
      if (flags.failSet) throw new Error("QuotaExceededError");
      data.set(k, v);
    },
    removeItem: (k) => void data.delete(k),
  };
  return { data, flags, backend };
}
const saved = (v: string[]) => JSON.stringify({ version: 1, cleared: v });

describe("LocalStorageProgressStore (UI-CONTRACT 10절)", () => {
  it("저장 값이 없으면 empty, 첫 클리어 저장 → 새 스토어에서 재로드하면 같은 목록(왕복)", () => {
    const f = fakeBackend();
    const a = new LocalStorageProgressStore(f.backend);
    expect(a.load()).toBe("empty");
    expect(a.getCleared()).toEqual([]);
    expect(a.markCleared("stage-1")).toBe("saved");
    expect(f.data.get(PROGRESS_KEY)).toBe('{"version":1,"cleared":["stage-1"]}');
    const b = new LocalStorageProgressStore(f.backend);
    expect(b.load()).toBe("ok");
    expect(b.getCleared()).toEqual(["stage-1"]);
  });
  it("중복 제거·정렬 저장, 이미 저장된 클리어를 다시 표시해도 값 불변(멱등)", () => {
    const f = fakeBackend({ [PROGRESS_KEY]: saved(["stage-2", "stage-1", "stage-2"]) });
    const s = new LocalStorageProgressStore(f.backend);
    expect(s.load()).toBe("ok");
    expect(s.getCleared()).toEqual(["stage-1", "stage-2"]);
    s.markCleared("stage-3");
    s.markCleared("stage-1");
    expect(f.data.get(PROGRESS_KEY)).toBe(saved(["stage-1", "stage-2", "stage-3"]));
  });
  it("setItem 예외 → failed(메모리엔 반영) → 복구 후 retrySave 성공, 저장 값에 전체 기록", () => {
    const f = fakeBackend();
    const s = new LocalStorageProgressStore(f.backend);
    s.load();
    f.flags.failSet = true;
    expect(s.markCleared("stage-1")).toBe("failed");
    expect(s.getSaveStatus()).toBe("failed");
    expect(s.getCleared()).toEqual(["stage-1"]);
    expect(f.data.has(PROGRESS_KEY)).toBe(false);
    expect(s.retrySave()).toBe("failed");
    f.flags.failSet = false;
    expect(s.retrySave()).toBe("saved");
    expect(s.getSaveStatus()).toBe("saved");
    expect(f.data.get(PROGRESS_KEY)).toBe(saved(["stage-1"]));
  });
  it("failed 뒤 다른 클리어 저장이 성공하면 이전 클리어까지 함께 저장된다", () => {
    const f = fakeBackend();
    const s = new LocalStorageProgressStore(f.backend);
    s.load();
    f.flags.failSet = true;
    s.markCleared("stage-1");
    f.flags.failSet = false;
    expect(s.markCleared("stage-2")).toBe("saved");
    expect(f.data.get(PROGRESS_KEY)).toBe(saved(["stage-1", "stage-2"]));
  });
  it("failed 상태에서 이미 클리어한 스테이지를 다시 표시하면 저장을 다시 시도한다", () => {
    const f = fakeBackend();
    const s = new LocalStorageProgressStore(f.backend);
    s.load();
    f.flags.failSet = true;
    s.markCleared("stage-1");
    f.flags.failSet = false;
    expect(s.markCleared("stage-1")).toBe("saved");
  });
  it("getItem 예외 또는 백엔드 없음 → unavailable, 메모리로는 계속 동작하고 저장은 failed", () => {
    const f = fakeBackend();
    f.flags.failGet = true;
    const a = new LocalStorageProgressStore(f.backend);
    expect(a.load()).toBe("unavailable");
    f.flags.failSet = true;
    expect(a.markCleared("stage-1")).toBe("failed");
    expect(a.getCleared()).toEqual(["stage-1"]);
    const b = new LocalStorageProgressStore(null);
    expect(b.load()).toBe("unavailable");
    expect(b.markCleared("stage-1")).toBe("failed");
    expect(b.getCleared()).toEqual(["stage-1"]);
  });
  it.each([
    ["JSON 깨짐", "{not json"],
    ["모르는 version", JSON.stringify({ version: 2, cleared: ["stage-1"] })],
    ["version 없음", JSON.stringify({ cleared: ["stage-1"] })],
    ["cleared 가 배열 아님", JSON.stringify({ version: 1, cleared: "stage-1" })],
    ["객체 아님(배열)", "[1,2]"],
    ["null", "null"],
  ])("읽기 실패(%s): unreadable, 빈 기록, 원문을 corrupt 키로 보존하고 본 키는 로드만으로는 덮어쓰지 않음", (_n, raw) => {
    const f = fakeBackend({ [PROGRESS_KEY]: raw });
    const s = new LocalStorageProgressStore(f.backend);
    expect(s.load()).toBe("unreadable");
    expect(s.getCleared()).toEqual([]);
    expect(f.data.get(PROGRESS_CORRUPT_KEY)).toBe(raw);
    expect(f.data.get(PROGRESS_KEY)).toBe(raw);
    // 다시 읽어도(두 번째 인스턴스) 같은 결과·corrupt 키 그대로
    expect(new LocalStorageProgressStore(f.backend).load()).toBe("unreadable");
    expect(f.data.get(PROGRESS_CORRUPT_KEY)).toBe(raw);
  });
  it("이미 보존된 corrupt 원문은 새 읽기 실패로 덮어쓰지 않는다(먼저 보존한 것을 지킴)", () => {
    const f = fakeBackend({ [PROGRESS_KEY]: "{second", [PROGRESS_CORRUPT_KEY]: "{first" });
    new LocalStorageProgressStore(f.backend).load();
    expect(f.data.get(PROGRESS_CORRUPT_KEY)).toBe("{first");
  });
  it("읽기 실패 뒤 첫 클리어 저장이 본 키를 새 기록으로 바꾸고 corrupt 원문은 남는다", () => {
    const f = fakeBackend({ [PROGRESS_KEY]: "{broken" });
    const s = new LocalStorageProgressStore(f.backend);
    s.load();
    expect(s.markCleared("stage-1")).toBe("saved");
    expect(f.data.get(PROGRESS_KEY)).toBe(saved(["stage-1"]));
    expect(f.data.get(PROGRESS_CORRUPT_KEY)).toBe("{broken");
  });
  it("corrupt 보존 중 setItem 이 실패해도 load 는 던지지 않고 unreadable", () => {
    const f = fakeBackend({ [PROGRESS_KEY]: "{broken" });
    f.flags.failSet = true;
    expect(new LocalStorageProgressStore(f.backend).load()).toBe("unreadable");
  });
  it("모르는 stageId 는 저장 값에서 보존(해금 파생엔 영향 없음), 문자열 아닌 항목만 버림", () => {
    const f = fakeBackend({ [PROGRESS_KEY]: JSON.stringify({ version: 1, cleared: ["future-stage", 3, null, ids[0], { a: 1 }] }) });
    const s = new LocalStorageProgressStore(f.backend);
    expect(s.load()).toBe("ok");
    expect(s.getCleared()).toEqual([ids[0], "future-stage"].sort());
    s.markCleared(ids[1]);
    expect(f.data.get(PROGRESS_KEY)).toBe(saved([ids[0], ids[1], "future-stage"].sort()));
    expect(deriveStageCards(ok, ids, s.getCleared()).map((c) => c.state)).toEqual(["cleared", "cleared", "available"]);
  });
  it("해금 파생 연결: 로드한 기록으로 카드 상태가 정해진다", () => {
    const f = fakeBackend({ [PROGRESS_KEY]: saved([ids[0]]) });
    const s = new LocalStorageProgressStore(f.backend);
    s.load();
    expect(deriveStageCards(ok, ids, s.getCleared()).map((c) => c.state)).toEqual(["cleared", "available", "locked"]);
  });
});

describe("browserStorageBackend (SSR 안전)", () => {
  it("window 가 없는 환경(서버·빌드)에서는 null — 접근 예외 없이", () => {
    expect(typeof window).toBe("undefined");
    expect(browserStorageBackend()).toBeNull();
  });
});
