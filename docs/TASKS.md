# Ddooby-defence — TASKS v0.1

> 상태: **태스크 계획 v0.1, 진행 중** (2026-11-23 작성, 진행 현황은 §0) · 관리: claude-main(PM·개발 PL)
> 제품 규칙은 [SPEC](../SPEC.md), 기술 선택·검증 방향은 [PLAN](PLAN.md), 팀 운영은 [WORKFLOW](WORKFLOW.md)를 따른다. **SPEC > PLAN > TASKS**.
> 이 파일의 체크박스는 완료 기준을 실제 확인하기 전까지 모두 `[ ]`. 탭·파일 담당자는 claude-main이 실제 개발 환경을 확인하고 확정하며, 아래의 담당·파일 예시는 배정 완료가 아니다.

## 0. 진행 현황·다음 작업 (세션 인계)

> 다른 PC·새 세션에서는 이 섹션부터 읽는다. 세션을 마칠 때 claude-main이 갱신한다.

- **최종 갱신:** 2026-11-26, `main` 기준
- **완료:** DOC-01, DOC-02(추적표 골격), TECH-02, MAP-01, DATA-01, SIM-01, ECON-01(결정성 계약·기초 모듈), ART-01 시안 선택(Stage 1 v2·Stage 2·Stage 3), TECH-01 스캐폴딩(Next.js 16 + TS + Phaser 4, 검증 명령은 `README.md`), 전체 문서 탭 이름 통일
- **사용자 결정:** TECH-01은 codex-main 독립 리뷰 없이 `main` 반영으로 마무리(2026-11-24)
- **다음 작업 순서 (2026-11-24 사용자 확정):**
  1. ~~DOC-01~~ 완료(2026-11-24, 재리뷰 1 통과). 문서 상호검증: 스택 확정 후 남은 "미정·확인 필요" 문구 정리 + codex-main 문서 QA (ART-01·TECH-01이 DOC-01 선행 없이 진행된 점 보완)
  2. ~~TECH-02~~ 완료(2026-11-24). 계약 `docs/SIM-CONTRACT.md`(재리뷰 2 통과) + 기초 모듈 `src/game/core/sim/`(claude-1 구현, 재리뷰 1 통과)
  3. ~~DOC-02~~ 완료(2026-11-24). 추적표 `docs/TRACE.md`, 태스크 반영 때마다 해당 행 갱신
  4. ~~MAP-01~~ 완료(2026-11-24, 3맵 후보·기하 모듈). ~~DATA-01~~ 완료(2026-11-24, 스키마·검증기). ~~SIM-01~~·~~ECON-01~~ 완료(2026-11-24). ~~SIM-02~~·~~SIM-03~~ 완료(2026-11-25, 계약 14·15절). ~~UI-01~~ 완료(2026-11-25, `docs/UI-CONTRACT.md`, 화면에서 임시 수치로 플레이 가능). ~~MOB-01~~ 완료(2026-11-25, Android APK). ~~MOB-02~~ 완료(2026-11-26, 모바일 HUD·메뉴·뒤로가기). ~~SAVE-01~~ 완료(2026-11-26, 클리어 기록 localStorage). ~~MOB-03~~ 완료(2026-11-26, 좌우 대칭 여백). ~~ART-02~~ 완료(2026-11-26, 앱 아이콘 C안). ~~UI-02~~ 완료(2026-11-26, 배속·정수 초·HUD 여백). 진행 중: BAL-01(실제 수치 후보, `feat/bal-01`)
- **운영 흐름:** 사용자는 claude-main 탭에서 지시 → 코딩 claude-1/2, QA·리뷰 codex-main, 디자인 codex-design (WORKFLOW 2~4절). `main` 반영·push는 claude-main 탭에서 사용자 직접 확인 후
- **저장소 경로(2026-11-24 변경):** `~/Desktop/Ddooby/projects/ddooby-defence` (이전 `.../ddooby-defence/ddooby-defence` 이중 폴더 정리, 사용자 요청)
- **구현 탭 작업 방식:** claude-1/2는 공유 폴더가 아닌 전용 git worktree와 작업 브랜치에서 작업한다. worktree는 형제 폴더 `../ddooby-defence-<task>`(예: `ddooby-defence-sim-02`)에 만들고, 병합 후 worktree·브랜치 삭제(사용자 결정 2026-11-24)
- **브랜치 정리:** `chore/tech-01-scaffold`·`docs/doc-01-crosscheck` 로컬·원격 삭제 완료(2026-11-24, 사용자 승인)
- **저장소 밖 자료:** 선택 전 Stage 1 구판 PNG와 `.omc/`는 원래 PC에만 있음(의도적 미포함)

