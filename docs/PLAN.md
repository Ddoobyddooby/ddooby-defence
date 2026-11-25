# Ddooby-defence — PLAN v0.1

> Draft / 기술 계획 v0.1 · 2026-11-23 · 책임: claude-main(PM·개발 PL) · 기술 스택 사용자 확정 반영
> 제품 규칙은 [SPEC](../SPEC.md), 실제 태스크는 [TASKS](TASKS.md), 검토·반영 절차는 [WORKFLOW](WORKFLOW.md)를 따른다.
> **확정 스택: Next.js + TypeScript + Phaser**, 게임 규칙·경제·상태 전이는 순수 TypeScript 게임 코어로 분리. 초기 버전·프로젝트 설정·초기 폴더는 TECH-01에서 확정(9절 TBD-STACK). 아트 시각 방향은 ART-01 선택(`docs/DESIGN.md`). 경로 좌표·게임 수치·구현용 스프라이트 에셋·Lv별 외형·특성 표식·상세 색상·폰트·CI·배포 환경은 아직 확정하지 않는다.

## 1. 전제와 설계 선택

- 2026-11-23 확인: 새 GitHub 저장소 `Ddoobyddooby/ddooby-defence`, 기본 브랜치 `main`. 문서 초기화 전 빈 저장소로 확인됨.
- 대상 경험: 맵 전체가 보이는 가로형 16:9 기준 2D 타워디펜스 + 우측 HUD. **픽셀 치수와 최소 지원 화면 크기는 TBD**.
- **기술 스택 확정(사용자 승인):** **Next.js + TypeScript + Phaser**. Next.js는 페이지·스테이지 선택·우측 HUD 및 애플리케이션 UI를, Phaser는 맵·타워·적·투사체·VFX 렌더링과 게임 화면 입력을 담당한다. **순수 TypeScript 게임 코어**는 틱·전투·경제·결정성·게임 상태를 소유하며 Next.js/Phaser에서 분리한다.
- **계층 원칙:** Phaser는 화면 렌더링·입력 어댑터 역할이고 임의의 렌더 프레임 시간이나 Phaser 씬 상태가 경제 정산·승패·시뮬레이션의 기준이 되지 않는다. Next.js의 UI도 게임 코어 상태를 관찰하고 검증된 논리 명령을 전달한다.
- **구현 상세 (일부 확정):** Phaser 게임 인스턴스는 브라우저 클라이언트에서만 생성하고 Next.js 서버 렌더링 중 브라우저 API 접근을 피한다. 클라이언트 전용 컴포넌트·동적 로딩, Phaser 인스턴스의 생성/정리, HUD와 게임 상태의 단일 진실 원천은 claude-main이 구체 설계·검증한다. **TECH-01 확정:** 라이브러리 버전·App Router·npm·초기 폴더(9절 TBD-STACK), Phaser 초기화/정리 방식(클라이언트 `useEffect`에서 `import("phaser")`, unmount 시 `destroy(true)`). **미정:** HUD↔코어 상태 동기화 방식, 추가 모듈 폴더, 재도전·페이지 전환 시 생명주기 검증.
- **검증 명령 확정(TECH-01):** `npm run lint`·`npm run typecheck`·`npm run test`·`npm run build`. **배포·CI: 확인 필요.**
- 외부 계정·클라우드 백엔드는 MVP 요구 없음. 로컬 클리어 플래그 저장만 필수. 사용 도구·스토리지 API는 기술 검토 후 확정.
- 데이터/렌더/시뮬레이션 경계를 분리하고 **한 플레이 시도 동안 불변 콘텐츠 스냅샷**을 사용.

## 2. 기술 스택별 책임과 후보 모듈 구조 (초기 폴더·버전은 TECH-01 확정, 나머지 모듈 경로 미확정)

