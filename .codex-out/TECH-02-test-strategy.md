지적 있음

# TECH-02 테스트 전략

- 작성: 2026-11-24, codex-main · 요청 `msg_1b2103392d5e` · 역할: 테스트 전략(계약 허점 포함)
- 대상: `docs/tech-02-contract` @ `a6166fb3d8fe070ade51ff5bcb93e1c9c55a5623`, base `b0902ab6e34381a26a16e366bfe46c1f3cb4c6a9`
- 범위: `docs/SIM-CONTRACT.md` 전체 및 SPEC 7·12절, PLAN 3.2·9절, TASKS TECH-02 연결 diff. REQ-STATE·REQ-QA / DATA-01~15·INT-01~15·TSTR-05~12.
- 첫 줄은 **계약 허점 판정**이다. 아래 테스트는 모두 **설계됨**, 제품 구현 테스트 통과가 아니다. TECH-02 기초 모듈은 아직 없으며 이 산출물은 구현하지 않는다.
- P0: 기초 모듈 완료 전에 필수. P1: 해당 어댑터/전투 구현 통합 전 필수. P2: 실제 지원 브라우저·기기 검증. 이 우선순위는 결함 심각도와 별개다.
- 제품 수치 승인은 요청서와 SPEC 95줄에 명시된 50ms·정수 고정소수점·비율 반올림뿐으로 취급한다. 모든 예시 수치는 TEST_ONLY이며 밸런스 후보가 아니다.

## 1. 계약 허점과 결정 의존성

### C1 — 보통 — 안전한 곱셈만으로 roundDiv의 중간 덧셈 정밀도를 보장할 수 없음

- 위치: `docs/SIM-CONTRACT.md:51`·`:53` (영향: 52·54·64~66줄)
- 근거: 51줄은 안전 정수 상태 및 ‘중간 곱이 2^53을 넘지 않음’을 요구한다. 그러나 roundDiv는 덧셈 `2*abs(a)+b`도 수행한다. `a=4503599627370493, b=9`는 두 입력, `2a=9007199254740986`, `2b=18` 모두 안전하다. 정확한 분자는 `9007199254740995`인데 JS Number는 `9007199254740996`으로 만든다. 정확한 결과 **500399958596721**, 문서 식의 Number 결과 **500399958596722**를 직접 확인했다.
- 추가 경계: 안전 정수 최대는 `2^53−1=9007199254740991`이다. `2^53` 자체를 허용해서는 안 된다. `a=MAX_SAFE_INTEGER,b=1`도 Number 식은 `9007199254740992`를 반환한다.
- 수정 제안: helper의 허용 입력/실패 동작과 **모든 곱·합·차·카운터 증가·시각 합산**의 안전 범위를 명시한다. DATA-01의 실제 필드 상한과 별개로, helper는 정확한 BigInt 중간 계산 후 안전한 Number로 변환하거나, 몫·나머지 연산 등 정확성이 증명된 방식/사전 가드로 처리한다. 거부할 경우 상태를 부분 변경하지 않는다. 상한을 지금 제품 수치로 확정할 필요는 없다.
- 해소 조건: N09의 정확한 값 또는 명시된 도메인 밖 오류가 검증되고, 안전하지 않은 값을 조용히 반올림해 반환하지 않음. 실제 DATA-01 상한 기반 통합 검증은 의존성 차단으로 남긴다.

### C2 — 보통 — 속도 보정 전후의 단위·변환 순서가 달라 정수 불변식/결과가 갈림

- 위치: `docs/SIM-CONTRACT.md:44`·`:61`·`:63`
- 근거: 데이터 속도 1000mt/s는 20의 배수다. 둔화 2500bp 적용 후 초 단위에서 계산하면 750mt/s, 나누기 20은 **37.5mt/틱**이 되어 정수 상태 규칙을 깨뜨린다. 먼저 50mt/틱으로 변환한 뒤 적용하면 **38mt/틱**이다. 초 단위 보정 후 변환 시 추가 roundDiv를 쓰는 것도 문서에는 정의되지 않았다. 작은 속도에서는 차이도 커진다: 20mt/s에 +5000bp는 초 단위 우선이면 30/20=1.5, 틱 단위 우선이면 round(1×1.5)=2이다.
- 수정 제안: `baseSpeed`·`baseSpeed'`·`speed`가 각각 mt/s인지 mt/틱인지 명명하고, 데이터 검증→단위 변환→특성→둔화의 정확한 순서 및 각 반올림 시점을 고정한다. 간단한 제안은 데이터 검증 후 먼저 mt/틱으로 바꾸고 두 비율을 순서대로 적용하는 것이다. 다른 방식을 택해도 동일한 정수 결과 oracle을 먼저 승인해야 한다. 파생 속도에 ‘20 배수’를 다시 요구하면 유효한 둔화를 거부하므로 피한다.
- 해소 조건: N14의 양쪽 경계 입력에 단일 기대값을 정할 수 있음. 현재는 이 테스트의 최종 기대값 확정이 차단돼 있다.

### C3 — 보통 — tick이 step 전/후 무엇인지, 기록 tick이 접수/실행 중 무엇인지 불명확

- 위치: `docs/SIM-CONTRACT.md:18`·`:29`~`:34`·`:72`·`:99`
- 근거: 시도 시작 tick=0과 ‘접수된 명령은 다음 틱’은 있지만 step에서 tick을 언제 증가시키는지 없다. 첫 step 전에 접수한 startWave가 첫 step의 tick=0에 적용되는 해석과 tick=1에 적용되는 해석이 모두 가능하다. 이후 startMs=0 생성과 모든 해시 인덱스가 1틱 어긋난다. 기록의 `{tick,seq}`가 접수 틱이면 재생 때 +1이 필요하고 실행 틱이면 필요 없다.
- 수정 제안: 초기 스냅샷·첫 step·명령 접수 마감·tick 증가·해시 생성 시점을 한 타임라인으로 고정하고, 기록은 명시적인 `applyTick` 또는 의미가 고정된 tick을 사용한다. 예: 초기 상태는 completedTick=0, 다음 step은 T=1을 실행하고 8단계 종료 후 snapshot(T)을 저장. 첫 step 전 명령은 applyTick=1. step 중 재진입 enqueue는 금지하거나 T+1로 밀어낸다.
- 함께 명시할 경계: 새 준비 단계에 진입한 바로 그 틱 8단계가 준비 카운트를 소비하는지; 준비 0ms/둔화 0ms/공격 주기 0ms를 허용하는지. 0 지속 둔화를 4단계에 붙이면 이미 만료됐는데 6단계 이동에 적용될 수 있다. 하한은 DATA-01 의존성으로 명시하고 자동 보정하지 않는다.
- 해소 조건: T05~T09에 tick 번호를 포함한 단일 기대 추적표를 쓸 수 있음. 제안 타임라인은 사용자 확정 사항으로 취급하지 않는다.