## 표기·검증 원칙

- **미정:** 제품·수치·시안·기술 선택이 승인되지 않음. **의존성 차단:** 필요한 입력 없이 시험 불가. **실패:** 실제 실행 후 기대값 불충족. **통과:** 실행 증거 필수.
- 각 태스크에 SPEC의 `REQ-*` → 관련 QA 시리즈 → 실제 테스트 결과를 연결한다. 구현 코드를 만들거나 검증하기 전에는 완수를 선언하지 않는다.
- QA 전문 역할: 테스트 전략 / 실패 분석·트리아지 / 독립 리뷰 중 하나. 미실행 리뷰를 통과로 간주하지 않는다.
- **순서 고정:** 08-10 최종 기획 검토 → 6개 v0.1 문서 → **별도 디자이너 시안 및 사용자 선택** → 구현과 실제 콘텐츠 수치 후보·검증·승인. 문서 v0.1은 구현 완료가 아니다.

## 1. 문서·최종 기획 인계

- [x] **DOC-01 — 문서 v0.1 상호검증** (2026-11-24 codex-main 재리뷰 1 통과: `.codex-out/DOC-01-review.md`)
  - 담당: claude-main 조정, codex-main 독립 문서 QA
  - 선행: 08-1~08-10 기획 결정
  - 결과: `AGENTS.md`, `CLAUDE.md`, `SPEC.md`, `docs/PLAN.md`, `docs/TASKS.md`, `docs/WORKFLOW.md` 대조
  - QA: DOCQ-01~16, FINQ-01~16. 확정 규칙 누락·상충·자리표시자·실제 미정값 오염 점검
  - 완료 조건: 6개 문서 존재·참조 유효·실제 충돌 없음·미정 의존성 기록·검토 근거 보존
  - **현재:** 문서 작성 작업과 별개로 실제 실행 QA·시각 검증은 아직 미실행
  - **진행(2026-11-24, 브랜치 `docs/doc-01-crosscheck`):** claude-main 1차 대조 완료. 링크·앵커 전부 유효. 스택(TECH-01)·아트 방향(ART-01) 확정 이후 남은 "미정·확인 필요" 표기 20곳을 6개 문서에서 갱신. codex-main 리뷰(`.codex-out/DOC-01-review.md`) 지적 있음 F1(보통)·F2(낮음) → `1012b86` 반영 → 재리뷰 1 **통과**

- [x] **DOC-02 — 요구사항 ↔ QA ↔ TASK 세부 추적 매트릭스 확정** (2026-11-24 골격 v0.1, 이후 태스크마다 갱신)
  - 담당: claude-main / codex-main
  - 선행: DOC-01
  - 결과: SPEC의 요구사항 범주 ID를 개별 테스트·태스크까지 연결하는 표(위치 claude-main 확정)
  - QA: GATE-01~12, DOCQ-05~08, FINQ-08
  - 완료 조건: 핵심 경로 누락 없음, 잘못된 ID 참조 없음, 중복/유사 테스트 책임 구분
  - 진행(2026-11-24, 브랜치 `docs/doc-02-trace`): `docs/TRACE.md` 골격 v0.1 — SPEC 규칙을 개별 REQ 79행으로 분해, TASK·QA 시리즈·실제 테스트 위치·상태 연결, TASK 역추적, 테스트 책임 구분. TECH-02 테스트 연결 채움. codex-main 리뷰 F1~F4(보통2·낮음2) 반영 → **재리뷰 1 통과**(@`141d0ff`, `.codex-out/DOC-02-review.md`)

## 2. 디자인 시안 (v0.1 문서 이후)

- [x] **ART-01 — 별도 디자이너 탭 초기 시안** (2026-11-23 사용자 선택 완료: `docs/DESIGN.md`)
  - 담당: codex-design(별도 탭); 최종 선택: 사용자
  - 선행: DOC-01 및 문서 v0.1 사용자 검토
  - 범위: 판타지 2D 고정 경로에 맞는 맵·타워 4종·몬스터 4종·성·HUD 시각 콘셉트
  - 결과: 원본 및 `.codex-out/ART-01-image.md`(파일 목록·사용처·프롬프트 요약·생성일·출처)
  - 완료 조건: 사용자 시안 선택/수정 방향 명시, 미승인 시안의 구현 사용 금지
  - **주의:** 시각 방향만 선택됨. 색상·폰트·픽셀 치수·구현용 스프라이트 에셋은 현재 미정