| 후보 영역 | 책임 | 계약 |
|---|---|---|
| content | StageMap, Wave, Tower, Enemy, Trait, Economy의 버전별 데이터 정의·검증 | 유효하지 않은 실제 Stage 데이터는 진입 차단 |
| sim/core (순수 TypeScript) | 논리 틱·상태 머신·엔티티 ID·명령 처리·승패 | Next.js/Phaser에 의존하지 않는 결정적 상태 전이; VFX/렌더 프레임에 의존 금지 |
| sim/combat (순수 TypeScript) | 타깃·사거리·발사·추적·명중·광역·둔화·적 이동 | `SPEC.md` 3~7절, Phaser 물리 엔진의 비결정적 결과를 진실 원천으로 사용하지 않음 |
| sim/economy (순수 TypeScript) | 설치·강화·판매·처치·완료 보상 원자 정산 | 이벤트 식별/중복 방지·실제 지출 기록; UI/Phaser와 독립 |
| render (Phaser) | 맵·타워·적·투사체·VFX 표현 및 게임 월드 포인터 입력 | 코어 상태의 렌더링·논리 명령 전달; 렌더 지연이 게임 정산에 영향 금지 |
| ui (Next.js/React) | 페이지·오른쪽 HUD·스테이지 선택·타워 상세·오버레이·오류 피드백 | 게임 코어 상태에서 표시값 파생, 허용 명령만 전달; 게임 규칙은 코어에서 재검증 |
| persistence | 클리어 플래그 저장·로드·실패·재시도 | 세션 성공과 영구 저장 성공을 분리 |
| test | 데이터 계약·단위·결정적 리플레이·UI·실패 주입 | 증거·콘텐츠 버전·첫 불일치 틱 기록 |

**Next.js + TypeScript + Phaser의 선택은 확정**됐지만 TECH-01에서 `src/app`·`src/game/core`·`src/game/phaser`만 생성했다. 나머지 모듈 이름(content·render·ui·persistence 등)은 후보 경계이며 아직 폴더가 없다. claude-main이 구현 전 담당 파일·상태 동기화 방식·클라이언트 생명주기를 구체화한다.

### 2.1 Next.js ↔ Phaser ↔ 순수 TypeScript 코어 데이터 흐름

```text
Next.js UI(HUD·메뉴) ──검증 대상 논리 명령──┐
                                         ▼
Phaser 입력(맵 클릭) ──논리 좌표/명령──▶ 순수 TypeScript game core
                                         │
                                         ├─ 결정적 tick·전투·경제·상태 전이
                                         └─ 불변/읽기 상태 스냅샷
                                                  │
                            ┌─────────────────────┴─────────────┐
                            ▼                                   ▼
                      Next.js UI 갱신                     Phaser 월드 렌더
```

- **상태 소유권:** 전투·골드·타워 점유·웨이브·승패는 코어가 판단하고, UI와 Phaser는 별도 진실 원천을 만들지 않는다.
- **입력:** Phaser의 픽셀 입력은 맵 좌표·격자 변환과 명령 적법성 검증을 거쳐 코어로 전달. HUD 조작도 동일한 코어 명령 경로를 사용한다.
- **프레임과 틱:** Phaser의 렌더 프레임/애니메이션은 결정적 논리 틱과 분리한다. 일시정지는 논리 틱과 VFX 모두 동결하되 구현 방법은 후속 기술 설계에서 결정한다.
- **라이프사이클:** Next.js에서 Phaser를 클라이언트 전용으로 초기화·해제하고, 페이지 전환이나 재도전 시 중복 게임 인스턴스·이전 이벤트 리스너 유입을 방지한다. 구체 구현 및 테스트는 후속 태스크에서 확정한다.

## 3. 데이터 모델 및 불변식

### 3.1 콘텐츠 데이터

- `StageMap`: stageId, 논리 열 18·행 10, 1개 spawn/base, 경로 waypoint, 통과 영역에 따른 reservedCells. 실제 좌표·경로 폭 TBD.
- `TowerType`: archer / ballista / mage / frost; Lv1 기본 스탯 + Lv2~4 증분. 발리스타 사거리 > 궁수 > 마법 > 서리.
- `TowerEconomy`: towerType별 설치 비용 + Lv2·3·4 강화 가격. 같은 타워는 순증가.
- `EnemyType`: normal / fast / heavy / swarm, 공통 기본 HP·이동속도·기지 피해.
- `EnemyTrait`: 없음 / controlResistance / hpBoost / speedBoost(최대 하나). HP·속도는 비율 보정, 저항은 둔화 계산에 적용.
- `Wave`: stageId·waveIndex·기획 의도 매트릭스와 실제 SpawnSegment 데이터. Segment는 상대 시작 시각, 개체 수, 간격, 기본 적 유형, 선택적 특성.
- `StageEconomy`: stage별 초기 골드, wave별 완료 보상. `EnemyReward`: 처치 보상 정책(특성 영향 여부 미정).
- 모든 숫자 필드의 범위·단위·정밀도·반올림 규칙은 **설계 검토 대상**. 현실적인 값을 임의로 채우지 않는다.

### 3.2 런타임 데이터

