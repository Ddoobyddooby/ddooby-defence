통과

# ECON-01 독립 리뷰

- 대상: feat/econ-01 @ `9c81831fae27067de18e22b2054fd1a396137943`
- 비교: `537d778..9c81831`; 기준: SPEC 8절, SIM-CONTRACT 4·12·13절 및 요청된 TRACE 요구.
- 판정: **보통 1건**. 정산·점유·리플레이의 확인 범위는 아래와 같다.

## F1 — 보통: 음수 격자 좌표를 접수 시 거부하여 계약의 outOfGrid 적용 경로를 타지 않는다

- 위치: `src/game/core/sim/commands.ts:82`, `:83`.
- 기준: `docs/SIM-CONTRACT.md:340`은 “격자 밖 좌표(정수지만 범위 밖)는 접수는 되고 적용 시 outOfGrid”로 정한다. 13.2의 첫 검사는 격자 밖 여부다.
- 재현: 새 시도에서 build `{towerType:"archer",tile:{col:-1,row:0}}` 또는 `{towerType:"archer",tile:{col:0,row:-1}}`를 submit한다.
- 실제: 각각 CommandStructureError(command.payload.tile.col/row)를 던지고 nextCommandSeq는 1이다. 비교 입력 col=18은 정상 접수되어 seq 1을 받고 step에서 commandRejected/outOfGrid 이벤트를 남긴다.
- 원인: 좌표에 기존 safeInt의 최소값 0을 사용하여 음수 안전 정수도 구조 오류로 처리한다.
- 영향: 같은 격자 밖 정수 좌표인데 부호에 따라 피드백·기록·seq 소비 정책이 달라진다. 골드 손상은 확인되지 않았다.
- 수정 제안: build 좌표는 부호를 허용하는 안전 정수 검사로 접수하고 범위 판정은 applyBuild의 isInsideGrid에 맡긴다. towerId 등 다른 필드의 하한 검사는 유지한다.
- 재검증: col/row 각각 −1·음수 안전 정수 최솟값·상한 밖 정수는 접수 성공 후 outOfGrid, null/boolean/문자열/소수/비안전 정수는 접수 구조 오류. 거부 후 골드·타워·원장·소비 키·nextTowerId 불변과 command/event seq 정책을 함께 확인한다.

## 정산·점유 검증

- 설치 검사 순서(격자→경로/예약→점유→골드), 강화 가격 인덱스·Lv4 우선 거부, 판매 단계 우선 거부, 같은 targeting 값도 성공하는 동작을 계약·소스·기존 테스트와 대조했다.
- 독립 참조 모델은 제품의 격자/환급/가격 helper를 사용하지 않았다. Stage 2 경로 그림 리터럴·예약 칸(0,0)·가격/강화 표 리터럴·BigInt 최종 한 번 내림으로 기대값을 계산했다.
- 시드 2·19·98765, 각 100틱×10명령 = **3000명령/300틱**을 실행했다. 성공 805건·거부 2195건. 매 틱 이벤트 유형/거부 사유·골드·타워 전체(레벨/실지출/타깃/점유/ID)·원장 delta·다음 towerId·소비 키 유일성이 모델과 일치했다.
- 별도 동일 틱 build→upgrade 3회→sell→중복 sell→같은 칸 build에서 원장 delta는 **−100,−150,−250,−400,+600,−100**, 최종 골드 **500**, 새 towerId **2**, nextTowerId **3**이었다. 환급은 누적 지출 900×6667/10000의 한 번 내림 600과 일치했다.
- 기존 테스트는 환급률 0, 누적 지출 환급, 실패/점유/부족 골드, 전투 중 설치·강화/판매 거부, 같은 틱 앞 명령 상태 반영, 5·7단계 골드 선사용 금지, 재도전 초기화를 포함하며 통과했다.
- 기존 LCG 3개 시드·60틱은 표본 검사다. 이번 별도 3000명령 대조가 보완 증거이며, 무작위 열만으로 모든 경로의 불변식을 증명한 것으로 해석하지 않는다.

## SIM-01 보호 경계·리플레이

- handleCommand 및 외부 emit/settle 경로가 제거됐다. 현재 명령 거부 분기는 거래 변경 전에 끝나고, mustSettle의 예외를 포함한 처리 예외는 기존 작업 사본 단위로 롤백된다.
- fire가 예외를 던지도록 주입한 뒤 build를 실행했을 때 골드·타워·점유·원장·큐·카운터를 포함한 이전 스냅샷이 유지됐다.
- 저장한 damage의 step 반환 후 사용은 오류이고 상태 불변이었다. 남은 slow/fire/speed 각각의 async 훅도 step 실패 후 microtask 뒤까지 스냅샷·원장 불변이었다. lease·동기 검사·pause/resume/submit 가드는 소스에서도 유지됨을 확인했다.
- build→upgrade→setTargeting→sell 리플레이 두 새 코어의 **5개 스냅샷**이 같았다. 독립 계산 최종 골드 **275**와 일치하고, 타깃만 strong→last로 바꾸면 최초 차이는 **틱 2, state.towers[0].targetingMode**였다.
- towers는 towerId 순으로 모든 계약 필드를 직렬화하며, 점유를 별도 저장하지 않아 타워 제거와 해제가 함께 일어난다. 새 시도는 towers/원장이 비어 있었다.