## 3. 기술 기반과 환경 결정

- [x] **TECH-01 — 기술 스택·실행 환경 제안·확정** (2026-11-24 `main` 반영, codex-main 리뷰 생략은 사용자 결정)
  - 담당: claude-main; 제품/운영 제약 확인: 사용자
  - 선행: DOC-01
  - 범위: 확정 스택(Next.js + TypeScript + Phaser + 순수 TS 코어)의 프로젝트 초기화, lint/typecheck/test/build 명령, CI·호스팅은 후속 결정, 접근성·성능 목표
  - 진행(2026-11-23, 브랜치 `chore/tech-01-scaffold`): 스캐폴딩 및 `npm run lint`/`typecheck`/`test`/`build` 실제 실행 exit 0, 브라우저에서 18×10 Phaser 캔버스 1개 렌더 확인. CI·배포 미정, Codex QA 리뷰 미실행
  - QA: COREG-01, TSTR-01, GATE-05
  - 완료 조건: 결정/제안 구분, 설치·빌드·테스트 명령을 실제 실행해 확인

- [x] **TECH-02 — 결정적 수치·시계·명령 순서 계약** (2026-11-24 `main` 반영)
  - 담당: claude-main 설계; codex-main 테스트 전략
  - 선행: TECH-01
  - 범위: tick 길이, 시각 비교/라운딩, 동일 tick 다중 명령 순서, 적 ID·명령 ID·경제 이벤트 키, HP 비율 보정 반올림, 직렬화·해시
  - QA: DATA-01~15, INT-01~15, TSTR-05~12
  - 완료 조건: 결정적 테스트 케이스로 동일 입력 동일 상태 확인
  - 진행(2026-11-24, 브랜치 `docs/tech-02-contract`): 계약 초안 `docs/SIM-CONTRACT.md` 작성. 사용자 확인: 틱 50ms·정수 고정소수점·비율 반올림(환급은 SPEC 내림 유지). codex-main 테스트 전략(69개 케이스, `.codex-out/TECH-02-test-strategy.md`) 및 계약 리뷰: 원리뷰 C1~C5·재리뷰 1 RR1-F1~F3 반영, **재리뷰 2 통과**(@`02bb1b9`). 구현(claude-1, worktree `wt-tech-02-core`·브랜치 `feat/tech-02-core`): `src/game/core/sim/` 기초 모듈·ESLint 금지 규칙·장난감 리플레이 테스트, lint/typecheck/test(224 passed)/build exit 0. codex-main 구현 리뷰 I1·I2(보통) 수정 후 **재리뷰 1 통과**(@`f8f59b1`, `.codex-out/TECH-02-impl-review.md`). 전투 연결 케이스(T09·Q02)와 P1/P2(어댑터·기기)는 SIM-01/02 이후

- [x] **MAP-01 — StageMap·경로 예약 영역 계약과 후보** (2026-11-24 `main` 반영)
  - 담당: claude-main 조정, 구현 claude-1(worktree `wt-map-01`, 브랜치 `feat/map-01`); 사용자 실제 맵 후보 승인
  - 선행: TECH-01, TECH-02
  - 범위: 18×10, waypoint, spawn/base, path width, reserved tile, 경계 접촉/클릭 귀속
  - 사용자 결정(2026-11-24): 가로·세로 폭 1칸 경로, 경계 클릭은 오른쪽·아래 칸, ART-01 시안 기반 3개 맵 후보(Stage 2·3은 35칸 이상으로 연장) 승인. 기하 계약 `docs/SIM-CONTRACT.md` 10절
  - 결과: `src/game/core/map/`(검증·설치 가능·진행도→위치·좌표→칸), `src/game/content/stageMaps.ts`(3맵 후보). lint/typecheck/test(291 passed)/build exit 0. codex-main 리뷰 F1(소수 tile 경계)·F2(sparse 배열) 보통 2건 수정 → **재리뷰 1 통과**(@`42b233d`, `.codex-out/MAP-01-review.md`)
  - QA: MAPD-01~46, VAL-01~16, UI 좌표 검증
  - 완료 조건: 세 스테이지 모두 유효한 후보 데이터·검증 증거