- `AttemptState`: attemptId, snapshotVersion, stageId, phase, wave, tick, gold, baseHP, towers, enemies, projectiles, activeDebuffs, scheduledSpawns, consumedEconomyEvents.
- `TowerState`: towerId, tile, type, level, targetingMode, **actuallyPaid**(해당 시도의 성공한 설치·강화 지출 누적).
- `EnemyState`: enemyId, spawnSerial, pathProgress, hp, immutableSpawnStats, active slow per source.
- `ProjectileState`: 발사 틱, 공격 스냅샷, 잠금 타깃 또는 고정 광역 충돌 좌표, 게임플레이 생존 상태.
- `ProgressState`: clearedStageFlags만 로컬 저장. available/unlocked 상태는 플래그로 파생.
- 기술 계약: tickDuration·시간 정밀도·동일 틱 복수 입력 순서·HP 비율 연산·반올림은 `docs/SIM-CONTRACT.md`(TECH-02 초안). 격자 경계 귀속·경로 접촉은 MAP-01 미정.

### 3.3 검증

1. 저장소/콘텐츠 로드 시 3개 StageMap와 15개 Wave를 포함한 데이터 계약·참조 검증.
2. 스테이지 선택/진입 시 해당 StageMap·경제·5개 웨이브 재검증. 고정 spawn segment 일정 전개 및 시각·원본 순서로 정렬.
3. 오류 스테이지는 선택 카드에 콘텐츠 오류 상태를 표시하고 플레이를 차단. 다른 정상 스테이지는 기존 해금 범위에서 접근 허용. 자동 대체 데이터 없음.
4. 실행 중 경제·타워 중복 점유·웨이브 상태·attemptId·ID/이벤트 유일성을 핵심 불변식으로 감시/테스트.
5. 오류·경계 상황은 중복 이벤트, 잘못된 명령, stale tower ID, 저장 실패, 동일 틱 승패 등을 주입하여 검증.

## 4. 결정적 전투·상태 흐름

### 4.1 틱 단계 (순서 고정)

```text
1 유효 플레이어 명령 적용
2 둔화 만료
3 예약 적 생성(예약시각 → 원본순서 → 적 ID)
4 타워 발사 및 투사체 충돌
5 적 사망 + 처치 골드
6 생존 적 이동 + 기지 도달/피해
7 패배 우선 → 유효 웨이브 완료·보상 → 마지막 웨이브 승리
8 정리/다음 상태 전환
```

새 적은 같은 틱에 피격 가능. 현재 틱 #1 입력에서 이후 #5 획득 예정 골드를 사용할 수 없다. 패배와 완료가 동시라면 패배.

### 4.2 전투 계산

- 유클리드 거리로 사거리 경계 포함, LoS 없음. 타깃은 선두/후미/가까운/강한, 확정된 경로 진행도·스폰 순번·ID 동률 순서 사용.
- 단일 탄환은 타깃·스탯 스냅샷 고정, 타깃 소멸/기지 도달이면 게임플레이 탄환 즉시 취소. 명중과 TTL 동시라면 명중 우선.
- 마법형 광역은 고정 충돌 좌표 기준 범위 피해(원래 타깃 사망과 독립). 반경 안 적은 타워 사거리 밖이어도 피격.
- 둔화는 출처별 독립 유지, 같은 출처 갱신, 최고 실효 강도 적용; 만료 후 다른 효과 복귀. 판매 후 잔존 둔화 유지. `effectiveSlow = baseSlow*(1-controlResistance)`.
- 모든 능력치·TTL·둔화 계수는 아직 미정.

### 4.3 상태 머신

`stageSelect → preparation → combat → (preparation 반복) → victory/defeat → stageSelect/retry`.
별도 `paused` 상태/오버레이는 게임 시계를 멈추고 이전 게임 화면 상태를 보존한다.

- 준비에서 조기 시작 또는 타이머 종료는 1회성 전환; 다른 웨이브 시작 전 기존 웨이브의 전원 생성 완료+생존자 0이 선행.
- 설치 1회 성공 시 타워 선택 모드 종료. 강화는 단일 원자 명령. 판매는 준비에서만 확인+재검증.
- 준비→전투 시 판매 확인 취소, 다른 허용 선택 상태 유지. 일시정지 중 조작 금지, 재개 후 명령 유효성 재평가.
- 결과 화면에서는 게임플레이 불변, 제한된 VFX 잔존 허용. retry는 런타임 상태 초기화하고 clearedStageFlags는 보존.

## 5. 경제 정산·저장

