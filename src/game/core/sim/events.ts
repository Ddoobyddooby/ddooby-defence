// 이벤트 이름·거부 사유 문자열의 단일 목록 (SIM-CONTRACT 8절 "이벤트 이름·거부 사유 문자열 목록").
// 이 값들은 정규 스냅샷·해시 입력에 그대로 들어가므로 바꾸면 모든 golden이 바뀐다.

/** 틱 안에서 발생하는 이벤트 type. 모든 이벤트는 eventSeq를 소비한다. */
export const EVENT_TYPE = {
  /** 설치 성공(경제 이벤트 `build:c{seq}`). */
  towerBuilt: "towerBuilt",
  /** 판매 성공(경제 이벤트 `sell:t{towerId}`). */
  towerSold: "towerSold",
  /** 타깃 우선순위 변경 성공. */
  targetingChanged: "targetingChanged",
  /** 준비 → 전투 전환. trigger는 "command"(조기 시작) 또는 "timer"(준비 타이머 만료). */
  waveStarted: "waveStarted",
  /** 전투 → 준비 전환(TEST_ONLY toy 스크립트). */
  prepEntered: "prepEntered",
  /** 시도 결과 확정(결과 단계로 전환). */
  resultReached: "resultReached",
  /** 외부 경제 정산(kill/waveClear 등) 성공. */
  economySettled: "economySettled",
  /** 적용 시점 재검증에서 거부된 명령. reason은 REJECT_REASON. */
  commandRejected: "commandRejected",
} as const;
export type EventType = (typeof EVENT_TYPE)[keyof typeof EVENT_TYPE];

/** 명령 적용(1단계) 재검증 거부 사유. 거부된 명령은 seq·eventSeq를 소비하고 게임 상태를 바꾸지 않는다. */
export const REJECT_REASON = {
  insufficientGold: "insufficientGold",
  occupied: "occupied",
  outOfGrid: "outOfGrid",
  towerNotFound: "towerNotFound",
  wrongPhase: "wrongPhase",
  /** toy 시뮬이 구현하지 않은 명령 종류(upgrade). */
  unsupportedKind: "unsupportedKind",
  /** 같은 경제 이벤트 키가 이미 정산됨(정확히 한 번 정책). */
  alreadySettled: "alreadySettled",
} as const;
export type RejectReason = (typeof REJECT_REASON)[keyof typeof REJECT_REASON];

/** 접수 시점 즉시 거부 사유. seq 미부여, 기록·이벤트에 남지 않는다. */
export const SUBMIT_REJECT = {
  paused: "paused",
  resultPhase: "resultPhase",
} as const;
export type SubmitRejectReason = (typeof SUBMIT_REJECT)[keyof typeof SUBMIT_REJECT];