### C4 — 보통 — 리플레이 기록만으로 같은 초기 상태와 시도 식별자를 복원할 수 없음

- 위치: `docs/SIM-CONTRACT.md:83`·`:86`·`:97`~`:100`
- 근거: attemptId는 세션에서 증가하고 이벤트 출력에도 포함되지만 기록에는 codeVersion·contentHash·stageId·commands만 있다. 같은 기록을 같은 세션에서 두 번 새 시도로 실행하면 attemptId가 1→2로 바뀌어 상태 또는 이벤트 문자열 해시가 달라질 수 있다. 반대로 attemptId 등을 비교에서 무조건 빼면 이전 시도 데이터 유입 회귀를 놓친다. 재생 종료 틱도 없어 명령 이후의 무입력 구간을 어디까지 검증할지 고정되지 않는다.
- 수정 제안: 초기 시도 ID·초기 상태(또는 버전이 고정된 재구성 규칙과 그 hash) 및 종료 틱을 기록한다. 시도 ID를 재생 로컬 namespace로 정규화한다면 상태·이벤트·참조 전부에 같은 매핑을 적용하고 이전 시도 이벤트 차단은 별도 검사한다. 버전/contentHash 불일치와 잘못된 명령 기록은 실행 전 오류로 구분한다. 기본값은 현재 세션 상태를 재사용하지 않는 것이다.
- 해소 조건: R02·R06~R09에서 같은 기록 재생이 현재 세션 카운터·저장 상태와 독립이며, 원 실행의 틱별 상태·이벤트와 비교 가능함.

### C5 — 보통 — 정규 JSON·이벤트 해시 입력에 구현 간 차이를 막을 바이트 계약이 부족

- 위치: `docs/SIM-CONTRACT.md:92`·`:97`~`:99`
- 근거: ‘배열은 ID 순’은 entity 외 명령 seq·원장 eventSeq·waypoint 원본 순서·키 집합을 구분하지 않는다. events의 객체 키 정렬, JSON과 이벤트의 결합 형식, UTF-8/UTF-16, FNV 오버플로 마스킹·출력 너비도 미정이다. 동일한 논리 상태여도 각 구현이 다른 바이트를 만들 수 있다. Number.isSafeInteger(-0)는 true이고 roundDiv(-1,3)의 직접 JS 구현은 -0을 만들지만 JSON은 0으로 쓰므로 0 정규화도 필요하다.
- 수정 제안: 스키마별 배열 순서를 정한다(entities=id, commands=seq, ledger/events=eventSeq, 경로/Segment=원본 의미 순서, consumed keys=명시된 문자열 순서). 객체 키는 재귀 정렬하고 UTF-8·공백 없음·-0 정규화·허용 JSON 타입·오류 정책을 고정한다. 틱 입력은 문자열 단순 이어붙이기 대신 정규화된 `{events,state}` 같은 한 envelope로 정의한다. FNV의 offset/prime, 바이트 XOR→곱→64비트 mask, 소문자 16자리 출력과 스냅샷 대상 필드(다음 ID/seq·명령 큐·타이머·소비 키 등)를 명시한다.
- 해소 조건: S01~S09의 문자열·바이트·해시를 서로 다른 구현에서 같은 값으로 만들 수 있음. 아래 golden은 **제안한 바이트 계약 기준**이므로 현 계약 확정 결과로 보지 않는다.

SPEC 대조: 50ms·정수·비율 반올림과 환급 floor 예외는 SPEC 95·103줄과 일치한다. 고정 8단계, 패배 우선, 명중/TTL 동시 명중 우선도 계약에서 뒤집지 않는다. 가까운 타깃은 SPEC 41줄의 실제 거리 최소를 계속 사용해야 하므로 계약 67줄의 ‘판정·정렬에는 pathProgress’는 **경로 진행 기반 정렬**에 한정해 해석/명료화할 것을 권고한다. 전투 4단계 내부의 추가 세부는 계약 105줄에 따라 SIM-02 후속 검증으로 남긴다.

## 2. 기대값 산출 방식과 실행 위치

- helper 단위: Vitest, 순수 TS 코어. 테스트 oracle은 제품 helper를 호출하지 않고 BigInt 정수 산술·명시된 literal·Python `math.isqrt`로 교차 계산한다. 같은 식을 Number로 복사해서 예상값을 만들지 않는다.
- 명령/ID/정규화: 렌더 없는 장난감 시뮬. 성공·거부 모두 실행 후 gameplay state와 진단 메타데이터를 따로 비교한다. ‘거부 시 상태 불변’은 gold/tower/occupancy를 뜻하며 이미 부여된 seq와 rejection/eventSeq까지 불변이라는 뜻이 아니다.
- ESLint: lint API의 메모리 내 source fixture(또는 저장소 밖 임시 파일), 실제 `src/game/core` 경로로 설정을 해석. 브라우저/Next 빌드를 실행해야 하는 테스트로 만들지 않는다.
- 시간 어댑터/실제 replay: TECH-02 toy → SIM-01/02·ECON 통합 → 실제 지원 브라우저 순으로 확대한다. 수동 플레이는 숫자 helper 검증을 대체하지 않는다.
- 개별 DATA/INT/TSTR 원문 케이스가 제공되지 않아 아래 독립 ID를 사용했다. DOC-02에서 세부 연결한다. 시리즈 번호만으로 기존 테스트 존재/통과를 주장하지 않는다.

## 3. 시간·틱 테스트 (REQ-STATE / INT·DATA)

