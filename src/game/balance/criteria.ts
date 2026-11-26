// BAL-01 통과 기준 BALX-01~10 (BALANCE 4절) 평가. 봇 실행 결과를 모아 기준별 통과·실패와 근거 문구를 만든다.
import type { ContentBundle, EnemyType, TowerType } from "../core/content/types";
import type { BotId } from "./bots";
import { runRole, type RoleResult } from "./roles";
import { runBot, type RunResult } from "./runner";

export const STAGES = [0, 1, 2] as const;
const ENEMIES: readonly EnemyType[] = ["normal", "fast", "heavy", "swarm"];
const TOWERS: readonly TowerType[] = ["archer", "ballista", "mage", "frost"];
const ALL_BOTS: readonly BotId[] = ["B0", "B1", "B2", "B3a", "B3b", "B3c", "B3d", "B4", "B5"];
const SINGLE: Readonly<Record<string, TowerType>> = { B3a: "archer", B3b: "ballista", B3c: "mage", B3d: "frost" };

export interface BalanceData {
  readonly version: string;
  /** bot → 스테이지별 결과. */
  readonly runs: Readonly<Record<BotId, readonly RunResult[]>>;
  readonly roles: readonly RoleResult[];
  /** B1 을 같은 입력으로 다시(추적 포함) 두 번 돌린 결과. */
  readonly replay: readonly [readonly RunResult[], readonly RunResult[]];
}

export interface Criterion {
  readonly id: string;
  readonly title: string;
  readonly pass: boolean;
  readonly detail: string;
}

export function collectData(bundle: ContentBundle): BalanceData {
  const runs = {} as Record<BotId, RunResult[]>;
  for (const id of ALL_BOTS) runs[id] = STAGES.map((s) => runBot(bundle, s, id));
  const roles: RoleResult[] = [];
  for (const e of ENEMIES) for (const t of TOWERS) roles.push(runRole(bundle, e, t));
  const replay: [RunResult[], RunResult[]] = [STAGES.map((s) => runBot(bundle, s, "B1", { trace: true })), STAGES.map((s) => runBot(bundle, s, "B1", { trace: true }))];
  return { version: bundle.contentVersion, runs, roles, replay };
}

const pct = (r: RunResult): number => Math.round((r.baseHp * 1000) / r.maxBaseHp) / 10;
const fmt = (r: RunResult): string => `${r.outcome === "victory" ? "승" : r.outcome === "defeat" ? "패" : "시간초과"} ${pct(r)}%`;
const rankOf = (rs: readonly RoleResult[], pick: (r: RoleResult) => number, tower: TowerType): number => 1 + rs.filter((r) => pick(r) > pick(rs.find((x) => x.tower === tower)!)).length;

