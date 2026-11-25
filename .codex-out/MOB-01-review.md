지적 있음

# MOB-01 독립 리뷰 (claude-2, codex-main 한도로 대행)

- 대상: `feat/mob-01` HEAD `d837e2c` (main `b03279f` 대비 1커밋). 코드·문서·Git 수정 없음(워크트리 `git status` 깨끗). 재현은 스크래치패드 복사본(`out/` 정적 서빙 포트 3218, `next dev` 포트 3219).
- 결론: **치명적/높음 없음 → 반영 보류 아님.** 보통 1건(F1, 비차단 후속 권장), 낮음 7건.
- 직접 실행(복사본): `npm run build`(정적 export) exit 0, `vitest run` **31 files / 627 passed**, `npm run lint` exit 0, `npm run typecheck` exit 0, `cap sync android` 성공, `next dev` GET / 200, 정적 `out/`을 브라우저에서 640×320·796×384(DPR 2, mobile 에뮬레이션)로 열어 스테이지 선택 → 전투 진입 확인. 실기기는 읽기 전용 adb(`devices`, `dumpsys package`, `logcat -d`)만 사용, 조작 없음.
- **실행하지 않은 것(통과로 쓰지 않음):** `gradlew assembleDebug`/APK 재빌드, 실기기 전투 조작·터치·회전·백그라운드 전환, 릴리스 서명 빌드, `npm audit`, Android 에뮬레이터/다른 기기.

## 지적

### F1 (보통, 비차단) 640×320에서 HUD가 빡빡하다: 강화·판매까지 약 335px 스크롤, 타일 25px
- 위치: 최소 크기 하향(`src/game/session/layout.ts:5-6`)과 HUD 구성(`src/game/ui/Hud.tsx`).
- 근거(복사본, 640×320 에뮬레이션): HUD 상단 고정 영역이 125px(전체 높이의 39%)이고 스크롤 영역은 195px인데 타워를 선택하면 내용 높이가 530px이다. 강화 버튼(554~594)·판매 버튼(598~638)이 뷰포트 높이(320) 밖에 있어 스크롤해야 닿는다. 타워 목록 아래 줄(마법탑·서리탑)은 반쯤 잘리고 `발리스타`가 두 줄로 줄바꿈된다(스크린샷 `scratchpad/mob-640x320.png`, `mob-640-detail.png`). 맵 타일은 25px이라 손가락 탭 대상으로 작다. 796×384(실기기 크기)는 선택 전 스크롤이 필요 없었으나(259/259) 선택 후는 측정하지 않았다.
- 영향: 기능은 동작하지만 전투 중 업그레이드·타깃 변경이 스크롤을 요구해 모바일 플레이감이 나쁠 수 있다. 계약 3절의 "상단 고정" 요구는 충족.
- 수정 제안: 후속 UI 태스크에서 타워 상세를 맵 위 하단 바/팝업으로 옮기거나 640×320에서만 상세를 가로 2열로 압축. 지금 반영에는 영향 없음(실기기 크기에서는 허용 범위일 가능성).

### F2 (낮음) 서명 키 무시 규칙이 주석 처리되어 있다
- 위치: `android/.gitignore`(`#*.jks`, `#*.keystore` 주석 상태, Capacitor 템플릿 기본값).
- 근거: 지금 커밋된 키는 없다(`git ls-files`에 `.jks`/`.keystore`/`local.properties`/`.apk`/`assets/public`/`capacitor.config.json` 없음, android 추적 파일 53개 288KB). 릴리스 서명을 도입하면 키 파일이 그대로 커밋될 수 있다.
- 수정 제안: 릴리스 서명 도입 전에 `*.jks`, `*.keystore`, `keystore.properties`를 무시 규칙에 추가.

### F3 (낮음) 템플릿 샘플 테스트가 패키지명과 맞지 않는다
- 위치: `android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java:24`(`"com.getcapacitor.app"` 단언), `android/app/src/test/.../ExampleUnitTest.java`.
- 근거: 앱 ID는 `com.ddooby.defence`라 계측 테스트를 실행하면 실패한다. 현재 스크립트가 실행하지 않아 증상은 없다.
- 수정 제안: 샘플 테스트 삭제 또는 ID 수정.

### F4 (낮음) 백업·권한 기본값 결정 필요
- 위치: `AndroidManifest.xml:4`(`android:allowBackup="true"`), `:40`(`INTERNET`).
- 근거: 병합 매니페스트에 선언된 권한은 `INTERNET` 하나와 앱 서명용 `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`뿐이다. 실기기(Android 17)에서 보이는 `ACCESS_LOCAL_NETWORK`는 병합 매니페스트에 없고 같은 기기의 다른 앱에도 있어 플랫폼이 자동 부여한 것이다(우리 변경 아님). 활동은 `exported="true"`가 런처 하나뿐, `FileProvider`는 `exported="false"`. `allowBackup`은 SAVE-01에서 로컬 진행 기록이 생기면 백업·복원 대상이 된다. 게임이 오프라인 정적 자산만 쓰므로 `INTERNET`이 필요한지는 검증하지 않았다(Capacitor의 앱 내부 서버는 로컬 처리일 가능성이 높으나 확인 안 함).
- 수정 제안: SAVE-01 설계 때 `allowBackup` 정책 결정, `INTERNET` 제거가 동작에 영향 없는지 실기기에서 확인.

