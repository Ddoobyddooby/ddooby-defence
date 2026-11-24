통과

# MAP-01 구현 독립 리뷰

- 검토일: 2026-11-24 · codex-main · 요청 `msg_30e183c0bda5` · 역할: 독립 리뷰(코드·계약 대조)
- worktree: `/Users/ddooby/Desktop/Ddooby/projects/ddooby-defence/wt-map-01`
- 대상: `feat/map-01` @ `a5aa7c720094008ea52bd9ea56227145348b76a9`, base `82a66a8`
- diff: 문서 결정 `5749a87` 및 구현 `a5aa7c7`, 12파일·605줄 추가·7줄 삭제.
- 기준: SIM-CONTRACT10절 및1~7절의 정수/오류 규칙, SPEC2·12절, TRACE REQ-MAP-01·02·03·05.
- 판정: **새 지적 보통2건**. 소수 tile 경계 오분류 및 sparse 배열 검증 누락을 직접 재현했다. 사전 공유된 Stage2·3 ID 명칭 불일치는 아래 별도로 확인한다. 치명적/높음 결함에 따른 반영 보류는 선언하지 않는다.
- 아래 소스 경로와 줄 번호는 대상 worktree 기준이다. 공유 폴더에서는 이 QA 산출물만 작성했다.

## 지적

### MAP-01-F1 — 보통 — 소수 tile의 정확한 격자선이 왼쪽·위쪽 칸으로 귀속될 수 있음

- 위치: `src/game/core/map/pointToCell.ts:9`·`:10`
- 기준: SPEC26줄, SIM-CONTRACT172줄, REQ-MAP-05. 격자 경계는 오른쪽·아래 칸이고 소수 렌더 좌표/tile을 허용한다.
- 직접 재현:

```ts
const tile = 30.4;
const boundary = 3 * tile; // 91.19999999999999
pointToCell(boundary, boundary, tile);
// 실제: {col:2,row:2}, 기대: {col:3,row:3}
// boundary/tile = 2.9999999999999996
```

- 근거: 나눗셈 결과를 바로 floor하여 부동소수점 오차가 격자선의 소유를 바꾼다. 이 입력은 `x=3*tile`, `y=3*tile`로 만든 실제 경계 좌표다. 작은 비현실적 tile만의 문제도 아니다. 30.9·31.4 등에서도 재현했고, tile34.2/15번째 세로선에서는 x513인데 col14로 계산된다.
- 영향: 화면 축척으로 tile이 소수가 되면 같은 격자선 클릭이 계약과 다른 타일에 설치 명령을 만들 수 있다. 현재 테스트는 정수64와 이진수로 정확히 표현되는1.25를 사용해 이 경계를 놓친다(`pointToCell.test.ts:11`·`:37`). 실제 브라우저 조작을 실행한 것은 아니다.
- 수정 제안: 렌더에서 사용하는 `n*tile` 경계와 같은 기준으로 구간을 비교해 정확한 경계에 오른쪽/아래를 부여한다. 18×10이므로 유한 경계 비교/탐색도 단순하다. 무조건 epsilon을 더해 실제 경계 바로 왼쪽/위 입력까지 넘기지 않도록 주의한다. 소수 tile을 금지하는 변경은 현재 계약/테스트와 다르므로 임의로 좁히지 않는다.
- 재검증: tile30.4에서 모든 내부 세로/가로 경계의 정확한 값·바로 이전/이후 표현 가능 값, 모서리 및 끝선 검사. 원점/음수/끝선 초과/비유한 거부와64·1.25 기존 사례도 유지한다.

### MAP-01-F2 — 보통 — sparse reservedCells를 유효 맵으로 통과시키고 sparse waypoint는 경로 없는 TypeError를 냄

- 위치: `src/game/core/map/stageMap.ts:76`·`:125`·`:127`
- 기준: compileStageMap(unknown)의 검증 경계, SIM-CONTRACT170줄의 유효 예약 칸 및111줄의 배열 구멍 금지/필드 경로 오류 원칙, REQ-MAP-02·03.
- 직접 재현:

