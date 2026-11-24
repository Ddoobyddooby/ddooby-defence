// REQ-QA · N01~N10 (+속성 순회). 기대값은 제품 helper가 아니라 literal 또는 BigInt 독립 산술로 만든다.
import { describe, expect, it } from "vitest";
import { addSafe, applyBp, floorBp, isqrt, mulSafe, roundDiv } from "./intmath";

const M = Number.MAX_SAFE_INTEGER; // 9007199254740991
const B = (n: number | string): bigint => BigInt(n);

describe("applyBp (N01~N03)", () => {
  it("N01: 0/100% 경계", () => {
    expect([applyBp(0, 0), applyBp(0, 10000), applyBp(123, 0), applyBp(123, 10000)]).toEqual([0, 0, 0, 123]);
  });
  it("N02: 0.5는 올림 (4999→0, 5000→1, 5001→1)", () => {
    expect([applyBp(1, 4999), applyBp(1, 5000), applyBp(1, 5001)]).toEqual([0, 1, 1]);
  });
  it("N03: applyBp(3,5000)=2, applyBp(101,12500)=126", () => {
    expect(applyBp(3, 5000)).toBe(2);
    expect(applyBp(101, 12500)).toBe(126);
  });
  it("N10: applyBp(M,10000)=M은 곱셈 중간값이 M을 넘어도 성공, 결과가 M을 넘으면 RangeError", () => {
    expect(applyBp(M, 10000)).toBe(M);
    expect(() => applyBp(M, 10001)).toThrow(RangeError);
  });
});

describe("roundDiv (N04, N05, N09)", () => {
  it("N04: 0에서 먼 쪽으로 반올림, 부호 대칭", () => {
    const cases: [number, number, number][] = [
      [0, 2, 0],
      [1, 2, 1],
      [-1, 2, -1],
      [3, 2, 2],
      [-3, 2, -2],
      [5, 2, 3],
      [-5, 2, -3],
    ];
    for (const [a, b, want] of cases) expect(roundDiv(a, b), `roundDiv(${a},${b})`).toBe(want);
  });
  it("N05: 수학값 0은 +0 (−0 정규화)", () => {
    for (const [a, b] of [
      [1, 3],
      [-1, 3],
      [-0, 1],
      [0, 5],
    ] as const) {
      expect(Object.is(roundDiv(a, b), 0), `roundDiv(${a},${b})`).toBe(true);
    }
  });
  it("N09: 4503599627370493/9=500399958596721, M/1=M (Number 식의 ...722 오답을 잡는다)", () => {
    expect(roundDiv(4503599627370493, 9)).toBe(500399958596721);
    expect(roundDiv(M, 1)).toBe(M);
    expect(roundDiv(-4503599627370493, 9)).toBe(-500399958596721);
  });
});

describe("isqrt (N07, N08)", () => {
  it("N07", () => {
    const input = [0, 1, 2, 3, 4, 8, 9, 15, 16, 17];
    expect(input.map(isqrt)).toEqual([0, 1, 1, 1, 2, 2, 3, 3, 4, 4]);
  });
  it("N08: isqrt(M)=94906265 (BigInt로 r² ≤ M < (r+1)² 확인)", () => {
    const r = isqrt(M);
    expect(r).toBe(94906265);
    expect(B(r) * B(r) <= B(M)).toBe(true);
    expect(B(r + 1) * B(r + 1) > B(M)).toBe(true);
    expect(B(94906265) * B(94906265)).toBe(B("9007199136250225"));
    expect(B(94906266) * B(94906266)).toBe(B("9007199326062756"));
  });
  it("큰 완전제곱 전·정확·후 경계", () => {
    for (const k of [1, 2, 1000, 94906265]) {
      const sq = Number(B(k) * B(k));
      expect([isqrt(sq - 1), isqrt(sq), isqrt(sq + 1)]).toEqual([k - 1, k, k]);
    }
  });
});

