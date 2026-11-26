// ART-03 리뷰 F2 — 코드 움직임(걷는 흔들림·발사 반동·효과)의 시계. 게임이 흐르는 동안은 배속을 곱하고, 일시정지에서는 멈춘다.
// 결과 단계(게임 상태 정지)의 잔여 효과는 1배속 실제 시간으로 끝까지 재생한다.
export function animationDelta(deltaMs: number, running: boolean, resultPlaying: boolean, speed: number): number {
  if (running) return deltaMs * (Number.isFinite(speed) && speed > 0 ? speed : 1);
  return resultPlaying ? deltaMs : 0;
}
