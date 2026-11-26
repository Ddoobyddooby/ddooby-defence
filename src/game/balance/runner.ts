// BAL-01 실행기: 번들 × 스테이지 × 봇 → 결과. 시도 코어에 submit 만 한다(코어 무변경).
import { createAttempt, createRecordedAttempt, type RecordedCore } from "../core/attempt";
import type { ContentBundle, StageContent, TowerType } from "../core/content/types";
import { compileStageMap } from "../core/map";
import { TICK_MS } from "../core/sim/time";
import { createBot, type Bot, type BotCommand, type BotId, type BotLabel, type BotTower, type BotView } from "./bots";
import { pathSamples, rankCells, type ScoredCell } from "./placement";

const TOWER_TYPES_LIST: readonly TowerType[] = ["archer", "ballista", "mage", "frost"];

export interface WaveStat {
  readonly wave: number;
  /** 전투 시작 틱(없으면 시작 못 함). */
  readonly startTick: number | null;
  /** 완료(또는 패배) 틱. */
  readonly endTick: number | null;
  readonly combatSeconds: number;
  readonly leaks: number;
  readonly baseDamage: number;
  readonly kills: number;
  readonly goldAtEnd: number | null;
}

export interface RunResult {
  readonly botId: BotLabel;
  readonly stageIndex: number;
  readonly outcome: "victory" | "defeat" | "timeout";
  readonly baseHp: number;
  readonly maxBaseHp: number;
  readonly ticks: number;
  readonly seconds: number;
  readonly reachedWave: number;
  readonly waves: readonly WaveStat[];
  /** 첫 웨이브 시작 시점의 타워 수. */
  readonly towersAtFirstWave: number;
  readonly towerCount: number;
  readonly levelDist: readonly [number, number, number, number];
  readonly kills: number;
  readonly leaks: number;
  readonly incomeKill: number;
  readonly incomeWaveClear: number;
  readonly spentBuild: number;
  readonly spentUpgrade: number;
  readonly initialGold: number;
  readonly finalGold: number;
  readonly damageByTower: Readonly<Record<TowerType, number>>;
  /** 남은 타워 중 가장 낮은 레벨 타워의 다음 강화 비용(전부 Lv4 면 null). */
  readonly nextUpgradeCost: number | null;
  /** trace 옵션이 있을 때만: 틱 0..끝 상태 해시. */
  readonly hashes?: readonly string[];
}

export interface RunOptions {
  readonly trace?: boolean;
  readonly maxTicks?: number;
  /** 이 웨이브가 완료되면(waveCleared) 거기서 멈춘다(역할 측정용). */
  readonly stopAfterWave?: number;
}

interface Snap {
  readonly tick: number;
  readonly phase: string;
  readonly gold: number;
  readonly baseHp: number;
  readonly waveIndex: number;
  readonly towers: readonly { towerId: number; type: TowerType; level: number; cell: { col: number; row: number } }[];
}

export function runBot(bundle: ContentBundle, stageIndex: number, botId: BotId, opts: RunOptions = {}): RunResult {
  return runWithBot(bundle, stageIndex, createBot(botId), opts);
}

