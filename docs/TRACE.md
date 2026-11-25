# Ddooby-defence — 요구사항 ↔ QA ↔ TASK 추적표 (DOC-02, v0.1 골격)

> 상태: **골격 v0.1, 2026-11-24 claude-main.** 기준 `main` @ `1d3c829`. 태스크가 끝날 때마다 해당 행의 테스트 위치·상태를 채운다(갱신 책임: 해당 태스크를 반영하는 claude-main).
> 근거 문서: `SPEC.md`(규칙·11절 범주), `docs/SIM-CONTRACT.md`(결정성 계약), `docs/TASKS.md`(태스크), `CLAUDE.md` 5절(QA 게이트).
> 이 표는 **연결과 상태 기록**이다. 행이 있다는 것은 테스트가 존재하거나 통과했다는 뜻이 아니다. 상태 칸만 실행 증거를 뜻한다.

## 1. 표기 규칙

- **요구사항 ID:** `REQ-<범주>-<번호>`. 범주는 SPEC 11절의 9개(MAP·TOWER·ENEMY·WAVE·ECON·STATE·UI·BALANCE·QA). 번호는 이 문서에서 처음 부여하며 재사용·재번호하지 않는다(삭제 시 `폐기` 표기).
- **QA 시리즈:** SPEC 11절의 번호 범위(MAPD-01~46 등)는 **예약 범위**다. 범위 안 개별 케이스 원문은 저장소에 없으므로, 실제 케이스는 각 태스크의 테스트 전략에서 `<TASK>/<케이스ID>`로 정의한다(예: `TECH-02/N09` = `.codex-out/TECH-02-test-strategy.md`의 N09). 시리즈 칸은 "어느 QA 영역 게이트에 속하는가"만 뜻한다.
- **테스트 위치:** 실제 존재하는 테스트 파일(`sim/…`·`map/…`은 `src/game/core/` 아래, `content/…`는 `src/game/content/` 아래)과 케이스 ID. 없으면 `—`. 케이스 ID는 테스트의 `describe`/`it` 이름에 들어 있다.
- **상태**(CLAUDE.md 5절): `설계됨` / `실행 대기` / `의존성 차단` / `통과` / `실패` / `해당 없음`. `통과`는 기록된 커밋에서 실제 실행 증거가 있을 때만. 기초 수준만 검증되고 제품 통합이 남았으면 `부분 통과`라고 쓰고 남은 범위를 적는다.
- **게이트:** CORE / ECON / DATA / STATE / UI (CLAUDE.md 5절).

## 2. 추적 매트릭스

### REQ-MAP — 격자·경로·설치 가능 영역 (게이트 DATA·UI, QA MAPD·VAL)

| ID | 요구 | 근거 | TASK | 테스트 위치 | 상태 |
|---|---|---|---|---|---|
| REQ-MAP-01 | 18열×10행 정사각 논리 격자, 격자 밖 좌표 거부 | SPEC 1·2절 | TECH-01, MAP-01 | `src/game/core/grid.test.ts`, `map/stageMap.test.ts` | **통과**(`42b233d`, 격자 경계·3맵 격자 안 검증) |
| REQ-MAP-02 | 스테이지별 독립 지도, 경로 = waypoint + 설치 불가 예약 격자 | SPEC 2절, SIM-CONTRACT 10절 | MAP-01, DATA-01 | `map/stageMap.test.ts`(3맵 그림 리터럴·칸 수·검증 오류), `content/stageMaps.ts`, `content/validate.test.ts`(맵 엄격 필드·스테이지 격리) | **통과**(`42b233d`·`ceded17`, 기하·후보 데이터·묶음 스키마) |
| REQ-MAP-03 | 경로·spawn·base·예약 격자·점유 칸에는 설치 불가 | SPEC 2절 | MAP-01, ECON-01 | `map/stageMap.test.ts`(isBuildable), `attempt/econ.test.ts`(경로·출발·기지 notBuildable, 점유 occupied, 경로 칸 타워 없음 불변식) | **통과**(`cc4059a`) |
| REQ-MAP-04 | 타워는 논리 1×1 점유, 스프라이트 돌출은 점유를 늘리지 않음 | SPEC 2절 | SIM-02, UI-01 | `attempt/combat.test.ts`(타워는 칸 중심 기준 1칸, 점유·사거리 중심 일치) | 부분 통과(`50b320b`, 코어 점유·발사 중심). 스프라이트 돌출은 UI-01 |
| REQ-MAP-05 | 화면 → 맵 논리 격자 역변환, HUD·레터박스·맵 밖 입력은 설치 명령 생성 금지. 격자 경계 클릭은 오른쪽·아래 칸 | SPEC 2·9절, SIM-CONTRACT 10.1 | MAP-01, UI-01 | `map/pointToCell.test.ts`(소수 tile 경계 포함) | **통과**(`5c4ecfc`, UI 입력 연결: DOM 좌표 → pointToCell, 레터박스·HUD 무명령, 왼쪽 버튼만) |