| ID·우선순위 | 입력·조건 | 기대 결과 / 상태 |
|---|---|---|
| T01 P0 | 일반 시간 변환 0, 50, 100, 1000ms | 각각 0, 1, 2, 20틱. 0의 **필드별 허용 여부**는 T04에서 따로 검사 |
| T02 P0 | 1, 49, 51, 99, -50, 0.5, NaN, ±Infinity, 2^53, null, true, 문자열 "50" | 변환 전 명시적 오류, 강제 형변환·반올림 보정 없음. 음수/타입은 helper 입력 도메인으로 고정 필요 |
| T03 P0 | 50×N, N=0..1000 및 실제 허용 최대 근처 | ticks=N, 역변환=ticks×50. 경계 초과는 오류. MAX_SAFE_INTEGER ms는 50의 배수가 아니므로 오류 |
| T04 P0 | startMs=0, intervalMs=0/count=1·2, prep=0, slowDuration=0, period=0, TTL=0 | startMs=0 허용. 나머지는 필드별 하한을 결정한 뒤 성공/오류를 고정. 현재 의존성 차단; 0을 몰래 1틱으로 보정 금지 |
| T05 P0 | 초기 tick=0, 첫 step 직전 startWave seq1, startMs=0/count1 | C3 제안 채택 시 step T=1의 단계1 startWave→단계3 enemy1 생성. snapshot(1)과 record.applyTick=1. 첫 생성이 0/2틱이면 실패 |
| T06 P0 | 준비 상태로 시작하는 T=7, remainingPrepTicks=1, 명령 없음 | 단계8 전환, waveStartTick=8. T7에는 해당 웨이브 spawn 없음, T8 단계3의 startMs=0 spawn 있음 |
| T07 P0 | T7 remainingPrepTicks=1에 startWave 2개, 이후 동일 타이머 경계 | 첫 명령만 전투 전환·waveStartTick=7; 두 번째는 조건 재검증 거부, 다음 웨이브/보너스/두 번째 spawn 없음. T7 단계3부터 시작 |
| T08 P0 | waveStartTick=10, S0 start100/interval50/count3, S1 start150/interval0/count2 | 생성 순서 (tick,Segment,i,id): (12,0,0,1),(13,0,1,2),(13,1,0,3),(13,1,1,4),(14,0,2,5). interval0 허용 확정 전 해당 부분은 차단 |
| T09 P0 | T10 단계4에 slow duration=100ms 적용 | expireTick=12; T10·11 이동에 적용, T12 단계2 제거 후 이동. 새 준비 단계 진입 틱의 카운트 소비는 C3 결정 후 별도 literal trace 고정 |
| T10 P1 | nextFireTick=10, period=100ms=2틱, 타깃 상시 존재 | T10·12·14 발사, T11·13 없음. 사거리/타깃 부재 때 nextFireTick 갱신 여부는 SIM-02에서 확정 |
| T11 P1 | 누적 프레임 [20,30], [100], [300]ms, 초기 0 | 각각 총 1, 2, 5 step. [300]의 초과 누적은 버려 다음 0ms 프레임에서 추가 step 없음. pause 중 5000ms는 0 step, resume 시 catch-up 없음 |
| T12 P1 | [275]ms 후 [25]ms | ‘나머지 누적 전부 버림’이면 5+0 step; 25ms 잔여 보존 정책이면 5+1. 계약 24줄 해석을 고정할 회귀 케이스. 남은 25ms를 보존할지 제안/승인 후 literal 고정 |

## 4. 정수 helper·연산 테스트 (REQ-QA / DATA·TSTR)

`M=9007199254740991`. 허용 범위를 넘는 경우 **정확한 결과 또는 명시적 거부** 중 채택한 API 계약 하나를 테스트한다. 두 결과를 모두 허용하는 느슨한 테스트를 구현하지 않는다.

| ID·우선순위 | 입력 | 독립 기대값 / 판정 |
|---|---|---|
| N01 P0 | applyBp(0,0),(0,10000),(123,0),(123,10000) | 0,0,0,123 |
| N02 P0 | applyBp(1,4999),(1,5000),(1,5001) | 0,1,1 (0.5 올림 경계) |
| N03 P0 | applyBp(3,5000),(101,12500) | 2,126 |
| N04 P0 | roundDiv(0,2),(1,2),(-1,2),(3,2),(-3,2),(5,2),(-5,2) | 0,1,-1,2,-2,3,-3. Math.round(-0.5)=−0으로 대체하는 구현 검출 |
| N05 P0 | roundDiv(1,3),(-1,3),(-0,1) | 수학값 모두 0. 정규화 제안 채택 시 Object.is(result,-0)=false도 검사 |
| N06 P0 | applyBp 음수 v/bp, roundDiv b=0·음수·소수, isqrt n=-1, 공통 null/boolean/string/NaN/Infinity/소수/unsafe integer | 연산 전 오류, 상태 변경 없음. isqrt(0)는 성공 0. 타입 단언만으로 통과시키지 않음 |
| N07 P0 | isqrt n=[0,1,2,3,4,8,9,15,16,17] | [0,1,1,1,2,2,3,3,4,4]. 완전제곱 전·정확·후 모두 포함 |
| N08 P0 | isqrt(M) | 94906265. BigInt로 94906265²=9007199136250225 ≤ M < 9007199326062756=94906266² 확인. 허용 helper 상한이 더 작다면 상한 밖 오류 케이스로 분리 |
| N09 P0 | roundDiv(4503599627370493,9); roundDiv(M,1) | 정확값 500399958596721; M. 허용 범위 밖으로 정하면 **먼저 오류**. C1의 현재 Number 식 오답을 의도적으로 죽이는 회귀 |
| N10 P0 | v×bp=M 경계, M+1 산출; (dx²+dy²), range², 2abs(a)+b, tick+duration, start+i×interval, 실제지출+가격, gold+reward, counter+1 | 허용 중간값까지 안전함 증명, 다음 한 단계 초과는 거부. 각 합산 항은 안전해도 합이 넘는 입력 포함. 구체 필드 상한 통합은 DATA-01 차단 |
| N11 P0 | baseHp=101,hpBoostBp=2500; baseHp=1,boost0 | max/currentHP=126/126; 1/1. 실제 게임 HP가 아닌 TEST_ONLY |
| N12 P0 | baseSlowBp=5000,resistanceBp=2500; resistance10000 | effective=3750; 0. resistance<0 또는 >10000은 거부 규칙 필요 |
| N13 P0 | 실제지출 3,refund5000bp; 실제지출=설치1+강화1,refund5000 | 환급1; 환급1. 반올림하면2가 되는 첫 예, 거래별 floor 합은0이 되는 둘째 예로 **최종 한 번 floor** 검증 |
| N14 P0 | 데이터 1000mt/s, boost0, slow2500; 20mt/s, boost5000, slow0 | C2 제안(먼저 /20) 채택 시 38mt/틱; 2mt/틱. 보정 후 /20이면 37.5;1.5가 나옴을 검출. 최종 정책 결정 전 의존성 차단 |
| N15 P1 | 사거리 r=5, dx/dy=(3,4),(0,5),(0,6),(-3,-4) | true,true,false,true. 제곱 비교로 경계 포함, Math.hypot 호출 없이 검사 |
| N16 P1 | 투사체 (0,0)→(3,4), step5·4 | step5는 이번 틱 명중. step4는 아직 명중 아님, d=5·roundDiv로 위치(2,3). dx/dy 부호 반전이면 위치(-2,-3) |
| N17 P1 | (0,0)→(3,4), step1 | 명시된 식이면 위치(1,1). 이 양자화로 이동 길이는 √2가 되므로 정수 이동의 근사 정책을 검토할 관찰 케이스; 독단적으로 ‘정속 오차 없음’ 판정 금지 |

