# Ddooby-defence

판타지 2D 고정 경로 타워디펜스 MVP. Next.js + TypeScript + Phaser, 게임 규칙은 `src/game/core`의 순수 TypeScript 코어.

## 시작하기 (새 PC)

필요: Node.js 24, npm

```bash
git clone https://github.com/Ddoobyddooby/ddooby-defence.git
cd ddooby-defence
npm install
npm run dev        # http://localhost:3000
```

## 검증 명령

| 명령 | 내용 |
|---|---|
| `npm run lint` | ESLint (`src/game/core`에서 next/react/phaser import 금지 포함) |
| `npm run typecheck` | `next typegen && tsc --noEmit` |
| `npm run test` | Vitest (`src/**/*.test.ts`) |
| `npm run build` | Next.js 프로덕션 빌드 |

## 문서

- 진행 현황·다음 작업: [docs/TASKS.md §0](docs/TASKS.md)
- 제품 규칙 [SPEC.md](SPEC.md) · 기술 계획 [docs/PLAN.md](docs/PLAN.md) · 협업 절차 [docs/WORKFLOW.md](docs/WORKFLOW.md) · 디자인 [docs/DESIGN.md](docs/DESIGN.md)
- 에이전트 지침: [AGENTS.md](AGENTS.md), [CLAUDE.md](CLAUDE.md)