```ts
compileStageMap({
  stageId:"t",
  waypoints:[{col:0,row:2},{col:5,row:2}],
  reservedCells:new Array(1),
});
// 성공 반환: reservedCells.length=1인데 해당 칸 없음, blocked.size=6
```

또한 waypoint를 `[{col:0,row:2}, , {col:5,row:2}]`로 주면 `MapValidationError(field)` 대신 `Cannot read properties of undefined (reading 'col')` TypeError가 발생했다.

- 근거: Array.map/forEach는 hole을 방문하지 않는다. 예약 배열의 누락 칸은 parseCell 검사를 피하고 차단 집합에서도 빠진다. waypoint의 누락 칸도 parseCell을 피한 뒤 구간 전개에서 잘못 접근한다. 일반 JSON 텍스트가 hole을 표현한다는 뜻은 아니며, 이 unknown API에 전달할 수 있는 런타임 배열 입력의 결함이다.
- 영향: 명시적으로 유효하지 않은 칸 배열이 조용히 유효 맵으로 승인되거나 진단 경로가 사라진다. 현재 구조/좌표 오류 테스트(`stageMap.test.ts:161`~`:171`)에는 null 항목은 있지만 sparse 배열이 없다.
- 수정 제안: 두 배열 모두 길이 범위의 각 인덱스를 실제로 방문하고 own 요소 존재 여부 및 parseCell을 검사한다. hole을 `reservedCells[i]`/`waypoints[i]` 경로를 가진 MapValidationError로 거부하며 필터링/빈 목록 보정은 하지 않는다.
- 재검증: 첫/중간/마지막 hole, Array(n), 명시적 undefined·null·잘못된 좌표를 각각 검사. 모두 실패하고 입력을 바꾸지 않아야 한다. 정상 후보3종·추가 예약 칸·중복/겹침 기존 테스트도 유지한다.

## 직접 실행한 검사

| 검사 | 직접 결과 |
|---|---|
| `npm run test` | exit0, **14 files / 276 passed**, 약1.51초 |
| `npm run lint` | exit0 |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | exit0. 기존 생성 타입을 읽는 타입 검사이며 next typegen 재실행 아님 |
| `git diff --check 82a66a8..a5aa7c7` | exit0 |
| 일회성 메모리 TS 로딩 probe | F1/F2 출력 직접 확인. 제품 파일/테스트를 쓰거나 바꾸지 않음 |
| 입력 강제 변환 경계 | waypoint col에 null/true/false/문자열"0"/NaN/Infinity/1.5 모두 MapValidationError(`waypoints[1].col`)로 거부. 정상 정수 경로도 함께 확인 |

`npm run typecheck`·`npm run build` exit0은 요청서의 **claude-main 보고**이며 이번 직접 실행과 구분한다. 이번 리뷰에서 브라우저·실제 포인터 입력·build를 실행하지 않았다. 기존276개 통과와 추가 재현에서 드러난 두 결함은 별개의 사실이다.

## 후보 맵·oracle·실패 사례 대조

후보 waypoint에서 별도의 단위 칸 walk를 구성하고, 제품 compile/progress helper를 기대값 계산에 쓰지 않았다. 그 단위 경로에서 칸별 설치 가능 여부와 `cellIndex + mt잔여 이동`으로 기대 위치를 산출해 실제 출력과 대조했다. 비연속 칸 쌍의 Manhattan거리1도 별도로 검사했다.

| 후보 | 경로 칸 | 총길이 mt | 설치 가능 칸 | 직접 비교한 진행도(0..총길이) |
|---|---|---|---|---|
| Stage1 | 50 | 49000 | 130 | 49001개 |
| Stage2 | 37 | 36000 | 143 | 36001개 |
| Stage3 | 38 | 37000 | 142 | 37001개 |

