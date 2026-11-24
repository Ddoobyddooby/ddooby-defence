통과

# TECH-02 기초 모듈 구현 독립 리뷰

- 검토일: 2026-11-24 · codex-main · 요청 `msg_a80cb7e124d4` · 역할: 독립 리뷰(코드)
- 대상 worktree: `/Users/ddooby/Desktop/Ddooby/projects/ddooby-defence/wt-tech-02-core`
- 브랜치/커밋: `feat/tech-02-core` @ `b7724067a35b1be7f3f0e569d8e90d991eb6509d`
- 기준: `46c9657..b772406`, 23개 파일·2935줄 추가. 아래 소스 경로/줄 번호는 대상 worktree 기준이다.
- 기준 계약: 해당 worktree의 `docs/SIM-CONTRACT.md` v0.2, `.codex-out/TECH-02-test-strategy.md`의 재리뷰1·2 갱신 기대값 우선. REQ-STATE·REQ-QA / DATA-01~15·INT-01~15·TSTR-05~12.
- 판정: **보통 2건**. 기존 자동 검사 통과와 별도로, 마지막 step 완료 틱 누락 검증 및 toy 콘텐츠 참조 공유를 직접 재현했다. 치명적/높음 결함에 따른 별도 반영 보류 선언은 없다. 코드·문서 수정이나 통합 승인을 수행하지 않았다.

## 지적

### TECH-02-I1 — 보통 — 마지막 step이 endTick에 도달했는지 확인하지 않고 재생 성공 반환

- 위치: `src/game/core/sim/replay.ts:231` (관련 216~234줄)
- 계약/케이스: SIM-CONTRACT 31·133·139줄, R08 및 결정성 실패 주입.
- 기대: 매 step은 정확히 T를 완료하며, 성공 반환 시 `core.completedTick === record.endTick`이어야 한다. 진행하지 않거나 두 틱 진행하는 코어는 재생 오류다.
- 실제: 217줄은 **step 전** completedTick만 검사한다. `core.step()` 직후 검사가 없고 trace에는 루프 변수 T를 쓰므로 마지막 step이 잘못 진행해도 다음 반복이 없어 그대로 성공 반환한다.
- 직접 재현: 정상 초기 상태의 ToySim을 ReplayCore로 감싸고, 기록은 `commands:[], endTick:1`로 설정했다. 초기 해시·버전·콘텐츠는 정상이다. wrapper의 step을 (a) 빈 이벤트만 반환/진행0회, (b) inner.step을2회 실행으로 바꾸었다. 소스 파일을 고치지 않은 메모리 내 실패 주입이다.

```text
(a) runReplay 성공: trace.ticks[1].tick = 1, trace.ticks[1].state.tick = 0
    snapshot0 hash == 마지막 hash: true
    같은 잘못된 wrapper 2회 실행을 firstMismatch로 비교: null
(b) runReplay 성공: trace.ticks[1].tick = 1, trace.ticks[1].state.tick = 2
```

- 영향: 마지막 틱을 생략/중복 실행하는 코어 회귀가 runner의 완료 조건을 위반해도 성공 결과가 된다. 같은 잘못된 실행 두 번의 일치는 이 경계를 검증하지 못한다. 현재 ToySim의 정상 step/golden은 맞으므로 실제 게임 틱 누락이 발생했다고 확대하지 않는다.
- 수정 제안: `core.step()` 뒤, trace 생성/성공 반환 전에 `completedTick === T`를 검증한다. 새 코어의 초기 completedTick=0 조건도 명시적으로 확인하면 endTick0 경계와 일관된다.
- 재검증: 정상 endTick0·1·4 및 결과R=endTick/결과R<endTick 기존 테스트를 유지하고, 마지막 step의 **진행0회·진행2회** wrapper를 각각 오류로 거부하는 회귀 테스트를 추가한다. 더 긴 기록에서 마지막 step만 잘못되는 경우도 확인한다.

### TECH-02-I2 — 보통 — toy가 콘텐츠를 참조로 보관하여 초기 content 변경이 시도 중 정산에 반영됨