추가 속성: 허용 작은 영역 v=0..200·bp=0..20000을 고정 간격/경계로 순회해 BigInt oracle과 비교, roundDiv의 부호 대칭·양수 b에서의 단조성, isqrt의 BigInt 제곱 부등식을 검증한다. 코어에 금지된 난수를 oracle 데이터 생성에 쓸 필요 없이 결정적인 열거로 충분하다. isqrt 보정 분기는 초기 추정 r을 ±1 틀리게 주입할 seam이 있다면 해당 분기를 검증하되 테스트 전용 API를 제품에 추가하도록 강제하지 않는다.

## 5. ID·명령 큐·원장 테스트 (REQ-STATE / INT·DATA)

| ID·우선순위 | 입력·조건 | 기대 결과 |
|---|---|---|
| Q01 P0 | 새 세션 진입→재도전 | attemptId 1→2, 각 시도의 tower/projectile/enemy/command/event 첫 번호는1. 기존 소비 키·이전 큐 제거 |
| Q02 P0 | enemy 3개 같은 틱·겹친 Segment | T08 순서의 연속 ID, spawnSerial=enemyId. 저장 구조 삽입 순서에 의존 금지 |
| Q03 P0 | gold100, cost60, 다른 칸 build 2개 접수 | seq1/2, 같은 applyTick. 1번 성공·gold40·tower1/점유1; 2번 insufficientGold 거부, 추가 차감/타워/점유 없음 |
| Q04 P0 | Q03의 내부 큐 저장 순서를 [seq2,seq1]로 오염 | 적용은 seq1→2, Q03과 동일 gameplay/이벤트/해시. seq를 문자열 비교해 1,10,2 순으로 적용하는 변이도 검출 |
| Q05 P0 | gold120, 동일 타일 cost60 build 2개 | 첫 성공, 두 번째 occupied 거부. gold60·tower1 한 개. 실패 시 towerId 소비 여부는 제안상 **성공 생성 시에만 소비**로 고정 필요 |
| Q06 P0 | 같은 틱 sell tower1→sell tower1, 실제지출60·refund5000 | 첫 환급30·타워 제거, 두 번째 towerNotFound/중복 거부. refund 원장1건, sell:t1 소비1회 |
| Q07 P0 | sell→build와 build→sell 순서를 교환, 초기 gold0·기존타워 환급60·새 설치60 | sell→build면 둘 다 성공 gold0; build→sell면 build 거부 후 sell 성공 gold60. 앞 명령 반영 상태 재검증 |
| Q08 P0 | startWave→sell vs sell→startWave | 전자는 판매 거부, 후자는 유효 판매 후 전투. 판매 확인 UI 없이도 적용 단계 재검증 |
| Q09 P0 | 접수 전 pause/result, build/startWave/upgrade 등 | 즉시 거부, seq 미부여·기록 없음·gold/점유 변화 없음. 접수해 둔 명령 이후 pause는 진행 정지 후 resume 시 재검증; 결과 도달 뒤 대기 명령 처리 정책은 freeze와 양립하도록 명시 |
| Q10 P0 | 같은 kill:e1 / waveClear:w1 / sell:t1 정산을 두 번 주입 | 원장 각1건, 금액1회. 다음 시도의 같은 로컬 키는 새 시도에서 정상 정산, 이전 attempt 이벤트는 유입 차단 |
| Q11 P0 | 이벤트 발생 build→rejected→sell | eventSeq 1,2,3 순; 경제 원장은 eventSeq1·3만(거부는 경제 delta 없음). 모든 이벤트가 eventSeq를 쓰는지 계약에 명시 후 고정 |
| Q12 P0 | counter=M, 다음 접수/생성/시도 | wrap·ID재사용·unsafe 증가 없이 명시적 오류. 원자성: 잔액/점유/큐/부분 원장 변경 없음 |
| Q13 P0 | 접수한 payload 객체/초기 content를 호출자 쪽에서 변경 | 접수/시도 시작 시 스냅샷 정책에 따라 원래 입력 유지 또는 명시적 변경 거부. 조용히 재생 기록과 실행 입력이 달라지면 실패 |
| Q14 P0 | replay의 중복 seq, 음수/소수 tick, 알 수 없는 kind, 잘못된 payload, 과거 applyTick | 실행 전/해당 입력 경계에서 구조 오류. duplicate seq의 안정 정렬이나 현재 tick으로 자동 이동 금지. 허용 gaps 정책은 별도 명시 |

## 6. 정규 스냅샷·FNV·ESLint 테스트 (REQ-QA / DATA·TSTR)

아래 바이트 golden 제안: 객체 키를 재귀적으로 고정 순서 정렬, JSON.stringify와 같은 문자열 escaping·공백 없음, 숫자는 safe integer만, -0은0, 배열은 스키마별 순서. UTF-8 byte마다 FNV-1a: 시작 `0xcbf29ce484222325`, `h=((h XOR byte)×0x100000001b3) & 0xffffffffffffffff`, 소문자 16자리. 이것을 채택하기 전에는 계약 결정 필요 상태다. BigInt는 해시 계산 내부에서만 사용하고 상태 JSON에 넣지 않는다.

