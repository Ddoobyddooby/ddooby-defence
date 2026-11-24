통과

# DATA-01 독립 리뷰

- 대상: `feat/data-01`, HEAD `e02a35d4559a44f2762d8517f5ff42486b0f6a8e`
- 비교: `0d36ddd..e02a35d` (계약 변경 포함)
- 검토 기준: SPEC 3·6·10절, SIM-CONTRACT 11절, PLAN 3.3절.
- 결과: 중간 2건, 낮음 1건. 아래 확인 사항은 결함과 구분한다.
- 범위: 코드·계약·테스트를 읽고, 지정 worktree에서 기존 검사와 파일을 만들지 않는 독립 프로브를 실행했다. 제품·테스트·문서 수정 및 Git 변경은 하지 않았다.

## F1 — 중간: map 내부는 엄격 필드 검사를 우회한다

- 위치: `src/game/core/content/validate.ts:465` (466~469행의 위임·결과 재구성).
- 계약: SIM-CONTRACT 11.4, 259행은 계약에 없는 필드를 해당 경로 오류로 요구한다.
- 재현: 유효 TEST_ONLY 묶음에 `stages[1].map.extra = 1` 또는 `stages[1].map.waypoints[0].extra = 1`만 추가한다.
- 실제: 두 경우 모두 전역·스테이지 오류가 0개이고, 세 스테이지의 진입 재검증도 모두 성공한다. `compileStageMap`은 이 추가 필드를 검사하지 않으며, 반환용 map 재구성이 필드를 제거해 버린다.
- 영향: 맵·좌표의 오타/지원하지 않는 필드가 콘텐츠 오류로 진단되지 않고 정상 데이터처럼 통과한다. 반환 사본이 깨끗하다는 사실은 엄격 입력 검사를 대체하지 못한다.
- 수정 제안: DATA 검증 단계에서 map의 `stageId/waypoints/reservedCells`, 각 좌표의 `col/row` 허용 필드를 검사한 후 기존 기하 검증을 사용한다. 두 추가 필드 사례와 reservedCells 좌표 사례의 정확한 오류 경로·해당 스테이지 격리를 테스트한다.

## F2 — 중간: 필드·블록 단위 중단이 서로 독립적인 오류를 숨긴다

- 위치: `src/game/core/content/validate.ts:277`, `:282`, `:324`; 같은 수집 문제는 `:236`, `:269`, `:465`에도 있다.
- 계약: SIM-CONTRACT 11.4, 251행은 첫 오류에서 멈추지 않고 필드 경로별 오류를 모두 수집한다.
- 직접 재현:
  1. `towers[0].levels.base.damage = null`, `base.attackPeriodMs = 75`를 함께 설정하면 damage 오류만 나온다. 75ms는 독립적으로 판정 가능한 50 배수 위반이지만 누락된다.
  2. `increments[0].damage = null`, `increments[0].attackPeriodMs = 25`를 함께 설정해도 damage 오류만 나온다. base 1000 + 증분 25 = Lv2 1025ms의 배수 위반은 damage와 무관하게 계산 가능하다.
  3. `upgradeCosts = [null, 0]`이면 배열 길이 오류만 나오고, 존재하는 두 항목의 안전 정수/가격 하한 오류가 빠진다.
  4. `stages[1].map.waypoints[0].col = null`, `waypoints[1].row = null`이면 첫 좌표 오류 하나만 나온다.
- 원인: 레벨 블록의 필드 하나가 실패하면 블록 전체가 undefined가 되어 모든 결과값 검사를 건너뛴다. 배열 길이가 다르면 항목 검사를 생략하고, map은 예외 하나를 던지는 검증기에 전부 위임한다.
- 영향: 기존 337개 테스트는 통과하지만 잘못된 콘텐츠의 여러 원인을 한 번에 진단한다는 계약을 충족하지 못한다. 입력을 거부한다는 사실과 진단 목록의 완전성은 별개다.
- 수정 제안: 필드별 파싱 성공 여부를 유지하여 해당 필드의 누적 계산만 중단한다. 배열 길이 오류와 존재하는 항목 검사를 분리한다. map의 독립적인 구조·좌표 오류를 먼저 모은 후, 그 값에 의존하는 기하 검사를 수행한다.
- 정당한 생략: damage 자체가 없어서 그 damage의 후속 레벨을 계산하지 않는 것은 타당하다. 위 지적은 그와 무관하게 판정 가능한 시간·다른 항목·다른 좌표 오류에 한정한다.