- 위치: `src/game/core/sim/testing/toySim.ts:108` (사용 211·292·313줄)
- 계약/케이스: PLAN 16줄 ‘한 플레이 시도 동안 불변 콘텐츠 스냅샷’, 테스트 전략 Q13의 초기 content 변경 경계, R07의 콘텐츠 버전 일관성.
- 기대: 시도 생성/입력 검증 후 외부 원본 객체를 변경해도 해당 시도의 콘텐츠는 유지되거나 명시적으로 변경이 거부돼야 한다.
- 실제: constructor는 `this.content = content`로 원본을 참조한다. `readonly`는 TypeScript 접근 제한이며 호출자 객체를 복사/동결하지 않는다. 검증한 buildCost·refundRate 및 중첩 script를 이후 step에서 외부 변경 값으로 읽을 수 있다.
- 직접 재현(수치는 TEST_ONLY, 새 프로세스의 로컬 객체만 변경):

```ts
const content = {
  contentVersion: "test-content-v1", initialGold: 100,
  buildCost: 60, refundRateBp: 5000, prepMs: 2000,
};
const sim = new ToySim(content, "stage-test", 1);
sim.submit("build", { tile: { col: 0, row: 0 } });
content.buildCost = 1;
sim.step();
// 실제 snapshot: gold=99, towers[0].actuallyPaid=1
// 원래 시도 콘텐츠 유지 기대: gold=40, actuallyPaid=60
```

- 영향: 장난감 시뮬의 결정성 증거에서 콘텐츠가 시도 시작 시점과 실행 시점 사이에 바뀔 수 있다. Q13 테스트는 현재 `commands.test.ts:88`의 payload 복사/동결만 검증하며 **초기 content 절반은 빠졌다**. TEST_ONLY의 결함이며 제품 경로로 유출됐다고 주장하지 않는다.
- 수정 제안: ToySim이 시도 시작 때 소유할 콘텐츠의 깊은 사본을 만들고 검증한다(중첩 script/settlements 포함). 호출자의 객체에 공유 동결을 적용하기보다 시도 내부 사본을 소유하는 방식이 적절하다. 그 사본에서 파생 초기 값과 이후 정산/스크립트를 읽는다.
- 재검증: 생성 뒤 원본 buildCost·refundRateBp 및 중첩 settlement 배열/항목을 바꿔도 원래 상태/이벤트가 유지되는지 테스트한다. payload 복사 테스트, 콘텐츠 hash 불일치 테스트, 기존 toy golden5개도 함께 유지한다.

## 직접 실행한 검사와 독립 oracle 확인

| 검사 | 직접 결과 | 범위 |
|---|---|---|
| `npm run test` | exit0, **Vitest11 files / 220 passed**, 약1.22초 | 지정 worktree 커밋 상태. 위 추가 경계를 기존220개가 검증한다는 뜻은 아님 |
| `npm run lint` | exit0 | 기존 import 제한 및 새 결정성 규칙 포함 |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | exit0 | 기존 생성 타입을 읽은 쓰기 없는 타입 검사. `next typegen`을 다시 실행한 것은 아님 |
| `git diff --check 46c9657..b772406` | exit0 | 지정 diff |
| I1·I2 재현 | 위 실제 출력 확인 | Node에서 TypeScript를 메모리 내 CommonJS로 변환/로딩한 일회성 probe. 제품 파일/테스트 수정 없음 |
| replay golden 독립 검산 | 틱0~4의 canonical 문자열·해시 **5개 모두 일치** | Python JSON 재정렬 및 정수 FNV 구현, 제품 canonical/hash 함수 미사용 |

독립 검산값:

| tick | gold | 이벤트 수 | FNV-1a64 |
|---|---|---|---|
| 0 | 100 | 0 | `b6435deadbb45635` |
| 1 | 40 | 2 | `198a43511a892682` |
| 2 | 10 | 2 | `2f212b0b9f3f6e9e` |
| 3 | 10 | 1 | `eb259b1d98efc71e` |
| 4 | 10 | 0 | `314c8be49cb0f5d4` |

`npm run typecheck` 및 `npm run build` exit0은 요청서의 **claude-main 재검증 보고**로 구분한다. 이번 리뷰에서 그 두 npm 명령/브라우저를 직접 실행하지 않았다. 이번 직접 타입 검사는 위 tsc 명령이다.

## P0 주장 표본과 oracle 충실도