export function evaluateCriteria(bundle: ContentBundle, d: BalanceData): Criterion[] {
  const out: Criterion[] = [];
  const add = (id: string, title: string, pass: boolean, detail: string) => out.push({ id, title, pass, detail });
  const B = (id: BotId, s: number) => d.runs[id][s];

  add("BALX-01", "B0 무대응: 세 스테이지 모두 패배, 웨이브 3 안에", STAGES.every((s) => B("B0", s).outcome === "defeat" && B("B0", s).reachedWave <= 3), STAGES.map((s) => `S${s + 1} ${fmt(B("B0", s))} W${B("B0", s).reachedWave}`).join(", "));
  add("BALX-02", "B1 균형: 세 스테이지 모두 승리", STAGES.every((s) => B("B1", s).outcome === "victory"), STAGES.map((s) => `S${s + 1} ${fmt(B("B1", s))}`).join(", "));
  const lim = [90, 70] as const;
  add(
    "BALX-03",
    "B1 남은 기지 HP: S1 ≥ 90%, S2 ≥ 70%, S3 40~90%",
    pct(B("B1", 0)) >= lim[0] && pct(B("B1", 1)) >= lim[1] && pct(B("B1", 2)) >= 40 && pct(B("B1", 2)) <= 90 && STAGES.every((s) => B("B1", s).outcome === "victory"),
    STAGES.map((s) => `S${s + 1} ${pct(B("B1", s))}%`).join(", "),
  );
  add("BALX-04", "B2 초보: S1 승리, S3 패배", B("B2", 0).outcome === "victory" && B("B2", 2).outcome === "defeat", STAGES.map((s) => `S${s + 1} ${fmt(B("B2", s))}`).join(", "));
  const singles = Object.keys(SINGLE) as BotId[];
  const s3Losers = singles.filter((id) => B(id, 2).outcome !== "victory");
  const s3Winners = singles.filter((id) => B(id, 2).outcome === "victory");
  add(
    "BALX-05",
    "B3 단일 종류: 4종 모두 S1 승리, S3 는 2종 이상 패배·승리 종류는 B1 보다 남은 HP 적음",
    singles.every((id) => B(id, 0).outcome === "victory") && s3Losers.length >= 2 && s3Winners.every((id) => B(id, 2).baseHp < B("B1", 2).baseHp),
    singles.map((id) => `${id}(${SINGLE[id]}) S1 ${fmt(B(id, 0))} / S3 ${fmt(B(id, 2))}`).join("; "),
  );
  add("BALX-06", "B4 조기 시작: S1 승리", B("B4", 0).outcome === "victory", STAGES.map((s) => `S${s + 1} ${fmt(B("B4", s))}`).join(", "));
  const timeOk = STAGES.every((s) => B("B1", s).seconds >= 240 && B("B1", s).seconds <= 360);
  const waveOk = STAGES.every((s) => B("B1", s).waves.length === 5 && B("B1", s).waves.every((w) => w.combatSeconds >= 30 && w.combatSeconds <= 75));
  add(
    "BALX-07",
    "플레이 시간(B1): 스테이지 240~360초, 웨이브당 전투 30~75초",
    timeOk && waveOk,
    STAGES.map((s) => `S${s + 1} ${B("B1", s).seconds}s [${B("B1", s).waves.map((w) => w.combatSeconds).join("/")}]`).join(", "),
  );
  const first = STAGES.map((s) => B("B1", s).towersAtFirstWave);
  const s3 = B("B1", 2);
  const lv4 = s3.levelDist[3];
  const left = s3.nextUpgradeCost === null ? null : s3.finalGold < s3.nextUpgradeCost * 3;
  add(
    "BALX-08",
    "경제 흐름(B1): W1 준비 중 타워 2~3개, S3 종료 Lv4 ≥ 1 이면서 전부 Lv4 는 아님(남는 골드 < 다음 강화 비용 × 3)",
    first.every((n) => n >= 2 && n <= 3) && lv4 >= 1 && left === true,
    `W1 시작 타워 ${first.join("/")}개, S3 레벨 분포 Lv1~4 ${s3.levelDist.join("/")}, 남은 골드 ${s3.finalGold}, 다음 강화 비용 ${s3.nextUpgradeCost ?? "없음"}`,
  );

  // BALX-09 역할 점검 (정적 수치 + 측정 시나리오)
  const tw = (t: TowerType) => bundle.towers.find((x) => x.type === t)!;
  const lvStat = (t: TowerType, level: number) => {
    const def = tw(t);
    const sum = (k: "damage" | "attackPeriodMs") => (def.levels.base[k] as number) + def.levels.increments.slice(0, level - 1).reduce((n, inc) => n + (inc[k] as number), 0);
    return { damage: sum("damage"), period: sum("attackPeriodMs") };
  };
  const checks: [string, boolean][] = [];
  for (const level of [1, 4]) {
    const stats = TOWERS.map((t) => ({ t, ...lvStat(t, level) }));
    checks.push([`Lv${level} 공격 주기 궁수 최단`, stats.every((x) => x.t === "archer" || x.period > stats.find((y) => y.t === "archer")!.period)]);
    checks.push([`Lv${level} 1발 피해 발리스타 최대`, stats.every((x) => x.t === "ballista" || x.damage < stats.find((y) => y.t === "ballista")!.damage)]);
    checks.push([`Lv${level} 단독 DPS 서리 최저`, stats.every((x) => x.t === "frost" || x.damage / x.period > stats.find((y) => y.t === "frost")!.damage / stats.find((y) => y.t === "frost")!.period)]);
  }
  const en = (t: EnemyType) => bundle.enemies.find((x) => x.type === t)!;
  checks.push(["고속형 이동속도 최대", ENEMIES.every((t) => t === "fast" || en(t).speedMtPerSec < en("fast").speedMtPerSec)]);
  checks.push(["중장형 HP 최대", ENEMIES.every((t) => t === "heavy" || en(t).hp < en("heavy").hp)]);
  checks.push(["중장형 기지 피해 최대", ENEMIES.every((t) => t === "heavy" || en(t).baseDamage < en("heavy").baseDamage)]);
  checks.push(["군집형 HP 최저", ENEMIES.every((t) => t === "swarm" || en(t).hp > en("swarm").hp)]);
  const swarmSegs = bundle.stages.flatMap((s) => s.waves.flatMap((w) => w.segments.filter((x) => x.enemyType === "swarm")));
  const otherMinInterval = Math.min(...bundle.stages.flatMap((s) => s.waves.flatMap((w) => w.segments.filter((x) => x.enemyType !== "swarm" && x.count > 1).map((x) => x.intervalMs))));
  checks.push(["군집형 생성 간격이 가장 짧음(≤ 500ms, 다른 종류 최소보다 짧음)", swarmSegs.length > 0 && swarmSegs.every((x) => x.count === 1 || x.intervalMs <= 500) && Math.min(...swarmSegs.filter((x) => x.count > 1).map((x) => x.intervalMs)) < otherMinInterval]);
  const gaps = bundle.stages.flatMap((s) =>
    s.waves.map((w) => {
      const ss = w.segments.filter((x) => x.enemyType === "swarm").sort((a, b) => a.startMs - b.startMs);
      return ss.length < 2 ? 0 : Math.max(...ss.slice(1).map((x, i) => x.startMs - (ss[i].startMs + (ss[i].count - 1) * ss[i].intervalMs)));
    }),
  );
  checks.push(["군집형 군집 사이 긴 공백(군집 끝~다음 군집 시작 ≥ 3000ms 인 웨이브가 있음)", gaps.some((g) => g >= 3000)]);
  const roleOf = (e: EnemyType) => d.roles.filter((r) => r.enemy === e);
  const killsRank = (e: EnemyType, t: TowerType) => rankOf(roleOf(e), (r) => r.killsPerKGold, t);
  const dmgRank = (e: EnemyType, t: TowerType) => rankOf(roleOf(e), (r) => r.damagePerGold, t);
  checks.push([`고속형 상대 골드당 처치 궁수 1~2위(측정 ${killsRank("fast", "archer")}위)`, killsRank("fast", "archer") <= 2]);
  checks.push([`중장형 상대 골드당 피해 발리스타 1위(측정 ${dmgRank("heavy", "ballista")}위)`, dmgRank("heavy", "ballista") === 1]);
  checks.push([`군집형 상대 골드당 처치 마법 1위(측정 ${killsRank("swarm", "mage")}위)`, killsRank("swarm", "mage") === 1]);
  const noFrostWorse = B("B5", 2).outcome !== "victory" || B("B5", 2).baseHp < B("B1", 2).baseHp;
  checks.push([`서리 제외(B5) 시 S3 결과가 나빠짐(B1 ${fmt(B("B1", 2))} → B5 ${fmt(B("B5", 2))})`, noFrostWorse]);
  add("BALX-09", "역할 점검(5절)", checks.every(([, ok]) => ok), checks.map(([n, ok]) => `${ok ? "○" : "×"} ${n}`).join("; "));

  const same = STAGES.every((s) => {
    const a = d.replay[0][s];
    const b = d.replay[1][s];
    return a.hashes !== undefined && b.hashes !== undefined && a.hashes.length === b.hashes.length && a.hashes.every((h, i) => h === b.hashes![i]) && JSON.stringify({ ...a, hashes: 0 }) === JSON.stringify({ ...b, hashes: 0 });
  });
  const noTrace = STAGES.every((s) => JSON.stringify({ ...d.replay[0][s], hashes: 0 }) === JSON.stringify({ ...B("B1", s), hashes: 0 }));
  add("BALX-10", "결정성: 같은 번들 2회(틱별 해시 포함) 동일, 추적 유무와 무관", same && noTrace, `B1 ${STAGES.map((s) => `S${s + 1} ${d.replay[0][s].hashes?.length ?? 0}틱`).join(", ")} 해시 일치=${same}, 추적 없는 실행과 일치=${noTrace}`);
  return out;
}
