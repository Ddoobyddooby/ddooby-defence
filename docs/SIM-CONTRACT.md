# Ddooby-defence — 결정성 계약 (TECH-02, v0.2 초안)

> 상태: **claude-main 설계 초안 v0.2, 2026-11-24.** 사용자 확인: 틱 20/초(50ms)·정수 고정소수점·비율 계산 반올림(2026-11-24). v0.2는 codex-main 테스트 전략(`.codex-out/TECH-02-test-strategy.md`)의 계약 허점 C1~C5, 재리뷰 1의 RR1-F1~F3 반영. 코드 미구현.
> 범위: SPEC 12절 **TBD-SIM**, PLAN 3.2·9절의 기술 계약 미정 항목. 게임 수치(공격력·속도·가격 등)는 정하지 않는다. 값이 아니라 **단위·연산·순서·식별자·바이트 규칙**을 정한다.
> 우선순위: SPEC > 이 문서 > PLAN. 이 문서가 SPEC의 확정 규칙과 충돌하면 SPEC을 따르고 이 문서를 고친다.

## 1. 원칙

- **같은 코드 버전 + 같은 콘텐츠 데이터 + 같은 초기 상태 + 같은 명령 기록 → 매 틱 같은 게임 상태·같은 이벤트·같은 결과.** 브라우저·기기·프레임 속도가 달라도 같아야 한다.
- 게임 상태는 **안전 정수만** 담는다(문자열·불리언·`null` 허용, 소수·`-0`·`NaN` 금지). 소수가 필요한 비율은 정수 단위(3절)로 표현한다.
- 순수 코어(`src/game/core`)는 벽시계·난수·환경 의존 수학을 쓰지 않는다(6절).
- 렌더 프레임(Phaser)과 논리 틱은 분리한다. 렌더는 상태를 읽기만 하고 보간·VFX는 게임 결과에 영향을 주지 않는다.
- 범위를 벗어난 값은 **조용히 보정하지 않고 오류**로 처리하며, 오류가 난 명령·단계는 상태를 부분 변경하지 않는다.

## 2. 시간

| 항목 | 규칙 |
|---|---|
| 논리 틱 | **고정 50ms = 20틱/초** (`TICK_MS = 50`) |
| 콘텐츠 시간 단위 | 데이터의 모든 시간 값은 **정수 ms, 50의 배수**. 아니면 데이터 검증 오류(반올림 보정 없음) |
| 시간 하한 | 준비 시간·둔화 지속·공격 주기·TTL은 **≥ 50ms(1틱)**. Segment `startMs ≥ 0`, `count ≥ 1`, `count > 1`이면 `intervalMs ≥ 50`. 위반은 검증 오류. 실제 상한은 DATA-01 |
| 변환 | `ticks = ms / 50` (나누어떨어짐이 보장되므로 반올림 없음) |
| 시각 비교 | 모두 정수 틱 비교. 만료 판정은 `tick >= expireTick` |
| 일시정지 | 틱을 진행하지 않는다. 일시정지 시간은 게임 상태·명령 기록에 나타나지 않는다 |

**벽시계 연결(Phaser 쪽, 코어 밖):** 프레임 경과 ms를 누적하고 50ms마다 `core.step()` 1회. 한 프레임 최대 5틱까지만 따라잡고 나머지 누적은 버린다(탭 비활성 복귀 시 폭주 방지). 이 정책은 진행 속도에만 영향을 주고, 같은 명령 기록이면 게임 결과는 같다.

### 2.1 틱 타임라인 (C3)