| 범주 | 소스/테스트 대조 | 판단 |
|---|---|---|
| T01~T04·T08 | `time.test.ts:17`·`:38`·`:57`의 변환 literal·도메인 오류·Segment 순서 | 직접 존재/실행 확인. 0지속 거부·count>1/interval0 거부·정상 중첩 순서가 재리뷰 갱신과 일치 |
| T05~T07 | `testing/toySim.test.ts:288` 이후의 첫 step1·타이머·조기 시작·준비 진입 경계 | 직접 존재/실행 확인. 기대 tick·남은 타이머가 literal |
| N01~N10 | `intmath.test.ts:9`·`:26`·`:48`·`:60`·`:100`·`:127` | 경계 literal과 별도 BigInt 정수 산술, isqrt 제곱 부등식. 기대값을 제품 helper로 즉석 생성하지 않음. Number 오답 반례 및 ±0도 포함 |
| N11~N14 | `formulas.test.ts:13`·`:18`·`:27`·`:43` | 126·3750·38/2 및 최종1회 floor literal. formulas는 제품 수치를 확정하는 코드가 아님 |
| Q03~Q12 | `commands.test.ts` 및 `testing/toySim.test.ts` | 숫자 seq순, 순차 재검증, pause 큐 보존, 결과 접수 거부/step 오류, 원장1회, overflow 시 whole-step rollback 확인. Q09는 즉시 거부만이 아니라 toy의 결과 step 불변 테스트도 실제 존재 |
| Q13 | `commands.test.ts:88` | payload 깊은 복사/동결은 충실. 초기 content 사본은 미검증/실패(I2), 따라서 Q13 전부 통과 주장은 축소 필요 |
| Q14·R07~R09 | `replay.test.ts:228`·`:256`·`:324` | malformed endTick/seq/payload를 코어 생성 전에 거부, 결과 조기 종료/정상 종료 검사 존재. runner의 마지막 실제 tick 검증은 누락(I1) |
| S01~S09 | `canonical.test.ts`, `hash.test.ts`, `replay.test.ts:26` | 문자열·UTF-8 hash literal, 오류 field path, schema별 정렬 호출, 실패 진단 확인. 배열의 의미 순서는 generic canonicalize가 아닌 snapshot/명령 계층이 담당 |
| R01·R03~R06 | `replay.test.ts:85`·`:114`·`:124`·`:167`·`:207` | 5틱 전체 golden, 명령 변조 첫 tick2/정확 field path, 이벤트 reason/eventSeq 차이, ID1/2/10/11 및 역순 큐/소비 키 오염 검증 존재 |
| L01~L04 | `lint.test.ts`, canonical 소수 검사 | 실제 ESLint API로 메모리 내 fixture 검사. 허용/금지/우회 미검출을 구분. 프레임워크 import 금지 회귀 검사 유지 |

R05의 contentHash/initialStateHash를 제품 함수로 만드는 부분은 **동일한 입력의 두 실행을 구성하는 setup**이다. 핵심 원 실행의 절대 oracle은 별도 GOLDEN이고 문자열·hash를 독립 검산했으므로 setup에서 제품 함수를 썼다는 이유만으로 자기 oracle이라고 판정하지 않았다. 명령 변조/이벤트 변조 검증도 정상 golden과 함께 사용돼 유효하다.

T09·Q02의 전투 단계 연결과 P1/P2를 TECH-02 전체 게임 검증으로 확대하지 않는다. R12 변이7종 ‘실패 후 복구’는 **claude-1 보고**이며 이번에 소스를 변이하거나 그 이력을 독립 재현하지 않았다. 기존 실패 주입·literal 테스트가 존재하는 사실과 수동 변이 실행 증거를 구분한다.

## 요청서의 모호점·추가 범위 판단

