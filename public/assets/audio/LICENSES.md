# 오디오 라이선스 (SND-01)

모두 **CC0 1.0 (퍼블릭 도메인 헌정)**: 저작자 표시·비용 없이 상업 사용 가능. 제작: Kenney (www.kenney.nl) 및 아래 "타워 효과음" 표의 OpenGameArt 제작자.
라이선스 원문: https://creativecommons.org/publicdomain/zero/1.0/ (각 팩의 License.txt 에도 같은 표기, 2026-11-27 확인).
받은 곳: 각 팩의 공식 페이지(kenney.nl)에서 내려받아 .ogg 원본을 그대로 복사(재인코딩 없음).

| 파일 | 원본 팩 | 원본 파일명 | 출처 |
|---|---|---|---|
| sfx-tap.ogg | Interface Sounds | click_001.ogg | https://kenney.nl/assets/interface-sounds |
| sfx-error.ogg | Interface Sounds | error_006.ogg | https://kenney.nl/assets/interface-sounds |
| sfx-upgrade.ogg | Interface Sounds | confirmation_002.ogg | https://kenney.nl/assets/interface-sounds |
| sfx-enemy-die.ogg | Interface Sounds | drop_003.ogg | https://kenney.nl/assets/interface-sounds |
| sfx-build.ogg | Impact Sounds | impactPlank_medium_000.ogg | https://kenney.nl/assets/impact-sounds |
| sfx-base-hit.ogg | Impact Sounds | impactPlate_heavy_001.ogg | https://kenney.nl/assets/impact-sounds |
| sfx-sell.ogg | RPG Audio | handleCoins2.ogg | https://kenney.nl/assets/rpg-audio |
| sfx-wave-start.ogg | Music Jingles | Steel jingles/jingles_STEEL08.ogg | https://kenney.nl/assets/music-jingles |
| sfx-victory.ogg | Music Jingles | Steel jingles/jingles_STEEL06.ogg | https://kenney.nl/assets/music-jingles |
| sfx-defeat.ogg | Music Jingles | Sax jingles/jingles_SAX03.ogg | https://kenney.nl/assets/music-jingles |

## 타워 효과음 5종 (OpenGameArt, 모두 CC0 — 각 페이지 License 항목 확인 2026-11-27)

| 파일 | 원본 | 저작자 | 출처 | 가공 |
|---|---|---|---|---|
| sfx-arrow.ogg | 80 CC0 RPG SFX `item_wood_02.ogg` + Tinysized `tin-whistle-whoosh-01.wav` 겹침 | NoirPhantom89 / Jean Liu | https://opengameart.org/content/80-cc0-rpg-sfx , https://opengameart.org/content/fantasy-sound-effects-tinysized-sfx | 모노 44.1kHz, 앞 무음 제거, 0.33초로 자름+페이드, 두 소리 겹침, 정규화, ogg q3 |
| sfx-bolt.ogg | 80 CC0 RPG SFX `item_wood_03.ogg` + Swishes `swish-7.wav` 겹침 | NoirPhantom89 / qubodup | https://opengameart.org/content/80-cc0-rpg-sfx , https://opengameart.org/content/swishes-sound-pack | 위와 같음(0.3초) |
| sfx-fire.ogg | LEGIT Audio Fire Staff 7 의 앞 0.55초 | LEGIT Audio | https://opengameart.org/content/fire-staff-sound-effects | 모노 44.1kHz, 앞 무음 제거, 0.55초 자름+페이드, 정규화, ogg q3 |
| sfx-explode.ogg | 25 CC0 Bang `bang_02.ogg` | Snabisch | https://opengameart.org/content/25-cc0-bang-firework-sfx | 0.55초 자름+페이드(0.2초), 정규화, ogg q3 |
| sfx-frost.ogg | LEGIT Audio Fire Staff 7 의 앞 0.55초 | LEGIT Audio | https://opengameart.org/content/fire-staff-sound-effects | 모노 44.1kHz, 앞 무음 제거, 0.55초 자름+페이드, 정규화, ogg q3 — sfx-fire.ogg 와 같은 파일(사용자 결정 2026-11-27) |

선택은 파일 이름·길이 기준이며 귀로 확인하지 않았다(소리가 어울리지 않으면 같은 팩의 다른 파일로 교체).
## 배경음 (CC-BY 3.0 — 게임 안 크레딧 표시 필수)

| 파일 | 곡 | 저작자 | 라이선스 | 출처 |
|---|---|---|---|---|
| bgm-main.ogg | "War Humans March" | tridentkeep(원곡 "theme humans march", Frostbite Medieval soundtrack), Bobjt(리믹스, 2025) | CC BY 3.0 — https://creativecommons.org/licenses/by/3.0/ | https://opengameart.org/content/war-humans-march |

- 변경 사항: 원본 war_humans_march.mp3(꼬리 없는 반복용 버전)를 44.1kHz로 디코딩해 양 끝에 10ms 페이드를 걸고 ogg(q2)로 변환. 그 외 편집 없음.
- 표시 위치: 스테이지 선택 화면 `크레딧` 버튼(src/game/ui/Credits.tsx, 문구는 strings.ko.ts의 credits). 제목·저작자·라이선스 링크·출처·변경 여부를 표시한다.