- 시도 시작 직후 상태는 `completedTick = 0`이며 이것이 **스냅샷 0**이다. 시도는 준비 단계로 시작한다.
- `step()`은 `T = completedTick + 1`을 실행한다: SPEC 7절 1~8단계 → `completedTick = T` → **스냅샷 T** 생성. 상태의 `tick` 필드는 `completedTick`이다.
- 명령은 `step()` 호출 **사이**에만 접수하고, 접수 시 `applyTick = completedTick + 1`이 정해진다. `step()` 실행 중 접수는 오류(코어는 동기 실행이므로 정상 경로에서는 발생하지 않음).
- 명령 큐는 각 `step()`의 1단계에서 모두 소비된다. 따라서 스텝 직후 큐는 비어 있다(스텝 사이에 접수된 명령은 일시정지 중에도 다음 스텝까지 큐에 남는다, 4절).
- **준비 타이머:** 준비 단계에 들어갈 때 `prepTicksRemaining = prepMs / 50`. 준비 단계로 **진입한 그 틱의 8단계는 소비하지 않고**, 이후 준비 단계인 각 틱의 8단계에서 1 감소한다. 0이 된 틱을 T라 하면 `waveStartTick = T + 1`. 예: 시도 시작 시 준비 N틱이면 틱 1..N 동안 감소, `waveStartTick = N + 1`.
- **조기 시작:** `startWave`가 틱 T의 1단계에서 적용되면 그 틱에 전투로 바뀌고 `waveStartTick = T`.
- **Segment 생성 틱** = `waveStartTick + (startMs + i × intervalMs) / 50`, 해당 틱 3단계에서 생성.
- **둔화:** 틱 T의 4단계 명중 시 `expireTick = T + durationTicks`. 틱 T..`expireTick − 1`의 6단계 이동에 적용되고 `expireTick` 틱의 2단계에서 제거된다.
- **공격 주기:** 타워는 `nextFireTick`을 가지며 4단계에서 `tick >= nextFireTick`이고 타깃이 있으면 발사, `nextFireTick = T + 주기 틱`. 설치 직후 첫 발사 가능 틱은 SIM-02.
- **결과 단계:** 7단계에서 승패가 정해지면 그 틱 R의 8단계에서 결과 단계로 바뀐다. 결과 단계에서 `step()`은 **오류**(상태·`completedTick` 불변)이며 어댑터는 더 호출하지 않는다. 따라서 결과가 난 시도의 마지막 `completedTick`은 R이다.

## 3. 숫자 단위와 연산

### 3.1 단위

| 양 | 단위 | 예 |
|---|---|---|
| 위치·거리·사거리·반경 | **밀리타일 `mt`** (1타일 = 1000mt). 타일 (col,row) 중심 = `(col×1000+500, row×1000+500)` | 사거리 2.5타일 = `2500` |
| 이동·투사체 속도 | 데이터: **mt/초**, 20의 배수 필수(아니면 검증 오류). 런타임 상태: **mt/틱**만 사용 | `1000` mt/s → 50 mt/틱 |
| 비율(특성 배율·둔화·저항·환급률) | **bp(1/10000)**, 정수 ≥ 0 | 25% = `2500` |
| 골드·HP·피해 | 정수 | — |
| 경로 진행도 `pathProgress` | 출발점부터 경로를 따라 이동한 mt | — |

### 3.2 정수 연산 helper (C1)

- 모든 helper는 **입력이 `Number.isSafeInteger`인지 검사**하고, 중간 계산은 **`BigInt`로 정확히** 수행한 뒤, 결과가 안전 정수가 아니면 `RangeError`를 던진다. 결과 `-0`은 `0`으로 정규화한다. 조용한 근사 반환 금지.
- **`applyBp(v, bp)`** (v ≥ 0, bp ≥ 0) = `floor((v × bp + 5000) / 10000)` — **반올림, 0.5는 올림**(사용자 결정 2026-11-24).
- **`roundDiv(a, b)`** (b > 0) = `sign(a) × floor((2|a| + b) / (2b))` — 0에서 먼 쪽으로 반올림. 부호 대칭.
- **`isqrt(n)`** (n ≥ 0) = `floor(√n)`, `r² ≤ n < (r+1)²`를 BigInt로 보장(`Math.sqrt` 초기 추정 + 보정 허용).
- **`addSafe(a, b)`**: 틱·카운터 증가·시각 합산·골드 증감에 사용, 안전 범위를 벗어나면 `RangeError`.
- 데이터 검증기(DATA-01)가 필드 상한을 두어 정상 콘텐츠에서 `RangeError`가 나지 않게 한다. helper 오류는 버그 신호다.

### 3.3 규칙별 적용 (C2: 속도는 먼저 mt/틱으로 변환)