## F3 — 낮음: 공개 TowerDef 타입·주석이 확정된 증분 계약과 다르다

- 위치: `src/game/core/content/types.ts:37`, `:38`.
- 계약: SIM-CONTRACT 11.1, 207행은 매 증분에 base와 같은 필드 전부를 요구하고 강화마다 누적한다.
- 실제: 주석은 `base + increments[N−2]`라는 비누적 공식을 안내하고, 타입은 `Partial<TowerLevelStats>`라서 공통 필드가 전혀 없는 증분도 허용한다. 실행 검증기와 누적 회귀 테스트는 올바르게 동작한다.
- 영향: 후속 시뮬레이션 구현자가 공개 계약만 따라가면 비누적 계산 또는 누락 필드를 허용하는 소비 코드를 만들 수 있다.
- 수정 제안: 주석을 누적 공식으로 고치고, 증분 타입에서도 공통 필드를 필수로 맞춘다. mage/frost 전용 필드의 필수 여부도 종류별 계약과 함께 표현한다.

## 계약·테스트 확인 사항

### C1 — 스테이지 전체 항목이 잘못된 경우의 격리 범위는 명시가 필요하다

- 위치: `validate.ts:540`, `:546`; `validate.test.ts:355`.
- 직접 확인: 길이 3인 배열에서 `delete stages[1]`하면 같은 경로가 globalErrors와 Stage 2 오류 양쪽에 들어가며 세 스테이지 모두 차단된다. 같은 자리를 null로 바꾸면 Stage 2만 차단되고 Stage 1·3 진입은 성공한다.
- 11.4는 스테이지 개수·ID 중복을 전역으로, initialGold/map/waves를 개별 오류로 정하지만, 스테이지 전체 hole/null/undefined의 분류는 직접 설명하지 않는다. hole을 개수 부족으로 보는 현재 의도인지 확인해 계약과 테스트에 명시할 필요가 있다. 이 항목은 위 세 결함 건수에 포함하지 않는다.

### C2 — 빈 배열 golden은 현재 구현의 실패 증거는 아니지만 회귀 검출 범위가 좁다

- 위치: `stageHash.test.ts:18`.
- 정규 문자열과 독립 FNV 상수는 있으나 towers/enemies/traits/waves가 비어 있어 실제 계약을 통과하지 않는 입력이다. 관계형 테스트는 전역 변경·스테이지 변경·타입 배열 순서·키 순서를 별도로 확인한다.
- 독립 보완 검증: 유효한 TEST_ONLY 묶음의 원본에서 Python 표준 JSON 정렬과 별도 FNV-1a 64 계산을 수행했다. 제품의 canonical/hash 함수는 기대값 계산에 사용하지 않았다. 세 해시는 진입 결과와 일치했다.
  - Stage 1: `038012bb00e9449c`
  - Stage 2: `f0ada8bd09ae2599`
  - Stage 3: `84bf748411fc0347`
- 제안: 채워진 유효 입력의 독립 정규 문자열/해시를 고정 회귀 증거로 추가하면 중첩 증분·웨이브·Segment 필드의 직렬화 회귀도 고정값으로 검출할 수 있다. 이번 독립 계산 통과를 근거로 현재 해시 결함은 지적하지 않는다.

### 계약과 구현이 맞는 범위

