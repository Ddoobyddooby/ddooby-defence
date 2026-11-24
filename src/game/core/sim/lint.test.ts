// L01~L03 — ESLint Node API로 메모리 내 소스를 lint한다(파일 경로만 src/game/core/... 로 지정, 디스크에 쓰지 않음).
// lint는 결정성의 *일부*만 막는다: 못 잡는 우회는 아래 "BYPASS" 테스트로 기록하고 코드 리뷰 게이트로 보완한다.
import path from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const eslint = new ESLint({ cwd: ROOT });
const CORE = "src/game/core/sim/fixture.ts";

const RESTRICTED = new Set(["no-restricted-globals", "no-restricted-properties", "no-restricted-imports"]);

async function restricted(code: string, file = CORE): Promise<{ ruleId: string; message: string }[]> {
  const [result] = await eslint.lintText(code, { filePath: path.join(ROOT, file) });
  return result.messages
    .filter((m) => m.ruleId !== null && RESTRICTED.has(m.ruleId))
    .map((m) => ({ ruleId: m.ruleId as string, message: m.message }));
}

describe("L01: 코어에서 금지된 전역·수학 함수", () => {
  const banned: [string, string][] = [
    ["Math.random()", "no-restricted-properties"],
    ["new Date()", "no-restricted-globals"],
    ["Date.now()", "no-restricted-globals"],
    ["performance.now()", "no-restricted-globals"],
    ["Math.sin(1)", "no-restricted-properties"],
    ["Math.cos(1)", "no-restricted-properties"],
    ["Math.tan(1)", "no-restricted-properties"],
    ["Math.atan2(1, 2)", "no-restricted-properties"],
    ["Math.pow(2, 3)", "no-restricted-properties"],
    ["Math.exp(1)", "no-restricted-properties"],
    ["Math.log(1)", "no-restricted-properties"],
    ["Math.hypot(3, 4)", "no-restricted-properties"],
    ["Math.sqrt(4)", "no-restricted-properties"],
  ];
  for (const [expr, rule] of banned) {
    it(`${expr} → ${rule}`, async () => {
      const found = await restricted(`export const x = ${expr};\n`);
      expect(found.map((f) => f.ruleId)).toContain(rule);
    }, 60_000);
  }
  it("테스트 파일(src/game/core/**/*.test.ts)에도 같은 금지가 적용된다", async () => {
    const found = await restricted("export const x = Math.random();\n", "src/game/core/sim/fixture.test.ts");
    expect(found.map((f) => f.ruleId)).toContain("no-restricted-properties");
  }, 60_000);
  it("코어 밖(src/game/phaser)에는 이 금지가 적용되지 않는다", async () => {
    expect(await restricted("export const x = Math.random() + Date.now();\n", "src/game/phaser/fixture.ts")).toEqual([]);
  }, 60_000);
});

describe("L02: 우회 접근", () => {
  it("계산된 속성 Math['random']() 은 잡는다", async () => {
    expect((await restricted(`export const x = Math["random"]();\n`)).map((f) => f.ruleId)).toContain("no-restricted-properties");
  }, 60_000);
  it("별칭 const r = Math.random 은 속성 접근 지점에서 잡는다", async () => {
    expect((await restricted("const r = Math.random;\nexport const x = r();\n")).map((f) => f.ruleId)).toContain("no-restricted-properties");
  }, 60_000);
  it("구조분해 const { random } = Math 을 잡는다", async () => {
    expect((await restricted("const { random } = Math;\nexport const x = random();\n")).map((f) => f.ruleId)).toContain("no-restricted-properties");
  }, 60_000);
  it("globalThis.Date / globalThis.performance 를 잡는다", async () => {
    expect((await restricted("export const x = globalThis.Date;\n")).map((f) => f.ruleId)).toContain("no-restricted-properties");
    expect((await restricted("export const x = globalThis.performance;\n")).map((f) => f.ruleId)).toContain("no-restricted-properties");
  }, 60_000);

  // BYPASS — 아래는 lint가 못 잡는 우회다. "못 잡음"을 테스트로 고정해 두고, 코드 리뷰 게이트로 보완한다
  // (lint 통과가 코어의 순수성을 증명한다고 주장하지 않는다). 나중에 규칙을 강화하면 이 기대를 뒤집는다.
  it("BYPASS: 객체 별칭 const M = Math; M.random() 은 못 잡는다", async () => {
    expect(await restricted("const M = Math;\nexport const x = M.random();\n")).toEqual([]);
  }, 60_000);
  it("BYPASS: globalThis.Math.random() 은 못 잡는다", async () => {
    expect(await restricted("export const x = globalThis.Math.random();\n")).toEqual([]);
  }, 60_000);
});

describe("L03: 허용되는 코드와 framework import 금지", () => {
  it("Math.floor/abs/sign/max/min, BigInt FNV 같은 결정적 코드는 통과", async () => {
    const code = [
      "export const a = Math.floor(1.5) + Math.abs(-1) + Math.sign(2) + Math.max(1, 2) + Math.min(1, 2);",
      "export const h = BigInt.asUintN(64, BigInt(1) * BigInt(3));",
      "",
    ].join("\n");
    expect(await restricted(code)).toEqual([]);
  }, 60_000);
  it("Math.sqrt는 src/game/core/sim/intmath.ts 에서만 허용된다", async () => {
    expect(await restricted("export const r = Math.sqrt(4);\n", "src/game/core/sim/intmath.ts")).toEqual([]);
    expect((await restricted("export const r = Math.sqrt(4);\n", "src/game/core/sim/other.ts")).map((f) => f.ruleId)).toContain(
      "no-restricted-properties",
    );
  }, 60_000);
  it("intmath.ts 에서도 Math.sqrt 외 금지는 유지된다", async () => {
    expect((await restricted("export const r = Math.random();\n", "src/game/core/sim/intmath.ts")).map((f) => f.ruleId)).toContain(
      "no-restricted-properties",
    );
    expect((await restricted("export const r = new Date();\n", "src/game/core/sim/intmath.ts")).map((f) => f.ruleId)).toContain(
      "no-restricted-globals",
    );
  }, 60_000);
  it("코어의 Next/React/Phaser/앱 import는 계속 금지된다", async () => {
    for (const src of ["react", "react-dom/client", "next/link", "next", "phaser", "@/game/phaser/scene", "@/app/page"]) {
      const found = await restricted(`import x from "${src}";\nexport const y = x;\n`);
      expect(found.map((f) => f.ruleId), src).toContain("no-restricted-imports");
    }
  }, 60_000);
});