| 규칙 | 계산 (모든 속도 변수는 mt/틱) |
|---|---|
| 속도 변환 | `baseSpeedPerTick = speedMtPerSec / 20` (데이터 검증으로 정수 보장) |
| 속도 강화 | `boostedSpeedPerTick = max(1, applyBp(baseSpeedPerTick, 10000 + speedBoostBp))` (둔화 전 기본 속도, 생성 시 고정) |
| 체력 강화 | `maxHp = max(1, applyBp(baseHp, 10000 + hpBoostBp))`, 생성 시 현재 HP = maxHp |
| 실효 둔화 (SPEC 4절) | `effectiveSlowBp = applyBp(baseSlowBp, 10000 − controlResistanceBp)` (`controlResistanceBp ≤ 10000`) |
| 둔화 적용 속도 | `speedPerTick = max(1, applyBp(boostedSpeedPerTick, 10000 − 가장 큰 effectiveSlowBp))`. 둔화 bp < 10000은 데이터 검증 |
| **환급 (SPEC 8절 예외)** | `refund = floor(actuallyPaid × refundRateBp / 10000)` — SPEC 확정 규칙인 **내림 한 번** 유지. 반올림 아님 |
| 사거리 판정 | `dx² + dy² ≤ range²` (정수, 제곱근 없음, 경계 포함) |
| 투사체 이동 | 남은 거리² ≤ step²이면 이번 틱 명중. 아니면 `d = isqrt(dx²+dy²)`, 위치 += `(roundDiv(dx×step, d), roundDiv(dy×step, d))`. 양자화로 실제 이동 길이가 step과 다를 수 있음(허용, 결정적) — 정밀도 정책은 SIM-02에서 재검토 |
| 경로 위 위치 | waypoint 구간에서 `pathProgress`로 선형 보간(`roundDiv`) |
| 타깃 정렬 | **선두·후미**는 `pathProgress`, **가까운**은 타워 중심~보간 위치의 거리²(SPEC 3절 유클리드), **강한**은 현재 HP. 동률은 SPEC대로 경로 진행도 → 생성 순번 → 적 ID |

## 4. 명령

- 모든 플레이어 행동(HUD·맵 클릭)은 같은 경로로 코어에 `Command`를 넣는다: `build`, `upgrade`, `sell`, `setTargeting`, `startWave`(조기 시작).
- 접수 시 코어는 시도 안에서 단조 증가하는 **`seq`(1부터)**와 `applyTick`(2.1절)을 붙이고, payload를 **복사해 동결**한다(호출자가 나중에 객체를 바꿔도 영향 없음).
- `applyTick` 틱의 1단계에서 **`seq` 숫자 오름차순**으로 적용한다. 큐 내부 저장 순서에 의존하지 않는다.
- 각 명령은 **앞 명령까지 반영된 상태**로 재검증한다. 예: 골드 100에서 설치 60 명령 두 개가 같은 틱이면 첫째 성공, 둘째는 `insufficientGold` 거부.
- 거부된 명령은 게임 상태(골드·타워·점유·레벨 등)를 바꾸지 않고 `commandRejected{seq, reason}` 이벤트만 남긴다. `seq`와 `eventSeq`는 소비된다.
- **일시정지·결과 단계**에서 들어온 게임플레이 명령은 **접수 시 즉시 거부**: `seq` 미부여, 기록·이벤트에 남지 않음.
- **일시정지 전에 접수된 명령**(스텝 사이에 접수 → 다음 스텝 전에 일시정지)은 **큐에 보존**된다. 일시정지 중에는 스텝이 없으므로 `applyTick`은 그대로 유효하고, 재개 후 첫 스텝(= 그 `applyTick`)의 1단계에서 평소처럼 순차 재검증·적용한다. 폐기하지 않는다.
- 판매 확인창 취소 같은 UI 상태는 코어 밖이다. 코어는 `sell` 적용 시점의 단계·타워 존재만 재검증한다.
- 스테이지 선택·재도전은 시도 밖 동작으로 새 시도를 만든다(5절).

## 5. 식별자·이벤트

| 대상 | 규칙 |
|---|---|
| `attemptId` | 세션 안에서 새 시도(진입·재도전)마다 1씩 증가. 저장하지 않는다. 리플레이는 기록의 `attemptId`로 새 코어를 만든다(7.3절) |
| `towerId`·`projectileId`·`enemyId`·`commandSeq`·`eventSeq` | 시도마다 1부터 시작하는 정수 카운터, 재도전 시 초기화. ID는 **생성에 성공했을 때만** 소비(거부된 설치는 `towerId`를 쓰지 않음). 제거된 ID는 재사용하지 않음. 증가는 `addSafe` |
| 적 ID 부여 순서 | 3단계 생성 시 `(생성 틱, Segment 원본 순서, Segment 내 순번)` 오름차순. 따라서 `spawnSerial == enemyId`이고 SPEC의 "생성 순번 → 적 ID" 동률 규칙과 일치 |
| 이벤트 | **모든 이벤트**(명령 성공·거부, 생성, 피해, 사망, 정산, 상태 전환)는 발생 순서대로 `eventSeq`를 받는다 |
| 경제 이벤트 키 | `kill:e{enemyId}`, `waveClear:w{waveIndex}`, `build:c{seq}`, `upgrade:c{seq}`, `sell:t{towerId}`. 시도 상태의 `consumedEconomyEvents`(키 집합)에 이미 있으면 정산하지 않는다(정확히 한 번). 로그·리플레이 출력에는 `a{attemptId}:` 접두어 |
| 경제 원장 | 시도별 추가 전용 목록 `{tick, eventSeq, key, delta, goldAfter}`. 각 항목은 해당 틱 이벤트 목록에도 나타난다 |