### REQ-TOWER — 타워 역할·레벨·타깃·투사체 (게이트 CORE, QA BALD·INT)

| ID | 요구 | 근거 | TASK | 테스트 위치 | 상태 |
|---|---|---|---|---|---|
| REQ-TOWER-01 | 4종 역할(궁수 연사·발리스타 장거리 단일·마법 광역·서리 둔화) | SPEC 3절 | SIM-02, BAL-01 | `attempt/combat.test.ts`(single·aoe·frost 둔화 경로) | 부분 통과(`50b320b`, 역할별 동작 구조). 역할 수치는 BAL-01 |
| REQ-TOWER-02 | 사거리 엄격 순서 발리스타 > 궁수 > 마법 > 서리 | SPEC 3절(사용자 결정: 같은 레벨끼리), SIM-CONTRACT 11.3 | DATA-01(검증기), BAL-01 | `content/validate.test.ts`(같은 레벨 순서 Lv1~4, 동률 오류, 다른 레벨 역전 허용) | **통과**(`ceded17`, 검증기). 실제 값은 BAL-01 |
| REQ-TOWER-03 | Lv1~4, 갈림길 없는 강화 3회, Lv1 기본값 + Lv2/3/4 증분 데이터 | SPEC 3절 | DATA-01, SIM-02 | `content/validate.test.ts`(base·증분 누적, 증분 결과 범위), `attempt/combat.test.ts`(강화 후 Lv2 능력치 적용) | 부분 통과(`50b320b`, 데이터 누적·강화 적용). 실제 수치는 BAL-01 |
| REQ-TOWER-04 | 같은 타워 강화 비용 Lv2 < Lv3 < Lv4 | SPEC 3·8절 | DATA-01 | `content/validate.test.ts`(Lv2<Lv3<Lv4, 동률·역전 오류) | **통과**(`ceded17`, 검증기) |
| REQ-TOWER-05 | 모든 타워가 모든 적에게 피해, 면역·하드카운터 없음 | SPEC 3절 | SIM-02, BAL-01 | `attempt/combat.test.ts`(모든 타워 피해에 면역 분기 없음) | 부분 통과(`50b320b`, 코어에 면역 규칙 없음). 수치 체감은 BAL-01 |
| REQ-TOWER-06 | 타깃 우선순위 선두(기본)·후미·가까운·강한 | SPEC 3절, SIM-CONTRACT 3.3 | SIM-02 | `attempt/combat.test.ts` 타깃 모드 4종·pickTarget | **통과**(`50b320b`) |
| REQ-TOWER-07 | 동률은 경로 진행도 → 생성 순번 → 적 ID | SPEC 3절, SIM-CONTRACT 5절 | TECH-02, SIM-02 | `sim/time.test.ts` TECH-02/T08, `attempt/combat.test.ts` 동률(first·last id, close·strong 진행도→id) | **통과**(`50b320b`) |
| REQ-TOWER-08 | 사거리 = 타워 중심~적 유클리드 거리, 경계 포함, LoS 없음 (정수 거리² 비교) | SPEC 3절, SIM-CONTRACT 3.3 | SIM-02 | `attempt/combat.test.ts` 사거리 경계(거리² == range² 발사, range−1 미발사) | **통과**(`50b320b`) |
| REQ-TOWER-09 | 타깃 변경은 이후 발사에만 영향 | SPEC 3절 | SIM-02 | `attempt/combat.test.ts` REQ-TOWER-09 전용(모드 변경 시 후보 2명, 비행 중 투사체 불변·다음 발사 새 모드) | **통과**(`3ea5077`) |
| REQ-TOWER-10 | 단일 투사체: 발사 시 대상·스탯 고정, 사거리 밖도 추적, 대상 사망·기지 도달 시 게임플레이 투사체 취소 | SPEC 4절 | SIM-02 | `attempt/combat.test.ts` 취소·만료·추적(사거리 밖 추적, 대상 사망·기지 도달 취소) | **통과**(`50b320b`) |
| REQ-TOWER-11 | 명중과 수명 만료가 같은 시각이면 명중 우선 | SPEC 4절 | SIM-02 | `attempt/combat.test.ts` 같은 틱 명중 == 만료 → 명중 | **통과**(`50b320b`, TTL 판정 = 이동·명중 후, SIM-CONTRACT 14.4) |
| REQ-TOWER-12 | 마법 광역은 고정 충돌 좌표에서 폭발, 반경 안이면 타워 사거리 밖 적도 피해 | SPEC 4절 | SIM-02 | `attempt/combat.test.ts` aoe(고정 충돌점, 사거리 밖 피해, 반경 경계, 노린 적 소멸 후 폭발, 만료 시 미폭발) | **통과**(`50b320b`) |

### REQ-ENEMY — 적·특성·둔화 (게이트 CORE, QA ENMD)

