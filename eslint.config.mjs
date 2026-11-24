import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const BANNED_MATH = ["random", "sin", "cos", "tan", "atan2", "pow", "exp", "log", "hypot", "sqrt"];

function restrictedMath({ allowSqrt }) {
  return BANNED_MATH.filter((property) => !(allowSqrt && property === "sqrt")).map((property) => ({
    object: "Math",
    property,
    message:
      property === "sqrt"
        ? "SIM-CONTRACT 6절: Math.sqrt는 src/game/core/sim/intmath.ts의 isqrt에서만 허용."
        : `SIM-CONTRACT 6절: 코어에서 Math.${property} 금지 (결정성).`,
  }));
}

function restrictedGlobalThis() {
  return ["Date", "performance"].map((property) => ({
    object: "globalThis",
    property,
    message: `SIM-CONTRACT 6절: 코어에서 globalThis.${property} 금지 (벽시계 의존).`,
  }));
}

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // PLAN 2절: 순수 TypeScript 게임 코어는 Next.js/React/Phaser에 의존하지 않는다.
  {
    files: ["src/game/core/**", "src/game/content/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["next", "next/*", "react", "react/*", "react-dom", "react-dom/*", "phaser", "@/game/phaser/*", "@/app/*"],
              message: "src/game/core must stay framework-free (PLAN.md §2).",
            },
          ],
        },
      ],
    },
  },
  // SIM-CONTRACT 6절: 결정성을 깨는 전역·수학 함수 금지. 별칭(`const M = Math; M.random()`)·`globalThis.Math.random()` 같은
  // 우회는 lint가 못 잡으므로 코드 리뷰 게이트로 보완한다(lint만으로 순수성을 증명하지 않는다).
  {
    files: ["src/game/core/**", "src/game/content/**"],
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "Date", message: "SIM-CONTRACT 6절: 코어에서 Date 금지 (벽시계 의존)." },
        { name: "performance", message: "SIM-CONTRACT 6절: 코어에서 performance 금지 (벽시계 의존)." },
      ],
      "no-restricted-properties": ["error", ...restrictedMath({ allowSqrt: false }), ...restrictedGlobalThis()],
    },
  },
  // Math.sqrt는 isqrt 초기 추정용으로 intmath.ts에서만 허용한다.
  {
    files: ["src/game/core/sim/intmath.ts"],
    rules: {
      "no-restricted-properties": ["error", ...restrictedMath({ allowSqrt: true }), ...restrictedGlobalThis()],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