- [x] **DATA-01 — 데이터 스키마·15개 웨이브 검증기** (2026-11-24 `main` 반영)
  - 담당: claude-main 조정, 구현 claude-1(worktree `wt-data-01`, 브랜치 `feat/data-01`)
  - 선행: TECH-02, MAP-01의 데이터 계약
  - 범위: 타워·적·특성·스테이지 경제·SpawnSegment, 전체 15 Wave 사전 검사와 진입 시 재검사, 오류 격리
  - 계약: `docs/SIM-CONTRACT.md` 11절(스키마·기술 상한·교차 규칙·오류 격리·웨이브 전개). 사용자 결정(2026-11-24): 사거리 순서는 같은 레벨끼리 비교. 실제 수치는 미승인 → 테스트는 `TEST_ONLY` 데이터
  - 결과: `src/game/core/content/`(검증·격리·진입 재검증·스테이지 해시·웨이브 전개). lint/typecheck/test(356 passed)/build exit 0. codex-main 리뷰 F1~F3·C1·C2 → 재리뷰 1 RR1-F2a·F2b → **재리뷰 2 통과**(@`ceded17`, `.codex-out/DATA-01-review.md`)
  - QA: WAVD-01~15, VAL-01~16, WBL-01~18, COREG-07~08
  - 완료 조건: 정상/누락/중복/역순/오류 데이터의 예상 차단 및 결정적 전개 검증

## 4. 핵심 게임 로직

- [x] **SIM-01 — 시도 상태·스테이지·웨이브 상태 머신** (2026-11-24 `main` 반영)
  - 담당: claude-main 계약(`docs/SIM-CONTRACT.md` 12절), 구현 claude-1(worktree `wt-sim-01`, 브랜치 `feat/sim-01`)
  - 선행: TECH-02, DATA-01
  - 범위: prep/combat/pause/result, spawn/clear, attempt snapshot, 8단계 틱
  - QA: INT-01~15, COREG-02, COREG-09~10, TSTR-04
  - 완료 조건: 동일 틱 동시 이벤트·패배 우선·재도전 초기화 테스트 통과
  - 결과: `src/game/core/attempt/`(createAttempt·8단계 틱·확장 지점 훅·리플레이 연결), 스테이지 `baseHp` 필드 추가. lint/typecheck/test(419 passed)/build exit 0. codex-main 리뷰 F1~F4(훅 수명·step 중 pause·명령 롤백·생성 경로) 수정 → **재리뷰 1 통과**(@`3ff5742`, `.codex-out/SIM-01-review.md`). 남은 연결: 타워·투사체·둔화 상태와 스냅샷 필드는 SIM-02·ECON-01에서 코어에 추가

- [x] **SIM-02 — 타워·적·타깃·투사체·둔화** (2026-11-25 `main` 반영)
  - 담당: claude-main 계약(`docs/SIM-CONTRACT.md` 14절), 구현 claude-1(worktree `../ddooby-defence-sim-02`, 브랜치 `feat/sim-02`). 사용자 결정(2026-11-24): 설치 틱 즉시 발사 가능, 4단계 HP 0 적 즉시 사망 취급, 강화 시 남은 대기 유지
  - 선행: SIM-01, DATA-01
  - 범위: 4타워·3강화·4적·3특성, 타깃 4종, ST·AoE 발사/명중, slow source 상태
  - QA: BALD-01~10, ENMD-01~18, INT-01~15, BALX-03~08
  - 완료 조건: 타워 역할·발사 스냅샷·저항·중첩·만료·VFX/게임 상태 분리 검증
  - 결과: 코어가 2·4·6·8단계 전투 직접 처리(투사체·발사·타깃·둔화), `content/levelStats.ts`, 이벤트 6종, `expireSlows`·`enemySpeed` 훅 제거(`fire`는 TEST_ONLY), `ATTEMPT_CODE_VERSION` attempt-v3. lint/typecheck/test(472 passed)/build exit 0(claude-main 재실행). codex-main 독립 리뷰 **통과**(@`50b320b`, `.codex-out/SIM-02-review.md`, 롤백·저장 순서 교란·Lv4 누적 보강 검증 포함). 남은 부분: 실제 수치 BAL-01, VFX 잔상 UI-01, 발사 후 타깃 변경 전용 회귀 SIM-03