describe("addSafe / mulSafe / floorBp (N10, N13)", () => {
  it("N10: addSafe 경계 — 합이 안전 범위를 넘으면 각 항이 안전해도 RangeError", () => {
    expect(addSafe(M, 0)).toBe(M);
    expect(addSafe(M - 1, 1)).toBe(M);
    expect(() => addSafe(M, 1)).toThrow(RangeError);
    expect(() => addSafe(-M, -1)).toThrow(RangeError);
    expect(() => addSafe(M, M)).toThrow(RangeError);
    expect(Object.is(addSafe(0, -0), 0)).toBe(true);
    expect(Object.is(addSafe(-5, 5), 0)).toBe(true);
  });
  it("N10: mulSafe — 94906265²는 안전, 94906266²는 초과", () => {
    expect(mulSafe(94906265, 94906265)).toBe(9007199136250225);
    expect(() => mulSafe(94906266, 94906266)).toThrow(RangeError);
    expect(Object.is(mulSafe(0, -5), 0)).toBe(true);
  });
  it("N13: floorBp는 내림 한 번 (반올림이면 2가 되는 3×50%)", () => {
    expect(floorBp(3, 5000)).toBe(1);
    expect(applyBp(3, 5000)).toBe(2);
    expect(floorBp(2, 5000)).toBe(1);
    expect(floorBp(1, 5000) + floorBp(1, 5000)).toBe(0);
    expect(floorBp(M, 10000)).toBe(M);
  });
});

describe("입력 도메인 (N06)", () => {
  const notSafeInts: unknown[] = [null, undefined, true, "5", NaN, Infinity, -Infinity, 1.5, 2 ** 53, {}, [], Symbol("x"), B(1)];

  it("안전 정수가 아닌 입력은 모든 helper가 TypeError", () => {
    for (const bad of notSafeInts) {
      expect(() => applyBp(bad as number, 1), `applyBp(${String(bad)})`).toThrow(TypeError);
      expect(() => applyBp(1, bad as number)).toThrow(TypeError);
      expect(() => floorBp(bad as number, 1)).toThrow(TypeError);
      expect(() => roundDiv(bad as number, 1)).toThrow(TypeError);
      expect(() => roundDiv(1, bad as number)).toThrow(TypeError);
      expect(() => isqrt(bad as number)).toThrow(TypeError);
      expect(() => addSafe(bad as number, 1)).toThrow(TypeError);
      expect(() => addSafe(1, bad as number)).toThrow(TypeError);
      expect(() => mulSafe(1, bad as number)).toThrow(TypeError);
    }
  });
  it("도메인 위반은 RangeError: 음수 v/bp, roundDiv b ≤ 0, isqrt n < 0", () => {
    expect(() => applyBp(-1, 5000)).toThrow(RangeError);
    expect(() => applyBp(1, -5000)).toThrow(RangeError);
    expect(() => floorBp(-1, 5000)).toThrow(RangeError);
    expect(() => roundDiv(1, 0)).toThrow(RangeError);
    expect(() => roundDiv(1, -2)).toThrow(RangeError);
    expect(() => isqrt(-1)).toThrow(RangeError);
    expect(isqrt(0)).toBe(0);
  });
});

describe("속성: v=0..200 × bp 경계 순회를 BigInt oracle과 비교", () => {
  const bps = [0, 1, 4999, 5000, 5001, 9999, 10000, 10001, 12500, 15000, 19999, 20000];
  it("applyBp / floorBp", () => {
    for (let v = 0; v <= 200; v += 1) {
      for (const bp of bps) {
        const num = B(v) * B(bp);
        expect(applyBp(v, bp), `applyBp(${v},${bp})`).toBe(Number((num + B(5000)) / B(10000)));
        expect(floorBp(v, bp), `floorBp(${v},${bp})`).toBe(Number(num / B(10000)));
      }
    }
  });
  it("roundDiv: 부호 대칭·단조성·BigInt oracle", () => {
    for (let b = 1; b <= 12; b += 1) {
      let previous = -Infinity;
      for (let a = -60; a <= 60; a += 1) {
        const got = roundDiv(a, b);
        const abs = B(Math.abs(a));
        const mag = Number((B(2) * abs + B(b)) / B(2 * b));
        expect(got, `roundDiv(${a},${b})`).toBe(a < 0 ? 0 - mag : mag);
        expect(roundDiv(-a, b) + got, `symmetry ${a}/${b}`).toBe(0);
        expect(got).toBeGreaterThanOrEqual(previous);
        previous = got;
      }
    }
  });
  it("isqrt: n=0..3000 모두 r² ≤ n < (r+1)²", () => {
    for (let n = 0; n <= 3000; n += 1) {
      const r = isqrt(n);
      expect(r * r <= n && (r + 1) * (r + 1) > n, `isqrt(${n})=${r}`).toBe(true);
    }
  });
});