- 기술 상한·배수·count별 intervalMs 예외, Segment 64개/웨이브 적 총수 5000 한도, 누적 Lv1~4 결과 범위 검사, 같은 레벨 사거리 순서, 강화 비용 엄격 증가, Stage 1 적·특성 등장 조건을 대조했다.
- 전역 오류의 전체 차단, 일반적인 Stage 2 필드 오류의 개별 격리, 입력 인덱스 오류 경로, 타입 배열 정규 순서, 진입 재검증은 기존 테스트와 소스에서 확인했다. F1/F2/C1의 경계는 별도다.
- 독립 프로브에서 반환 객체 226개를 순회해 모두 동결됨과 원본 참조 미공유를 확인했다. 원본 타워 값 변경 후 기존 사본 해시는 유지되며 새 진입 해시는 바뀌고, 원본 전역 값을 무효로 만들면 재진입이 거부됐다.
- 15개 웨이브를 별도 산술식 `17 + (startMs + index × intervalMs) / 50`과 정렬로 전개해 expandWave 결과 전체와 비교했다. 시각·원본 Segment 순서·순번·enemyType·trait가 일치했다.
- TEST_ONLY 값은 testing/fixtures.ts에 명시되어 있고, 테스트 외 제품 소비/배럴 export는 찾지 못했다. 계약의 실제 밸런스 미승인 상태와 기술 상한 구분도 유지되어 있다. 특성 보상 가산의 실제 정산 정책이나 밸런스 자체는 이번 구현의 통과 대상으로 보지 않았다.
- 최종 웨이브 완료 판정·웨이브 간 비중첩은 계약대로 SIM-01 범위이며 이번 전개 함수 검사로 통과를 주장하지 않는다.

## 실행 증거와 변경 범위

| 검사 | 직접 결과 |
|---|---|
| `npm run test` | exit 0, 17 files / 337 tests passed |
| `npm run lint` | exit 0 |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | exit 0 |
| `git diff --check 0d36ddd..e02a35d` | exit 0 |
| 파일을 생성하지 않는 독립 Node/Python 프로브 | F1/F2/C1 재현, 채워진 3개 해시·15 Wave·복사/동결 확인 |

- `npm run typecheck`와 `npm run build` 성공은 claude-main의 보고이며 이 리뷰에서 재실행하지 않았다. 직접 타입 검사는 위의 incremental 비활성 tsc다.
- 기존 untracked `.omc/`는 보존한다. 검사로 생성된 Vitest 결과 캐시만 정리하고, tracked 파일은 변경하지 않는다.
- 위 판정은 DATA-01 스키마·검증 범위의 독립 리뷰다. 실제 밸런스 수치 승인이나 게임 통합·출시 검증을 의미하지 않는다.

## 재리뷰 1

- 대상: `feat/data-01` @ `142f0155aba6749019adeb821e50456a250ee98a`, diff `e02a35d..142f015`.
- 판정: **지적 있음 — F2의 수정 경계 2건(중간 1건, 낮음 1건)**. F1·F3·C1·C2는 해소했다.
- 범위: 이전 지적의 재현·수정 경계 및 요청서에 유지됐다고 명시된 type 무효 분기만 확인했다. 다른 기능으로 범위를 넓히지 않았다.

### RR1-F2a — 중간: type 하나가 무효이면 공통 레벨 필드 오류까지 모두 생략한다

- 위치: `src/game/core/content/validate.ts:261`.
- 기준: 보완된 `docs/SIM-CONTRACT.md:257`은 한 필드의 오류가 다른 필드 판정을 막지 않으며 그 값에 의존하는 계산만 생략하도록 명시한다.
- 재현: 유효 TEST_ONLY 묶음에서 `towers[0].type = "cannon"`, `levels.base.damage = null`, `levels.base.attackPeriodMs = 75`를 함께 설정한다.
- 실제 오류는 `towers[0].type`과 `towers`의 archer 누락뿐이다. 공통 damage의 안전 정수 오류와 attackPeriodMs의 50 배수 위반은 누락된다.
- type을 알아야 mage/frost 전용 필드 집합을 선택할 수 있다는 생략 이유는 타당하다. 그러나 모든 타워가 공유하는 damage·attackPeriodMs 등은 type과 무관하게 판정 가능하므로 levels 전체 생략은 보완된 수집 계약보다 넓다. 입력 자체는 거부되며, 문제는 진단 수집 범위다.
- 수정 제안: type 무효일 때도 levels 구조와 공통 필드를 검사·누적하고, 종류에 의존하는 전용 필드 판정만 생략한다. 위 복합 입력에서 공통 오류가 수집되고 전용 필드 때문에 부정확한 연쇄 오류를 만들지 않는지 회귀 검증한다.

### RR1-F2b — 낮음: unknown field 오류는 맵 기하 검사 생략 조건에 반영되지 않는다