- [x] **ECON-01 — 원자적 경제 거래와 보상** (2026-11-24 `main` 반영)
  - 담당: claude-main 계약(`docs/SIM-CONTRACT.md` 13절), 구현 claude-1(worktree `wt-econ-01`, 브랜치 `feat/econ-01`). 사용자 결정(2026-11-24): 설치·강화는 준비·전투 모두, 판매는 준비만
  - 선행: SIM-01, DATA-01
  - 범위: 설치·강화·판매, actuallyPaid, 환급 한 번 내림, kill/wave award exactly-once, stage 독립 골드
  - QA: ECOD-01~20, COREG-05~06, BALX-09~12
  - 완료 조건: 실패·중복·동시 조건·retry 케이스에서 경제·점유 불변식 만족
  - 결과: 시도 코어가 build·upgrade·sell·setTargeting 직접 처리, 스냅샷 `towers`, 명령 훅 제거, `ATTEMPT_CODE_VERSION` attempt-v2. lint/typecheck/test(439 passed)/build exit 0. codex-main 리뷰 F1(음수 좌표 접수) 수정 → **재리뷰 1 통과**(@`cc4059a`, `.codex-out/ECON-01-review.md`)

- [x] **SIM-03 — 결정적 리플레이·실패 주입·회귀 기반** (2026-11-25 `main` 반영)
  - 담당: claude-main 계약(`docs/SIM-CONTRACT.md` 15절), 구현 claude-1(worktree `../ddooby-defence-sim-03`, 브랜치 `feat/sim-03`), codex-main 독립 리뷰
  - 선행: SIM-01, SIM-02, ECON-01
  - 범위: code/content version + input sequence, tick별 핵심 상태·경제 이벤트·최종 결과 비교, 최초 불일치 탐색
  - QA: DATA, INT, TSTR-05~16, COREG-13~14
  - 완료 조건: 정합/의도적 불일치 테스트의 재현 근거와 자동 검증 결과
  - 결과: 기록 생성기 `attempt/record.ts`(미적용 명령 보존), 골든 회귀 `attempt/regression/`(R1 승리·R2 패배·R3 전투 중, 틱별 해시·결과·원장, `npm run golden:update` + 입력 정의 기반 갱신 가드·원자적 갱신), 실패 주입 F1~F9, 공유 불변식 `testing/invariants.ts`, REQ-TOWER-09 전용 테스트. 코어·`ATTEMPT_CODE_VERSION`(attempt-v3) 무변경. lint/typecheck/test(542 passed)/build exit 0(claude-main 재실행). codex-main 리뷰 F1(높음·갱신 가드 우회)·F2(보통·finish 무효 기록) → 재리뷰 1 RR1-F1(높음·구형식 골든 우회) → **재리뷰 2 통과**(@`3ea5077`, `.codex-out/SIM-03-review.md`). 남은 위험: 골든 JSON 직접 위조는 가드로 구분 불가(diff 리뷰 몫), `golden:update`는 POSIX 셸 전용

## 5. UI·저장·콘텐츠 수치

- [x] **UI-01 — 게임 화면·격자 입력·HUD** (2026-11-25 `main` 반영)
  - 담당: claude-main 계약(`docs/UI-CONTRACT.md`), 구현 claude-1(worktree `../ddooby-defence-ui-01`, 브랜치 `feat/ui-01`), 리뷰 claude-2(codex-main 한도 초기화 전까지 사용자 지시 2026-11-25). 사용자 결정(2026-11-25): 단순 도형 자리표시, 한국어, 모바일 가로(800×360)까지
  - 선행: TECH-01, MAP-01, SIM-01, ECON-01, ART-01(선택 자산 연결 시)
  - 범위: 우측 HUD, 선택·설치·업그레이드·판매 확인·타깃, prep/combat/pause/result, 스테이지 카드·오류
  - QA: UI-01~88, HUD-01~16, COREG-12
  - 완료 조건: 논리 좌표 매핑·실제 게임 상태와 HUD 일치·금지 상태 입력 무효 검증
  - 결과: 계약 `docs/UI-CONTRACT.md`. 세션 계층 `src/game/session/`(시간 50ms·최대 5틱·복귀 첫 입력 폐기, 명령·거부 피드백, UI 상태, hudView, 레이아웃, 세션 메모리 진행), Phaser 단순 도형 렌더·DOM 좌표 입력, React HUD·오버레이·스테이지 선택(한국어), 개발용 임시 수치 `content/devBundle.ts`(DEV_PLACEHOLDER). 코어 무변경. lint/typecheck/test(625 passed)/build exit 0(claude-main 재실행), ego-browser 시나리오·1280×720·800×360 스크린샷(저장소 밖 `../ddooby-defence-ui-01-shots/`). 리뷰는 codex-main 한도로 claude-2 대행: 원리뷰 보통1·낮음7 → F1~F6 수정 → **재리뷰 1 통과**(@`5c4ecfc`, `.codex-out/UI-01-review.md`). 후속: F7 DPR 해상도·실제 스프라이트(아트), F8 브라우저 전용 코드 E2E, 실기기 터치·모바일 innerHeight<360, scene.ts 격자 상수 하드코딩(낮음)

