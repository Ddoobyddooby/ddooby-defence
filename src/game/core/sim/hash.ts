// SIM-CONTRACT 7.2: 틱 해시 = FNV-1a 64 over UTF-8({"events":[...],"state":{...}}). 보안 목적 아님.
import { canonicalize } from "./canonical";

const FNV_OFFSET = BigInt("0xcbf29ce484222325");
const FNV_PRIME = BigInt("0x100000001b3");

/** 소문자 16자리 16진수. 바이트마다 h = ((h XOR byte) × prime) mod 2^64. */
export function fnv1a64Bytes(bytes: Uint8Array): string {
  let h = FNV_OFFSET;
  for (let i = 0; i < bytes.length; i += 1) {
    h = BigInt.asUintN(64, (h ^ BigInt(bytes[i])) * FNV_PRIME);
  }
  return h.toString(16).padStart(16, "0");
}

/** 문자열을 UTF-8 바이트로 인코딩해 해시한다(UTF-16 코드 단위 해시 아님). */
export function fnv1a64(text: string): string {
  return fnv1a64Bytes(new TextEncoder().encode(text));
}

/** 틱 해시 입력 envelope의 정규 문자열. 키 정렬 결과 `{"events":...,"state":...}`. */
export function tickEnvelope(events: unknown, state: unknown): string {
  return canonicalize({ events, state });
}

export function tickHash(events: unknown, state: unknown): string {
  return fnv1a64(tickEnvelope(events, state));
}

/** contentHash = 콘텐츠 데이터 정규 JSON의 같은 해시. */
export function contentHashOf(content: unknown): string {
  return fnv1a64(canonicalize(content, "content"));
}