- **180칸×3=540칸**의 설치 가능 판정과 **진행도122003개**의 보간 위치가 독립 oracle과 일치했다. 출발/기지/꺾임/좌·상 이동을 포함하며 후보3종은 비연속 통로 접촉도 없다.
- `stageMap.test.ts:10`·`:48`의 그림/칸 수/길이는 literal이다. 제품 출력으로 그림을 만들어 literal과 비교하므로 그 방향의 oracle은 독립이다. 기본 시작/끝 위치의 기대값도 별도 좌표와 단순 단위 식이다.
- 격자 밖·대각·길이0·불필요한 중간 waypoint·교차·되돌아감·통로 접촉·내부 출발·예약 중복/격자 밖·점유·행 끝 인덱스 및 잘못된 타입의 실패 사례는 실제 테스트에 있다. 정상 꺾임/위·아래·오른쪽 가장자리 출발도 양성 사례로 존재한다.
- 입력 원본의 waypoint를 compile 뒤 변경해도 compiled waypoint는 바뀌지 않음을 추가 확인했다. 반환 결과를 임의로 변조해도 안전하다는 보장을 검사한 것은 아니다.

## claude-1 판단 1~5 및 계약 문서 검토

| 항목 | 판단과 근거 |
|---|---|
| 1. 총길이 초과 진행도의 위치를 기지 중심으로 고정 | **수용.** 계약171줄은 p≥길이에서 기지 도달을 정의한다. 순수 위치 조회가 초과분을 기지 좌표로 투영하는 것은 게임 상태의 진행도를 몰래 보정하는 것과 다르다. 음수/비정수는 거부하며, MAX_SAFE_INTEGER 진행도도 기지 중심을 반환함을 확인했다. 적 제거/기지 피해 시점은 SIM-01/02에서 p≥길이로 처리해야 함 |
| 2. roundDiv 미사용 | **수용.** 축 정렬 직선만 허용하고 방향 성분이−1/0/1이므로 위치=시작 중심±정수 mt잔여 거리다. 나눗셈 반올림이 필요 없으며 독립122003개 비교로 정수 보간 일치를 확인했다 |
| 3. 경로와 겹친 reservedCells 거부 | **수용 가능한 입력 정규형.** 추가 예약 칸의 중복 금지를 경로 집합과의 중복까지 포함해 검사하는 선택이다. 이미 차단된 경로를 다시 예약해도 새 기하 효과는 없어 후보3종을 바꾸지 않는다. 다만 계약170줄은 합집합/추가 예약 중복만 쓰므로, DATA-01과 공유 전에 ‘경로와 겹친 추가 예약도 오류’라고 명료화하면 해석 차이를 줄일 수 있다. 이 표현 보완을 F1/F2와 별도 새 기능 결함으로 세지 않았다 |
| 4. 순서 차≥2인 상하좌우 인접 칸 거부 | **수용.** 연속 경로 칸은 정상 연결이고, 공유 꺾임은 한 번만 전개된다. 나머지 인접은 경로 순서상 비연속 통로 접촉이다. 오른쪽/아래 이웃만 보는 구현은 무방향 인접 쌍을 한 번씩 모두 검사한다. 정상 꺾임·인접 평행 통로 실패 테스트 및 후보 전수 대조와 일치 |
| 5. compile unknown / occupied 인덱스 Set API | **수용, F2 보완 필요.** 칸은0..17/0..9 검증 후 row×18+col로 유일하게 매핑된다. isBuildable은 경계·차단·점유 조회이고 점유 거래 원자성은 ECON-01 책임이다. compile의 런타임 숫자 검사·복사·필드 오류 방식은 적절하나 sparse 입력이 빠졌다 |

