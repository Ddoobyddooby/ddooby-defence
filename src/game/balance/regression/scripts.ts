// GOLD-01 — 실제 수치(GAME_CONTENT, bal-01-v1) 골든 시나리오의 **고정 명령 스크립트**.
// B1·B2 스크립트는 검증 봇(src/game/balance/bots.ts)이 승인 수치에서 낸 명령을 한 번 기록해 그대로 저장한 것이다.
// 테스트가 봇을 다시 돌려 만들지 않는다 — 봇·자리 점수 함수가 바뀌어도 골든은 흔들리지 않는다(스크립트를 의도적으로 고칠 때만 바뀐다).
// 틱 규칙은 core 시나리오와 같다: tick 은 "그 틱의 1단계에 적용될 명령"(= completedTick + 1 일 때 접수).
export interface Cmd {
  readonly tick: number;
  readonly kind: "build" | "upgrade" | "sell" | "setTargeting" | "startWave";
  readonly payload: unknown;
}
const build = (tick: number, towerType: string, col: number, row: number): Cmd => ({ tick, kind: "build", payload: { towerType, tile: { col, row } } });
const upgrade = (tick: number, towerId: number): Cmd => ({ tick, kind: "upgrade", payload: { towerId } });
const sell = (tick: number, towerId: number): Cmd => ({ tick, kind: "sell", payload: { towerId } });
const target = (tick: number, towerId: number, mode: string): Cmd => ({ tick, kind: "setTargeting", payload: { towerId, mode } });
const startWave = (tick: number): Cmd => ({ tick, kind: "startWave", payload: {} });

/** G1: 스테이지 1, 균형 봇(B1) 기록. 승리, 5116틱. */
export const G1_S1_B1: readonly Cmd[] = [
  build(1, "archer", 12, 3),
  build(1, "frost", 13, 3),
  build(1276, "mage", 13, 4),
  build(2229, "ballista", 11, 4),
  build(3182, "archer", 12, 4),
  build(3636, "frost", 4, 6),
  upgrade(3869, 1),
  upgrade(4140, 2),
  upgrade(4637, 3),
];

/** G2: 스테이지 2, 균형 봇(B1) 기록. 승리, 6903틱. */
export const G2_S2_B1: readonly Cmd[] = [
  build(1, "archer", 11, 3),
  build(1, "frost", 12, 2),
  build(743, "mage", 10, 6),
  build(2424, "ballista", 11, 5),
  build(2795, "archer", 11, 6),
  build(3284, "frost", 12, 3),
  upgrade(3408, 1),
  upgrade(4108, 2),
  upgrade(4136, 3),
  upgrade(4812, 4),
  upgrade(5227, 5),
  upgrade(5440, 6),
  upgrade(6088, 1),
  upgrade(6363, 2),
  upgrade(6810, 3),
];

/** G3: 스테이지 3, 균형 봇(B1) 기록. 승리, 6941틱. */
export const G3_S3_B1: readonly Cmd[] = [
  build(1, "archer", 13, 6),
  build(1, "frost", 13, 5),
  build(1, "mage", 14, 5),
  build(1191, "ballista", 11, 5),
  build(1790, "archer", 4, 3),
  build(2093, "frost", 14, 4),
  upgrade(2568, 1),
  upgrade(2892, 2),
  upgrade(3580, 3),
  upgrade(3713, 4),
  upgrade(3714, 5),
  upgrade(4209, 6),
  upgrade(4445, 1),
  upgrade(4685, 2),
  upgrade(5019, 3),
  upgrade(5299, 4),
  upgrade(5354, 5),
  upgrade(5827, 6),
  upgrade(5982, 1),
  upgrade(6142, 2),
  upgrade(6485, 3),
  upgrade(6696, 4),
  upgrade(6912, 5),
];

/** G4: 스테이지 3, 초보 봇(B2) 기록. 패배, 5403틱. */
export const G4_S3_B2: readonly Cmd[] = [
  build(1, "archer", 15, 2),
  build(2, "archer", 17, 4),
  build(3, "archer", 12, 2),
  build(1251, "archer", 1, 7),
  build(1880, "archer", 10, 2),
  build(2146, "archer", 3, 7),
  build(2736, "archer", 9, 2),
  build(3356, "archer", 13, 8),
  build(3973, "archer", 11, 8),
  build(4258, "archer", 14, 8),
  build(4422, "archer", 8, 8),
  build(4626, "archer", 17, 3),
  build(4743, "archer", 6, 6),
  build(5026, "archer", 2, 0),
  build(5354, "archer", 8, 2),
];

/**
 * G5: 스테이지 1, 손으로 쓴 혼합 스크립트(조기 시작·전투 중 설치/강화·준비 중 판매·타깃 변경·전투 중 판매 거부). 승리, 4687틱.
 * 앞부분은 B4(균형+조기 시작) 기록에서 가져왔고, 웨이브 3 준비 구간(틱 1407~1707)을 일부러 기다려 그 안에서 판매·강화·타깃 변경을 한다.
 * 틱 950 의 sell 은 전투 중이라 wrongPhase 로 거부된다(의도).
 */
export const G5_S1_MIXED: readonly Cmd[] = [
  build(1, "archer", 12, 3), build(1, "frost", 13, 3), startWave(2),
  // 웨이브 2: 조기 시작 직후 전투 중 설치, 전투 중 타깃 변경, 전투 중 판매 시도(거부)
  build(797, "mage", 13, 4), startWave(797), target(900, 1, "strong"), sell(950, 2),
  // 웨이브 3 준비(1407~1707): 설치·판매(환급)·강화·타깃 변경, 시작은 자동
  build(1450, "ballista", 11, 4), sell(1460, 3), upgrade(1490, 1), target(1500, 4, "close"),
  target(2000, 1, "last"),
  // 웨이브 4 준비: 설치. 웨이브 5 준비: 강화 2건·타깃 변경·판매. 웨이브 5 전투: 타깃 변경·강화·설치
  build(2400, "frost", 4, 6),
  upgrade(3400, 1), upgrade(3500, 2), target(3550, 5, "first"),
  sell(3700, 4), target(3800, 2, "first"), upgrade(4200, 1), build(4300, "archer", 12, 4),
];
