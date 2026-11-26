import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// npm run golden:record-scripts: 봇 명령 기록 도구 전용(일반 `npm test` 에는 포함되지 않는다).
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "node", include: ["src/game/balance/regression/record.run.ts"], reporters: ["dot"] },
});