- [x] **MOB-01 — Android 앱(APK) 포장** (2026-11-25 `main` 반영)
  - 담당: claude-main(사용자 요청 2026-11-25: "애초에 모바일 게임으로 생각하고 시작"). SPEC 1절 플랫폼을 Android 앱으로 정정
  - 범위: Next 정적 내보내기, Capacitor 8.6.0 Android 프로젝트, 가로 고정·몰입 전체 화면, 빌드·설치 스크립트, 실기기 확인
  - 결과: `npm run android:apk`로 debug APK(약 4.7MB) 빌드, Galaxy A16(SM-A166L)에 `adb install` 설치·실행 확인. 실기기에서 최소 뷰포트 800×360 미달 안내가 떠서 640×320으로 낮춤(UI-CONTRACT 3절). 스크린샷 저장소 밖 `../ddooby-defence-mob-01-shots/`
  - 남은 것: 실기기 전체 플레이·터치 검증(사용자 직접), 릴리스 서명·앱 아이콘·스토어 배포·iOS 미정, 클리어 기록 영구 저장은 SAVE-01(앱에서는 WebView 저장소 사용 예정)
  - 리뷰: codex-main 한도로 claude-2 대행 독립 리뷰 **지적 있음, 반영 보류 아님**(치명적·높음 없음, `.codex-out/MOB-01-review.md`). 반영 전 수정: F2 서명 키 무시 규칙, F3 템플릿 샘플 테스트 삭제, F5 문서 800×360 잔재, F6 README PATH·Windows 안내
  - 후속(리뷰): **F1(보통) 640×320에서 HUD가 빡빡함** — 타워 선택 시 강화·판매가 스크롤 뒤, 타일 25px → 모바일 HUD 개선 태스크 필요. F4 `allowBackup`·`INTERNET` 정책(SAVE-01 때 결정), F7 앱 백그라운드 시 자동 일시정지·뒤로가기 처리, F8 앱 아이콘·스플래시(아트)

- [x] **MOB-02 — 모바일 HUD·조작 개선** (2026-11-26 `main` 반영)
  - 담당: claude-main 계약(UI-CONTRACT 3·5·7·8.1절), 구현 claude-1(worktree `../ddooby-defence-mob-02`, 브랜치 `feat/mob-02`), 리뷰 codex-main(한도 시 쉬는 claude 탭)
  - 사용자 결정(2026-11-26): HUD에는 골드·기지 HP·웨이브·지금 시작(남은 시간)·타워 4종·강화/판매만 한 화면에, 나머지는 ⚙ 메뉴로. 맵은 18×10 유지하고 HUD를 줄여 칸 확대
  - 범위: 레이아웃 `hudW = clamp(round(W×0.17),136,240)`, HUD 재구성(스크롤 없음), ⚙ 메뉴(일시정지 겸용, 스테이지 선택 나가기), 일시정지 없는 타워 정보 창(능력치·타깃), 숨김 시 자동 일시정지(MOB-01 F7), Android 뒤로가기(8.1절, MOB-01 F7)
  - 완료 조건: 640×320·796×384·1280×720에서 HUD 스크롤 없이 상시 항목 표시(브라우저 스크린샷), 레이아웃·메뉴·정보 창·뒤로가기 순서 단위 테스트, lint/typecheck/test/build exit 0, APK 빌드
  - 결과: HUD 재구성(스크롤 없음), ⚙ 메뉴(일시정지 겸용, 스테이지 선택 나가기 확인), 일시정지 없는 타워 정보 창(능력치·타깃), 숨김 자동 일시정지, `session.handleBack()` + `@capacitor/app` 8.1.2 뒤로가기, Phaser `noAudio`. 코어 무변경. lint/typecheck/test(652 passed)/build exit 0(claude-main 재실행), ego-browser 640×320·796×384·1280×720 HUD 스크롤 없음 측정(claude-1, 스크린샷 저장소 밖 `../ddooby-defence-mob-02-shots/`), debug APK 빌드·Galaxy A16 설치(2026-11-26)
  - 리뷰: codex-main **지적 있음 보통 1**(F1 메뉴 뒤 정보 창 때문에 뒤로가기가 보이는 확인창을 못 닫음) → 수정(메뉴 열리면 정보 창 닫힘, 보이는 최상위부터) → **재리뷰 1 통과**(`.codex-out/MOB-02-review.md`)
  - 남은 것: 실기기 백그라운드 자동 일시정지·뒤로가기·터치 플레이 감각(사용자 확인), 640×320 HUD 세로 여유 약 10px(항목 추가 시 주의), 정보 창이 맵 좌상단을 가림

