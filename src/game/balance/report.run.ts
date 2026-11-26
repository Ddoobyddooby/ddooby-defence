// `npm run balance` 진입점(vitest 로 실행, 별도 설정 vitest.balance.config.mts). 보고서를 stdout 에 쓰고 docs/balance/bal-01-v1-report.md 에 저장한다.
import { mkdirSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import { BALANCE_CANDIDATE } from "../content/balanceCandidate";
import { buildReport } from "./report";

it("balance report", () => {
  const md = buildReport(BALANCE_CANDIDATE);
  mkdirSync("docs/balance", { recursive: true });
  writeFileSync(`docs/balance/${BALANCE_CANDIDATE.contentVersion}-report.md`, md);
  process.stdout.write(`\n${md}\n`);
}, 120000);