| ID | 요구 | 근거 | TASK | 테스트 위치 | 상태 |
|---|---|---|---|---|---|
| REQ-ENEMY-01 | 기본 적 4종, 유형별 HP·속도·기지 피해는 Stage 1~3 공통, 스테이지·웨이브 보정 없음 | SPEC 5절 | DATA-01 | `content/validate.test.ts`(적 4종 1회씩, 스테이지별 적 능력치 필드 없음) | **통과**(`ceded17`, 스키마) |
| REQ-ENEMY-02 | 적 = 기본 유형 1 + 보조 특성 0~1 | SPEC 5절 | DATA-01 | `content/validate.test.ts`(Segment trait null 또는 1개) | **통과**(`ceded17`, 스키마) |
| REQ-ENEMY-03 | 체력·속도 강화는 비율 보정(반올림, 최소 1), 생성 시 고정, 속도는 mt/틱 변환 후 적용 | SPEC 5절, SIM-CONTRACT 3.3 | TECH-02, SIM-02 | `sim/formulas.test.ts` TECH-02/N11·N14, `attempt/attempt.test.ts`(생성 시 고정) | 부분 통과(산식·생성 연결 SIM-01). 실제 특성 배율은 BAL-01 |
| REQ-ENEMY-04 | 둔화: 같은 출처 갱신, 다른 출처 개별 유지, 가장 강한 하나만 적용, 만료 후 다음 효과 | SPEC 4절 | SIM-02 | `sim/time.test.ts` TECH-02/T09, `attempt/combat.test.ts` 둔화(같은 출처 교체·다른 출처 공존·최대 1개·만료 경계) | **통과**(`50b320b`) |
| REQ-ENEMY-05 | `effectiveSlow = baseSlow × (1 − controlResistance)` (bp, 반올림) | SPEC 4절, SIM-CONTRACT 3.3 | TECH-02, SIM-02 | `sim/formulas.test.ts` TECH-02/N12, `attempt/combat.test.ts` 저항 반영 | **통과**(`50b320b`) |
| REQ-ENEMY-06 | 판매된 타워의 둔화는 만료까지 유지, 적 사망·기지 도달 시 제거 | SPEC 4절 | SIM-02 | `attempt/combat.test.ts`(적 제거 시 둔화 소멸, 둔화가 타워 존재를 참조하지 않음) | 부분 통과(`50b320b`). 판매 타워 둔화 유지는 판매가 준비 단계 전용이라 정상 입력으로 도달 불가(codex 리뷰 확인) |
| REQ-ENEMY-07 | 경량 군집형은 데이터의 밀집 생성으로 표현, 사망 시 분열·추가 생성 없음, 중장형 방어력 없음 | SPEC 5절 | DATA-01, SIM-02 | `content/validate.test.ts`, `attempt/combat.test.ts`(사망 시 제거만, 추가 생성 없음) | 부분 통과(`50b320b`). 밀집 생성 데이터는 BAL-01 |
| REQ-ENEMY-08 | 처치 보상에 특성 영향을 줄지 | SPEC 5·8절, TBD-ECON | BAL-01 | — | 의존성 차단(사용자 결정 필요) |

### REQ-WAVE — 3×5 웨이브·생성·완료 (게이트 DATA·STATE, QA WAVD·WBL)

| ID | 요구 | 근거 | TASK | 테스트 위치 | 상태 |
|---|---|---|---|---|---|
| REQ-WAVE-01 | 3 Stage × 5 Wave 고정, 5개 역할 순서 | SPEC 1·6절 | DATA-01 | `content/validate.test.ts`(스테이지 3·웨이브 5·waveIndex·role 순서) | **통과**(`ceded17`, 검증기) |
| REQ-WAVE-02 | Stage 1의 5개 웨이브에 적 4종·특성 3종 모두 등장 | SPEC 6절 | DATA-01(검증기), BAL-01 | `content/validate.test.ts`(Stage 1 적·특성 누락 시 Stage 1만 오류) | **통과**(`ceded17`, 검증기). 실제 구성은 BAL-01 |
| REQ-WAVE-03 | 설계 의도 매트릭스와 Segment 출현 데이터 분리, Segment는 고정 일정(시작·간격·유형·특성·수량), 같은 웨이브 내 겹침 허용 | SPEC 6절, SIM-CONTRACT 2절 | DATA-01, SIM-01 | `sim/time.test.ts` TECH-02/T04·T05·T08, `content/validate.test.ts`, `content/expandWave.test.ts`, `attempt/attempt.test.ts`(일정대로 생성) | **통과**(`3ff5742`, 스키마·전개·실제 생성) |
| REQ-WAVE-04 | 동일 예약 시각은 원본 데이터 순서 → 적 ID 순 | SPEC 6절, SIM-CONTRACT 5절 | TECH-02, SIM-01 | `sim/time.test.ts` TECH-02/T08, `content/expandWave.test.ts`, `attempt/attempt.test.ts`(같은 틱 여러 생성 순서) | **통과**(`3ff5742`) |
| REQ-WAVE-05 | 웨이브 사이 중첩 없음, 완료 = 예약 생성 전부 완료 + 생존 적 0 | SPEC 6절 | SIM-01 | `attempt/attempt.test.ts`(웨이브 사이 중첩 없음, 완료 = 전원 생성+생존 0) | **통과**(`3ff5742`) |
| REQ-WAVE-06 | 조기 시작·준비 타이머 만료는 정확히 한 번 전투 시작, 조기 시작 보너스 없음 | SPEC 6절, SIM-CONTRACT 2.1 | SIM-01, ECON-01 | `sim/testing/toySim.test.ts` T06·T07, `attempt/attempt.test.ts`(타이머 만료·조기 시작 1회, 전투 중 startWave 거부) | **통과**(`3ff5742`) |
| REQ-WAVE-07 | 3맵·15웨이브 사전 검증 + 진입 재검증, 오류 스테이지 격리·진단, 가짜 데이터 자동 대체 금지 | SPEC 10절, PLAN 3.3 | DATA-01, UI-01 | `content/validate.test.ts`(전역/스테이지 격리, 오류 전부 수집, 진입 재검증 동일, 자동 보정 없음), `content/stageHash.test.ts` | 부분 통과(`ceded17`, 코어 검증·격리). 스테이지 카드 오류 표시는 UI-01 |