- 계약의 가로·세로 폭1칸, 오른쪽·아래 경계 귀속/끝선 예외, 후보3종은 SPEC2절 및 요청서의 사용자 결정과 맞는다. 후보임과 BAL-01 재검토 가능성을 유지하므로 밸런스 최종 승인으로 승격하지 않았다.
- 중간 waypoint 제거·접촉 금지·출발 가장자리 같은 검증 정규형은 기술 계약으로 명시돼 있고 승인된 후보를 거부하지 않는다. 요청서/저장소 기록을 기준으로 검토했으며 원 사용자 승인 대화까지 독립 조회해 모든 하위 문장이 사용자 직접 발언이었다고 검증한 것은 아니다.
- 소수 입력 변환 유틸이 `core/map`에 있지만 현재 runtime 정수 상태를 바꾸지 않는 순수 어댑터용 함수다. `core 밖 입력 어댑터가 사용`한다는 설명을 게임 시뮬레이션 상태에 소수를 허용한다는 뜻으로 해석하지 않았다. 실제 화면→맵 역변환/HUD 차단 연결은 후속 UI-01 범위다.

## 사전 공유된 낮음 명칭 사항·lint

- `src/game/content/stageMaps.ts:14`의 `stage-2-snow-canyon`, 19줄의 `stage-3-twilight-ruins`는 DESIGN의 자산 식별자 `stage-2-snowfall-pass`·`stage-3-dusk-ruins`와 다름을 확인했다. 요청서에 이미 낮음/수정 예정으로 공유된 사항이며 신규 발견으로 중복 계수하지 않았다. 이 커밋에서 기능 매핑 실패까지 확인한 것은 아니다. 정리할 때 테스트의 PICTURES/EXPECT 키와 향후 stage 참조도 함께 일치시킨다.
- ESLint diff는 기존 두 설정의 files 범위에 content를 추가한 것뿐이다. core의 framework import/결정성 금지 및 intmath의 기존 sqrt 예외는 유지된다. 새 `content.lint.test.ts`는 random/Date/performance·Next/React/Phaser 금지·순수 코드 허용·Phaser 폴더 제외를 실제 ESLint API로 검사하고, 전체 lint 테스트도 직접 통과했다.
- lint의 기존 별칭 우회 한계는 이미 계약의 리뷰 게이트로 보완하는 범위이며 이번 변경에서 금지 우회 사용은 발견하지 못했다. 새 맵 모듈/후보는 아직 app/Phaser/기존 sim에서 사용하는 경로가 없어 화면이나 전투 통합이 끝났다고 주장하지 않는다.

## 작업 범위·정리·후속

- 저장소에 기존 graphify 그래프가 없어 직접 문서/소스 검색을 사용했다. 추가 조사 범위는 DESIGN 명칭, TRACE 요구, 기존 grid/정수 helper, 소비 경로·설정 및 독립 probe로 한정했다.
- 이번 실행이 갱신한 Vitest results 캐시와 비어 있는 해당 캐시 디렉터리만 정리했다. 기존 .next·의존성·tsbuildinfo는 유지하고 타입 검사는 incremental=false로 실행했다.
- 대상 worktree의 코드/문서·브랜치·Git 기록은 바꾸지 않았고 두 폴더 모두 checkout·커밋·push·병합하지 않았다. 원래 공유 폴더의 이 QA 파일만 작성했다.
- 후속: F1의 소수 경계·주변값 회귀 및 F2의 배열 hole/명시적 invalid 값 회귀를 구현 담당에게 요청한다. 수정 커밋에 대해 두 지적 및 후보/입력/진단 경계를 좁게 재검증하면 된다. 원리뷰, 재리뷰0/2회.

## 재리뷰 1

- 검토일: 2026-11-24 · 요청 `msg_38ffd3543df3` · 역할: 독립 리뷰(재리뷰1/2)
- 대상: 같은 worktree의 `feat/map-01` @ `42b233d00443d2eac23cd3a16325de9b0c53d3dd`
- 범위: `git diff a5aa7c7..42b233d`의 F1·F2·Stage2/3 명칭 및 SIM-CONTRACT10.1 명료화와 수정 경계만 확인했다.
- **판정: 통과. F1·F2와 사전 공유 명칭 사항 모두 해소됐고 이 수정 범위의 회귀를 발견하지 못했다.** 첫 줄은 최신 판정이다. 원리뷰의 지적/검사 결과는 `a5aa7c7` 당시 기록으로 보존한다.

