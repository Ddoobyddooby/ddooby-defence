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

- 게임 수치 전부(TBD-TOWER/ENEMY/ECON/WAVE/PROJECTILE) → BAL-01 및 사용자 승인. 필드 형식·기술 상한은 11절(DATA-01).
- 같은 틱에 이미 HP 0이 된 적에게 다른 투사체가 명중하는 경우, 설치 직후 첫 발사 틱, 투사체 TTL 판정 단계, 투사체 이동 양자화 정밀도 → SIM-02.
- ~~경로 폭·대각 구간 허용 여부·격자 경계 클릭 귀속 → MAP-01~~ 10절에서 확정.
- 이벤트·거부 사유는 기초 모듈(`src/game/core/sim/events.ts`)에서 아래로 고정했다(TECH-02 구현). SIM-01/02에서 추가·변경하면 해시가 바뀌므로 이 목록을 함께 갱신한다.
  - 이벤트: `towerBuilt` `towerSold` `targetingChanged` `waveStarted`{trigger: command|timer, waveIndex, waveStartTick[, seq]} `prepEntered`{waveIndex, prepTicks} `resultReached`{outcome} `economySettled`{key, delta, goldAfter, +enemyId|waveIndex} `commandRejected`
  - SIM-01 추가: `enemySpawned`{enemyId, enemyType, trait, maxHp, speedPerTick, segmentIndex} `enemyKilled`{enemyId, reward} `enemyReachedBase`{enemyId, baseDamage, baseHpAfter} `waveCleared`{waveIndex, reward}
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

## 10. 맵 기하 (MAP-01, 사용자 결정 2026-11-24)

### 10.1 규칙

- 격자 18열×10행, 칸 `(col,row)`, `0 ≤ col < 18`, `0 ≤ row < 10`. 칸 중심 = `(col×1000+500, row×1000+500)` mt.
- **경로 = waypoint 목록.** 모든 waypoint는 격자 안의 칸이고, 연속한 두 waypoint는 같은 행 또는 같은 열에 있다(가로·세로 직선만, 대각 금지). 길이 0인 구간·같은 방향으로 이어지는 불필요한 중간 waypoint는 검증 오류.
- **경로 칸** = 구간이 지나는 모든 칸(양 끝 포함). 경로 칸은 **중복 금지**(교차·되돌아감 없음). 경로의 서로 다른 구간에 속한 두 칸이 상하좌우로 붙어 있으면 검증 오류(통로가 맞닿지 않음; 구간이 이어지는 꺾임 칸은 예외).
- **출발점** = 첫 waypoint, 격자 가장자리 칸이어야 함. **기지** = 마지막 waypoint. 둘 다 경로 칸이다.
- **설치 불가 칸** = 경로 칸 ∪ 데이터의 추가 `reservedCells`(장식 등, 기본 빈 목록). 추가 예약 칸도 격자 안이어야 하고, 서로 중복되거나 **경로 칸과 겹치면 검증 오류**(이미 설치 불가인 칸을 다시 예약하지 않는다). 배열에 빈 자리(hole)·`undefined`·`null` 항목이 있으면 해당 인덱스 경로의 검증 오류(waypoint도 동일). 그 밖의 칸은 타워가 점유하지 않았으면 설치 가능.
- **경로 진행도:** 출발 칸 중심에서 `pathProgress = 0`, 경로를 따라 mt 단위로 증가. 경로 총길이 `pathLengthMt = (경로 칸 수 − 1) × 1000`. 적은 `pathProgress ≥ pathLengthMt`(기지 칸 중심 도달)에서 기지에 도달한다. 위치는 진행도로 구간을 찾아 정수 보간(3.3절).
- **입력 좌표 → 칸:** 맵 콘텐츠 영역 기준 좌표 `(x, y)`와 타일 크기 `tile`(양수)로 `col = floor(x / tile)`, `row = floor(y / tile)`. 따라서 경계선은 오른쪽·아래 칸에 속한다. 단 `x == 18×tile`은 `col 17`, `y == 10×tile`은 `row 9`(끝선은 마지막 칸). `x < 0`, `y < 0`, `x > 18×tile`, `y > 10×tile`, 비유한 값은 **칸 없음**(설치 명령을 만들지 않음). 렌더 좌표는 소수일 수 있으므로 이 변환은 코어 밖 입력 어댑터의 유일한 소수 연산이며, 결과는 정수 칸이다.