### REQ-ECON — 경제·원자성·판매 (게이트 ECON, QA ECOD)

| ID | 요구 | 근거 | TASK | 테스트 위치 | 상태 |
|---|---|---|---|---|---|
| REQ-ECON-01 | 골드는 정수, 스테이지별 초기 골드 독립·이월 없음 | SPEC 8절 | ECON-01 | `attempt/econ.test.ts`(정수 골드·불변식 gold = initialGold + Σdelta), `attempt/attempt.test.ts`(스테이지별 initialGold) | **통과**(`cc4059a`) |
| REQ-ECON-02 | 설치 성공 = 골드 차감·타워 생성·격자 점유 원자적 | SPEC 8절 | ECON-01 | `attempt/econ.test.ts`(설치 성공·거부 4종·검사 순서·같은 틱 경합) | **통과**(`cc4059a`) |
| REQ-ECON-03 | 강화 성공 = 차감·레벨 변경·actuallyPaid 누적 원자적 | SPEC 8절 | ECON-01 | `attempt/econ.test.ts`(Lv1→4 누적 actuallyPaid, maxLevel) | **통과**(`cc4059a`) |
| REQ-ECON-04 | 실패한 명령은 어떤 상태도 바꾸지 않음 | SPEC 8절, SIM-CONTRACT 4절 | ECON-01 | `attempt/econ.test.ts`(거부 시 골드·타워·원장·키·towerId 불변), `attempt/attempt.hooks.test.ts`(예외 시 step 롤백) | **통과**(`cc4059a`) |
| REQ-ECON-05 | 적 유효 사망 이벤트당 처치 골드 정확히 한 번 | SPEC 8절, SIM-CONTRACT 5절 | ECON-01 | `attempt/econ.test.ts`·`attempt/attempt.test.ts`(kill 키 1회, TEST_ONLY 처치 주입) | 부분 통과(`cc4059a`, 정산 1회 보장). 실제 사망 원인은 SIM-02 |
| REQ-ECON-06 | 웨이브 완료 보상 정확히 한 번, 패배 시 미지급 | SPEC 7·8절 | ECON-01, SIM-01 | `attempt/attempt.test.ts`(waveClear 키 1회, 패배 시 미지급) | **통과**(`3ff5742`) |
| REQ-ECON-07 | 판매는 준비 단계에서만, 확인 후 실행 시 재검증, 전투로 넘어간 확인창 무효 | SPEC 8·9절 | ECON-01, UI-01 | `attempt/econ.test.ts`(판매 준비만·전투 중 wrongPhase·적용 시 재검증) | 부분 통과(`cc4059a`, 코어). 판매 확인창은 UI-01 |
| REQ-ECON-08 | 환급 = `floor(actuallyPaid × 환급률)` 내림 한 번, 제거·환급 원자적, 중복 환급 방지 | SPEC 8절, SIM-CONTRACT 3.3 | ECON-01 | `sim/intmath.test.ts`·`sim/formulas.test.ts` N13, `attempt/econ.test.ts`(누적 지출 floor 한 번, 중복 판매 거부) | **통과**(`cc4059a`) |
| REQ-ECON-09 | 일시정지·결과 단계의 게임플레이 명령 거부 | SPEC 8절, SIM-CONTRACT 4절 | ECON-01, SIM-01 | `sim/commands.test.ts` Q09, `attempt/attempt.test.ts`·`attempt/attempt.hooks.test.ts`(pause·결과 단계 명령 거부) | **통과**(`3ff5742`) |
| REQ-ECON-10 | 재도전 시 이전 시도의 정산 ID·누적 비용 소멸 | SPEC 8·10절 | SIM-01, ECON-01 | `sim/ids.test.ts` Q01, `sim/replay.test.ts` R06, `attempt/attempt.test.ts`, `attempt/econ.test.ts`(재도전 시 타워·actuallyPaid·키 초기화) | **통과**(`cc4059a`) |
| REQ-ECON-11 | 설치 가격은 타워 종류별 1개이고 모든 스테이지에 동일, 강화 가격은 종류·레벨별 고정 명시값 | SPEC 3·8절 | DATA-01, ECON-01 | `content/validate.test.ts`, `attempt/econ.test.ts`(타워 종류별 buildCost 차감, 스테이지 무관) | **통과**(`cc4059a`) |