- 위치: `src/game/core/content/validate.ts:483`~497행, 관련 `:466`, `:479`.
- 기준: `docs/SIM-CONTRACT.md:257`은 맵의 구조·필드·좌표 오류가 없을 때만 기하 검증하도록 정했다.
- 재현: 유효 Stage 1 맵에 `map.extra = 1`을 추가하고 `map.waypoints[1] = { col: 3, row: 5 }`로 바꾼다. waypoint는 원래 `(0,2)`에서 시작하므로 이 구간은 대각이다.
- 실제: `stages[0].map.extra`와 `stages[0].map.waypoints[1]`의 대각 기하 오류가 함께 나온다. 계약대로면 이 단계에서는 extra 필드 오류만 보고해야 한다.
- 같은 결과를 `map.waypoints[0].extra`, `map.reservedCells[0].extra`로도 확인했다(reservedCells는 유효 좌표 `{col:0,row:0}`를 넣은 뒤 extra 추가).
- 원인: readRec은 unknown field 오류를 errs에 넣어도 객체를 반환하고, map/cell 파서는 이 오류 증가를 기하 검사 진입 조건에 반영하지 않는다. 숫자 좌표 무효 시의 생략은 정상이다. 잘못된 콘텐츠가 진입하는 결함은 아니다.
- 수정 제안: parseMap 진입 전 오류 개수를 저장하고, map의 독립 필드·좌표 검사를 모두 마친 뒤 그 검사에서 오류가 늘었으면 compileStageMap을 호출하지 않는다. 기존 stage의 initialGold 등 다른 필드 오류까지 기하 검사를 막지 않도록 map 지역 오류 증가만 사용한다. unknown field와 대각을 함께 넣은 회귀 사례를 추가한다.

### 해소 확인

| 항목 | 직접 확인 |
|---|---|
| F1 | map·waypoint·reservedCells의 extra 단독 입력 3종이 정확한 경로 오류가 되고 해당 Stage 진입 거부. 이전 소스는 3종 모두 오류 0개임을 메모리 내 실행으로 재현 |
| F2 기존 사례 | base damage null + 시간 75는 오류 1→5개, 증분 damage null + 시간 25는 1→4개, 비용 [null,0]은 1→3개, 두 좌표 null은 1→2개로 보완. 의존하지 않는 필드 검사와 길이/항목 분리는 수정됨 |
| F3 | 누적 주석과 종류별 TowerDef 판별 유니온 확인. 파일을 만들지 않는 TS 의미 검사 6종에서 유효 archer/mage/frost는 통과, 공통 증분 누락·mage 반경 누락·frost 증분 전용 필드 누락은 TS2322로 거부 |
| C1 | 계약에 길이 3인 자리 격리를 명시. 3자리 × hole/undefined/null/숫자/문자열/불리언/배열 = 21개 입력에서 globalErrors 0, 오류 자리 stageId null, 그 자리만 플레이/진입 거부 확인 |
| C2 | 채워진 유효 TEST_ONLY 묶음의 3개 해시 golden 추가. 원본 fixture → Python 표준 JSON 정렬/별도 FNV 계산을 다시 수행해 `038012bb00e9449c`·`f0ada8bd09ae2599`·`84bf748411fc0347` 일치 확인 |

- 이전 소스 재현은 `git show e02a35d:...`를 읽어 메모리에서 실행했다. checkout·소스 파일 생성은 하지 않았다.
- stage hole 검사 제거 변이가 같은 경로의 비객체 오류를 내어 구분되지 않는다는 구현자 메모는 오류 메시지 차이만으로 별도 결함으로 보지 않는다. C1 계약의 격리·stageId·진입 결과를 직접 확인했다.

### 재리뷰 실행 증거·변경 범위

- 직접: `npm run test` exit 0, 17 files / **348 tests passed**; `npm run lint` exit 0; `node node_modules/typescript/bin/tsc --noEmit --incremental false` exit 0; `git diff --check e02a35d..142f015` exit 0.
- 직접: 기존 지적의 이전/현재 소스 비교 프로브, F2 수정 경계 2종, 자리 격리 21종, 타입 의미 검사 6종, Python 해시 대조.
- `npm run typecheck`·`npm run build` 성공은 claude-main 보고이며 이번에도 재실행하지 않았다.
- 지정 리뷰 파일에만 추가했다. worktree tracked 변경 없음, 기존 untracked `.omc/` 보존, 생성된 Vitest 결과 캐시만 정리한다.


