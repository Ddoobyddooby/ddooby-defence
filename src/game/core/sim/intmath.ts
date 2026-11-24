// SIM-CONTRACT 3.2: 정수 연산 helper. 모든 입력은 안전 정수여야 하고, 중간 계산은 BigInt로 정확히 수행하며,
// 결과가 안전 정수가 아니면 RangeError. 결과 -0은 0으로 정규화된다(BigInt에는 -0이 없다).
// BigInt 리터럴(`1n`)은 tsconfig target(ES2017)에서 쓸 수 없어 BigInt()로 만든다.

const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);
const BP_SCALE = BigInt(10000);
const BP_HALF = BigInt(5000);
const BIG_MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

export const BP_ONE = 10000;

function describe(v: unknown): string {
  try {
    if (typeof v === "bigint") return `${v.toString()}n`;
    if (typeof v === "symbol") return v.toString();
    if (typeof v === "string") return JSON.stringify(v);
    return String(v);
  } catch {
    return typeof v;
  }
}

/** 안전 정수(number)인지 검사한다. 강제 형변환 없음: "50", true, null, 1.5, NaN, Infinity, 2^53 모두 TypeError. */
export function assertSafeInteger(v: unknown, name: string): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v)) {
    throw new TypeError(`${name}: 안전 정수가 아님 (${describe(v)})`);
  }
  return v;
}

function toBig(v: unknown, name: string): bigint {
  return BigInt(assertSafeInteger(v, name));
}

function toSafe(x: bigint, name: string): number {
  if (x > BIG_MAX_SAFE || x < -BIG_MAX_SAFE) {
    throw new RangeError(`${name}: 결과가 안전 정수 범위를 벗어남 (${x.toString()})`);
  }
  return Number(x);
}

/** floor((v × bp + 5000) / 10000). 반올림, 0.5는 올림. v ≥ 0, bp ≥ 0. */
export function applyBp(v: number, bp: number): number {
  const bv = toBig(v, "applyBp.v");
  const bb = toBig(bp, "applyBp.bp");
  if (bv < ZERO) throw new RangeError(`applyBp.v: 음수 불가 (${v})`);
  if (bb < ZERO) throw new RangeError(`applyBp.bp: 음수 불가 (${bp})`);
  return toSafe((bv * bb + BP_HALF) / BP_SCALE, "applyBp");
}

/** floor(v × bp / 10000). 내림 한 번. 환급(SPEC 8절)에 쓴다. v ≥ 0, bp ≥ 0. */
export function floorBp(v: number, bp: number): number {
  const bv = toBig(v, "floorBp.v");
  const bb = toBig(bp, "floorBp.bp");
  if (bv < ZERO) throw new RangeError(`floorBp.v: 음수 불가 (${v})`);
  if (bb < ZERO) throw new RangeError(`floorBp.bp: 음수 불가 (${bp})`);
  return toSafe((bv * bb) / BP_SCALE, "floorBp");
}

/** sign(a) × floor((2|a| + b) / (2b)). 0에서 먼 쪽으로 반올림, 부호 대칭. b > 0. */
export function roundDiv(a: number, b: number): number {
  const ba = toBig(a, "roundDiv.a");
  const bb = toBig(b, "roundDiv.b");
  if (bb <= ZERO) throw new RangeError(`roundDiv.b: 양수여야 함 (${b})`);
  const abs = ba < ZERO ? -ba : ba;
  const q = (TWO * abs + bb) / (TWO * bb);
  return toSafe(ba < ZERO ? -q : q, "roundDiv");
}

/** floor(√n), r² ≤ n < (r+1)². n ≥ 0. Math.sqrt는 초기 추정에만 쓰고 BigInt로 보정한다. */
export function isqrt(n: number): number {
  const bn = toBig(n, "isqrt.n");
  if (bn < ZERO) throw new RangeError(`isqrt.n: 음수 불가 (${n})`);
  let r = BigInt(Math.floor(Math.sqrt(n)));
  while (r * r > bn) r -= ONE;
  while ((r + ONE) * (r + ONE) <= bn) r += ONE;
  return toSafe(r, "isqrt");
}

/** 안전 범위를 벗어나면 RangeError. 틱·카운터·시각·골드 증감에 쓴다. */
export function addSafe(a: number, b: number): number {
  return toSafe(toBig(a, "addSafe.a") + toBig(b, "addSafe.b"), "addSafe");
}

/** 안전 범위를 벗어나면 RangeError. `start + i × interval` 같은 곱에 쓴다. */
export function mulSafe(a: number, b: number): number {
  return toSafe(toBig(a, "mulSafe.a") * toBig(b, "mulSafe.b"), "mulSafe");
}