### REQ-STATE — 틱·시도·승패·저장 (게이트 CORE·STATE, QA INT·DATA)

| ID | 요구 | 근거 | TASK | 테스트 위치 | 상태 |
|---|---|---|---|---|---|
| REQ-STATE-01 | 논리 틱 8단계 순서 고정 | SPEC 7절 | SIM-01 | `attempt/attempt.test.ts`·`attempt/attempt.hooks.test.ts`(단계·훅 호출 순서) | **통과**(`3ff5742`, 8단계 순서·확장 지점). 2·4단계 내용은 SIM-02 |
| REQ-STATE-02 | 같은 틱에 생성된 적도 공격 대상 | SPEC 7절 | SIM-02 | `attempt/combat.test.ts` 틱 41 생성 적을 같은 틱 발사 | **통과**(`50b320b`) |
| REQ-STATE-03 | 1단계 명령은 같은 틱 5단계 처치 골드를 쓸 수 없음 | SPEC 7절 | SIM-01, ECON-01 | `attempt/attempt.test.ts`(1단계 명령이 같은 틱 처치 골드 사용 불가) | **통과**(`3ff5742`) |
| REQ-STATE-04 | 기지 파괴와 웨이브 완료가 같은 틱이면 패배 우선, 보상 없음 | SPEC 7절 | SIM-01 | `attempt/attempt.test.ts`(기지 파괴+웨이브 완료 같은 틱 → defeat·보상 없음) | **통과**(`3ff5742`) |
| REQ-STATE-05 | 마지막 웨이브 정상 완료 시 보상 한 번 후 승리 | SPEC 7절 | SIM-01, ECON-01 | `attempt/attempt.test.ts`(마지막 웨이브 보상 1회 후 victory) | **통과**(`3ff5742`) |
| REQ-STATE-06 | 승패 결과 이후 게임플레이 상태 불변, 순수 VFX만 잔존 | SPEC 7절, SIM-CONTRACT 2.1 | SIM-01, UI-01 | `attempt/attempt.test.ts`·`attempt/attempt.hooks.test.ts`(결과 후 step·명령·pause·저장된 쓰기 함수 거부) | 부분 통과(`3ff5742`, 게임플레이 불변). VFX 잔존은 UI-01 |
| REQ-STATE-07 | 논리 틱 50ms, 콘텐츠 시간 50ms 배수·하한, 정수 고정소수점(mt·bp), 비율 반올림 | SPEC 7절, SIM-CONTRACT 2·3절 | TECH-02 | `sim/time.test.ts` T01~T04, `sim/intmath.test.ts` N01~N10, `sim/formulas.test.ts` N11~N14 | **통과**(`1d3c829`, 224 passed) |
| REQ-STATE-08 | 같은 틱 복수 명령은 seq 숫자 순, 앞 명령 반영 상태로 순차 재검증, payload 동결 | SIM-CONTRACT 4절 | TECH-02, SIM-01 | `sim/commands.test.ts` Q04·Q12~Q14, `attempt/attempt.test.ts`·`attempt/attempt.hooks.test.ts`(seq 순 적용·명령 단위 롤백) | **통과**(`3ff5742`, 실제 시도 코어). 설치·판매 등 명령 내용은 ECON-01 |
| REQ-STATE-09 | 동일 코드·콘텐츠·초기 상태·입력 → 틱별 상태·이벤트 동일, 첫 불일치 틱·필드 진단 | SPEC 11절, SIM-CONTRACT 7절 | TECH-02, SIM-03 | `sim/canonical.test.ts`·`sim/hash.test.ts` S01~S09, `sim/replay.test.ts`, `attempt/record.test.ts`(기록 생성기·미적용 명령), `attempt/regression/regression.test.ts`(골든 R1~R3 틱별 해시), `regression/faults.test.ts` F1~F9 | **통과**(`3ea5077`, codex-main 재리뷰 2 통과) |
| REQ-STATE-10 | 코어 결정성 금지(난수·벽시계·환경 의존 수학), 상태 내 소수 금지 | SIM-CONTRACT 6·7.1절 | TECH-02 | `sim/lint.test.ts` L01~L03, `sim/canonical.test.ts` L04 | **통과**(`1d3c829`). 별칭 우회는 lint 미검출 → 코드 리뷰 게이트 |
| REQ-STATE-11 | 일시정지 시 게임 시간·VFX 동결, 접수된 명령 보존 후 재개 시 재검증 | SPEC 9절, SIM-CONTRACT 4절 | SIM-01, UI-01 | `attempt/attempt.test.ts`·`attempt/attempt.hooks.test.ts`(pause 큐 보존·재개, step 중 pause 금지) | 부분 통과(`3ff5742`, 코어). VFX 동결·오버레이는 UI-01 |
| REQ-STATE-12 | 재도전 시 타워·적·골드·둔화·투사체·타이머·정산 초기화, 클리어 플래그 유지 | SPEC 10절 | SIM-01, SAVE-01 | `attempt/attempt.test.ts`(재도전 스냅샷 0 동일·유입 없음) | 부분 통과(`3ff5742`, 코어 초기화). 클리어 플래그 유지는 SAVE-01, 타워·투사체 초기화는 SIM-02·ECON-01에서 재확인 |
| REQ-STATE-13 | 로컬 클리어 플래그 저장, 해금은 플래그에서 파생, 클라우드 없음 | SPEC 10절 | SAVE-01 | — | 설계됨 |
| REQ-STATE-14 | 저장 실패 시 오류·재시도, 새로고침 시 미저장 클리어 손실 안내, 세션 해금 유지 | SPEC 10절 | SAVE-01, UI-01 | — | 설계됨 |
| REQ-STATE-15 | 이미 얻은 클리어는 재플레이 실패에도 유지 | SPEC 10절 | SAVE-01 | — | 설계됨 |
| REQ-STATE-16 | 해금 규칙: Stage 1만 최초 해금, 직전 스테이지 클리어 시 다음 스테이지 해금, 해금된 스테이지는 재도전 가능 | SPEC 1절 | SAVE-01, UI-01 | — | 설계됨 |

