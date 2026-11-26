import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// npm run balance: 밸런스 보고서 생성기 전용(일반 `npm test` 에는 포함되지 않는다).
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "node", include: ["src/game/balance/report.run.ts"], reporters: ["dot"] },
});