## 재리뷰 2

- 대상: `feat/data-01` @ `ceded178ce2b3530fea38bc44c75a94a83915cde`, diff `142f015..ceded17`.
- 판정: **통과**. RR1-F2a·RR1-F2b와 해당 수정 경계에서 남은 지적 없음. 첫 줄을 현재 판정으로 갱신했으며 이전 리뷰의 기록은 보존한다.
- 범위: 마지막 재리뷰 2/2로 두 지적의 해소와 그 수정 경계만 확인했다. 새 기능·밸런스·통합 검증으로 범위를 넓히지 않았다.

### RR1-F2a 해소

- `validate.ts:261` 부근에서 type 무효 시에도 levels 구조·공통 5필드를 검사하도록 변경했다. 종류별 전용 필드는 요구·금지·값 판정에서 제외하고, 전용 필드가 아닌 미지 키는 계속 오류로 처리한다.
- 이전 소스 `142f015`를 메모리에서 실행해 cannon + base.damage null + attackPeriodMs 75가 type/타입 누락 오류 2개만 내는 것을 다시 확인했다. 수정 소스는 type/타입 누락·damage·Lv1~4 시간 배수 오류의 정확한 7개 경로를 반환했다.
- 독립 type 경계 **17개 입력** 통과: 무효 type 5종과 type 삭제, 4종 타워 각각의 전용 필드 무시·bogus 키 오류, levels 비객체, 공통 사거리 상한 위반·하한값. 공통 필드 오류 수집이 유지되고, 종류를 모르는 타워의 사거리 순서 오류·전용 필드 연쇄 오류는 생기지 않았다.
- 무효 type의 전용 필드 생략은 그 type에 의존하는 판정만 보류한다는 이전 수정 제안과 일치한다. type 오류 자체로 진입은 거부된다.

### RR1-F2b 해소

- parseMap 진입 시 오류 수를 저장하고, 독립 필드·좌표 검사를 끝낸 뒤 **그 map에서 오류가 늘었을 때만** compileStageMap을 생략하도록 변경했다.
- 이전 소스에서 map/waypoint/reservedCell extra + 대각은 각각 오류 2개였다. 수정 소스는 각 extra 경로 오류 1개만 반환했다.
- 독립 map 경계 **8개 입력** 통과: extra + 대각 3종, map.stageId 불일치 + 대각, 좌표 null + 대각, initialGold 0 + 대각, 여러 map 필드·좌표 오류 + prepMs 오류, 정상 묶음.
- 메모리 내 compileStageMap 호출 계수로도 확인했다. 오류 map 하나를 포함한 묶음은 정상인 다른 두 map의 기하 검증만 실행했고(2회), map 밖 initialGold 오류 + 대각에서는 세 map 모두 기하 검증을 실행해 두 독립 오류를 수집했다(3회).
- 여러 map 구조·필드·좌표 오류와 wave 오류가 함께 있을 때도 독립 오류를 모두 모은 뒤 기하 검증만 생략했다.

### 최종 실행 증거·변경 범위

| 직접 검사 | 결과 |
|---|---|
| `npm run test` | exit 0, 17 files / **356 tests passed** |
| `npm run lint` | exit 0 |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | exit 0 |
| `git diff --check 142f015..ceded17` | exit 0 |
| 파일 없는 이전/현재 소스 비교 및 경계 프로브 | exit 0, type 17개·map 8개 입력, 기하 호출 범위 확인 |

- `npm run typecheck`·`npm run build` 성공은 claude-main의 재검증 보고이며 이 리뷰에서 재실행하지 않았다. 직접 타입 검사는 위 incremental 비활성 tsc다.
- 제품·테스트·문서·Git 변경 없이 지정 리뷰 파일의 첫 줄과 이 섹션만 갱신했다. 생성 Vitest 결과 캐시만 정리하고, 기존 untracked `.omc/`는 보존한다.
- DATA-01 독립 리뷰의 기존 지적은 모두 해소됐다. 통합·배포 또는 실제 수치 승인은 이 결과에 포함하지 않는다.