### 10.2 후보 맵 (사용자 승인 2026-11-24, 수치 아님 — BAL-01에서 재검토 가능)

| Stage | waypoint `(col,row)` | 경로 칸 | 설치 가능 칸 |
|---|---|---|---|
| 1 초원 전초기지 | (0,2) (15,2) (15,5) (2,5) (2,8) (17,8) | 50 | 130 |
| 2 눈 내리는 협곡 | (0,1) (14,1) (14,4) (8,4) (8,8) (17,8) | 37 | 143 |
| 3 어스름 폐허 | (0,8) (2,8) (2,1) (7,1) (7,7) (12,7) (12,3) (15,3) (15,6) (17,6) | 38 | 142 |

```text
Stage 1                Stage 2                Stage 3
  012345678901234567     012345678901234567     012345678901234567
0 ..................   0 ..................   0 ..................
1 ..................   1 S##############...   1 ..######..........
2 S###############..   2 ..............#...   2 ..#....#..........
3 ...............#..   3 ..............#...   3 ..#....#....####..
4 ...............#..   4 ........#######...   4 ..#....#....#..#..
5 ..##############..   5 ........#.........   5 ..#....#....#..#..
6 ..#...............   6 ........#.........   6 ..#....#....#..##B
7 ..#...............   7 ........#.........   7 ..#....######.....
8 ..###############B   8 ........#########B   8 S##...............
9 ..................   9 ..................   9 ..................
```

## 11. 콘텐츠 데이터 스키마·검증 (DATA-01)

> **값이 아니라 형식·단위·검증 규칙만 정한다.** 실제 능력치·가격·보상·웨이브 구성은 미승인(TBD-TOWER/ENEMY/ECON/WAVE/PROJECTILE)이며 BAL-01에서 후보를 만들고 사용자가 승인한다. 그 전까지 테스트·개발용 값은 `TEST_ONLY`로만 둔다.

### 11.1 묶음 구조

`ContentBundle = { contentVersion, towers, enemies, traits, economy, stages }`. 숫자는 모두 안전 정수, 시간은 2절, 거리·속도는 3.1절 단위.

| 항목 | 필드 |
|---|---|
| `towers` | 정확히 4개, `type` ∈ `archer`·`ballista`·`mage`·`frost` 각 1개. `buildCost`, `upgradeCosts: [Lv2, Lv3, Lv4]`, `levels: { base, increments: [Lv2, Lv3, Lv4] }`. 각 증분은 base와 **같은 필드 전부**를 가진 정수(음수·0 허용). **증분은 강화 1회마다 누적**된다: `Lv2 = base + inc[0]`, `Lv3 = Lv2 + inc[1]`, `Lv4 = Lv3 + inc[2]` |
| 타워 레벨 필드(공통) | `damage`, `attackPeriodMs`, `rangeMt`, `projectileSpeedMtPerSec`, `projectileTtlMs` |
| 타워 레벨 필드(종류별) | `mage`: `aoeRadiusMt` · `frost`: `slowBp`, `slowDurationMs`. 다른 종류에 이 필드가 있으면 오류 |
| `enemies` | 정확히 4개, `type` ∈ `normal`·`fast`·`heavy`·`swarm` 각 1개. `hp`, `speedMtPerSec`, `baseDamage`(기지 피해), `killReward` |
| `traits` | 정확히 3개, `type` ∈ `controlResistance`·`hpBoost`·`speedBoost` 각 1개. `controlResistance`: `resistBp` · `hpBoost`: `hpBoostBp` · `speedBoost`: `speedBoostBp`. 공통 `killRewardBonus`(특성 처치 보상 가산, 정책 미정이므로 0 허용) |
| `economy` | `refundRateBp`(전 스테이지 공통) |
| `stages` | 정확히 3개, 순서 = Stage 1·2·3. 각 `stageId`, `initialGold`, `baseHp`(기지 HP 초기값, SIM-01에서 추가), `map`(10절 `StageMap`, `map.stageId == stageId`), `waves` |
| `waves` | 스테이지마다 정확히 5개, 순서대로 `waveIndex` 1..5. 각 `role`, `prepMs`, `clearReward`, `segments` |
| `role` | 웨이브 번호별 고정(SPEC 6절): 1 `basic`(기본 대응) · 2 `focus`(특정 적 강조) · 3 `newMix`(새 조합) · 4 `complex`(복합 대응) · 5 `finale`(종합 도전). 다른 값·순서는 오류 |
| `segments` | 1개 이상. 각 `startMs`, `intervalMs`, `count`, `enemyType`, `trait`(`null` 또는 특성 type 1개) |

