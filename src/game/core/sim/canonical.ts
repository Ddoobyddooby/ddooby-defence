// SIM-CONTRACT 7.1: 정규 스냅샷. 허용 값만 통과시키고, 키를 재귀 정렬하며, 위반은 필드 경로가 담긴 오류로 던진다.
// 조용한 null/누락/{} 변환은 없다.

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export class CanonicalError extends Error {
  readonly path: string;
  constructor(path: string, detail: string) {
    super(`${path}: ${detail}`);
    this.name = "CanonicalError";
    this.path = path;
  }
}

function typeLabel(v: unknown): string {
  if (v === null) return "null";
  if (typeof v === "object") return Object.prototype.toString.call(v);
  return typeof v;
}

/** 값을 정규 JSON 문자열로. 같은 논리 값이면 삽입 순서와 무관하게 같은 문자열. */
export function canonicalize(value: unknown, rootPath = "$"): string {
  const active = new Set<object>();

  const walk = (v: unknown, path: string): string => {
    if (v === null) return "null";
    switch (typeof v) {
      case "boolean":
        return v ? "true" : "false";
      case "string":
        return JSON.stringify(v);
      case "number":
        if (!Number.isSafeInteger(v)) throw new CanonicalError(path, `안전 정수가 아닌 숫자 (${String(v)})`);
        return v === 0 ? "0" : String(v);
      case "object":
        break;
      default:
        throw new CanonicalError(path, `허용되지 않는 타입 (${typeLabel(v)})`);
    }
    const obj = v as object;
    if (active.has(obj)) throw new CanonicalError(path, "순환 참조");
    active.add(obj);
    try {
      if (Array.isArray(obj)) {
        if (Object.keys(obj).length !== obj.length) {
          throw new CanonicalError(path, "배열 구멍 또는 비인덱스 속성");
        }
        const parts: string[] = [];
        for (let i = 0; i < obj.length; i += 1) parts.push(walk(obj[i], `${path}[${i}]`));
        return `[${parts.join(",")}]`;
      }
      const proto = Object.getPrototypeOf(obj);
      if (proto !== Object.prototype && proto !== null) {
        throw new CanonicalError(path, `일반 객체가 아님 (${typeLabel(obj)})`);
      }
      if (Object.getOwnPropertySymbols(obj).length > 0) throw new CanonicalError(path, "심볼 키");
      const record = obj as Record<string, unknown>;
      const keys = Object.keys(record).sort();
      const parts: string[] = [];
      for (const key of keys) {
        if (!KEY_PATTERN.test(key)) {
          throw new CanonicalError(`${path}.${key}`, "키는 ASCII 식별자([A-Za-z_][A-Za-z0-9_]*)여야 함");
        }
        parts.push(`${JSON.stringify(key)}:${walk(record[key], `${path}.${key}`)}`);
      }
      return `{${parts.join(",")}}`;
    } finally {
      active.delete(obj);
    }
  };

  return walk(value, rootPath);
}

/** 정규화·검증을 거친 깊은 복사본(키는 정렬된 순서, -0은 0). 원본은 바꾸지 않는다. */
export function cloneCanonical<T>(value: T, rootPath = "$"): T {
  return JSON.parse(canonicalize(value, rootPath)) as T;
}

/** 숫자 키(ID·seq·eventSeq) 오름차순 복사본. 문자열 정렬(1, 10, 2)이 아니다. */
export function sortByNumber<T>(items: readonly T[], pick: (item: T) => number): T[] {
  return [...items].sort((a, b) => pick(a) - pick(b));
}

/** 문자열 코드 단위 오름차순 복사본(locale 비의존). Set은 먼저 이 함수로 배열로 바꾼다. */
export function sortCodeUnit(items: Iterable<string>): string[] {
  return Array.from(items).sort();
}
