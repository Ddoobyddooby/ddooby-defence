// 코어 기초 모듈 공통 오류. 호출 규칙 위반(프로그래머 오류)은 throw, 게임 규칙상 거부는 이벤트(events.ts)로 표현한다.

/** 호출이 허용되지 않는 상태(결과 단계·일시정지·step 실행 중 등). 던진 시점에 상태는 변하지 않는다. */
export class SimStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SimStateError";
  }
}