- 설계 의도 매트릭스(주력·지원 적, 압박 목표)는 문서(BAL-01 산출물)에 두고 데이터에는 `role`만 둔다(SPEC 6절 "의도와 Segment 데이터 분리").
- `stageId` 3개는 서로 달라야 하고 10절 맵 데이터와 연결된다. 현재 후보 ID: `stage-1-meadow-outpost`·`stage-2-snowfall-pass`·`stage-3-dusk-ruins`.

### 11.2 필드 범위 (기술 상한, 밸런스 값 아님)

정수 overflow를 막기 위한 상한이다(3.2절 C1). 밸런스 승인과 무관하며 BAL-01에서 좁힐 수 있다.

| 필드 | 범위 |
|---|---|
| 골드(`buildCost`·`upgradeCosts`·`initialGold`·`clearReward`·`killReward`) | 1 ≤ v ≤ 1,000,000. `killRewardBonus`만 0 ≤ v ≤ 1,000,000 |
| `hp`, `damage`, `baseDamage`, `baseHp` | 1 ≤ v ≤ 1,000,000 |
| `rangeMt`, `aoeRadiusMt` | 1 ≤ v ≤ 25,000 (맵 대각선 약 20,600mt) |
| 속도(`speedMtPerSec`·`projectileSpeedMtPerSec`) | 20 ≤ v ≤ 100,000, 20의 배수 (3.1절) |
| 지속 시간(`attackPeriodMs`·`projectileTtlMs`·`slowDurationMs`·`prepMs`) | 50 ≤ v ≤ 600,000, 50의 배수 (2절 하한) |
| `startMs` | 0 ≤ v ≤ 600,000, 50의 배수 |
| `intervalMs` | `count > 1`이면 50 ≤ v ≤ 600,000, `count == 1`이면 0 또는 위 범위. 50의 배수 |
| `count` | 1 ≤ v ≤ 1,000. 웨이브당 Segment ≤ 64개, 웨이브당 적 총수 ≤ 5,000 |
| `slowBp` | 1 ≤ v ≤ 9,999 (3.3절: 둔화 < 100%) |
| `resistBp`, `refundRateBp` | 0 ≤ v ≤ 10,000 |
| `hpBoostBp`, `speedBoostBp` | 1 ≤ v ≤ 90,000 (최대 +900%) |

- **레벨 범위는 증분을 더한 결과값(Lv1~4 각각)에 적용**한다. 증분 자체는 범위 검사 대상이 아니고, 결과가 범위를 벗어나면 그 레벨·필드 경로의 오류.

### 11.3 교차 규칙 (SPEC 3·6·8절)

- **사거리 순서(사용자 결정 2026-11-24):** 같은 레벨끼리 `ballista > archer > mage > frost`(엄격 부등호)를 **Lv1~Lv4 각각** 만족. 다른 레벨끼리는 비교하지 않는다.
- **강화 비용:** 타워마다 `upgradeCosts[0] < upgradeCosts[1] < upgradeCosts[2]` (Lv2 < Lv3 < Lv4). 다른 타워끼리 가격 순서는 검사하지 않는다(SPEC 미정).
- **설치 가격**은 타워 종류별 1개이고 스테이지 데이터에 두지 않는다(REQ-ECON-11: 스테이지 공통).
- **Stage 1 등장 조건:** Stage 1의 5개 웨이브 Segment를 합치면 적 4종과 특성 3종이 모두 한 번 이상 등장.
- **참조 무결성:** `enemyType`·`trait`는 위 목록의 값만, `map`은 10절 검증 통과.

