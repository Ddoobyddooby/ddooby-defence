// GOLD-01 — 검증 봇의 명령을 기록해 scripts.ts 형태로 만드는 도구. 테스트는 쓰지 않는다(골든은 scripts.ts 의 고정 명령만 쓴다).
// 승인 수치가 바뀌면(BALANCE.md 9절) 옛 스크립트는 골드 부족 거부 등으로 의미가 달라질 수 있어 다시 기록해야 한다 — `npm run golden:record-scripts`.
import { createAttempt } from "../../core/attempt";
import type { ContentBundle, TowerType } from "../../core/content/types";
import { compileStageMap } from "../../core/map";
import { createBot, type BotId } from "../bots";
import { pathSamples, rankCells, type ScoredCell } from "../placement";
import type { Cmd } from "./scripts";

export interface RecordedScript {
  readonly commands: readonly Cmd[];
  readonly outcome: "victory" | "defeat" | "timeout";
  readonly endTick: number;
  /** 코어가 거부(접수 불가)한 명령 수. 0 이어야 스크립트로 의미가 있다. */
  readonly submitRejected: number;
}

/** balance/runner.ts 와 같은 방식으로 봇을 돌리며, 접수한 명령을 "tick = completedTick + 1" 로 기록한다. attemptId 는 1(골든 시나리오와 같음). */
export function recordBotScript(bundle: ContentBundle, stageIndex: number, botId: BotId, maxTicks = 24000): RecordedScript {
  const core = createAttempt(bundle, bundle.stages[stageIndex].stageId, 1);
  const map = compileStageMap(core.stageContent.stage.map);
  const samples = pathSamples(map);
  const ranked = {} as Record<TowerType, readonly ScoredCell[]>;
  for (const t of core.stageContent.global.towers) ranked[t.type] = rankCells(map, samples, t.levels.base.rangeMt);
  const bot = createBot(botId);
  const commands: Cmd[] = [];
  let submitRejected = 0;
  while (!core.isResult() && core.completedTick < maxTicks) {
    const snap = core.snapshot() as unknown as { tick: number; phase: string; gold: number; waveIndex: number; towers: { towerId: number; type: TowerType; level: number; cell: { col: number; row: number } }[] };
    if (snap.phase === "preparation" || snap.phase === "combat") {
      const towers = snap.towers.map((t) => ({ towerId: t.towerId, type: t.type, level: t.level, col: t.cell.col, row: t.cell.row }));
      for (const c of bot.act({ tick: snap.tick, phase: snap.phase as "preparation" | "combat", gold: snap.gold, waveIndex: snap.waveIndex, towers, stage: core.stageContent, ranked })) {
        if (!core.submit(c.kind, c.payload).ok) submitRejected += 1;
        commands.push({ tick: core.completedTick + 1, kind: c.kind, payload: c.payload });
      }
    }
    core.step();
  }
  const outcome = (core.snapshot() as unknown as { outcome: string | null }).outcome;
  return { commands, outcome: outcome === "victory" ? "victory" : outcome === "defeat" ? "defeat" : "timeout", endTick: core.completedTick, submitRejected };
}

/** scripts.ts 의 한 줄 형식(`build(1, "archer", 12, 3),` 등). 봇은 build·upgrade·startWave 만 낸다. */
export function formatCmd(c: Cmd): string {
  const p = c.payload as { towerType?: string; tile?: { col: number; row: number }; towerId?: number };
  switch (c.kind) {
    case "build":
      return `build(${c.tick}, "${p.towerType}", ${p.tile!.col}, ${p.tile!.row})`;
    case "upgrade":
      return `upgrade(${c.tick}, ${p.towerId})`;
    case "startWave":
      return `startWave(${c.tick})`;
    default:
      throw new Error(`봇 기록에 없는 명령 종류: ${c.kind}`);
  }
}

export function formatScript(name: string, doc: string, r: RecordedScript): string {
  return `/** ${doc} ${r.outcome === "victory" ? "승리" : r.outcome === "defeat" ? "패배" : "시간 초과"}, ${r.endTick}틱. */\nexport const ${name}: readonly Cmd[] = [\n${r.commands.map((c) => `  ${formatCmd(c)},`).join("\n")}\n];\n`;
}
