// 프레임 경과 시간 (UI-CONTRACT 5절, 리뷰 UI-01 F1). 씬이 rAF 타임스탬프로 실제 경과 ms 를 구할 때 쓰는 순수 함수라 단위 테스트가 가능하다.
export const MAX_FRAME_DELTA_MS = 250;

/**
 * 이전 프레임(last)과 지금(now)의 차(ms). 첫 프레임(last=null)·시계가 거꾸로 가거나 비정상 값은 0,
 * 탭 복귀·rAF 정지 뒤의 아주 큰 값은 상한(250ms = 5틱 분량)으로 자른다. "복귀 시 누적 0"은 세션(setHidden)이 추가로 보장한다.
 */
export function frameDelta(now: number, last: number | null): number {
  if (last === null || !Number.isFinite(now) || !Number.isFinite(last)) return 0;
  const d = now - last;
  if (d <= 0) return 0;
  return Math.min(d, MAX_FRAME_DELTA_MS);
}