### 11.4 검증 단계·오류 격리 (SPEC 10절, PLAN 3.3)

- 오류는 **필드 경로**(예: `stages[1].waves[3].segments[0].count`)와 사유를 담은 목록으로 모두 모은다(첫 오류에서 멈추지 않음). 자동 보정·기본값 대체 금지(SPEC 10절 "가짜 데이터로 대체하지 않음"). 배열 hole·`undefined`·`null`·비정수·문자열 숫자는 모두 오류(10.1절과 같은 원칙).
- **사전 검증**(콘텐츠 로드 시): 결과 = `{ globalErrors, stages: [{ stageId, errors }] }`.
  - `globalErrors`: `contentVersion`·`towers`·`enemies`·`traits`·`economy`·스테이지 개수·`stageId` 중복 오류. 하나라도 있으면 **모든 스테이지 플레이 불가**.
  - 스테이지별 `errors`: 그 스테이지의 `initialGold`·`baseHp`·`map`·`waves` 오류. 해당 스테이지만 **콘텐츠 오류로 격리**하고 다른 정상 스테이지는 그대로 사용 가능.
  - Stage 1 등장 조건 위반은 Stage 1의 오류.
  - **스테이지 항목 자체가 잘못된 경우:** `stages` 배열 길이가 3이 아니면 전역 오류. 길이가 3이면 각 자리의 hole·`undefined`·`null`·객체 아님은 **그 자리 스테이지만의 오류**(격리, 다른 스테이지는 사용 가능). 그 자리의 `stageId`를 알 수 없으므로 결과의 `stageId`는 `null`.
- **수집 범위:** 한 필드의 오류가 다른 필드의 판정을 막지 않는다. 배열 길이 오류가 있어도 존재하는 항목은 각각 검사한다. 생략은 **그 값에 의존하는 계산만**(예: Lv2 `damage`가 무효면 Lv3·Lv4 `damage` 누적 결과 검사만 생략, 같은 레벨의 다른 필드는 계속 검사). 맵은 구조·필드·좌표 오류를 모두 모은 뒤, 그것이 없을 때만 기하 검증(10절)을 수행한다.
- **엄격 필드 범위:** 묶음의 모든 객체(맵·waypoint·reservedCells 좌표 포함)에 적용한다.
- **진입 재검증:** 스테이지 시작 직전에 전역 항목 + 그 스테이지를 같은 검증기로 다시 검사. 실패하면 시작하지 않는다.
- **검증 통과 결과물**은 깊은 복사 후 동결한 객체로 반환하고, 시도는 그 사본만 읽는다(TECH-02 리뷰 I2와 같은 원칙).
- **정규 순서:** 통과 결과에서 `towers`는 `archer`·`ballista`·`mage`·`frost`, `enemies`는 `normal`·`fast`·`heavy`·`swarm`, `traits`는 `controlResistance`·`hpBoost`·`speedBoost` 순으로 정렬한다(입력 배열 순서는 의미 없음). `stages`·`waves`·`segments`는 입력 순서가 의미이므로 유지한다. 오류 경로는 **입력** 인덱스를 쓴다.
- **엄격 필드:** 계약에 없는 필드가 있으면 그 경로의 오류.
- **스테이지 콘텐츠 해시**(7.2절 `contentHash`) = **검증 통과 결과(정규 순서)** 기준 정규 JSON `{ "global": {contentVersion, towers, enemies, traits, economy}, "stage": <그 스테이지> }`의 FNV-1a 64. 따라서 타워·적·특성의 입력 배열 순서만 다른 묶음은 같은 해시다.

### 11.5 웨이브 전개

- 검증된 웨이브의 Segment는 `planSpawns`(TECH-02 `sim/time.ts`)로 `(생성 틱, Segment 원본 순서, Segment 내 순번)` 순서 일정으로 전개한다. 각 항목은 `enemyType`·`trait`를 함께 담는다. 같은 웨이브 안 Segment 겹침은 허용(SPEC 6절).
- 웨이브 사이 비중첩·완료 판정은 SIM-01 책임이다.