### F5 (낮음) 문서·주석에 800×360 잔재
- `src/game/ui/Orientation.tsx:3`(주석), `docs/PLAN.md:195`(TBD-UI "최소 800×360"), `docs/TRACE.md:110`·`:120`(REQ-UI-01·11에 800×360), `SPEC.md:14`("최소 화면 크기는 미정"인데 9절은 확정). `docs/UI-CONTRACT.md:88-89`의 800×360은 테스트·스크린샷 예시 크기라 허용.
- 코드·테스트·문구(`strings.ko.ts`)·UI-CONTRACT 3절·SPEC 9절은 모두 640×320으로 일치함(`layout.test.ts` 640×320·639×320·640×319 경계 포함).
- 수정 제안: 위 문서 4곳 갱신.

### F6 (낮음) 스크립트·빌드 이식성
- `package.json`: `android:install`은 PATH의 `adb`에 의존. README는 `ANDROID_HOME`·`JAVA_HOME`만 안내하고 `export PATH=$PATH:$ANDROID_HOME/platform-tools`는 없다. `JAVA_HOME` 대체 경로가 macOS Homebrew 전용이며 `./gradlew`라 Windows에서는 동작하지 않는다.
- `android/gradle/wrapper/gradle-wrapper.properties`에 `distributionSha256Sum`이 없다(템플릿 기본값). `android/build.gradle`의 `com.google.gms:google-services` classpath는 `google-services.json`이 없어 적용되지 않지만 빌드 시 의존으로 내려받는다.
- 수정 제안: README에 PATH 한 줄·Windows 미지원 명시, wrapper 체크섬 고정은 선택.

### F7 (낮음, 제안) 모바일 수명주기: 백그라운드 자동 일시정지·뒤로가기
- 근거(코드): UI-CONTRACT 5절은 숨김 복귀 시 자동 일시정지를 하지 않는다고 정했다. 앱에서는 전화·알림·앱 전환·뒤로가기가 흔한데 Capacitor `App` 플러그인 처리가 없어 뒤로가기는 앱 종료로 이어진다. 시간 폭주는 UI-01 재리뷰의 `frameDelta` 250ms 상한과 복귀 첫 입력 폐기로 막혀 있어 안전 문제는 아니다. 실기기에서 직접 확인하지는 않았다.
- 수정 제안: 후속에서 `visibilitychange`(앱 백그라운드) 시 `session.pause()`와 뒤로가기 처리를 검토.

### F8 (낮음, 정보) 기본 Capacitor 아이콘·스플래시, 큰 화면 방향 고정
- `android/app/src/main/res`의 아이콘·스플래시는 템플릿 기본이다. `targetSdk 36`에서 큰 화면(≥600dp)은 `screenOrientation` 고정이 무시될 수 있으나, 세로가 되면 앱의 "가로 화면으로 돌려 주세요" 안내가 뜨므로 동작은 안전하다.

## 중점 확인 항목별 결과

1. **정적 export 회귀 없음.** 빌드 라우트는 `/`와 `/_not-found`뿐이고 서버 기능·`use cache`·`next/image`·API 라우트 사용처가 코드에 없다. `next/font/google`은 빌드 시 자체 호스팅되며 산출물에 외부 런타임 URL 요청이 없다(발견된 URL은 SVG 네임스페이스·React 오류 문서 문자열·Phaser 문자열). Phaser 동적 import 포함 전투 화면이 정적 서빙에서 정상(스테이지 선택 → 전투, 캔버스 1개). `next dev`도 200. `cacheComponents`·`partialPrefetching` 제거로 인한 코드 영향 없음.
2. **커밋 금지 파일 없음.** `local.properties`·`*.apk`·`app/src/main/assets/public`·`capacitor.config.json`·키 파일은 추적되지 않고 `android/.gitignore`가 빌드 산출물·복사된 웹 자산을 제외한다(루트 `.gitignore`는 `/out/`). 추적된 큰 바이너리는 `gradle-wrapper.jar`(43KB)뿐이며 템플릿 표준(F6 체크섬 참고). 루트 PNG 2MB급은 main에 이미 있던 아트 원본.
3. **매니페스트·MainActivity.** `sensorLandscape`·`singleTask`·런처만 `exported`·`FileProvider` 비공개·클리어텍스트 미설정(targetSdk 36 기본 차단)로 안전 기본값은 양호(F4). `MainActivity`는 `onCreate`와 `onWindowFocusChanged`에서 시스템 바를 숨기고 스와이프 시 일시 표시 동작(`BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE`)이며 코드상 의도대로 동작한다. 실기기 조작은 하지 않았고 설치된 debug APK의 메타(versionCode 1, targetSdk 36, DEBUGGABLE)만 확인했다.
4. **640×320 HUD.** 계산·테스트·문서는 일치하나 사용성은 F1.
5. **스크립트 이식성.** F6.
6. **공급망.** 직접 추가는 `@capacitor/android`·`core`·`cli` 8.6.0 정확 고정(cli는 devDependency). 락파일 +1055행의 추가 패키지는 모두 `@capacitor/cli`의 전이 의존(`@ionic/utils-*`, `tar`, `xml2js`, `native-run`, `xcode`, `plist`, `rimraf`, `glob`, `fs-extra`, `kleur` 등)이며 `resolved`가 전부 `registry.npmjs.org`다. 기존 `globals` 등 항목은 줄 이동만 있고 버전 변경 없음(14.0.0·16.4.0 유지). `npm audit`는 실행하지 않았다.

## 판정

반영 보류 사유 없음(치명적/높음 없음). 보통 F1은 UI 사용성 후속, 낮음은 문서 갱신(F5)·릴리스 서명 전 준비(F2)·샘플 테스트 정리(F3) 우선 권장.