## 6. 순회 순서·금지 사항

- 4단계 타워 발사: `towerId` 오름차순. 투사체 처리: `projectileId` 오름차순. 6단계 적 이동·기지 도달: `enemyId` 오름차순.
- 상태 컬렉션은 순회 시 항상 ID 숫자 오름차순을 보장한다(삽입 순서·문자열 정렬에 의존 금지).
- **코어 금지:** `Math.random`, `Date`, `performance`, `Math.sin/cos/tan/atan2/pow/exp/log/hypot`. ESLint `no-restricted-properties`/`no-restricted-globals`/`no-restricted-syntax`로 강제(구현 태스크에서 추가). `Math.sqrt`는 `isqrt` 내부에서만 허용. 우회 접근(별칭·구조분해)은 lint가 못 잡을 수 있으므로 코드 리뷰 게이트로 보완한다.
- 상태 안의 소수 금지는 lint가 아니라 **정규 스냅샷 생성 시 런타임 검사**(7.1절)로 강제한다.

## 7. 직렬화·해시·리플레이

### 7.1 정규 스냅샷 (C5)

- **허용 값:** 안전 정수(`-0`은 0으로 정규화), 문자열, 불리언, `null`, 배열, 일반 객체. 그 밖(소수·`NaN`·`Infinity`·`undefined`·`BigInt`·함수·`Map`·`Set`·`Date`·배열 구멍·순환 참조)은 **필드 경로를 담은 오류**. `Set`/`Map`은 스냅샷 전에 명시적으로 정렬 배열로 변환한다.
- **객체 키:** ASCII 식별자만(`[A-Za-z_][A-Za-z0-9_]*`), 재귀적으로 코드 단위 오름차순 정렬. 숫자 문자열 키 금지(ID 맵은 배열로 표현).
- **배열 순서:** 엔티티(타워·적·투사체·둔화)=ID 오름차순, 명령=`seq`, 이벤트·원장=`eventSeq`, waypoint·Segment=원본 데이터 순서, `consumedEconomyEvents`=문자열 코드 단위 오름차순.
- **문자열화:** `JSON.stringify`와 같은 이스케이프, 공백 없음, **UTF-8** 바이트(`TextEncoder`).
- **스냅샷 대상:** `AttemptState` 전체 — `attemptId`, `tick`, 단계, 웨이브·타이머(`prepTicksRemaining` 등), 골드, 기지 HP, 엔티티, 다음 ID·`seq`·`eventSeq` 카운터, `consumedEconomyEvents`. 경제 원장 이력은 상태 해시에서 빼고 각 틱 이벤트로 비교한다.

### 7.2 틱 해시

- 해시 입력 = 정규 JSON `{"events":[그 틱 이벤트들],"state":{스냅샷}}`의 UTF-8 바이트.
- **FNV-1a 64:** 시작값 `0xcbf29ce484222325`, 바이트마다 `h = ((h XOR byte) × 0x100000001b3) mod 2^64` (`BigInt`), 출력은 **소문자 16자리 16진수(0 채움)**. 보안 목적 아님. BigInt는 **정수 helper(3.2절)와 해시의 계산 내부**에서만 쓰고 상태 JSON에는 넣지 않는다(상태는 안전 정수 Number).
- `contentHash` = 해당 스테이지 콘텐츠 데이터 정규 JSON의 같은 해시.

### 7.3 리플레이 기록 (C4)

```text
{ formatVersion: 1, codeVersion, contentHash, stageId, attemptId,
  initialStateHash, endTick,
  commands: [{ applyTick, seq, kind, payload }] }
```

