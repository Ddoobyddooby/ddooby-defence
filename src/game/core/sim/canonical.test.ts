// S01~S05, S09, L04, cloneCanonical. 기대 문자열은 literal.
import { describe, expect, it } from "vitest";
import { CanonicalError, canonicalize, cloneCanonical, sortByNumber, sortCodeUnit } from "./canonical";

const M = Number.MAX_SAFE_INTEGER;

describe("정규 문자열 (S01, S02, S05)", () => {
  it("S01: 삽입 순서와 무관하게 키 정렬, 공백 없음", () => {
    const reversed: Record<string, number> = {};
    reversed.b = 2;
    reversed.a = 1;
    expect(canonicalize(reversed)).toBe('{"a":1,"b":2}');
    expect(canonicalize({ a: 1, b: 2 })).toBe('{"a":1,"b":2}');
  });
  it("S02: 중첩 키도 정렬하고 원본을 바꾸지 않는다", () => {
    const input = { z: { b: 2, a: 1 }, a: 0 };
    expect(canonicalize(input)).toBe('{"a":0,"z":{"a":1,"b":2}}');
    expect(Object.keys(input)).toEqual(["z", "a"]);
    expect(Object.keys(input.z)).toEqual(["b", "a"]);
  });
  it("배열 안 객체도 정렬하고 배열 순서는 보존한다", () => {
    expect(canonicalize({ list: [{ y: 1, x: 2 }, { b: [3, 1, 2] }] })).toBe('{"list":[{"x":2,"y":1},{"b":[3,1,2]}]}');
  });
  it("S05: -0은 0, 안전 정수 경계 허용", () => {
    expect(canonicalize({ a: -0, b: [-0, 0] })).toBe('{"a":0,"b":[0,0]}');
    expect(canonicalize([M, -M])).toBe("[9007199254740991,-9007199254740991]");
    expect(canonicalize([true, false, null, ""])).toBe('[true,false,null,""]');
  });
  it("S05: 한글·따옴표·역슬래시·개행은 JSON.stringify와 같은 이스케이프", () => {
    expect(canonicalize({ s: '한글"\\\n' })).toBe('{"s":"한글\\"\\\\\\n"}');
  });
});

describe("허용되지 않는 값은 필드 경로가 담긴 오류 (S04, L04)", () => {
  const cases: [string, unknown][] = [
    ["NaN", NaN],
    ["Infinity", Infinity],
    ["-Infinity", -Infinity],
    ["소수 1.5", 1.5],
    ["소수 0.5 (연산 결과)", 1 / 2],
    ["M+1", M + 1],
    ["undefined", undefined],
    ["BigInt", BigInt(1)],
    ["함수", () => 1],
    ["Symbol", Symbol("s")],
    // eslint-disable-next-line no-restricted-globals -- 금지된 Date 값이 스냅샷에서 거부되는지 확인하는 부정 테스트
    ["Date", new Date(0)],
    ["Map", new Map([["a", 1]])],
    ["Set", new Set([1])],
    ["클래스 인스턴스", new (class Foo { x = 1 })()],
  ];
  for (const [label, bad] of cases) {
    it(`${label}: 조용한 null/누락/{} 변환 없이 경로 포함 CanonicalError`, () => {
      let caught: unknown;
      try {
        canonicalize({ a: [1, { b: bad }] }, "state");
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(CanonicalError);
      expect((caught as CanonicalError).path).toBe("state.a[1].b");
      expect((caught as Error).message).toContain("state.a[1].b");
    });
  }
  it("배열 구멍, 비인덱스 배열 속성, 순환 참조", () => {
    const holey = [1, 2, 3];
    delete (holey as unknown as Record<number, unknown>)[1];
    expect(() => canonicalize({ a: holey })).toThrow(/\$\.a/);
    const withProp: number[] & { extra?: number } = [1];
    withProp.extra = 2;
    expect(() => canonicalize(withProp)).toThrow(CanonicalError);
    const cyc: Record<string, unknown> = { a: 1 };
    cyc.self = cyc;
    expect(() => canonicalize(cyc)).toThrow(/순환/);
  });
  it("같은 객체를 두 번 참조하는 것은 순환이 아니다", () => {
    const shared = { x: 1 };
    expect(canonicalize({ a: shared, b: shared })).toBe('{"a":{"x":1},"b":{"x":1}}');
  });
  it("S09: 숫자 문자열 키·비ASCII 키·식별자가 아닌 키는 거부 (JS 열거 순서와 문자열 정렬 혼동 방지)", () => {
    for (const key of ["10", "2", "키", "a-b", "a b", ""]) {
      expect(() => canonicalize({ [key]: 1 }), JSON.stringify(key)).toThrow(CanonicalError);
    }
    expect(canonicalize({ a: 1, _b: 2, C9: 3 })).toBe('{"C9":3,"_b":2,"a":1}');
  });
  it("L04: 상태에 들어간 소수는 런타임 검사로 거부된다 (lint가 아님)", () => {
    expect(() => canonicalize({ gold: 5 / 10 }, "state")).toThrow(/state\.gold/);
  });
});

describe("정렬 helper (S03)", () => {
  it("sortByNumber: 숫자순 [1,2,10] (문자열 정렬 [1,10,2] 아님), 입력 불변", () => {
    const input = [{ id: 10 }, { id: 2 }, { id: 1 }];
    expect(sortByNumber(input, (x) => x.id).map((x) => x.id)).toEqual([1, 2, 10]);
    expect(input.map((x) => x.id)).toEqual([10, 2, 1]);
  });
  it("sortCodeUnit: 코드 단위 순, Set도 받는다", () => {
    expect(sortCodeUnit(["kill:e2", "kill:e1"])).toEqual(["kill:e1", "kill:e2"]);
    expect(sortCodeUnit(new Set(["b", "B", "a"]))).toEqual(["B", "a", "b"]);
  });
});

describe("cloneCanonical", () => {
  it("검증된 깊은 복사본을 돌려주고 원본과 참조를 공유하지 않는다", () => {
    const src = { z: [{ b: 1, a: -0 }], a: "x" };
    const copy = cloneCanonical(src);
    expect(copy).toEqual({ a: "x", z: [{ a: 0, b: 1 }] });
    expect(Object.keys(copy)).toEqual(["a", "z"]);
    expect(Object.is(copy.z[0].a, 0)).toBe(true);
    copy.z[0].b = 99;
    expect(src.z[0].b).toBe(1);
  });
});