| 항목 | 소스·테스트 대조 및 직접 재검증 | 판정 |
|---|---|---|
| F1 (보통) | `pointToCell.ts:13`의 owningIndex는 floor 후보를 `n*tile` 경계와 직접 비교해 보정하고 epsilon을 더하지 않는다. 원 재현 tile30.4/x=y=3*tile이 이제(3,3). 추가된4종 소수 tile 테스트는 내부선과 직전 double·끝선/모서리를 검증한다. 별도 probe는 **tile30.0..100.0(0.1 간격701종) × 세로17/가로9 경계 × 직전·정확·직후 double = 54678건** 모두 기대값과 일치했다. | 해소 |
| F2 (보통) | `stageMap.ts:64`의 parseCells가 모든 인덱스의 own 요소를 검사하고 parseCell을 호출한다. 86·135줄에서 waypoint와 reservedCells 모두 사용한다. 원 재현 Array(1) 예약 칸과 중간 hole waypoint는 각각 MapValidationError(`reservedCells[0]`, `waypoints[1]`). undefined·null probe도 해당 인덱스 오류로 거부했다. 추가 테스트는 첫/중간/마지막 hole·Array(n)·원본 길이/own keys 불변을 포함한다. | 해소 |
| Stage2/3 명칭 | 후보와 PICTURES/EXPECT 키가 `stage-2-snowfall-pass`·`stage-3-dusk-ruins`로 함께 변경됐다. 전체src에서 이전 두 식별자 잔존0건. 후보 경로 칸50/37/38·길이49000/36000/37000·설치 가능130/143/142도 그대로다. | 해소 |
| 계약 명료화 | SIM-CONTRACT170줄이 경로와 겹친 추가 예약 거부, 양쪽 배열의 hole/undefined/null 인덱스 오류를 명시한다. 기존 구현/수정된 검증기와 일치하며 후보 waypoint·게임 수치·승인 범위를 바꾸지 않는다. | 해소 |

### 직접 검증

- `npm run test -- src/game/core/map/pointToCell.test.ts src/game/core/map/stageMap.test.ts src/game/content/content.lint.test.ts src/game/core/sim/lint.test.ts`: exit0, **4 files / 92 passed**. 후보 그림/수치 및 기존 오류 사례, 소수 경계·sparse 회귀, content/core lint 경계 포함.
- `node node_modules/typescript/bin/tsc --noEmit --incremental false`: exit0. 기존 생성 타입을 읽는 검사이며 next typegen 재실행 아님.
- `git diff --check a5aa7c7..42b233d`: exit0.
- 별도 메모리 내 TypeScript probe로 위54678개 좌표 사례, 기존 sparse 재현4종 및 후보3종의 불변 수치를 직접 대조했다. 기대 인덱스는 경계 번호 n/n−1 literal이고 제품 owningIndex를 oracle로 호출하지 않았다.
- 요청서의 전체291 passed·npm lint/typecheck/build exit0은 **claude-main 보고**와 구분한다. 이번 직접 실행 범위는 위92개·tsc·추가 probe다. 브라우저/실제 입력 통합은 실행하지 않았다.

### 보존·정리

- 추가 전 QA 파일 SHA-256은 `e65bf5feff6bb9ee7f9d6bfa510c86dae749ced7684db1fc1582b5d2c3fc5156`으로 원리뷰 작성 직후 값과 같았다. 첫 줄 갱신과 이 섹션 추가 외 이전 본문은 보존했다.
- 이번 테스트가 갱신한 Vitest results 캐시와 비어 있는 해당 상위 디렉터리만 정리했다. 기존 .next·의존성·tsbuildinfo는 유지했다.
- 구현 worktree의 tracked/untracked 변경 없이 공유 폴더의 이 산출물만 갱신했다. 코드/문서 수정·checkout·커밋·push·병합 없음. 재리뷰1/2회 완료이며, 별도 통합/push 승인이나 실제 전투·화면 QA 완료를 뜻하지 않는다.