### REQ-UI — HUD·입력·화면 상태 (게이트 UI, QA UI·HUD)

| ID | 요구 | 근거 | TASK | 테스트 위치 | 상태 |
|---|---|---|---|---|---|
| REQ-UI-01 | 가로 16:9 참고 레이아웃, 맵 왼쪽·HUD 오른쪽 분리 | SPEC 9절 | UI-01 | `session/layout.test.ts`(HUD 폭·정수 타일·최소 640×320 경계·실기기 796×384·1280×720·1920×1080·세로 안내), 브라우저 ego-browser(1280×720·800×360 스크린샷), MOB-01 실기기 Galaxy A16 설치·실행, MOB-02 HUD 폭 `×0.17, 136~240`·640×320/796×384/1280×720 HUD 스크롤 없음(ego-browser) | 부분 통과(MOB-02 codex-main 재리뷰 1 통과). 실기기 터치 조작 감각 미검증 |
| REQ-UI-02 | HUD에 골드·기지 HP·웨이브·단계가 실제 상태와 항상 일치 | SPEC 9절 | UI-01 | `session/hudView.test.ts`(스냅샷 파생·웨이브 수 콘텐츠 파생), 브라우저 ego-browser(1280×720·800×360 스크린샷) | **통과**(`5c4ecfc`) |
| REQ-UI-03 | 타워 4종 목록 상시, 선택 → 유효 칸 클릭 시 1개 설치 후 선택 종료, 실패 시 불변·사유 표시 | SPEC 9절 | UI-01 | `session/session.test.ts`(설치 모드 1회 종료·맵 밖 탭 해제·거부 피드백), 브라우저 ego-browser(1280×720·800×360 스크린샷)(성공·경로 칸·골드 부족) | **통과**(`5c4ecfc`) |
| REQ-UI-04 | 타워 선택 시 상세·강화(1클릭)·판매(확인)·타깃 우선순위 | SPEC 9절 | UI-01 | `session/session.test.ts`·`session/hudView.test.ts`(상세·강화·판매 확인·타깃·이중 제출 방지), 브라우저 ego-browser(1280×720·800×360 스크린샷) | **통과**(`5c4ecfc`) |
| REQ-UI-05 | 준비: 남은 타이머·진행 정보·조기 시작 / 전투: 생성 진행·생존 적 | SPEC 9절 | UI-01 | `session/hudView.test.ts`(준비 타이머·조기 시작·생성 진행·생존 적), 브라우저 ego-browser(1280×720·800×360 스크린샷) | **통과**(`5c4ecfc`) |
| REQ-UI-06 | 일시정지 오버레이·재개, 재개 후 명령 조건 재검증 | SPEC 9절 | UI-01 | `session/session.test.ts`(일시정지 0틱·재개), 브라우저 ego-browser(1280×720·800×360 스크린샷)(오버레이·Space/P) | **통과**(`5c4ecfc`, 재검증은 코어) |
| REQ-UI-07 | 준비 → 전투 시 허용 선택 상태 유지, 판매 확인창 취소, 결과 단계 입력 차단 | SPEC 9절 | UI-01 | `session/session.test.ts`(준비→전투 판매 확인 자동 취소·결과 단계 차단) | **통과**(`5c4ecfc`) |
| REQ-UI-08 | 승패 화면: Stage·도달 Wave·남은 HP·재시도·스테이지 선택·다음 스테이지(Stage 3 제외) | SPEC 9절 | UI-01 | `session/session.test.ts`·`session/progress.test.ts`(결과·재도전 새 attemptId·다음 스테이지·Stage 3 없음), 브라우저 ego-browser(1280×720·800×360 스크린샷) | **통과**(`5c4ecfc`) |
| REQ-UI-09 | 스테이지 카드: 잠김·선택 가능·클리어·콘텐츠 오류 구분 | SPEC 9·10절 | UI-01, SAVE-01 | `session/progress.test.ts`(잠김·선택 가능·클리어·콘텐츠 오류 파생, 진입 재검증 실패 시 시작 안 함) | 부분 통과(`5c4ecfc`, 세션 메모리 클리어). 영구 저장은 SAVE-01, 오류 카드 브라우저 미확인 |
| REQ-UI-10 | 저장 상태 대기·성공·실패·재시도 안내 | SPEC 9절 | SAVE-01, UI-01 | — | 설계됨 |
| REQ-UI-11 | 실제 치수·최소 해상도·색상·폰트, 선택 시안 반영 | SPEC 9절, TBD-UI·TBD-ART | UI-01 | `docs/UI-CONTRACT.md` 3절(사용자 결정 2026-11-25: 모바일 가로 최소 640×320·한국어·단순 도형) | 부분 통과(`5c4ecfc`, 치수·언어 확정). 색상·폰트·스프라이트·DPR 해상도는 후속 아트 |

