// src/game/content/** 에도 코어와 같은 금지 규칙(framework import·결정성)이 적용되는지 ESLint Node API로 확인한다.
import path from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const eslint = new ESLint({ cwd: ROOT });
const RESTRICTED = new Set(["no-restricted-globals", "no-restricted-properties", "no-restricted-imports"]);

async function restricted(code: string, file: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: path.join(ROOT, file) });
  return result.messages.filter((m) => m.ruleId !== null && RESTRICTED.has(m.ruleId)).map((m) => m.ruleId as string);
}

describe("content 폴더 lint 범위", () => {
  const FILE = "src/game/content/fixture.ts";
  it("Math.random / Date / performance 금지", async () => {
    expect(await restricted("export const x = Math.random();\n", FILE)).toContain("no-restricted-properties");
    expect(await restricted("export const x = Date.now();\n", FILE)).toContain("no-restricted-globals");
    expect(await restricted("export const x = performance.now();\n", FILE)).toContain("no-restricted-globals");
  }, 60_000);
  it("next / react / phaser import 금지", async () => {
    for (const mod of ["next/image", "react", "phaser"]) {
      expect(await restricted(`import x from "${mod}";\nexport default x;\n`, FILE)).toContain("no-restricted-imports");
    }
  }, 60_000);
  it("순수 코드는 통과", async () => {
    expect(await restricted("export const x = Math.floor(1.5) + Math.max(1, 2);\n", FILE)).toEqual([]);
  }, 60_000);
  it("범위 밖(src/game/phaser)은 적용되지 않는다", async () => {
    expect(await restricted("export const x = Math.random();\n", "src/game/phaser/fixture.ts")).toEqual([]);
  }, 60_000);
});
