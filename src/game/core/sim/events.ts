// 이벤트 이름·거부 사유 문자열의 단일 목록 (SIM-CONTRACT 8절 "이벤트 이름·거부 사유 문자열 목록").
// 이 값들은 정규 스냅샷·해시 입력에 그대로 들어가므로 바꾸면 모든 golden이 바뀐다.

/** 틱 안에서 발생하는 이벤트 type. 모든 이벤트는 eventSeq를 소비한다. */
export const EVENT_TYPE = {
  /** 설치 성공(경제 이벤트 `build:c{seq}`). */
  towerBuilt: "towerBuilt",
  /** 강화 성공(경제 이벤트 `upgrade:c{seq}`, ECON-01). */
  towerUpgraded: "towerUpgraded",
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
  /** 3단계 적 생성(SIM-01). */
  enemySpawned: "enemySpawned",
  /** 5단계 적 제거(HP 0 이하). 처치 골드는 같은 단계의 economySettled(`kill:e{id}`). */
  enemyKilled: "enemyKilled",
  /** 6단계 적이 기지에 도달해 제거되고 기지 HP가 줄었다(처치 골드 없음). */
  enemyReachedBase: "enemyReachedBase",
  /** 7단계 웨이브 완료(완료 보상은 같은 단계의 economySettled `waveClear:w{n}`). 패배 틱에는 없다. */
  waveCleared: "waveCleared",
  /** 4단계(b) 타워 발사(SIM-02). 투사체 생성. */
  projectileFired: "projectileFired",
  /** 대상 적이 사라진 single 투사체 제거(4단계 시작 또는 8단계 정리, reason "targetGone"). */
  projectileCancelled: "projectileCancelled",
  /** 명중하지 못한 채 수명(expireTick)이 끝나 제거(aoe도 폭발하지 않음). */
  projectileExpired: "projectileExpired",
  /** aoe 투사체가 충돌점에 도달해 폭발(대상 0명이어도 남는다). */
  projectileExploded: "projectileExploded",
  /** 투사체 피해 적용(single 명중, aoe 범위 안 각 적). */
  enemyDamaged: "enemyDamaged",
  /** 둔화 적용·교체(실효값, 실효 0이어도 기록). */
  slowApplied: "slowApplied",
} as const;
export type EventType = (typeof EVENT_TYPE)[keyof typeof EVENT_TYPE];

/** 명령 적용(1단계) 재검증 거부 사유. 거부된 명령은 seq·eventSeq를 소비하고 게임 상태를 바꾸지 않는다. */
export const REJECT_REASON = {
  insufficientGold: "insufficientGold",
  occupied: "occupied",
  outOfGrid: "outOfGrid",
  towerNotFound: "towerNotFound",
  wrongPhase: "wrongPhase",
  /** 경로·예약 칸 등 설치 불가 칸(ECON-01). */
  notBuildable: "notBuildable",
  /** 이미 Lv4(ECON-01). */
  maxLevel: "maxLevel",
  /** 처리기가 없는 명령 종류. */
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