### REQ-BALANCE — 수치 승인·통합 시뮬 (게이트 전체, QA BALX·BAPR)

| ID | 요구 | 근거 | TASK | 테스트 위치 | 상태 |
|---|---|---|---|---|---|
| REQ-BALANCE-01 | 실제 맵·능력치·경제·웨이브 수치 후보와 사용자 최종 승인 | SPEC 12절 | BAL-01 | — | 의존성 차단(MAP-01·SIM-03·ECON-01·UI-01·SAVE-01 선행) |
| REQ-BALANCE-02 | 스테이지별 개별 경제·클리어 평가, 15웨이브 전략 학습 흐름 평가(기본·상성·경계 시나리오) | SPEC 6절, PLAN 7.1 | BAL-01 | — | 의존성 차단 |

### REQ-QA — 게이트·리플레이·결함·문서 (QA GATE·COREG·TSTR·DEFQ·DOCQ·FINQ)

| ID | 요구 | 근거 | TASK | 증거 위치 | 상태 |
|---|---|---|---|---|---|
| REQ-QA-01 | 6개 운영 문서 존재·상호 충돌 없음·미정 의존성 기록 | TASKS DOC-01 | DOC-01 | `.codex-out/DOC-01-review.md` | **통과**(재리뷰 1, `0525041`) |
| REQ-QA-02 | 요구사항 ↔ QA ↔ TASK 추적, 잘못된 ID 참조 없음 | TASKS DOC-02 | DOC-02 | 이 문서, `.codex-out/DOC-02-review.md` | **통과**(골격, 재리뷰 1 `141d0ff`). 태스크별 갱신은 계속 |
| REQ-QA-03 | Codex 리뷰 결과 첫 줄 판정·심각도·파일:줄·수정 제안, 재리뷰 최대 2회 | CLAUDE.md 5절 | QA-01 | `.codex-out/TECH-02-test-strategy.md`, `.codex-out/TECH-02-impl-review.md` | 운영 중(태스크별 기록) |
| REQ-QA-04 | 치명적·높음 결함·결정성 오류 시 반영 보류, 예외는 사용자 승인 | CLAUDE.md 3절, WORKFLOW 8절 | QA-01, REL-01 | — | 운영 중(현재 보류 0건) |
| REQ-QA-05 | 실행 증거 없는 통과 금지, 테스트 상태 6종 구분 | CLAUDE.md 5절 | 전체 | 이 문서 1절 | 운영 중 |
| REQ-QA-06 | 리플레이 회귀 기반: 실제 전투의 틱별 상태·경제 이벤트·최종 결과 비교와 의도적 불일치 검출 | TASKS SIM-03 | SIM-03 | `attempt/regression/`(골든 R1~R3: 틱별 해시·결과·경제 원장·2회 재생·매 틱 불변식, 실패 주입 F1~F9, 갱신 가드) | **통과**(`3ea5077`, codex-main 재리뷰 2 통과). 실제 수치 골든은 BAL-01 이후 |
| REQ-QA-07 | 전체 게이트 CORE/ECON/DATA/STATE/UI 증거, 통합·출시 검토 | TASKS REL-01 | REL-01 | — | 의존성 차단 |

