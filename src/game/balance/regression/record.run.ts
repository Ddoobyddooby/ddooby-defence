// `npm run golden:record-scripts` 진입점(vitest 로 실행, vitest.record.config.mts). 현재 GAME_CONTENT 에서 봇 B1(S1~S5)·B2(S3)를 기록해
// scripts.ts 의 G1~G4·G6·G7 블록 형식으로 stdout 에 출력한다. 파일은 쓰지 않는다 — 출력으로 scripts.ts 의 해당 블록을 바꾸고, scenarios.ts 의
// expectedOutcome·expectedEndTick 을 새 값으로 고친 뒤 `npm run golden:update` 를 실행한다(SIM-CONTRACT 15.6).
import { it } from "vitest";
import { GAME_CONTENT } from "../../content/gameContent";
import { formatScript, recordBotScript } from "./record";

it("record bot scripts", () => {
  const jobs = [
    { name: "G1_S1_B1", doc: "G1: 스테이지 1, 균형 봇(B1) 기록.", stage: 0, bot: "B1" },
    { name: "G2_S2_B1", doc: "G2: 스테이지 2, 균형 봇(B1) 기록.", stage: 1, bot: "B1" },
    { name: "G3_S3_B1", doc: "G3: 스테이지 3, 균형 봇(B1) 기록.", stage: 2, bot: "B1" },
    { name: "G4_S3_B2", doc: "G4: 스테이지 3, 초보 봇(B2) 기록.", stage: 2, bot: "B2" },
    { name: "G6_S4_B1", doc: "G6: 스테이지 4, 균형 봇(B1) 기록.", stage: 3, bot: "B1" },
    { name: "G7_S5_B1", doc: "G7: 스테이지 5, 균형 봇(B1) 기록.", stage: 4, bot: "B1" },
  ] as const;
  let out = `// contentVersion ${GAME_CONTENT.contentVersion}\n`;
  for (const j of jobs) {
    const r = recordBotScript(GAME_CONTENT, j.stage, j.bot);
    if (r.submitRejected > 0) out += `// 경고: ${j.name} 에서 코어가 접수를 거부한 명령 ${r.submitRejected}건\n`;
    out += `\n${formatScript(j.name, j.doc, r)}`;
  }
  process.stdout.write(`\n${out}\n`);
}, 120000);