- 초기 상태는 `(콘텐츠, stageId, attemptId)`에서 **버전이 고정된 초기화 규칙**으로 만들고, 스냅샷 0의 해시가 `initialStateHash`와 같아야 실행한다. 리플레이는 항상 **새 코어 인스턴스**로 실행하며 현재 세션의 카운터·상태를 재사용하지 않는다.
- **실행 전 구조 검사(자동 보정 없음, 형변환 없음):** `formatVersion`·`codeVersion`·`contentHash` 불일치는 호환성 오류. `attemptId`는 안전 정수 ≥ 1. `endTick`은 **안전 정수 ≥ 0**(문자열·소수·음수·`Infinity` 거부, `step()` 0회로 오류). `seq`는 안전 정수, 1부터 빈틈 없이 증가, 중복 금지. `applyTick`은 안전 정수 ≥ 1, `seq` 순으로 감소하지 않음, `≤ endTick`. 알 수 없는 `kind`·잘못된 payload는 구조 오류.
- `completedTick == endTick`이 될 때까지 `step()`한다(마지막 명령 틱에서 멈추지 않음). `endTick = 0`이면 스냅샷 0만 검증한다.
- **결과 종료 경계:** 결과가 틱 R에 확정되면 R이 마지막 틱이다. `endTick > R`인 기록은 R에 도달한 시점에 **종료 불일치 오류**(유한 종료, 결과 상태를 진행시키지 않음). 결과가 난 시도의 기록은 `endTick = R`로 만든다.
- 이 기록에는 즉시 거부된 명령(일시정지·결과 단계)이 들어가지 않는다. 적용 시 거부된 명령은 `seq`를 받았으므로 들어간다.

### 7.4 리플레이 검증

- 같은 기록을 새 코어 두 개(또는 원 실행 vs 재생)로 실행해 **틱 0..endTick 전부**의 상태·이벤트·해시를 비교한다(최종 해시 하나만 비교 금지).
- 다르면 **첫 불일치 틱**에서 두 스냅샷·이벤트 목록을 필드 경로 단위로 비교해 출력한다(예: `state.towers[0].tile.col 기대 1 / 실제 2`, 이벤트는 `eventSeq`·필드 경로). 순수 VFX는 비교 대상 아님(CLAUDE.md 4절).

## 8. 이 계약에서 정하지 않는 것

- 게임 수치 전부(TBD-TOWER/ENEMY/ECON/WAVE/PROJECTILE), 각 필드 상한 값 → DATA-01 및 사용자 승인.
- 같은 틱에 이미 HP 0이 된 적에게 다른 투사체가 명중하는 경우, 설치 직후 첫 발사 틱, 투사체 TTL 판정 단계, 투사체 이동 양자화 정밀도 → SIM-02.
- 경로 폭·대각 구간 허용 여부·격자 경계 클릭 귀속 → MAP-01.
- 이벤트·거부 사유는 기초 모듈(`src/game/core/sim/events.ts`)에서 아래로 고정했다(TECH-02 구현). SIM-01/02에서 추가·변경하면 해시가 바뀌므로 이 목록을 함께 갱신한다.
  - 이벤트: `towerBuilt` `towerSold` `targetingChanged` `waveStarted`(trigger: command|timer) `prepEntered` `resultReached` `economySettled` `commandRejected`
  - 적용 시 거부(seq·eventSeq 소비): `insufficientGold` `occupied` `outOfGrid` `towerNotFound` `wrongPhase` `unsupportedKind` `alreadySettled`
  - 접수 즉시 거부(seq 없음): `paused` `resultPhase`. 구조가 잘못된 명령은 접수 시 예외(seq 미소비)
  - 명령 payload(toy 수준): build `{tile:{col,row}}`, upgrade·sell `{towerId}`, setTargeting `{towerId, mode: first|last|close|strong}`, startWave `{}`
  - ID 카운터 최대 발급값은 `MAX_SAFE_INTEGER − 1`(다음 값도 안전 정수로 유지)

## 9. 완료 증거 (TASKS TECH-02)

이 문서 승인 후, 순수 코어에 다음 기초 모듈과 테스트를 구현한다(구현 담당 배정은 claude-main).
- 시간 변환·검증(`ms → ticks`, 50 배수·하한 검사), `applyBp`·`roundDiv`·`isqrt`·`addSafe`(BigInt 중간 계산), 시도별 ID 카운터, 명령 큐(seq·applyTick 부여·payload 동결·정렬·순차 재검증·즉시 거부), 정규 스냅샷·FNV-1a 64 해시, 리플레이 기록 구조 검사, ESLint 금지 규칙.
- 결정성 테스트: 장난감 시뮬레이션(준비 단계, build/sell/setTargeting, 경제 원장)으로 같은 기록 새 코어 2회 실행 시 틱별 상태·이벤트·해시 동일, 명령 하나를 바꾸면 그 틱이 첫 불일치로 보고됨, 컬렉션 저장 순서 오염에도 결과 동일.
- 테스트 케이스와 우선순위(P0 필수)는 codex-main 테스트 전략 `.codex-out/TECH-02-test-strategy.md`를 따른다. 기대값은 제품 helper가 아닌 독립 oracle(BigInt·리터럴·Python)로 만든다.
- TECH-02 완료는 기초 모듈과 장난감 결정성 증거까지다. 실데이터 상한, 실제 전투·경제·브라우저 검증과는 분리한다.