## 3. 태스크별 역추적 (TASK → REQ)

- 2절의 TASK 칸과 이 표는 양방향으로 일치해야 한다. 단 TECH-01·TECH-02 행은 **기초 증거를 제공한 태스크**이고, 그 밖의 행은 **제품 구현 책임 태스크**다.

| TASK | 담당 REQ | 현재 |
|---|---|---|
| TECH-01 | MAP-01(격자) | 완료 |
| TECH-02 | STATE-07·08·09·10, TOWER-07, ENEMY-03·05, WAVE-03·04·06, ECON-02·04·05·06·07·08·09·10, STATE-06·11 (기초·toy 수준) | 완료. 표의 `부분 통과` 행은 후속 태스크가 이어서 채움 |
| MAP-01 | MAP-01·02·03·05 | 완료 |
| DATA-01 | MAP-02, TOWER-02·03·04, ENEMY-01·02·07, WAVE-01·02·03·07, ECON-11 | 완료 |
| SIM-01 | STATE-01·03·04·05·06·08·11·12, WAVE-03·04·05·06, ECON-06·09·10 | 완료 |
| SIM-02 | TOWER-01·03·05~12, ENEMY-03~07, MAP-04, STATE-02 | 완료(`50b320b`, codex 리뷰 통과). 남은 부분은 BAL-01·UI-01(TOWER-09는 SIM-03에서 통과) |
| ECON-01 | ECON-01~11, MAP-03, STATE-03·05, WAVE-06 | 완료 |
| SIM-03 | STATE-09, QA-06 | 완료(`3ea5077`, codex 재리뷰 2 통과) |
| UI-01 | UI-01~11, MAP-04·05, ECON-07, STATE-06·11·14·16, WAVE-07 | 완료(`5c4ecfc`, claude-2 재리뷰 1 통과). 후속: SAVE-01 영구 저장, 실기기·DPR·아트 |
| SAVE-01 | STATE-12~16, UI-09·10 | 미착수 |
| BAL-01 | BALANCE-01·02, TOWER-01·02·05, WAVE-02, ENEMY-08 | 미착수 |
| DOC-01 | QA-01 | 완료 |
| DOC-02 | QA-02 | 완료(골격) |
| QA-01 | QA-03·04 | 운영 중 |
| REL-01 | QA-04·07 | 미착수 |

## 4. 테스트 책임 구분 (중복 방지)

- **규칙의 정답은 코어 단위 테스트가 소유한다.** 같은 규칙을 UI 테스트에서 다시 계산해 판정하지 않는다. UI 테스트는 (1) 코어 상태가 화면에 그대로 보이는가, (2) 금지 입력이 명령을 만들지 않는가, (3) **정상 선택·클릭이 올바른 종류·좌표·횟수의 명령으로 코어에 전달되고 그 결과가 화면·저장 피드백으로 이어지는가**(UI-01·SAVE-01의 계층 연동 책임)를 본다. 경제·전투 산식은 UI에서 재계산하지 않는다.
- **산식(helper) vs 규칙 적용:** `intmath`·`formulas` 테스트(TECH-02)는 계산식만 소유한다. 그 식이 올바른 시점·대상에 적용되는지는 SIM-01/02/ECON-01 테스트가 소유한다. 예: 환급 내림은 N13(산식) + ECON-01(강화 누적 actuallyPaid로 판매).
- **toy vs 실제 시뮬:** `sim/testing/toySim`은 TEST_ONLY다. toy 테스트 통과는 계약 수준 증거일 뿐 제품 규칙 통과로 세지 않는다(표에서 `부분 통과`).
- **리플레이:** 해시·정규화·종료 경계는 TECH-02 테스트가, 실제 전투 시나리오의 결정성은 SIM-03이 소유한다.
- **데이터 검증:** 사거리 순서·강화 비용 증가·Stage 1 등장 조건처럼 데이터로 판정 가능한 규칙은 DATA-01 검증기 테스트가 소유하고, BAL-01은 실제 값 후보가 검증기를 통과하는지만 확인한다.

## 5. 갱신 절차

1. 태스크 반영(main 병합) 때 claude-main이 해당 행의 테스트 위치·상태·커밋을 갱신한다.
2. 새 요구가 생기면 다음 번호로 행을 추가하고 근거(SPEC 절 또는 사용자 결정 날짜)를 적는다.
3. 태스크 테스트 전략(`.codex-out/<TASK>-test-strategy.md`)을 받으면 케이스 ID를 이 표의 테스트 위치에 `<TASK>/<ID>`로 연결한다.
4. codex-main 리뷰 때 이 표와 실제 테스트 파일의 대응을 표본 점검한다.
