# ART-02 — 앱 아이콘·스플래시 시안 기록

- 제작: codex-design(내장 ImageGen), 2026-11-26. ART-01 전투 시안과 `docs/DESIGN.md`를 참고.
- 원본 위치(저장소 밖): `~/Desktop/Ddooby/projects/ddooby-defence-art02/icon-{a,b,c}/` — 각 `icon.png`(1024² 합성), `foreground.png`(1024² 투명 전경, 가시 픽셀 중심 반경 ≤ 307px), `background.png`(단색), `preview-48.png`, `splash.png`(2400×1080), `README.md`(콘셉트·프롬프트).
- 시안: A 초원 성문(#153D36) · B 자수정 마법탑(#22203B) · **C 성채 방패(#162C37)**.
- **사용자 선택(2026-11-26): C 성채 방패.** 미선택 A·B는 제품에 사용하지 않는다.

## 제품 반영 (claude-main)

| 리소스 | 출처 | 변환 |
|---|---|---|
| `mipmap-*/ic_launcher.png`, `ic_launcher_round.png` | `icon-c/icon.png` | 48·72·96·144·192px (sips 축소, round는 같은 이미지) |
| `mipmap-*/ic_launcher_foreground.png` | `icon-c/foreground.png` | 108·162·216·324·432px |
| `values/ic_launcher_background.xml` | `icon-c/background.png` 색 | `#162C37` |
| `drawable*/splash.png` (land·port 11개) | `icon-c/splash.png` | 덮도록 축소 후 가운데 자르기 |
| `values/styles.xml` | — | Android 12+ 시작 화면 배경 `windowSplashScreenBackground` = 아이콘 배경색 |

## C 생성 프롬프트 (README 발췌)

Use case: logo-brand. A premium classic hand-painted fantasy tower defense app emblem for Ddooby Defence. … A flat-faced medieval heater shield, dignified and broad, curved upper rim and a strong pointed foot. Hammered antique gold edge, dark peacock teal enamel. A large raised ivory three-crenellation rook with one arch cutout is inlaid into the center. … No ribbons or surrounding accessories.
