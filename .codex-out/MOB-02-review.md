지적 있음

# MOB-02 독립 리뷰

- 대상: `feat/mob-02` HEAD `c2199fb`, `git diff 240ce5b..c2199fb`.
- 기준: SPEC 9절, UI-CONTRACT 3·5·6·7·8.1절.
- 판정: **보통 1건**. 높음 이상 결함은 확인되지 않아 반영 보류는 선언하지 않는다.

## F1 — 보통: 메뉴 뒤에 남은 정보 창 때문에 뒤로가기가 보이는 확인창을 닫지 못함

- 위치: `src/game/session/session.ts:296` (pause가 infoOpen 유지), `:429` (infoOpen을 leaveConfirm보다 먼저 처리), `src/game/ui/GameApp.tsx:86` (정보 창 z-5, 메뉴 z-10).
- 재현: 타워 선택 → 정보 창 열기 → ⚙ 메뉴 열기 → 메뉴의 스테이지 선택 확인창 열기 → Android 뒤로가기 또는 Esc 한 번.
- 기대: 현재 보이는 스테이지 선택 확인창이 닫히고 메뉴가 남는다. UI-CONTRACT 8.1은 메뉴 안 확인창을 먼저 닫는 동작을 요구한다.
- 실제: `infoOpen=true, leaveConfirm=true, paused=true`에서 첫 `handleBack()`은 메뉴 뒤에 가려진 정보 창만 닫아 `infoOpen=false, leaveConfirm=true, paused=true`가 된다. 확인창은 그대로 보여 한 번 더 눌러야 닫힌다. 직접 세션 재현에서 확인.
- 영향: 뒤로가기/Esc가 현재 보이는 창에 반응하지 않는 것처럼 느껴진다. 숨김 자동 일시정지나 Space/P로 정보 창 위에 메뉴가 열려도 같은 상태가 만들어진다.
- 수정 제안: 메뉴 진입 시 정보 창을 닫거나, 메뉴/leaveConfirm이 열렸을 때 `handleBack`이 실제로 보이는 최상위 확인창부터 처리하도록 상태 전이를 통일한다. 재현 순서에 대한 테스트를 추가한다.

## 그 밖의 확인

- 자동 일시정지는 `setHidden(true) → pause()`이며 결과 단계에서는 `pause()` 가드로 코어 호출을 피한다. 재도전/스테이지 진입은 새 시도를 만든다. 숨김 중 새 시도를 시작한 뒤 복귀하면 자동 일시정지 상태가 아닌 것은 직접 세션 호출로 가능하지만, 현재 화면에서 숨김 중 시작 입력에 도달하는 경로는 확인되지 않아 지적으로 분류하지 않았다.
- `handleBack`의 판매 확인 → 정보 → 메뉴 → 전투 → 결과 → 스테이지 선택 순서, `Esc`의 설치/선택 해제 선행, `useBackButton`의 네이티브 조건 동적 import 및 언마운트·늦은 등록 제거 경로 확인. Android 실기기 동작은 미검증.
- 정보 창의 타깃 변경은 세션 명령으로 제출되고, 열려 있을 때 맵 탭은 무시된다. 타워 사라짐/선택 해제 시 정리되는 경로 확인.
- `hudView`와 `menuView`는 스냅샷에서 값을 파생한다. 640×320 선택 상태의 기존 스크린샷을 직접 열어 상시 항목과 강화·판매 버튼이 화면에 보이는 것을 확인했다. 이 스크린샷은 특정 값/폰트/기기에서의 증거이며 모든 긴 수치·실기기 서체까지 보장하지 않는다.
- 레이아웃의 `hudW=clamp(round(W×0.17),136,240)`와 리터럴 테스트, 18×10 유지 확인. `@capacitor/app` 8.1.2는 package.json/lockfile에 고정됐고 Android Gradle 변경은 플러그인 등록 2파일이다. Phaser `audio: { noAudio: true }`는 현재 소리 없는 게임과 부합하며 소리 재생 코드 의존은 이번 범위에서 확인되지 않았다.
- 직접 실행: `npm test -- src/game/session/session.test.ts src/game/session/layout.test.ts src/game/session/hudView.test.ts` — **3파일/92테스트 통과**. 기존 테스트는 F1 재현 순서를 포함하지 않는다.
- claude-main 사전 보고: lint/typecheck/build 통과, 전체 31파일/648테스트 통과. 이 리뷰에서 재실행하지 않았다. claude-1의 브라우저 측정 및 APK 빌드도 보고로만 구분한다. 휴대폰 원격 조작은 하지 않았다.
- 코드·문서·Git 수정 없이 이 리뷰 파일만 작성했다.

## 재리뷰 1

통과

- 검토일: 2026-11-26. 대상: feat/mob-02 HEAD `b714c51`, `c2199fb..HEAD` 변경과 원 F1 재현.
- **F1 해소:** 타워 선택 → 정보 창 → 메뉴 → 스테이지 선택 확인창에서 뒤로가기 1회 후 `infoOpen=false, leaveConfirm=false, paused=true, selectedTowerId=1` 직접 확인. 두 번째 뒤로가기는 `paused=false`로 메뉴를 닫았다. `pause()`가 정보 창과 판매 확인을 함께 닫고 선택은 유지한다.
- 숨김 자동 일시정지에서도 정보 창·판매 확인이 닫히고 선택이 남는 것을 직접 확인. `pause()`의 결과 단계 가드는 유지되어 결과에서 코어 `pause()` 호출 경로가 재도입되지 않았다.
- `handleBack`이 판매 확인 → 메뉴 안 확인창 → 메뉴 → 정보 창 → 전투 순서로 바뀌었고 UI-CONTRACT 8.1 문구와 일치한다. `Esc`는 기존 설치 모드·선택 해제 선행 뒤 같은 경로를 쓴다.
- 직접 실행: `npm test -- src/game/session/session.test.ts` **1파일/69테스트 통과** 및 위 세션 재현 exit 0. 전체 31파일/652테스트, lint/typecheck/build는 claude-main의 사전 보고이며 이번 재리뷰에서 재실행하지 않았다. 대상 worktree의 코드·문서·Git은 수정하지 않았다.
- MOB-02 F1은 해제. 이 리뷰 범위에서 남은 지적 없음. 실기기 백그라운드·Android 뒤로가기 조작은 미검증 상태로 유지한다.