- [x] **SAVE-01 — 로컬 클리어·해금·저장 실패** (2026-11-26 `main` 반영)
  - 담당: claude-main 계약(UI-CONTRACT 10절), 구현 claude-1(worktree `../ddooby-defence-save-01`, 브랜치 `feat/save-01`), 리뷰 codex-main
  - 선행: SIM-01, UI-01
  - 범위: clear flags, derived unlock, 저장 오류·재시도·새로고침 손실 안내
  - QA: 진행 기록 UI/STATE, COREG-11, TSTR-17
  - 완료 조건: 성공/실패/기존 클리어 유지/재플레이 패배/재도전 구분 검증
  - 결과: `progress.ts` LocalStorageProgressStore(키 `ddooby-defence.progress`, `{"version":1,"cleared":[...]}`), 저장 상태 saved/failed·retrySave, 읽기 실패 안내·손상 원문 백업 슬롯 `.corrupt`~`.corrupt.5`, 쓰기 전 재읽기·합집합. 결과 오버레이 저장 상태·다시 저장, 스테이지 선택 안내. 코어·Android 설정 무변경. lint/typecheck/test(683 passed)/build exit 0(claude-main 재실행), ego-browser 클리어→새로고침 해금 유지·손상·예외 흉내(claude-1, 스크린샷 `../ddooby-defence-save-01-shots/`)
  - 리뷰: codex-main **지적 있음 높음 2 → 반영 보류**(F1 일시 읽기 실패 뒤 기존 클리어 덮어씀, F2 백업 실패 뒤 원문 소실) → 계약 10절 보완·수정 → **재리뷰 1 통과**(`.codex-out/SAVE-01-review.md`)
  - 남은 것: 실기기 앱 재시작 후 기록 유지 확인, Android `allowBackup` 기본값(켜짐) 유지는 claude-main 제안·사용자 이의 없음(2026-11-26)

- [x] **MOB-03 — 좌우 대칭 여백(카메라 구멍 반대쪽)** (2026-11-26 `main` 반영)
  - 담당: claude-main(사용자 실기기 피드백 2026-11-26: 왼쪽 카메라 구멍 여백은 유튜브 PIP 자리로 좋고, 오른쪽 위 글자가 잘리니 오른쪽에도 비슷한 여백)
  - 결과: `MainActivity.applySymmetricSideInsets()` — 시스템 바·컷아웃 인셋의 좌우 중 큰 값을 양쪽 패딩으로, `capacitor.config.ts` SystemBars `insetsHandling: "disable"`. 웹 코드 무변경. debug APK 빌드·Galaxy A16 설치, **사용자 실기기 확인 "딱 좋아"**(2026-11-26)
  - 리뷰: 작은 네이티브 변경이라 별도 독립 리뷰 없이 사용자 실기기 확인으로 갈음(claude-main 제안, 사용자 반영 지시)
  - 남은 것: 컷아웃이 없는 기기·세로 진입 시 동작은 미확인

- [x] **ART-02 — 앱 아이콘·스플래시** (2026-11-26 `main` 반영)
  - 담당: codex-design 시안 3안(A 초원 성문·B 자수정 마법탑·C 성채 방패), 사용자 선택 **C**(2026-11-26), 반영 claude-main. MOB-01 리뷰 F8 후속
  - 결과: Android 런처 아이콘(적응형 전경+배경 `#162C37`, 기존 밀도별 PNG)·시작 화면 PNG 교체, Android 12+ 시작 화면 배경색. 기록 `.codex-out/ART-02-image.md`(원본은 저장소 밖 `../ddooby-defence-art02/`). debug APK 빌드·Galaxy A16 설치, 사용자 실기기 확인 후 반영 지시(2026-11-26)
  - 남은 것: `ic_launcher_round`는 원형 마스크 없이 같은 이미지(적응형 아이콘 미지원 기기용), 스토어용 512px 아이콘·그래픽은 배포 때

