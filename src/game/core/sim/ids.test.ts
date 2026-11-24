// Q01(ID 초기화), Q12(카운터 한계). 모든 수치는 TEST_ONLY.
import { describe, expect, it } from "vitest";
import { createAttemptIdSource, createIdCounters, takeId, type IdKind } from "./ids";

const M = Number.MAX_SAFE_INTEGER;
const KINDS: IdKind[] = ["command", "enemy", "event", "projectile", "tower"];

describe("시도별 카운터", () => {
  it("모든 카운터는 1부터 시작하고 종류별로 독립적으로 증가한다", () => {
    const c = createIdCounters();
    expect(c).toEqual({ nextCommandSeq: 1, nextEnemyId: 1, nextEventSeq: 1, nextProjectileId: 1, nextTowerId: 1 });
    expect([takeId(c, "tower"), takeId(c, "tower"), takeId(c, "enemy")]).toEqual([1, 2, 1]);
    expect(c.nextTowerId).toBe(3);
    expect(c.nextEnemyId).toBe(2);
    expect(c.nextProjectileId).toBe(1);
  });
  it("Q01: 새 시도의 카운터는 이전 시도와 무관하게 1부터 (재사용 없음)", () => {
    const first = createIdCounters();
    for (let i = 0; i < 5; i += 1) takeId(first, "command");
    expect(createIdCounters().nextCommandSeq).toBe(1);
    expect(takeId(first, "command")).toBe(6);
  });
  it("Q12: 카운터가 한계(M)면 wrap·재사용 없이 RangeError이고 카운터는 변하지 않는다", () => {
    for (const kind of KINDS) {
      const c = createIdCounters();
      const field = Object.keys(c).find((k) => k.toLowerCase().includes(kind === "command" ? "commandseq" : kind))!;
      (c as unknown as Record<string, number>)[field] = M;
      const before = { ...c };
      expect(() => takeId(c, kind), kind).toThrow(RangeError);
      expect(c, kind).toEqual(before);
    }
  });
  it("Q12: M−1에서는 M−1을 발급하고 그 다음 호출부터 오류", () => {
    const c = createIdCounters();
    c.nextTowerId = M - 1;
    expect(takeId(c, "tower")).toBe(M - 1);
    expect(c.nextTowerId).toBe(M);
    expect(() => takeId(c, "tower")).toThrow(RangeError);
    expect(c.nextTowerId).toBe(M);
  });
});

describe("attemptId 발급기 (Q01)", () => {
  it("새 시도(진입·재도전)마다 1씩 증가", () => {
    const src = createAttemptIdSource();
    expect([src.next(), src.next(), src.next()]).toEqual([1, 2, 3]);
  });
  it("시작값 검증, 한계에서는 오류 후 상태 불변", () => {
    expect(() => createAttemptIdSource(0)).toThrow(RangeError);
    expect(() => createAttemptIdSource(1.5)).toThrow(TypeError);
    const src = createAttemptIdSource(M - 1);
    expect(src.next()).toBe(M - 1);
    expect(() => src.next()).toThrow(RangeError);
    expect(() => src.next()).toThrow(RangeError);
  });
});