| ID·우선순위 | 입력·조건 | 기대 결과 |
|---|---|---|
| S01 P0 | {b:2,a:1}, 역삽입 {a:1,b:2} | 둘 다 정확한 문자열 `{"a":1,"b":2}`. UTF-8 FNV=`a0ebc03bdc71de7b` |
| S02 P0 | {z:{b:2,a:1},a:0} | `{"a":0,"z":{"a":1,"b":2}}`. 중첩 키도 정렬, 원본 객체 mutate 없음 |
| S03 P0 | tower IDs [10,2,1], consumed keys ["kill:e2","kill:e1"] | ID 숫자순 [1,2,10], 키의 정의된 문자열순. 원장 eventSeq·명령 seq는 해당 키 순; waypoint·Segment의 의미 순서는 보존 |
| S04 P0 | NaN,±Infinity,1.5,M+1,undefined,BigInt,함수,Symbol,배열 hole,Date,Map/Set 그대로 전달, 순환 참조 | 조용한 null/필드 누락/{} 변환 없이 schema 오류와 필드 경로. Set은 명시적 snapshot 변환 후 정렬 배열로만 허용 |
| S05 P0 | -0·0, Unicode 한글, 문자열 quote/backslash/newline | 0은 canonical 동일. escaping/Unicode 정책은 명시된 바이트와 일치. 해시 부동소수점/localeCompare 사용 금지 |
| S06 P0 | UTF-8 문자열 "", "a", "foobar", "한글" | 각각 `cbf29ce484222325`, `af63dc4c8601ec8c`, `85944171f73967e8`, `5900dac74a762e41`. UTF-16 code unit hashing 변이 검출 |
| S07 P0 | 제안 envelope {state:{b:2,a:1},events:[]} | 정확한 bytes 문자열 `{"events":[],"state":{"a":1,"b":2}}`, hash=`9e35c5c623b68b4f`. event 객체 키도 재귀 canonical |
| S08 P0 | 동일 state에 서로 다른 seq/event/order, 같은 events에 nextTowerId·queue·timer·consumed key만 변경 | canonical 문자열/구조 비교에서 변경 지점 검출. hash 충돌이 원천적으로 없다고 주장하지 않음; 진단 경로 및 무변경 대조도 검사 |
| S09 P0 | JSON 키 "10","2","a" 및 유사 Unicode 키 | 숫자형 객체 키의 JS 열거순서(2→10)와 문자열 정렬(10→2)을 혼동하지 않음. 스키마가 금지하면 명시 거부, 허용하면 바이트 literal을 추가 확정 |
| L01 P0 | 코어 fixture: Math.random(), new Date(), Date.now(), performance.now(), Math.sin/cos/tan/atan2/pow/exp/log/hypot() | 각각 lint error. 테스트 파일 예외가 있다면 제품 코어 파일에는 금지가 유지됨 |
| L02 P0 | Math["random"](), globalThis.Date, const r=Math.random; r(), destructured {random}=Math | 금지 접근도 오류. no-restricted-properties/globals가 놓치면 금지 우회 범위를 규칙/리뷰 게이트로 명시; lint만으로 순수성 완전 증명 주장 금지 |
| L03 P0 | helper fixture Math.floor/abs/sign/sqrt, BigInt FNV, core의 Next/React/Phaser import | 허용 helper는 통과, 금지 framework import는 오류. Math.sqrt를 isqrt 내부 허용하면서 무조건 전역 금지하는 회귀 방지 |
| L04 P0 | 연산 결과로 생긴 0.5를 state에 삽입 | lint가 아니라 runtime schema/snapshot 검증에서 오류. ESLint만으로 ‘상태 안 소수’ 금지를 보장한다고 주장하지 않음 |

## 7. 장난감 리플레이 fixture와 오염 주입

### 7.1 실행 추적 golden (TEST_ONLY, C3/C4 결정 후 채택)

코어 step은 T=1부터, snapshot은 각 step 8단계 종료 후. fixture는 준비 상태만 유지하며 콘텐츠 버전 `test-content-v1`, attemptId=1, gold=100, 설치 cost60, refund5000bp, 빈 타워/원장, 모든 next 카운터1이다. 아래 applyTick 직전에 드라이버가 해당 명령만 접수한다. kind는 실제 계약 명령을 사용하고 이벤트 이름/거부 이유 문자열은 구현 전에 고정한다. HUD·전투·임의 RNG 없음.

| tick | 적용 명령(seq) | gameplay state 기대값 | 이벤트/카운터 기대값 |
|---|---|---|---|
| 0 | 없음, 초기 snapshot | gold100,towers=[] | nextTower=1,nextCommand=1,nextEvent=1,ledger=[] |
| 1 | build(1,tile0),build(2,tile1) | gold40,tower1(tile0,actuallyPaid60) | event1 build:c1 delta−60/goldAfter40; event2 reject seq2 insufficientGold. nextTower2,nextCommand3,nextEvent3. ledger 1건 |
| 2 | sell(3,tower1),build(4,tile1) | gold10,tower2(tile1,actuallyPaid60) | event3 sell:t1 delta+30/goldAfter70; event4 build:c4 delta−60/goldAfter10. nextTower3,nextCommand5,nextEvent5. ledger 누적3건 |
| 3 | setTargeting(5,tower1,mode=strong) | gold10,tower2 유지 | event5 reject seq5 towerNotFound, 추가 경제 원장 없음. nextTower3,nextCommand6,nextEvent6 |
| 4 | 없음 | gold10,tower2 유지 | 새 이벤트0; counter 유지. tick은4. 상태에 tick이 있으므로 T3/T4 hash까지 같아야 한다고 검사하면 안 됨 |

원장 key는 내부 `build:c1`,`sell:t1`,`build:c4`; 출력 key에는 모두 `a1:` 접두어. 타워 제거 후 ID 재사용 금지. 이벤트 순서는 eventSeq순이며 같은 시도의 모든 eventSeq를 공유하는 fixture 제안을 사용한다. 정확한 canonical schema 확정 후 각 행의 **정규 문자열 및 이벤트 문자열을 literal fixture로 보관**하고 별도 Python oracle로 hash를 한 번 산출해 체크인한다. 제품 함수에서 즉석 계산한 expected hash를 자기 자신과 비교하지 않는다.

### 7.2 재생·오염 케이스

