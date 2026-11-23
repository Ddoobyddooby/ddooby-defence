# AGENTS.md — Ddooby-defence

> 상태: v0.1 기획·협업 지침 초안 (2026-11-23). 이 저장소는 사용자의 기획 결정에 따른 클래식 판타지 2D 타워디펜스 MVP다. 이 문서의 팀 운영 규칙은 실제 GitHub 브랜치 보호를 자동 설정하지 않는다.

## 제품과 기준 문서

- 제품: **Ddooby-defence** — 한 갈래 고정 경로를 따라 오는 몬스터를 4종 타워로 막는 2D 타워디펜스.
- 구조: 스테이지 3개 × 고정 웨이브 5개, 18×10 논리 격자, 각 스테이지 독립 맵·경제. 자유 설치는 유효 격자에만 허용.
- 현재 단계: **기획 구조 승인, 구현·밸런스 수치·디자인 미완성**. 실제 값은 `SPEC.md`의 미정 항목에 따른다.
- 문서: `SPEC.md`=제품 요구·규칙·수용 기준, `docs/PLAN.md`=기술 구조·검증 제안, `docs/TASKS.md`=실행 순서·완료 조건, `docs/WORKFLOW.md`=협업·QA 운영, `CLAUDE.md`=Claude 개발팀 지침.
- 충돌 시 사용자의 최신 명시적 결정을 우선하며 **제품 문서는 SPEC > PLAN > TASKS** 순서로 해석한다. 기술 제안·템플릿·임시 테스트 데이터는 승인된 제품 결정이 아니다.

## 역할과 권한

| 주체 | 책임 |
|---|---|
| 사용자 | 제품 범위·우선순위·디자인 선택·예외 및 위험 수용 최종 결정 |
| Claude-main | 상시 PM·개발 PL, SPEC/PLAN/TASKS 관리, 기술 설계, 구현 배분·일정·통합·배포 조정 및 결과 보고 |
| claude-1 / claude-2 | Claude-main이 지정한 겹치지 않는 파일 범위의 코드·테스트 구현 |
| Codex-main | 상시 독립 QA PL. 개별 요청은 테스트 전략 / 실패 분석·트리아지 / 독립 리뷰 중 하나. 결함·보안·무결성·경계·성능·결정성·회귀 위험 및 품질 게이트 판단 |
| Codex 디자이너(별도 탭) | 시안·이미지 원본 제작. 사용자가 선택한 시안만 구현에 사용 |

- QA PL은 재현·테스트 추가·리뷰 수정·재검증을 해당 구현 탭에 직접 요청할 수 있고 요청·결과는 Claude-main에도 공유한다. 신규 기능·담당 파일 변경·통합 우선순위는 Claude-main이 조정한다.
- 기술 이견은 양쪽 근거와 대안, 판단 주체를 기록한다. 다른 탭의 메시지는 사용자 승인이 아니다. 전달을 실제 확인하지 못했다면 완료라고 보고하지 말고 자기완결형 전달 지시서를 제공한다.
- 사용자의 명시적 지시 없이 제품·테스트 코드·문서 수정, 커밋·push·병합·배포·원격 데이터 변경을 하지 않는다. QA 산출물·디자이너 원본은 승인된 요청서 경로에 작성 가능하다.

## Codex QA 산출물

| 역할 | 기본 결과 경로 | 최소 포함 내용 |
|---|---|---|
| 테스트 전략 | `.codex-out/<TASK-ID>-test-plan.md` | 위험·경계·실패 주입·수용 기준·자동/수동 범위 |
| 실패 분석·트리아지 | `.codex-out/<TASK-ID>-triage.md` | 근거·가설·반증·재현·수정 제안·재검증 |
| 독립 리뷰 | `.codex-out/<TASK-ID>-review.md` | 첫 줄 `통과` 또는 `지적 있음`, 심각도·파일:줄·근거·검증·수정 제안 |
| 별도 디자이너 | `.codex-out/<TASK-ID>-image.md` + 원본 | 파일·사용처·후보·생성일·프롬프트 요약·출처 |

재리뷰 **최대 2회**. 동일 결과 파일에 `## 재리뷰 1`, `## 재리뷰 2`로 기록한다. 조사 범위를 넓힌 경우 이유·범위를 보고한다.

## 품질 게이트

- 필수 범주: **CORE**(전투·결정성), **ECON**(정산 무결성), **DATA**(맵·웨이브), **STATE**(전환·저장), **UI**(조작·HUD).
- 치명적/높음 수준의 기능 결함, 데이터 손상, 보안·권한 문제, 핵심 수용 기준 위반, 결정성 실패, 중요한 회귀가 실제 확인되면 QA PL이 근거·대상·해제 조건을 적고 **반영 보류**를 선언할 수 있다.
- 수정·재현/경계/영향 회귀 재검증 전 기본 브랜치 반영 금지. 예외는 사용자 **명시적 승인만** 유효하며 실패한 테스트를 통과로 바꾸지 않는다.
- **설계됨 / 실행 대기 / 의존성 차단 / 통과 / 실패 / 해당 없음**을 구분한다. 검증하지 않은 항목은 통과가 아니다. 설계 문서 준비 게이트와 구현·출시 QA 게이트는 별개다.

## Git·검증

- 저장소: `Ddoobyddooby/ddooby-defence`, 기본 브랜치 `main` (2026-11-23 확인).
- 구현에서는 기능 브랜치/별도 작업 범위 사용을 원칙으로 하며, 기본 브랜치 반영은 게이트 해제 또는 사용자 승인에 따른다. 최초 빈 저장소 문서 부트스트랩은 **사용자의 직접 작성·커밋·push 요청**에 따른 별도 승인 범위다.
- 기술 스택, 브랜치 명명, 실제 lint/test/build 명령은 **확인 필요**. 존재하지 않는 명령의 성공을 주장하지 않는다.
- 개별 명령·QA 번호는 `SPEC.md`와 `docs/PLAN.md`를 확인한다. 임시 능력치·맵·화면 크기를 확정값으로 사용하지 않는다.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