## 12. 시도 상태 머신·틱 처리 (SIM-01)

> SPEC 7·9·10절과 2.1절 타임라인을 실제 시도(attempt) 코어로 구체화한다. 전투 계산(4단계 발사·명중, 2단계 둔화 만료)의 내용은 SIM-02, 설치·강화·판매는 ECON-01이 채운다. SIM-01은 그 자리를 **확장 지점**으로 둔다.

### 12.1 시도 생성·초기 상태

- `createAttempt(bundle, stageId, attemptId, hooks?)`: `bundle`은 **원본 콘텐츠 묶음**이며, 생성 안에서 **진입 재검증**(11.4)을 하고 실패면 생성하지 않는다. 시도는 그 스테이지의 깊은 복사·동결 사본과 그 사본으로 계산한 `contentHash`만 쓴다. **시도는 이 함수로만 만들 수 있다**(코어 클래스 생성자는 외부에 공개하지 않는다).
- 초기 상태(스냅샷 0): `phase = preparation`, `waveIndex = 1`(준비 중인 다음 웨이브), `prepTicksRemaining = wave1.prepMs/50`, `gold = initialGold`, `baseHp = stage.baseHp`, 엔티티·큐·소비 키 없음, 모든 카운터 1, `paused = false`, `outcome = null`.
- **재도전** = 같은 콘텐츠·stageId로 새 `attemptId`의 새 시도 생성. 이전 시도의 어떤 상태도 넘기지 않는다(SPEC 10절). 클리어 플래그는 코어 밖(SAVE-01).

### 12.2 단계(phase)

| phase | 의미 | 틱 진행 |
|---|---|---|
| `preparation` | 다음 웨이브 준비, 타이머 감소(2.1절), `startWave`로 조기 시작 | 예 |
| `combat` | 웨이브 진행 | 예 |
| `victory` / `defeat` | 결과, 게임플레이 불변 | `step()` 오류(2.1절) |

- **일시정지**는 phase가 아니라 별도 플래그 `paused`다. `pause()`/`resume()`은 틱 밖 조작이며 상태 스냅샷에 반영되지만 틱·이벤트를 만들지 않는다. `paused`인 동안 `step()`은 오류(어댑터는 호출하지 않음), 게임플레이 명령은 접수 즉시 거부(4절). 결과 단계에서 `pause()`는 오류.
- `startWave`는 `preparation`에서만 유효(아니면 `wrongPhase` 거부). 조기 시작 보너스 없음(SPEC 6절).

### 12.3 틱 8단계 (SPEC 7절, 순서 고정)