| ID·우선순위 | 실행/실패 주입 | 기대 결과 |
|---|---|---|
| R01 P0 | 7.1 기록을 fresh core 2개에서 replay, 각 tick state/events/hash 비교 | 0..4 모든 state·events 동일, hashes도 동일. 최종 hash 하나만 비교하지 않음 |
| R02 P0 | 같은 live 세션의 attempt1 종료 후 같은 기록 재생 | C4 방식으로 초기 상태/ID 복원·정규화하여 R01과 동일. 현재 세션 counter 의존 금지 |
| R03 P0 | tick2 seq4 payload를 tile1→tile2로 변경 | tick0·1 동일, 첫 불일치 tick2, 경로 예 `state.towers[0].tile.col` 기대1/실제2. 명령 기록 hash만 비교해 tick0부터 차이라고 보고하지 않음 |
| R04 P0 | 동일 상태를 만들지만 다른 이벤트 순서/거부 reason을 주입 | 이벤트 차이까지 검출, 첫 차이의 tick·eventSeq·field path 출력. 스냅샷만 비교하는 변이 검출 |
| R05 P0 | IDs [1,2,10] entity 저장 순서 역전, 큐 역전, object 키 역삽입, consumed Set 삽입순서 역전 | normalize/명시 순회 후 모든 tick 동일. **명령 seq나 원본 Segment 의미 순서를 바꾼 것**은 오염 제거 대상이 아니라 다른 입력으로 별도 검출 |
| R06 P0 | queued commands·consumed keys·counter를 가진 이전 core 재사용 vs fresh | 초기 복원 후 같거나 재사용 요청 거부. stale tower/kill 이벤트는 새 시도에 영향 없음 |
| R07 P0 | codeVersion/contentHash 불일치 | 재생 전 호환성 오류, 시뮬레이션/hash 불일치와 구분. content 한 숫자 변경 시 contentHash 재검사 |
| R08 P0 | 명령 없는 초기 기록 + endTick4; 결과 이후/장시간 idle tail 포함 | tick 수가 명시돼 동일 종료. 입력 개수만큼 step하거나 마지막 명령 tick에서 중단하지 않음 |
| R09 P0 | 누락/중복/잘못된 seq·tick·payload, 초기 snapshot 변조 | 구조/초기 hash 오류를 식별, 자동 정상화 없음. 허용되는 seq gap과 외부 초기 clear flags의 범위는 계약에서 명시 |
| R10 P1 | 외부 render 프레임 [50×4], [200], [20,30,100,50]ms 및 VFX만 다르게 | 동일한 적용 tick 기록/step 수4를 비교하면 0..4 동일. dropped wall time이 다른 실행을 같은 경과 ms만으로 동등하다고 검사하지 않음 |
| R11 P1 | 코어 밖에서 5초 pause·화면 draw 횟수 변경, 같은 applyTick 입력 | 게임 tick·상태·events 동일. pause 중 잘못 접수된 행동은 Q09로 별도 검증 |
| R12 P1 | 원장 중복 방지 제거, seq 정렬 제거, round half 처리 변경, canonical 정렬 제거 변이 | 각각 Q10·Q04/R05·N02/N04·S01/R05가 실패해야 함. 변이별 최소1개 실패 증거 |
| R13 P2 | 지원 Chromium/WebKit/Firefox 또는 실제 기기에서 고정 기록 동일 재생 | 코드/content/초기 상태/정규 byte fixture 동일, tick별 결과 동일. Node toy 검증을 기기 검증으로 보고하지 않음 |

실제 전투 통합에서는 T08의 동시 생성→공격, 같은 틱 사망 보상→설치 불가(명령이 보상보다 앞), 기지파괴와 완료 동시의 패배/보상0, 마지막 웨이브 보상1회 후 승리, 명중과TTL 동시의 명중 우선, 둔화 만료/다음 출처 복귀를 추가한다. 정확한 TTL 단계·첫 발사 틱·동일 틱 HP0 대상·경로 길이/대각 보간·타깃 tie 방향은 SIM-02/MAP-01 결정 의존성이므로 지금 장난감 fixture의 제품 통과로 확대하지 않는다.

## 8. 실행 순서·완료 증거·직접 검증 범위

1. C1~C5에서 helper 도메인·속도 단위·틱 경계·재생 초기 상태·canonical byte 계약을 고정한다. 미해결 항목의 테스트는 의존성 차단으로 표시한다.
2. 구현 담당이 시간/정수 helper→ID/큐→정규화/FNV→ESLint→toy replay 순으로 P0 테스트를 구현한다. 파일 배정·구현 우선순위는 claude-main 권한이다.
3. 완료 보고에는 대상 커밋, case별 통과/실패/차단, 실제 명령·exit code, golden bytes/hash·첫 불일치 진단 로그, 오염/변이 검출 결과를 남긴다. 실제 명령은 저장소의 `npm run test`, `npm run lint`, `npm run typecheck`를 사용하고 존재하지 않는 replay CLI를 만들었다고 주장하지 않는다. 전체 build 필요 여부는 구현 변경 범위에 맞춘다.
4. TECH-02 완료는 기본 모듈과 toy 결정성 증거다. DATA-01 실데이터 상한, 실제 전투/경제·브라우저·밸런스 QA 통과와 분리한다.

이번 작업에서 직접 확인한 것: 지정 커밋·diff·관련 SPEC 규칙, `git diff --check b0902ab..a6166fb` exit0. Node 일회성 산술 평가로 C1 Number 오답과 C2의 37.5/38 차이를 재현했고, 별도 Python 정수 산술로 roundDiv·math.isqrt 경계·UTF-8 FNV golden을 계산했다. **제품 helper/리플레이 테스트를 실행한 것이 아니다.**

조사 확장: 기초 모듈 부재 및 lint 전략의 현재 출발점을 확인하려고 `src/game/core` 파일 목록과 `eslint.config.mjs`만 추가로 읽었다. 현재 lint 설정은 framework import 제한만 있고, 계약 93줄의 신규 금지는 아직 구현 전이라는 점을 확인했다. 기존 graphify 그래프가 없는 이전 확인 상태에서 새 그래프를 만들지 않고 직접 문서 검색을 사용했다.

수정 범위: 이 지정 QA 산출물만 작성. 제품 문서·코드 수정, 브랜치 전환, 커밋·push·병합 없음. 기존 `.omc/` 및 구판 PNG 유지. 요청서의 사용자 확인 범위 밖 결정은 모두 제안/의존성으로 표시했다.

## 재리뷰 1

- 검토일: 2026-11-24 · 요청 `msg_fddfd5d4b740` · 역할: 독립 리뷰, C1~C5 및 수정 경계만 검토
- 대상: `docs/tech-02-contract` @ `4b37c6036d6090ffe446c3e5941dc92478b7649a`, `git diff a6166fb..4b37c60 -- docs/SIM-CONTRACT.md`
- **판정: 지적 있음.** C1·C2의 핵심 수식/단위 문제는 해소됐고, C3·C4·C5에는 아래 잔여 사항이 있다. 계약 검토 판정이며 제품 기능 결함 재현·QA 실행 통과를 뜻하지 않는다. 위 원문은 v0.1 당시 기록으로 보존하며 아래 내용이 v0.2에 대한 최신 판단이다.