- 골드는 정수; stage별 독립 초기값, 이월 없음.
- 설치: 검증→골드 차감+타워 생성+격자 점유 원자적 처리. 강화: 검증→골드 차감+레벨 상승+actuallyPaid 원자 처리.
- 판매: 준비에서 확인 후 조건 재검증, `refund=floor(actuallyPaid*refundRate)`를 **마지막에 한 번만 내림**하고 타워 제거/환급을 원자 처리.
- 처치/완료 보상은 유효 이벤트당 한 번; 이벤트 key에는 시도·유형·대상 유일성 포함 권장. 정확한 key 포맷 기술 결정 필요.
- 완료 보상은 플레이어가 패배하지 않은 경우에만; 마지막 Wave의 정상 보상 후 승리.
- 클리어 플래그 로컬 저장은 실패 가능. 성공 시 세션 해금 적용, 저장 실패 오류·재시도, 새로고침 시 데이터 손실 가능 알림. 실패한 재플레이로 과거 클리어 취소 금지.
- 처리 성능·메모리: 동시 적/탄환·VFX·데이터량은 미정. 실측 후 목표 설정; 성능 수치를 지어내지 않는다.

## 6. UI·시각적 경계

- 맵: 정사각 논리 타일 18×10, 비율 고정 및 화면 크기에 맞춰 축척. 오른쪽 HUD는 맵과 분리.
- 입력: Phaser의 맵 화면 좌표를 실제 맵 콘텐츠 경계에서만 논리 격자로 역매핑하고 검증된 명령을 코어에 전달; Next.js HUD·레터박스·맵 바깥 클릭으로 설치 명령을 생성하지 않는다. 격자 경계 클릭 귀속은 TBD.
- HUD: gold/baseHP/stage/wave/phase 상시; 타워 4종 선택, 준비 타이머·조기 시작, 전투 spawn progress·alive count, 타워 상세/강화/판매/타깃.
- 게임 결과: 승패·도달 wave·HP·재시도·선택·다음 Stage 조건부 표시. 잠금/해금/완료/콘텐츠 오류 카드 및 저장 상태.
- 스프라이트·타일·맵·성·몬스터의 비주얼은 **별도 디자이너 시안에 대해 사용자 선택 후** 반영. 디자이너 원본 및 출처 추적은 WORKFLOW 참조.

## 7. 검증·측정·품질 게이트

### 7.1 테스트 피라미드

1. 데이터 계약·정적 스케줄 검사.
2. 핵심 로직 단위 및 속성/경계 테스트.
3. 결정적 tick 시뮬레이션·경제 ledger·상태 비교.
4. UI·입력·저장 실패 연동 테스트.
5. 수동 플레이·가독성·타워 전략·체감 난이도 테스트.

- 시나리오: **기본 / 상성 / 경계**. 웨이브 단위, Stage별 누적 경제, 15 Wave 구성 검토.
- 동일 코드·콘텐츠·입력과 초기 상태로 tick별 HP·gold·towers·enemies·projectiles·wave·events 비교. 첫 불일치 tick/필드 진단. 순수 VFX frame 동일성은 필수 아님.
- 변경마다 핵심 smoke + 영향받는 정상/경계/예외 회귀. 주요 통합·반영 전 전체 필수 QA.
- 정량 밸런스 기준 및 값은 **미정**, 사용자의 후보 승인과 QA 근거 전에는 통과 판정 불가.

### 7.2 추적 및 게이트

| QA 영역 | 연결 |
|---|---|
| 지도·웨이브 | MAPD-01~46, WAVD-01~15, VAL-01~16, DATA-01~15 |
| 전투·상태 | INT-01~15, ENMD-01~18, BALD-01~10 |
| 경제 | ECOD-01~20 |
| UI·HUD | UI-01~88, HUD-01~16 |
| 콘텐츠·밸런스 | WBL-01~18, BALX-01~18, BAPR-01~12 |
| 운영·추적 | GATE-01~12, COREG-01~16, TSTR-01~18, DEFQ-01~16, DOCQ-01~16, FINQ-01~16 |

QA 상위 게이트는 **CORE/ECON/DATA/STATE/UI**. 설계됨/실행 대기/의존성 차단/통과/실패/해당 없음 별도 관리. 치명적·높음 결함은 근거와 해제 조건을 기록한 **반영 보류** 대상. 직접 예외 승인권은 사용자에 있다.

**프레임워크는 Next.js·TypeScript·Phaser로 확정.** 버전·검사 명령·테스트 도구(Vitest)는 TECH-01에서 확정(TBD-STACK 참조), CI는 미정이다. QA ID가 문서에 있다는 이유로 자동 테스트가 존재한다고 간주하지 않는다.

## 8. 배포·복구 방향 (미승인)