## 계약·의존성 판단

- SPEC의 설치·강화 준비/전투 허용과 판매 준비 한정이 구현과 맞는다. 13.2의 거래 이벤트→economySettled 순서도 확인했다.
- sim/commands가 content/types의 TOWER_TYPES를 가져오는 것은 게임 명령의 towerType 열거값을 한 곳에서 검사하기 위한 순수 데이터 의존이다. 현재 content/types는 map 타입을 type import하므로 해당 추가로 검증기/시도 코어의 런타임 순환 의존은 생기지 않는다.
- 콘텐츠 스키마 변경이 없어 content golden 상수가 유지되는 것은 타당하다. 다만 towers 스냅샷 추가와 build payload 변경으로 이전 시도 기록의 호환성은 달라졌다. 향후 저장된 리플레이를 지원할 때 ATTEMPT_CODE_VERSION 관리 기준을 명확히 할 필요가 있다(현재 배포된 기록의 회귀는 확인하지 않았으며 별도 결함 건수에 넣지 않는다).
- 13절 도입부의 “변경 전부 롤백” 표현은 최종 12.4의 “변경 전 검사로 거부 불변” 표현과 정리하면 좋다. 현재 거래 결과의 불변성에는 충돌이 없다.
- 실제 밸런스 승인·전투 발사/투사체·UI 판매 확인창·저장·출시는 이번 범위 밖이다.

## 실행 증거·변경 범위

| 직접 검사 | 결과 |
|---|---|
| npm run test | exit 0, 21 files / **432 tests passed** |
| npm run lint | exit 0 |
| node node_modules/typescript/bin/tsc --noEmit --incremental false | exit 0 |
| git diff --check 537d778..9c81831 | exit 0 |
| 파일 없는 독립 프로브 | F1 재현, 참조 모델 3000명령 대조·정산 리터럴·리플레이·훅 경계 확인 |

- npm run typecheck/build 성공은 claude-main의 보고이며 이 리뷰에서 재실행하지 않았다.
- 지정 리뷰 파일만 작성했다. 소스·테스트·문서 변경, checkout, 커밋·push·병합 없음. 생성된 Vitest 결과 캐시를 정리한 뒤 worktree clean을 확인했다.


## 재리뷰 1

- 대상: `cc4059ae7ce7c573fa07c538d4d2205d1c0683ee`, diff `9c81831..cc4059a`.
- 판정: **통과**. F1과 수정 경계·계약 보완에서 남은 지적 없음. 첫 줄을 현재 판정으로 갱신하고 최초 리뷰 기록을 보존한다.
- 이전 commands.ts를 git show로 읽어 메모리에서 실행해 음수 좌표의 구조 오류를 재현했다. 수정본은 부호 있는 안전 정수만 접수하고 적용 시 격자 범위를 검사한다.
- 독립 검사: col/row 각각 −1·−MAX_SAFE_INTEGER·MAX_SAFE_INTEGER·18·1000의 **10개 입력**에서 접수 성공 후 정확한 outOfGrid 이벤트, 골드 350·타워/원장/소비 키 비어 있음·nextTowerId 1·nextCommandSeq 2·nextEventSeq 2를 확인했다.
- null/boolean/문자열/소수/NaN/±Infinity/±2^53/undefined의 축별 **22개 입력**은 접수 예외·전체 스냅샷 불변이었다. upgrade/sell/setTargeting의 towerId −1·0·−MAX_SAFE_INTEGER **9개 입력**은 기존 하한대로 거부됐다. 좌표 −0은 0으로 정규화됐다.
- ATTEMPT_CODE_VERSION은 attempt-v2다. attempt-v1 기록은 ReplayCompatibilityError로 **코어 factory 호출 0회** 상태에서 거부됐고, v2의 스냅샷 0 재생은 통과했다. 상태/명령/틱 규칙 변경 시 버전 올림 계약과 일치한다.
- 13절 도입부의 원자성 문구도 12.4의 변경 전 검사·예외 시 전체 step 롤백으로 정리됐다.

| 직접 검사 | 결과 |
|---|---|
| npm run test | exit 0, 21 files / **439 tests passed** |
| npm run lint | exit 0 |
| node node_modules/typescript/bin/tsc --noEmit --incremental false | exit 0 |
| git diff --check 537d778..cc4059a | exit 0 |
| 파일 없는 이전/현재 소스·접수/적용 경계·버전 검사 | exit 0 |

- npm run typecheck/build 성공은 claude-main 보고이며 직접 재실행하지 않았다. 범위는 F1 수정과 계약 보완에 한정했다.
- 지정 리뷰 파일만 갱신했다. 생성 Vitest 결과 캐시 정리 후 worktree clean을 확인했다. 코드·문서·테스트·Git 변경 없음.