### RR1-F1 — 보통 — step 사이에 접수한 명령은 일시정지 시 큐에 남을 수 있음 (C3)

- 위치: `docs/SIM-CONTRACT.md:84` (대조: 24·32·33줄, SPEC 112·113줄)
- 근거/재현 타임라인: completedTick=0에서 build를 접수하면 seq1/applyTick1인 명령이 큐에 들어간다(32줄). **첫 step 전에 pause**하면 pause 중 step은 실행되지 않는다(24줄). 큐를 비우는 곳은 다음 step 1단계(33줄)이므로 명령은 큐에 남아 있다. 따라서 84줄의 ‘일시정지 전에 접수된 명령은 큐가 각 스텝에서 비워지므로 존재하지 않는다’는 결론은 성립하지 않는다. 동기 step 중 접수 금지와도 별개인 정상적인 프레임 사이 순서다.
- 영향: 한 구현은 명령을 보존하고 다른 구현은 폐기/즉시 실행할 수 있다. 폐기하면 이미 부여한 seq의 연속성 및 기록 재생과 불일치할 수도 있다. 기존 Q09의 ‘resume 시 재검증’ 기대와도 충돌한다.
- 수정 제안: **pause 전에 접수된 큐는 보존하고 resume 후 원래 applyTick의 1단계에서 순차 재검증**, pause 중 신규 접수는 seq 없이 즉시 거부한다고 명시하는 방식을 권고한다. 폐기 정책을 선택한다면 폐기 기록·seq·이벤트 재현 규칙까지 별도 정의해야 하므로 ‘원래 없다’고 생략해서는 안 된다.
- 해소 테스트: 초기 gold100, build60 접수→pause→pause 중 build 추가 요청→resume→첫 step. 보존 정책 채택 시 pause 중 gold100/seq 다음값2/queue 길이1, 신규 요청 기록·이벤트0, resume 뒤 gold40/tower1/적용 seq1 한 번. Q09의 최종 상태 계약은 아직 차단이다.

### RR1-F2 — 보통 — endTick의 유효 범위가 구조 검사에 빠져 재생 종료를 보장하지 않음 (C4)

- 위치: `docs/SIM-CONTRACT.md:131`·`:132` (대조: 39·125~127·137줄)
- 근거: 131줄은 applyTick의 정수·범위와 seq 연속성은 정했지만, `endTick` 자체의 타입·정수성·유한성·최솟값을 정하지 않는다. 유효한 초기 상태/버전의 **commands=[]** 기록에 `endTick=Infinity`, `-1`, `0.5` 또는 문자열 "4"를 넣으면 명시된 명령별 검사로는 거부 근거가 없다. 하지만 132줄은 endTick까지 step, 137줄은 0..endTick 전부 비교를 요구한다. 무한 반복·빈 검증·형변환을 막을 계약이 필요하다. 10줄의 상태 안전 정수 조건은 리플레이 입력 구조 검사를 대신하지 않는다.
- 수정 제안: `endTick`은 **Number.isSafeInteger이고 0 이상**인 값으로 실행 전에 검사한다. attemptId·seq·applyTick 같은 기록 숫자도 안전 정수/양수 규칙을 명시한다. 실제 실행량 상한은 별도 정책/DATA-01 의존성으로 남겨도 된다.
- 함께 고정할 결과 경계: 결과가 tick3에 확정된 기록에서 endTick5를 허용하는지 정해야 한다. 39줄대로 completedTick이3에서 멈추면 `while(completedTick<endTick)` 방식은 끝나지 않는다. 권고는 endTick을 실제 마지막 completedTick으로 한정하고 조기 결과와 endTick이 어긋난 기록을 오류로 처리하는 것이다. 반복 no-op 표본을 허용한다면 실제 tick과 표본 인덱스 및 이벤트 반환 규칙을 구분해야 한다. 결과 상태를 진행시키는 수정은 SPEC 94줄과 충돌하므로 피한다.
- 해소 테스트: commands=[]/endTick0은 초기 snapshot1개만 검증, 위 비유효 endTick들은 step0회로 구조 오류. 결과 tick3/endTick5는 선택된 정책에 따라 유한 종료·명시 판정. R08·R09는 이 종료/입력 경계 부분이 아직 차단이다.

### RR1-F3 — 낮음 — BigInt 사용 범위 문구가 helper 수정과 충돌 (C1/C5)

- 위치: `docs/SIM-CONTRACT.md:119` (대조: 55·58·150줄)
- 근거: 55줄은 모든 helper의 정확한 중간 계산에 BigInt를 사용하고 58·150줄도 이를 요구한다. 반면 119줄은 ‘BigInt는 해시 내부에서만 쓰고 상태에 넣지 않는다’고 제한한다. 두 지시를 문자 그대로 동시에 만족할 수 없다.
- 수정 제안: ‘BigInt는 **정수 helper와 해시의 계산 내부**에서만 사용하며 JSON 상태에는 넣지 않는다’로 범위를 맞춘다. BigInt 중간 계산은 유지하고 상태는 안전 정수 Number라는 경계도 유지한다.
- 해소 조건: C1의 정확한 helper와 C5의 상태 BigInt 거부를 모순 없이 구현할 수 있음. 실제 수식 검산은 아래와 같이 이미 일치하며 이 지적은 문구 충돌이다.

### C1~C5 및 기존 차단 케이스 상태 갱신

아래 ‘기대값 확정’은 **테스트 설계의 의존성 해소**를 뜻하며, 테스트 실행 상태는 계속 설계됨이다.