1. **명령:** 4절대로 seq 순 적용. SIM-01이 처리하는 명령은 `startWave`. `build`·`upgrade`·`sell`은 ECON-01, `setTargeting`은 SIM-02가 채우기 전까지 `unsupportedKind`로 거부.
2. **둔화 만료:** 확장 지점(SIM-02). SIM-01은 아무것도 하지 않음.
3. **생성:** `combat`이고 이번 웨이브의 전개 일정(11.5, `waveStartTick` 기준)에 이 틱 항목이 있으면 그 순서대로 생성. 적 상태: `enemyId`(카운터), `enemyType`, `trait`, `maxHp = hp`(3.3절 체력 강화 반영), `speedPerTick`(3.3절 변환·속도 강화 반영, 둔화 전), `pathProgress = 0`, `baseDamage`, `killReward`(= 유형 `killReward` + 특성 `killRewardBonus`, 특성 없으면 유형 값). 이벤트 `enemySpawned`.
4. **발사·충돌:** 확장 지점(SIM-02). 이 단계는 적 HP만 줄일 수 있고 제거는 하지 않는다. 같은 틱에 생성된 적도 대상이 될 수 있다.
5. **사망·처치 골드:** `hp ≤ 0`인 적을 `enemyId` 순으로 제거하고 경제 이벤트 `kill:e{enemyId}`로 `killReward`를 **정확히 한 번** 지급. 이벤트 `enemyKilled`·`economySettled`.
6. **이동·기지 도달:** 남은 적을 `enemyId` 순으로 `pathProgress += 현재 속도`(SIM-01에서는 둔화 없음, 확장 지점). `pathProgress ≥ pathLengthMt`이면 제거하고 `baseHp -= baseDamage`(0 미만이면 0), 처치 골드 없음. 이벤트 `enemyReachedBase`.
7. **결과 판정(패배 우선):** `baseHp == 0`이면 `defeat`(이번 틱의 웨이브 완료 보상 없음). 아니면 `combat`에서 이번 웨이브 예약 생성이 모두 끝났고 살아 있는 적이 0이면 웨이브 완료: 경제 이벤트 `waveClear:w{waveIndex}`로 `clearReward` 한 번 지급, 이벤트 `waveCleared`. 마지막(5번) 웨이브면 보상 후 `victory`.
8. **정리·전환:** 결과면 `resultReached{outcome}`. 웨이브 완료(비최종)면 `waveIndex + 1`, `preparation`, 그 웨이브의 `prepTicksRemaining`, `prepEntered`(진입 틱은 타이머를 소비하지 않음, 2.1절). 준비 단계였다면 타이머 감소·만료 시 다음 틱부터 전투(2.1절, `waveStarted{trigger:"timer"}`는 실제 전투가 시작되는 틱 1단계에서 기록).

- 웨이브 사이 중첩 없음: 다음 웨이브는 이전 웨이브 완료 후 준비 단계를 거쳐야만 시작한다(SPEC 6절).
- 1단계 명령은 같은 틱 5·7단계의 골드를 쓸 수 없다(단계 순서로 자연히 보장, SPEC 7절).

### 12.4 확장 지점 (SIM-02·ECON-01 연결용)

- 코어는 단계 2·4·6(속도)의 처리기를 **주입 가능한 순수 함수**로 둔다. 기본값은 위의 SIM-01 동작(없음/없음/둔화 없음). (SIM-01에 있던 1단계 명령 훅은 ECON-01에서 5개 명령을 모두 코어가 직접 처리하게 되어 **제거**했다, 13절.)
- 주입 함수는 상태를 정해진 범위로만 바꿀 수 있다: 4단계는 적 HP 감소와 자기 상태(투사체 등)만, 2단계는 둔화 상태만. 제거·골드·결과 판정은 항상 SIM-01 단계가 한다.
- 테스트는 TEST_ONLY 주입 함수(예: "이 틱에 이 적 HP를 0으로")로 동시 사건을 만든다.
- **훅은 동기 함수다.** Promise를 반환하면 프로토콜 오류로 step 전체를 실패(롤백)시킨다.
- **쓰기 함수 수명:** 훅에 넘기는 쓰기 함수(`damage`·`emit`·`settle` 등)는 **그 훅 호출 하나 동안만** 유효하다. 호출이 끝난 뒤(정상·예외 모두), 다른 단계·다음 틱·결과 이후에 부르면 상태를 바꾸기 전에 오류를 던진다.
- **명령 단위 원자성:** 거부되는 명령은 상태를 하나도 바꾸지 않고 `commandRejected`만 남긴다(코어는 모든 검사를 변경 전에 끝낸다, 13.2절). 앞서 성공한 명령의 변경은 유지된다. 처리 중 예외는 step 전체를 롤백한다.
- **step 중 조작 금지:** `step()` 실행 중(훅 안 포함) `pause()`·`resume()`·`submit()`은 상태를 바꾸기 전에 오류. 틱 밖 조작은 12.2절 그대로.

### 12.5 리플레이 연결

- 시도 코어는 7.3절 리플레이 실행기의 코어 인터페이스(`completedTick`·`isResult`·`submit`·`step`·`snapshot`)를 구현한다. 장난감 시뮬(TECH-02)과 같은 리플레이 검증을 실제 시도 코어에 적용할 수 있어야 한다.

## 13. 경제 거래·타워 상태 (ECON-01)