export function runWithBot(bundle: ContentBundle, stageIndex: number, bot: Bot, opts: RunOptions = {}): RunResult {
  const stageDef = bundle.stages[stageIndex];
  const rec = opts.trace ? createRecordedAttempt(bundle, stageDef.stageId, 1) : null;
  const core: RecordedCore = rec !== null ? rec.core : createAttempt(bundle, stageDef.stageId, 1);
  const content: StageContent = core.stageContent;
  const map = compileStageMap(content.stage.map);
  const samples = pathSamples(map);
  const ranked = {} as Record<TowerType, readonly ScoredCell[]>;
  for (const t of content.global.towers) ranked[t.type] = rankCells(map, samples, t.levels.base.rangeMt);

  const maxTicks = opts.maxTicks ?? 24000;
  const towerTypeById = new Map<number, TowerType>();
  const waves: { wave: number; startTick: number | null; endTick: number | null; leaks: number; baseDamage: number; kills: number; goldAtEnd: number | null }[] = [];
  const waveRec = (n: number) => {
    let w = waves.find((x) => x.wave === n);
    if (w === undefined) {
      w = { wave: n, startTick: null, endTick: null, leaks: 0, baseDamage: 0, kills: 0, goldAtEnd: null };
      waves.push(w);
    }
    return w;
  };
  let curWave = 1;
  let kills = 0;
  let leaks = 0;
  let incomeKill = 0;
  let incomeWaveClear = 0;
  let spentBuild = 0;
  let spentUpgrade = 0;
  let towersAtFirstWave = 0;
  const damageByTower: Record<TowerType, number> = { archer: 0, ballista: 0, mage: 0, frost: 0 };
  let towerCountNow = 0;
  const hashes: string[] = [];

  let stop = false;
  while (!stop && !core.isResult() && core.completedTick < maxTicks) {
    const snap = core.snapshot() as unknown as Snap;
    towerCountNow = snap.towers.length;
    if (snap.phase === "preparation" || snap.phase === "combat") {
      const towers: BotTower[] = snap.towers.map((t) => ({ towerId: t.towerId, type: t.type, level: t.level, col: t.cell.col, row: t.cell.row }));
      const view: BotView = { tick: snap.tick, phase: snap.phase, gold: snap.gold, waveIndex: snap.waveIndex, towers, stage: content, ranked };
      for (const c of bot.act(view) as BotCommand[]) core.submit(c.kind, c.payload);
    }
    const events = core.step();
    for (const e of events) {
      const type = e.type as string;
      const tick = e.tick as number;
      if (type === "towerBuilt") {
        towerTypeById.set(e.towerId as number, e.towerType as TowerType);
      } else if (type === "waveStarted") {
        curWave = e.waveIndex as number;
        const w = waveRec(curWave);
        w.startTick = tick;
        if (curWave === 1) towersAtFirstWave = towerCountNow + events.filter((x) => x.type === "towerBuilt" && (x.tick as number) === tick).length;
      } else if (type === "enemyKilled") {
        kills += 1;
        waveRec(curWave).kills += 1;
      } else if (type === "enemyReachedBase") {
        leaks += 1;
        const w = waveRec(curWave);
        w.leaks += 1;
        w.baseDamage += e.baseDamage as number;
      } else if (type === "enemyDamaged") {
        const tt = towerTypeById.get(e.towerId as number);
        if (tt !== undefined) damageByTower[tt] += e.damage as number;
      } else if (type === "economySettled") {
        const key = (e.key as string).replace(/^a\d+:/, "");
        const delta = e.delta as number;
        if (key.startsWith("kill:")) incomeKill += delta;
        else if (key.startsWith("waveClear:")) incomeWaveClear += delta;
        else if (key.startsWith("build:")) spentBuild += -delta;
        else if (key.startsWith("upgrade:")) spentUpgrade += -delta;
      } else if (type === "waveCleared") {
        const w = waveRec(e.waveIndex as number);
        w.endTick = tick;
        if (opts.stopAfterWave !== undefined && e.waveIndex === opts.stopAfterWave) stop = true;
        w.goldAtEnd = (events.filter((x) => x.type === "economySettled" && /^a\d+:waveClear:/.test(String(x.key))).map((x) => x.goldAfter as number)[0]) ?? null;
      } else if (type === "resultReached") {
        const w = waveRec(curWave);
        if (w.endTick === null) w.endTick = tick;
      }
    }
    if (rec !== null) {
      // 틱별 해시는 기록기가 만든다(코어 trace). 끝에서 한꺼번에 꺼낸다.
    }
  }

  const final = core.snapshot() as unknown as Snap & { outcome: string | null };
  if (rec !== null) for (const t of rec.trace().ticks) hashes.push(t.hash);
  const levelDist: [number, number, number, number] = [0, 0, 0, 0];
  for (const t of final.towers) levelDist[t.level - 1] += 1;
  const lowest = [...final.towers].filter((t) => t.level < 4).sort((a, b) => a.level - b.level || a.towerId - b.towerId)[0];
  const nextUpgradeCost = lowest === undefined ? null : content.global.towers.find((t) => t.type === lowest.type)!.upgradeCosts[lowest.level - 1];
  const outcome = final.outcome === "victory" ? "victory" : final.outcome === "defeat" ? "defeat" : "timeout";
  const ticks = core.completedTick;
  return {
    botId: bot.id,
    stageIndex,
    outcome,
    baseHp: final.baseHp,
    maxBaseHp: content.stage.baseHp,
    ticks,
    seconds: (ticks * TICK_MS) / 1000,
    reachedWave: final.waveIndex,
    waves: waves.sort((a, b) => a.wave - b.wave).map((w) => ({ ...w, combatSeconds: w.startTick !== null && w.endTick !== null ? ((w.endTick - w.startTick) * TICK_MS) / 1000 : 0 })),
    towersAtFirstWave,
    towerCount: final.towers.length,
    levelDist,
    kills,
    leaks,
    incomeKill,
    incomeWaveClear,
    spentBuild,
    spentUpgrade,
    initialGold: content.stage.initialGold,
    finalGold: final.gold,
    damageByTower,
    nextUpgradeCost,
    ...(rec !== null ? { hashes } : {}),
  };
}

export { TOWER_TYPES_LIST };