| 항목 | v0.2 대조 결과 | 기존 케이스의 최신 처리 |
|---|---|---|
| C1 | 55~60줄에서 입력 safe integer·정확 BigInt 중간 계산·결과 범위 오류·addSafe·0 정규화 정의. 핵심 수식 해소, RR1-F3 문구 수정 필요 | N05는 +0으로 확정. N08 isqrt(M)=94906265, N09는 두 입력 모두 **정확값 반환**(500399958596721, M)으로 확정. 오류와 정답 중 임의 허용 금지 |
| C2 | 66~70줄에서 먼저 /20→boost→slow, PerTick 변수 정의 | N14는 **38mt/틱, 2mt/틱**으로 확정. 37.5/1.5를 저장하면 실패 |
| C3 | 30~39줄에서 초기0·첫 step1·applyTick·post-step snapshot·준비 진입 틱 미소비·둔화 만료 정의 | T05·T06·T07·T09 기대 tick 확정. T04 하한 및 T08 조정은 아래. Q09는 RR1-F1 때문에 미해소 |
| C4 | 92·125~138줄에서 기록 attemptId·initialStateHash·endTick·fresh core·seq 연속성 정의 | R02·R06의 세션/초기 ID 의존성 해소, R07 호환성 오류 확정, Q14/R09의 seq gaps는 **거부**로 확정. R08/R09의 endTick/결과 종료는 RR1-F2 때문에 미해소 |
| C5 | 110~119줄에서 재귀 ASCII 키·스키마별 배열·UTF-8·envelope·FNV 상수/너비·스냅샷 필드 정의 | S01~S07 golden을 채택할 수 있음. S09는 숫자 문자열/비ASCII 키 **거부**로 확정. RR1-F3 문구 및 아래 이벤트 명세/실제 schema 결정은 남음 |

구현자가 원문 테스트를 그대로 복사해 잘못된 실패를 만들지 않도록 다음을 갱신한다.

- **T04:** prep/slow/period/TTL=0은 모두 오류, 50ms는 시간 하한 통과. startMs=0은 허용. count>1/intervalMs=0은 오류. count1/interval0은 허용 가능한 단일 생성(음수 등 다른 필드 도메인은 검증기로 제한). 상한 값은 DATA-01 의존성이다.
- **T08:** 원래 S1의 interval0/count2는 이제 검증 오류가 정답이다. 동시에 정상 중첩 생성도 검사하려면 S1을 start150/interval50/count2로 바꾼다. waveStart10에서 기대 순서는 **(12,0,0,id1),(13,0,1,id2),(13,1,0,id3),(14,0,2,id4),(14,1,1,id5)**다.
- **준비 진입 경계:** 전투 T10 단계8에서 준비 N=2틱 진입 시 T10 remaining2 유지, T11 remaining1, T12 remaining0/전환, waveStart13. 시도 초기 준비 N=2이면 T1→1,T2→0,waveStart3. 기존 T09 보조 의존성은 해소된다.
- **T12:** 26줄의 ‘나머지 누적은 버린다’에 따라 [275]→5step/누적0, 다음 [25]→0step/누적25가 기준이다. 총6step이면 실패. 실제 어댑터 구현은 P1 실행 대기다.
- **N06:** b=0/음수 등 helper 입력 도메인 위반은 오류. 결과 overflow는 RangeError로 확정됐고 입력 타입/도메인 오류의 구체 오류 클래스는 구현 API에서 고정한다. 0·-0 출력은 +0으로 정규화한다.
- **N10:** 기존의 ‘모든 중간값이 Number 안전 범위 안’이라는 제한은 **BigInt 중간 계산에 적용하지 않는다**. 입력과 최종 Number 상태가 안전해야 한다. 예: applyBp(M,10000)=M은 곱셈 중간값이 M을 넘더라도 성공한다. addSafe(M,0)=M, addSafe(M,1)는 RangeError, addSafe(-M,-1)도 RangeError. 합성 식의 범위/원자성과 실제 콘텐츠 상한 검증은 계속 필요하다.
- **Q05·Q11·Q13:** 설치 실패는 towerId 미소비, 모든 성공/거부 이벤트는 eventSeq 소비, payload는 복사·동결로 확정. 내부 경제 원장과 명령 성공이 하나의 이벤트인지 둘인지는 실제 이벤트 schema(145줄)를 고정한 후 7.1 toy의 eventSeq literal을 맞춘다. 원리뷰 toy의 nextEvent 1..6을 무조건 제품 계약값으로 복사하지 않는다.
- **S03·S08:** 경제 원장 전체 이력은 114줄에 따라 state hash에서 제외하므로 상태가 아닌 해당 틱 events 및 별도 원장 불변식으로 비교한다. 다음 ID·seq·eventSeq·타이머·소비 키는 snapshot 대상. 큐는 성공적으로 끝난 step에서 비어 있지만 pause 전 접수 큐 존재 문제는 RR1-F1로 남는다.
- **S09·L02·L03:** ASCII 식별자 아닌 키는 오류. alias/구조분해 금지는 lint 또는 명시된 리뷰 게이트로 확인하며 ‘모든 우회를 lint가 잡는다’고 주장하지 않는다. Math.sqrt는 isqrt 내부만 허용한다. L03의 허용 fixture 경로도 이에 맞춘다.
- **R08:** 결과 전 무명령 idle tail은 반드시 endTick까지 검증한다. 결과 확정 뒤 tail은 RR1-F2의 종료 정책 확정 후 literal을 추가한다.

계속 남는 의존성은 DATA-01의 실데이터 상한, SIM-02/MAP-01의 이미 명시된 전투·경로 세부, 실제 이벤트 이름/거부 사유·상태 schema(145줄), RR1-F1/F2의 pause·종료 경계다. 이미 인정한 전투/기기 검증 한계를 새 결함으로 세지 않았다.

### 직접 검증·보존·후속

- Node 일회성 BigInt oracle로 roundDiv 경계 2개, applyBp(M,10000), N14의 38/2를 재계산해 모두 위 기대값과 일치했다. UTF-8 FNV golden 6개도 재계산해 원리뷰 값과 일치했다. **제품 helper·리플레이·브라우저 테스트 실행 증거는 아니다.**
- `git diff --check a6166fb..4b37c60` exit0. 원리뷰 파일의 추가 전 SHA-256 `c259fc58e20cabb473b886595d54cf60db631fbdf6a000386fa5f44c7f80339a`는 원리뷰 작성 직후 값과 같았다.
- 범위: 계약 diff와 영향받은 SPEC/PLAN의 pause·결과·틱 규칙만 대조했다. 제품 문서·코드·Git 변경 없이 이 결과 파일 끝에 재리뷰 섹션만 추가했다. 브랜치 전환/커밋/push/병합 없음.
- 후속: RR1-F1~F3와 해당 케이스 기대값만 좁게 재리뷰할 수 있다. 재리뷰 **1/2회** 사용. 원리뷰의 69개 케이스는 위 갱신을 적용해 구현하며, 문서상 기대값이 정해진 케이스를 실행 통과로 표기하지 않는다.
