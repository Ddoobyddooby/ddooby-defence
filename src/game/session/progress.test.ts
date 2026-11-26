import { describe, expect, it } from "vitest";
import { validateContent } from "../core/content/validate";
import { DEV_PLACEHOLDER } from "../content/devBundle";
import { browserStorageBackend, deriveStageCards, isEnterable, LocalStorageProgressStore, MemoryProgressStore, PROGRESS_CORRUPT_KEY, PROGRESS_KEY, type StorageBackend } from "./progress";

const ids = DEV_PLACEHOLDER.stages.map((s) => s.stageId);
const ok = validateContent(DEV_PLACEHOLDER);

describe("deriveStageCards (SPEC 10절·UI-CONTRACT 4절)", () => {
  it("처음: Stage 1 선택 가능, 2·3 잠김", () => {
    expect(deriveStageCards(ok, ids, []).map((c) => c.state)).toEqual(["available", "locked", "locked", "locked", "locked"]);
  });
  it("Stage 1 클리어 → 1 클리어, 2 선택 가능, 3 잠김. 2 도 클리어 → 3 선택 가능", () => {
    expect(deriveStageCards(ok, ids, [ids[0]]).map((c) => c.state)).toEqual(["cleared", "available", "locked", "locked", "locked"]);
    expect(deriveStageCards(ok, ids, [ids[0], ids[1]]).map((c) => c.state)).toEqual(["cleared", "cleared", "available", "locked", "locked"]);
  });
  it("앞 스테이지가 클리어 안 됐으면 뒤 스테이지 클리어 플래그가 있어도 해금 파생은 '클리어'로 보인다(플래그 우선), 3 은 2 클리어 필요", () => {
    expect(deriveStageCards(ok, ids, [ids[2]]).map((c) => c.state)).toEqual(["available", "locked", "cleared", "available", "locked"]);
  });
  it("그 스테이지만 콘텐츠 오류: 해당 카드만 contentError + 진단, 다른 카드는 정상 파생", () => {
    const bad = structuredClone(DEV_PLACEHOLDER) as unknown as { stages: { baseHp: number }[] };
    bad.stages[1].baseHp = 0;
    const cards = deriveStageCards(validateContent(bad), ids, [ids[0]]);
    expect(cards.map((c) => c.state)).toEqual(["cleared", "contentError", "locked", "locked", "locked"]);
    expect(cards[1].diagnostics[0]).toContain("stages[1].baseHp");
    expect(isEnterable(cards[1])).toBe(false);
    expect(isEnterable(cards[0])).toBe(true);
  });
  it("전역 오류는 모든 카드가 contentError, 클리어 플래그가 있어도 오류가 우선", () => {
    const bad = structuredClone(DEV_PLACEHOLDER) as unknown as { economy: { refundRateBp: number } };
    bad.economy.refundRateBp = 10001;
    const cards = deriveStageCards(validateContent(bad), ids, [ids[0]]);
    expect(cards.map((c) => c.state)).toEqual(["contentError", "contentError", "contentError", "contentError", "contentError"]);
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
  const flags = { failGet: false, failSet: false, failGetNext: 0, failSetKeys: new Set<string>() };
  const backend: StorageBackend = {
    getItem: (k) => {
      if (flags.failGet) throw new Error("denied");
      if (flags.failGetNext > 0) {
        flags.failGetNext -= 1;
        throw new Error("transient");
      }
      return data.get(k) ?? null;
    },
    setItem: (k, v) => {
      if (flags.failSet || flags.failSetKeys.has(k)) throw new Error("QuotaExceededError");
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
  it("이미 보존된 corrupt 원문은 덮어쓰지 않고(먼저 보존한 것을 지킴) 다른 새 원문은 .corrupt.2 에 보존", () => {
    const f = fakeBackend({ [PROGRESS_KEY]: "{second", [PROGRESS_CORRUPT_KEY]: "{first" });
    new LocalStorageProgressStore(f.backend).load();
    expect(f.data.get(PROGRESS_CORRUPT_KEY)).toBe("{first");
    expect(f.data.get("ddooby-defence.progress.corrupt.2")).toBe("{second");
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
    expect(deriveStageCards(ok, ids, s.getCleared()).map((c) => c.state)).toEqual(["cleared", "cleared", "available", "locked", "locked"]);
  });
  it("해금 파생 연결: 로드한 기록으로 카드 상태가 정해진다", () => {
    const f = fakeBackend({ [PROGRESS_KEY]: saved([ids[0]]) });
    const s = new LocalStorageProgressStore(f.backend);
    s.load();
    expect(deriveStageCards(ok, ids, s.getCleared()).map((c) => c.state)).toEqual(["cleared", "available", "locked", "locked", "locked"]);
  });
});

describe("쓰기 전 재확인·병합·백업 슬롯 (리뷰 SAVE-01 F1·F2)", () => {
  const C = "ddooby-defence.progress.corrupt";
  it("F1: 첫 getItem 일시 예외(unavailable)로 시작해도, 복구 후 저장은 본 키의 기존 클리어(stage-1)와 합쳐 쓰고 메모리 해금도 갱신", () => {
    const f = fakeBackend({ [PROGRESS_KEY]: '{"version":1,"cleared":["stage-1"]}' });
    f.flags.failGetNext = 1;
    const s = new LocalStorageProgressStore(f.backend);
    expect(s.load()).toBe("unavailable");
    expect(s.getCleared()).toEqual([]);
    expect(s.markCleared("stage-2")).toBe("saved");
    expect(f.data.get(PROGRESS_KEY)).toBe('{"version":1,"cleared":["stage-1","stage-2"]}');
    expect(s.getCleared()).toEqual(["stage-1", "stage-2"]);
  });
  it("다시 읽기가 예외면 쓰지 않고 failed, 본 키 불변, 메모리 클리어 유지 → 복구 후 retrySave 성공(기존 클리어 보존)", () => {
    const f = fakeBackend({ [PROGRESS_KEY]: '{"version":1,"cleared":["stage-1"]}' });
    const s = new LocalStorageProgressStore(f.backend);
    s.load();
    f.flags.failGet = true;
    expect(s.markCleared("stage-2")).toBe("failed");
    expect(f.data.get(PROGRESS_KEY)).toBe('{"version":1,"cleared":["stage-1"]}');
    expect(s.getCleared()).toEqual(["stage-1", "stage-2"]);
    f.flags.failGet = false;
    expect(s.retrySave()).toBe("saved");
    expect(f.data.get(PROGRESS_KEY)).toBe('{"version":1,"cleared":["stage-1","stage-2"]}');
  });
  it("다른 탭/세션이 쓴 클리어와 합집합으로 저장, 합친 목록이 메모리에도 반영", () => {
    const f = fakeBackend();
    const s = new LocalStorageProgressStore(f.backend);
    s.load();
    f.data.set(PROGRESS_KEY, '{"version":1,"cleared":["stage-9","stage-1"]}'); // 다른 탭이 기록
    expect(s.markCleared("stage-2")).toBe("saved");
    expect(f.data.get(PROGRESS_KEY)).toBe('{"version":1,"cleared":["stage-1","stage-2","stage-9"]}');
    expect(s.getCleared()).toEqual(["stage-1", "stage-2", "stage-9"]);
  });
  it("F2: 손상 원문 백업 setItem 일시 실패 → load 는 unreadable. 복구 전 저장은 failed·본 키 불변, 복구 후 retrySave 가 백업을 만든 뒤 덮어쓴다", () => {
    const raw = '{"version":2,"cleared":["old-stage"]}';
    const f = fakeBackend({ [PROGRESS_KEY]: raw });
    f.flags.failSetKeys.add(C);
    const s = new LocalStorageProgressStore(f.backend);
    expect(s.load()).toBe("unreadable");
    expect(f.data.has(C)).toBe(false);
    expect(s.markCleared("stage-1")).toBe("failed");
    expect(f.data.get(PROGRESS_KEY)).toBe(raw);
    expect(s.getCleared()).toEqual(["stage-1"]);
    expect(s.retrySave()).toBe("failed");
    expect(f.data.get(PROGRESS_KEY)).toBe(raw);
    f.flags.failSetKeys.clear();
    expect(s.retrySave()).toBe("saved");
    expect(f.data.get(C)).toBe(raw);
    expect(f.data.get(PROGRESS_KEY)).toBe('{"version":1,"cleared":["stage-1"]}');
  });
  it("두 번째 다른 손상 원문은 .corrupt.2, 같은 원문을 다시 로드하면 추가 키 없음", () => {
    const f = fakeBackend({ [PROGRESS_KEY]: "{first", [C]: "{older" });
    new LocalStorageProgressStore(f.backend).load();
    expect([...f.data.keys()].sort()).toEqual([PROGRESS_KEY, C, C + ".2"].sort());
    expect(f.data.get(C + ".2")).toBe("{first");
    new LocalStorageProgressStore(f.backend).load();
    new LocalStorageProgressStore(f.backend).load();
    expect(f.data.size).toBe(3);
  });
  it("원문이 .corrupt.3 에 이미 있으면(앞 칸은 다른 원문) 보존된 것으로 보고 새 칸을 쓰지 않으며, 저장은 성공", () => {
    const f = fakeBackend({ [PROGRESS_KEY]: "{x", [C]: "{a", [C + ".2"]: "{b", [C + ".3"]: "{x" });
    const s = new LocalStorageProgressStore(f.backend);
    s.load();
    expect(f.data.size).toBe(4);
    expect(s.markCleared("stage-1")).toBe("saved");
    expect(f.data.size).toBe(4);
    expect(f.data.get(PROGRESS_KEY)).toBe('{"version":1,"cleared":["stage-1"]}');
  });
  it("5칸이 모두 다른 원문이면 덮어쓰지 않고 failed·본 키 불변(메모리 해금 유지)", () => {
    const f = fakeBackend({ [PROGRESS_KEY]: "{new", [C]: "{1", [C + ".2"]: "{2", [C + ".3"]: "{3", [C + ".4"]: "{4", [C + ".5"]: "{5" });
    const s = new LocalStorageProgressStore(f.backend);
    expect(s.load()).toBe("unreadable");
    expect(s.markCleared("stage-1")).toBe("failed");
    expect(f.data.get(PROGRESS_KEY)).toBe("{new");
    expect(f.data.size).toBe(6);
    expect(s.getCleared()).toEqual(["stage-1"]);
  });
  it("본 키가 비어 있으면(실제 빈 상태) 그대로 쓴다", () => {
    const f = fakeBackend();
    const s = new LocalStorageProgressStore(f.backend);
    s.load();
    expect(s.markCleared("stage-1")).toBe("saved");
    expect(f.data.get(PROGRESS_KEY)).toBe('{"version":1,"cleared":["stage-1"]}');
    expect(f.data.size).toBe(1);
  });
});

describe("browserStorageBackend (SSR 안전)", () => {
  it("window 가 없는 환경(서버·빌드)에서는 null — 접근 예외 없이", () => {
    expect(typeof window).toBe("undefined");
    expect(browserStorageBackend()).toBeNull();
  });
});

describe("5 스테이지 호환 (STAGE-45)", () => {
  it("예전 저장 {cleared:[S1..S3]} 는 그대로 읽히고 Stage 4 가 열린다", () => {
    const m = new Map<string, string>([[PROGRESS_KEY, JSON.stringify({ version: 1, cleared: [ids[0], ids[1], ids[2]] })]]);
    const backend: StorageBackend = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
    const store = new LocalStorageProgressStore(backend);
    store.load();
    expect(store.getCleared()).toEqual([ids[0], ids[1], ids[2]]);
    expect(deriveStageCards(ok, ids, store.getCleared()).map((c) => c.state)).toEqual(["cleared", "cleared", "cleared", "available", "locked"]);
  });
  it("Stage 4 클리어 → Stage 5 해금, 5 개 모두 클리어 가능", () => {
    expect(deriveStageCards(ok, ids, ids.slice(0, 4)).map((c) => c.state)).toEqual(["cleared", "cleared", "cleared", "cleared", "available"]);
    expect(deriveStageCards(ok, ids, ids).map((c) => c.state)).toEqual(["cleared", "cleared", "cleared", "cleared", "cleared"]);
  });
});