> SPEC 8절을 시도 코어에 구체화한다. 타워는 SIM-02 전투에서도 쓰므로 **코어 소유 상태**로 두고 1단계 명령 처리를 코어가 직접 한다(12.4의 명령 훅 대신). 명령 단위 원자성은 12.4의 규칙(거부 시 그 명령 변경 전부 롤백)을 그대로 따른다. 사용자 결정(2026-11-24): 설치·강화는 준비·전투 모두 가능, 판매는 준비만.

### 13.1 타워 상태

- `TowerState = { towerId, type, cell: {col,row}, level(1~4), targetingMode, actuallyPaid }`. 스냅샷의 `towers`는 `towerId` 오름차순. 점유 칸은 `towers`에서 파생(별도 저장 안 함).
- `targetingMode` 기본값 `first`(SPEC 3절 선두). 발사 관련 상태(`nextFireTick` 등)는 SIM-02가 추가한다.
- 재도전(새 시도)에는 타워가 없다.

### 13.2 명령

| 명령 | payload | 허용 단계 | 검사 순서 → 거부 사유 | 성공 시 (원자적) | 경제 키 |
|---|---|---|---|---|---|
| `build` | `{towerType, tile:{col,row}}` | preparation·combat | 격자 밖 → `outOfGrid` · 경로/예약 칸 → `notBuildable` · 타워 있음 → `occupied` · 골드 < `buildCost` → `insufficientGold` | 골드 −`buildCost`, 타워 생성(`towerId` 소비, Lv1, `first`, `actuallyPaid = buildCost`) | `build:c{seq}` |
| `upgrade` | `{towerId}` | preparation·combat | 타워 없음 → `towerNotFound` · Lv4 → `maxLevel` · 골드 < 다음 강화 가격 → `insufficientGold` | 골드 −가격, `level + 1`, `actuallyPaid += 가격` | `upgrade:c{seq}` |
| `sell` | `{towerId}` | preparation만 | 단계 → `wrongPhase` · 타워 없음 → `towerNotFound` | `refund = floor(actuallyPaid × refundRateBp / 10000)`(3.3절, 내림 한 번), 골드 +refund, 타워 제거(칸 해제) | `sell:t{towerId}` |
| `setTargeting` | `{towerId, mode}` | preparation·combat | 타워 없음 → `towerNotFound` | `targetingMode = mode`(같은 값이어도 성공) | 없음 |

- 단계 검사는 모든 명령에서 가장 먼저(`wrongPhase`). 일시정지·결과 단계는 접수 즉시 거부(4절).
- `towerType`·`mode`가 목록 밖이거나 payload 구조가 틀리면 **접수 시 구조 오류**(4절, seq 미소비). 격자 밖 좌표(정수지만 범위 밖)는 접수는 되고 적용 시 `outOfGrid`.
- 골드 검사는 **앞 명령까지 반영된 현재 골드**로 한다. 같은 틱 5·7단계 골드는 아직 없다(SPEC 7절).
- `refund`가 0이어도(환급률 0) 판매는 성공하고 `delta 0`으로 정산 기록한다.
- 이벤트 순서: 거래의 도메인 이벤트(`towerBuilt` 등) 바로 뒤에 `economySettled`(처치와 같은 방식). 강화 가격은 Lv N→N+1이 `upgradeCosts[N−1]`.
- 이벤트: `towerBuilt{towerId, towerType, cell, cost}`, `towerUpgraded{towerId, level, cost}`, `towerSold{towerId, refund}`, `targetingChanged{towerId, mode}`, 각 경제 거래마다 `economySettled`. 새 거부 사유: `notBuildable`, `maxLevel`.

### 13.3 불변식 (테스트·리플레이로 감시)

- 골드 ≥ 0, 안전 정수. `gold == initialGold + Σ 원장 delta`.
- 타워마다 `actuallyPaid == buildCost + Σ(성공한 강화 가격)`. 같은 칸 타워 최대 1개, 경로·예약 칸에 타워 없음.
- 경제 키는 시도 안에서 한 번만 소비(5절). 거부된 명령은 키·골드·타워를 남기지 않는다(12.4).