- [x] **UI-02 — 배속·정수 초 카운트다운·HUD 위 여백** (2026-11-26 `main` 반영)
  - 담당: claude-main 계약(UI-CONTRACT 5·7절), 구현 claude-2(worktree `../ddooby-defence-ui-02`, 브랜치 `feat/ui-02`), 리뷰 codex-main
  - 사용자 실기기 피드백(2026-11-26): 준비 남은 시간은 초 단위만, 골드·기지 HP 줄이 화면 위에 너무 붙음, 배속 2배·5배. '웨이브' 글자는 유지
  - 결과: 세션 배속 1×/2×/5×(게임 누적 × 배속, 최대 틱 5×배속, UI 시계는 실제 시간, 재도전·스테이지 변경 유지), 웨이브 줄 배속 버튼·웹 `F` 키, `▶ 시작 N초`(올림), HUD 위 여백 `clamp(12px,5vh,24px)`·자원 줄 오른쪽 여백. 코어 무변경. lint/typecheck/test(696 passed)/build exit 0(claude-main 재실행), ego-browser 3개 크기 스크롤 없음(claude-2, `../ddooby-defence-ui-02-shots/`), 사용자 실기기 확인 "딱 좋아"
  - 리뷰: codex-main **지적 있음 낮음 1**(L1 배속 단축키가 계약 미기재·Ctrl+F에도 반응) → 수정, 낮음이라 재리뷰 생략(`.codex-out/UI-02-review.md`)
  - 남은 것: 640×320 타워 선택 시 HUD 세로 여유 0(항목 추가 시 스크롤), 5× 실기기 성능 체감, 5×에서 준비 시간이 실제 4초로 짧음(사용자 체감 확인)

- [ ] **BAL-01 — 실제 초기 수치·맵·웨이브 후보와 검증**
  - 담당: claude-main 후보 설계·분석, codex-main QA, 최종 승인 사용자
  - 선행: MAP-01, SIM-03, ECON-01, UI-01, SAVE-01
  - 범위: 3개 맵·15개 웨이브·타워/적/특성 능력치·골드·환급률 후보 패키지, 기본/상성/경계 시나리오
  - QA: BALD, ECOD, ENMD, WBL, BALX-01~18, BAPR-01~12
  - 완료 조건: 버전별 실제 데이터·변경 이유·자동/수동 결과·잔여 위험 및 **사용자 명시적 최종 승인**
  - **현재 실제 수치·웨이브 적 조합·구현용 아트 에셋 승인 없음** (ART-01은 시각 방향 선택만)

## 6. 독립 QA·반영

- [ ] **QA-01 — 구현 영역별 독립 리뷰 및 재검증**
  - 담당: codex-main QA PL; 통합 조정 claude-main
  - 선행: 해당 변경의 특정 커밋/파일/검증 결과
  - 전문 역할: 테스트 전략 / 트리아지 / 독립 리뷰 중 요청별 하나
  - 결과: `.codex-out/<TASK-ID>-{test-plan|triage|review}.md` 또는 지정 파일
  - QA: GATE, COREG, TSTR, DEFQ
  - 완료 조건: 실제 재현·코드·수용 기준 대조, 중요한 결함 수정 후 재검증; 재리뷰 2회 한도
  - 보류가 있으면 기본 브랜치 통합 금지. **문서 작성 자체가 제품 출시 승인 아님**

- [ ] **REL-01 — 전체 게이트·통합·출시 검토**
  - 담당: claude-main 조정, codex-main 품질 판정, 사용자 예외·제품 승인
  - 선행: 관련 QA-01, BAL-01, 전체 스모크·회귀, 배포 계획
  - 결과: CORE/ECON/DATA/STATE/UI 게이트 증거, 위험 목록, 결과 보고
  - 완료 조건: 실검증 근거·보류 해제 또는 명시적 예외 승인·사용자 확인·복구안

## 7. 태스크 배정 시 주의

- 현재 어떤 구현 탭(claude-1/2)에도 실제 파일·브랜치·포트가 할당되지 않았다. claude-main이 확정 스택과 `src/` 구조를 기준으로 **겹치지 않게** 배정한다.
- 검증 명령은 `npm run lint`·`npm run typecheck`·`npm run test`·`npm run build`(TECH-01 확정). 실제 실행 결과(exit code·로그) 없이 완료 근거로 기재하지 않는다.
- 완료 `[x]`는 구현·문서 QA 실행 근거를 확보했을 때만. 제품 설계 승인과 실행 완료는 별개다.
- 테스트·로그·이미지·탭 메시지가 전달되지 않았으면 완료로 보고하지 않는다.