- **[MOB-01, 2026-11-25] Android 앱:** `output: "export"` 정적 빌드(`out/`)를 Capacitor 8.6.0(`capacitor.config.ts`, `android/`)으로 APK에 포장. 가로 고정(`sensorLandscape`)·몰입 전체 화면(`MainActivity`). 빌드 `npm run android:apk`(JDK 21·`ANDROID_HOME` 필요), 설치 `npm run android:install`. 정적 내보내기와 충돌하는 `cacheComponents`·`partialPrefetching`은 제거. 서명·스토어 배포·iOS는 미정.
- **Next.js 기반 웹 배포**를 전제로, 실제 사용하는 Next.js 기능과 라우팅·데이터 요구에 맞춰 정적 출력 또는 서버 실행 배포를 검토한다. 배포 방식·호스팅은 **미승인**이다. 빌드 산출물 버전 식별과 롤백 가능성을 고려한다.
- 실제 플랫폼, 호스팅, 백업/복구, 외부 비용, CI/CD, 보안 헤더 등은 환경 확정 후 설계.
- 배포 전 콘텐츠 검사, 스모크, 필수 회귀, 사용자 승인·QA 보류 해제 확인. 저장된 로컬 진행 기록의 기존 버전 처리 정책은 별도 기술 검토 필요.
- 사용자 명시적 범위 밖의 배포·원격 DB 작업 금지.

## 9. 의존 순서·미정 기술 계약

| 우선 순서 | 산출물 | 다음 작업 전 필수 점검 |
|---|---|---|
| 1 | v0.1 SPEC·PLAN·TASKS·운영 문서 | 사용자 결정과 템플릿의 충돌·누락·미정 표기 검토 |
| 2 | 별도 디자이너 시안 | 선택 전에는 아트 확정값 없음 |
| 3 | 확정 스택의 실행 환경 구체화 | Next.js·TypeScript·Phaser 버전·프로젝트 구조·개발/테스트 명령·담당 파일 검토 |
| 4 | 맵 및 데이터 계약 구현 | geometry 경계·타임 정밀도·스키마 검사 |
| 5 | 결정적 core/경제/전투 | 동시 이벤트·스냅샷·리플레이 증거 |
| 6 | UI·저장·실제 콘텐츠 후보 | 화면·경제·전투 통합 QA |
| 7 | 통합 밸런스 검증·수치 승인 | 실제 Stage 데이터·사용자 최종 승인 |
| 8 | 전체 QA 및 반영 검토 | CORE/ECON/DATA/STATE/UI 근거와 잔여 위험 |

| 미정 ID | 기술 검토 질문 |
|---|---|
| TBD-STACK | **스택 선정 완료: Next.js + TypeScript + Phaser + 순수 TypeScript 코어.** TECH-01(2026-11-23) 확정: Next.js 16.4.6 App Router·`src/`·Tailwind CSS 4, Phaser 4.2.1, Vitest 5.1.1, npm(Node 24). 구조 `src/app`(라우트)·`src/game/core`(순수 TS, ESLint로 next/react/phaser import 금지)·`src/game/phaser`(클라이언트 전용 동적 import, unmount 시 destroy). 명령 `npm run lint`·`typecheck`(`next typegen && tsc --noEmit`)·`test`(`vitest run`)·`build`. **미정:** CI, 배포 환경(정적 export 여부) |
| TBD-SIM | **TECH-02 초안 `docs/SIM-CONTRACT.md`:** 틱 50ms·정수 고정소수점(mt·bp)·비율 반올림(사용자 확인 2026-11-24), 명령 seq 순서, 시도별 ID·경제 이벤트 키, 정규 스냅샷·FNV-1a 64 해시 리플레이. codex-main 테스트 전략 대기 |
| TBD-MAP | **결정(2026-11-24):** 가로·세로 폭 1칸 경로, 경계 클릭은 오른쪽·아래 칸, 3개 맵 후보 승인. 기하 계약은 `docs/SIM-CONTRACT.md` 10절 |
| TBD-PROJECTILE | 투사체 이동·명중·TTL·VFX TTL |
| TBD-ENEMY | HP 비율 반올림/오버플로·저항률 경계 |
| TBD-ECON | 정수 범위, 환급률 표현, 적 특성의 kill reward 영향 |
| TBD-UI | ~~렌더 해상도·HUD 크기·최소 지원 화면~~ `docs/UI-CONTRACT.md` 3절(최소 640×320 가로(MOB-01에서 800×360에서 낮춤), HUD 폭 비율·정수 타일, 사용자 결정 2026-11-25) |
| TBD-ART | 사용자 승인된 시안·저작권/출처 처리 |

내용 확정 권한 및 항목별 완료 조건은 `SPEC.md` 12절을 참조.