| 항목 | 판단/근거 |
|---|---|
| M 자체 ID를 발급하지 못함 | **수용.** `ids.ts:30`은 다음 카운터도 안전 정수로 유지하므로 최대 실제 발급은 M−1, M에서 오류·무변경이다. 테스트 전략 Q12가 M에서 오류를 요구하고 `ids.test.ts:23`·`:33`이 이를 검증한다. wrap이나 unsafe sentinel을 도입할 필요 없음. 사용 가능 범위 M−1을 API 설명에 유지하면 됨 |
| `__proto__` 키 통과 | **수용.** 계약 ASCII 식별자 패턴에 부합하며 canonicalize는 정렬 문자열을 직접 만들고 clone은 JSON.parse를 사용한다. JSON.parse로 만든 own `__proto__` 키를 복제한 probe에서 own key 유지·Object.prototype 정상·전역 오염 없음 확인. 현재 구현에서 prototype pollution 결함은 발견하지 못함. 향후 다른 일반 객체에 assign/merge하는 경로가 생기면 그 사용처에서 재검토 |
| stageId·paused·outcome·phase가 snapshot에 포함 | **수용.** 상태를 숨기지 않고 결정성 진단에 포함하는 것이 적절하다. pause 중 step이 없어 replay는 post-step 상태를 비교한다. 실제 pause 중간 snapshot을 기록상의 추가 game tick으로 취급하지 않으면 모순 없음 |
| 접수 구조 오류 throw, seq 미소비 | **수용.** malformed 입력은 개발/구조 오류, 유효 구조의 게임 규칙 거부는 event라는 분리가 `commands.ts:29`·`:119` 및 테스트에서 일관된다. `events.ts`/`errors.ts`가 문자열과 클래스를 구체화한다. pause/result 중 malformed 입력까지 모두 SubmitResult로 반환한다고 주장하지 않아야 함 |
| lint 별칭·globalThis.Math 우회 | **수용, 리뷰 보완 전제.** 계약104줄이 우회 미검출을 리뷰 게이트로 보완하도록 이미 명시. `lint.test.ts:68`·`:71`은 미검출을 성공 보장으로 위장하지 않는다. 변경된 제품 코어에서 그런 우회 사용은 발견하지 못함 |
| Math.sqrt 예외 범위 | 현재 사용은 `intmath.ts:76`의 isqrt 내부뿐이므로 계약에 맞음. lint 예외 자체는 함수 단위가 아니라 **intmath.ts 파일 전체**이므로 ‘lint가 isqrt 내부만 증명한다’고 확대하지 않는다 |
| formulas.ts·floorBp·mulSafe 추가 | 계약3.3 정수 식 및 안전 중간 연산을 표현한 제한된 범위로 수용. 실제 데이터 능력치·밸런스가 확정된 것은 아님. 필드별 콘텐츠 상한/의미 도메인은 DATA-01 검증과 구분 |

## TEST_ONLY 경계·검증 상태·후속

- `testing/toySim.ts`/`fixtures.ts`에는 TEST_ONLY 표시가 있고, 전체 `src` import 검색에서 이들을 참조하는 것은 테스트와 testing 내부뿐이었다. 제품 route/Phaser/일반 core 모듈에서 testing import를 발견하지 못했다. `initialCounters`/`storageOrder` seam도 ToySim 안에만 있으며 제품 helper에 테스트 분기는 없다.
- `eslint.config.mjs:30`의 기존 framework import 제한은 유지되고 뒤 규칙이 덮어쓰지 않는다. 직접 실행한 `lint.test.ts:99`의 Next/React/Phaser/앱 금지 검사도 통과했다. TEST_ONLY import의 **향후 자동 차단 규칙까지 구현됐다고 주장하지는 않는다**.
- 저장소 그래프가 없어 직접 소스 검색/읽기를 사용했다. 추가 조사 범위는 계약·전략·기존 grid/config/import 경로 확인과 일회성 재현·독립 golden 계산에 한정했다.
- 실행 중 갱신된 `node_modules/.vite/vitest/da39a3ee5e6b4b0d3255bfef95601890afd80709/results.json` 및 비어 있는 상위 Vitest 캐시 디렉터리만 정리했다. 기존 `.next`, 의존성, tsbuildinfo는 건드리지 않았다. 타입 검사는 incremental=false로 실행했다.
- 검토 전후 worktree는 `b772406`/`feat/tech-02-core`, tracked/untracked 변경 없음. 두 폴더 모두 checkout·커밋·push·병합하지 않았으며 원래 작업 폴더의 **이 결과 파일만 작성**했다.
- 후속: 구현 담당에게 I1의 post-step tick 검증/회귀 테스트, I2의 소유 콘텐츠 사본/외부 변경 회귀 테스트를 요청한다. 수정 커밋에 대해 이 두 지적과 관련 기존 golden·입력/종료 경계를 좁게 재검증하면 된다. 원리뷰이며 재리뷰0/2회.

## 재리뷰 1

- 검토일: 2026-11-24 · 요청 `msg_a5f1053c6056` · 역할: 독립 리뷰(재리뷰1/2)
- 대상: 같은 worktree의 `feat/tech-02-core` @ `f8f59b1024e7438e924df54327a582cf34cdb945`
- 검토 범위: `git diff b772406..f8f59b1`의 replay·ToySim 및 관련 테스트4개 파일(69줄 추가·2줄 삭제). I1·I2 해소와 수정 경계만 검토했다.
- **판정: 통과. I1·I2 모두 해소됐고 해당 수정의 회귀를 발견하지 못했다.** 첫 줄은 최신 판정이다. 위 원리뷰의 지적과 검사 결과는 `b772406` 당시 기록으로 보존한다.

| 지적 | 소스·회귀 테스트 대조 | 직접 재현 결과 | 판정 |
|---|---|---|---|
| I1 | `src/game/core/sim/replay.ts:212`에서 새 코어 completedTick0 검사, 235줄에서 각 step 직후 completedTick=T 검사 후 trace 생성. `replay.test.ts`는 마지막 호출의 완료 틱을0회/2회 진행에 해당하게 바꾼 wrapper 및 초기 tick≠0(endTick0 포함)을 추가 검사한다. | 원리뷰 방식처럼 **실제 inner.step을 마지막에0회/2회 호출**하는 별도 wrapper도 재실행했다. endTick1·4 각각 두 경우, 총4개 모두 ReplayStructureError/path=core. endTick4는 앞3회 정상 후 마지막에 오류를 검출했다. | 해소 |
| I2 | `src/game/core/sim/testing/toySim.ts:106`에서 structuredClone(source)한 사본을 검증·소유하고 이후 해당 사본만 사용한다. `testing/toySim.test.ts`는 비용·환급률·중첩 settlement 항목과 배열 변경, 원본 미동결을 추가 검사한다. | 원리뷰의 buildCost60→1 변경 후에도 **gold40/actuallyPaid60**. 중첩 정산5→999·추가 정산50·환급률변경을 함께 주입한 별도 probe에서는 첫 gold45/이벤트2개, 판매 환급30/최종gold75, 호출자 원본 frozen=false. | 해소 |

### 직접 실행한 검증

| 검사 | 결과 |
|---|---|
| `npm run test -- src/game/core/sim/replay.test.ts src/game/core/sim/testing/toySim.test.ts` | exit0, **2 files / 83 passed**. 기존5틱 golden·contentHash·payload 복사·결과 종료 경계와 새 회귀 포함 |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false` | exit0. 기존 생성 타입을 읽은 타입 검사, next typegen 재실행 아님 |
| `git diff --check b772406..f8f59b1` | exit0 |
| 일회성 메모리 내 TS 로딩 probe | 위 I1의4개 실패 주입 및 I2의원본/중첩 콘텐츠 변경 기대값 확인. 제품 파일 변경 없음 |

진행된 코어 재사용의 오류가 이제 completedTick 검사에서 ReplayStructureError로 먼저 나오는 것은 적절하다. 추가된 **tick0이지만 큐/카운터가 남은 코어 → ReplayInitialStateError** 테스트가 초기 해시 검사를 계속 검증하므로 오류 클래스 기대를 바꾼 것만으로 검증이 약화되지 않았다. 정상 endTick0·결과R=endTick·결과R<endTick 및 기존 golden도 관련83개 테스트에서 유지됐다.

claude-main의 전체224 passed·npm lint/typecheck/build exit0은 **요청서 보고**이며, 이번 직접 재검증은 위83개·별도tsc·diff검사다. 원리뷰와 무관한 규칙/파일로 조사 범위를 넓히지 않았다.

### 보존·정리

- 추가 전 산출물 SHA-256은 `9d203eaa17cccd25ab9e633840c45396dcf5e9034bfb04a20a0094c6698fac5f`으로 원리뷰 작성 직후 값과 일치했다. 첫 줄 갱신 및 이 재리뷰1 추가 외 이전 본문을 바꾸지 않았다.
- 이번 실행으로 갱신된 Vitest results 캐시와 비어 있는 해당 상위 디렉터리만 정리했다. 기존 .next·의존성·tsbuildinfo는 유지했다.
- 검토 전후 구현 worktree는 `f8f59b1`/`feat/tech-02-core`이며 tracked/untracked 변경 없음. 제품 코드·문서·Git 변경이나 checkout 없이 원래 폴더의 이 결과 파일만 갱신했다.
- 재리뷰1/2회 완료. 이번 판정은 지정 구현 변경의 독립 리뷰 결과이며 별도 통합·push 승인이나 실제 전투/제품 출시 QA 완료를 뜻하지 않는다.
