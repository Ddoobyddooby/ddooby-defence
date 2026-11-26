// BAL-01 보고서 생성: 번들 → Markdown. 순수 함수(파일·콘솔 출력은 호출자 몫).
import type { ContentBundle, TowerType } from "../core/content/types";
import { STAGES, collectData, evaluateCriteria, type BalanceData } from "./criteria";
import type { BotId } from "./bots";
import type { RunResult } from "./runner";

const BOT_ORDER: readonly BotId[] = ["B0", "B1", "B2", "B3a", "B3b", "B3c", "B3d", "B4", "B5"];
const TOWERS: readonly TowerType[] = ["archer", "ballista", "mage", "frost"];
const pct = (r: RunResult): string => `${Math.round((r.baseHp * 1000) / r.maxBaseHp) / 10}%`;
const out = (r: RunResult): string => (r.outcome === "victory" ? "승" : r.outcome === "defeat" ? "패" : "시간초과");

/** 튜닝 이력(시도한 값 → 결과). 후보 수치가 바뀌면 사람이 갱신한다. */
export const TUNING_HISTORY_V1: readonly string[] = [
  "DEV_PLACEHOLDER 그대로(초기 골드 300/350/400 가정): B1 이 S1·S2·S3 모두 기지 HP 100% 로 이겨 BALX-03(S3 40~90%)·BALX-04·BALX-05 실패. S3 가 너무 쉬움.",
  "S3 웨이브 수를 전부 키움(배율): 초반(W1~W2)부터 모든 봇이 새서 B1 도 S3 에서 불안정 → 후반만 거칠게, 초반은 완만하게 하는 손으로 쓴 웨이브로 전환.",
  "서리 감속 5500bp·2500ms → 6500~8000bp·3500~4500ms, 사거리 2500 → 2750: 서리를 뺀 봇(B5)이 B1 보다 나빠지게 함(BALX-09). 사거리는 마법(3000) 미만을 지켜야 검증 통과(사거리 순서 규칙).",
  "발리스타 투사체 속도 10000 → 7000mt/s: 고속형 상대 발리스타 효율을 낮춰 궁수가 고속형 상대 골드당 처치 2위가 되게 함. 궁수 Lv1 피해 10 → 12, 고속형 HP 70 → 60 과 함께 적용(궁수 1~2위, 발리스타 중장형 1위 유지).",
  "마법사 Lv1 피해 16 → 15 → 13 → 12: 마법만 쓰는 봇(B3c)이 S3 에서 B1 보다 높은 HP 로 이기던 문제(BALX-05 '승리한 단일 종류는 B1 보다 HP 낮음') 해소. 서리 Lv1 피해 8 → 7 로 단독 DPS 서리 최저(마법 12/1.5s = 8.0 과 동률이던 것) 확보.",
  "S3 웨이브 수 ×1.25, 이후 W3~W5 ×1.15, 간격 ×0.8~0.9: B1 의 S3 HP 가 98% → 25% 로 절벽(민감도 큼). 간격 ×0.9 + 개수 ×1.25 가 40~90% 구간. 일반형 HP 80 → 90(S3 B2 가 이기던 것 해소).",
  "S3 기지 HP 50 → 40 → 36 → 32 → 30: B2(초보)가 S3 에서 아슬하게 이기던 것을 패배로. 일반형 HP 90 을 쓰면서 HP 30 유지.",
  "S3 전투 시간: W3 중장형 12 → 9~8기·간격 1600 → 1100, 군집 두 무리 사이 공백(≥ 3000ms) 추가, W4 일반형 간격 650 → 550 으로 웨이브당 전투 75초 이내, 스테이지 시간 360초 이내. 준비 시간 W2~W5 15000 → 8000ms.",
  "S1 W2 전투 시간이 20초대로 짧아져 일반형 4기 추가(offset 8000, 3000ms 간격) → 32.6초.",
  "최종 v1 은 위 값의 결과이며 BALX-01~10 모두 통과. 기준을 맞추려고 봇 규칙(구성 순서·상한 6·B2 규칙)은 바꾸지 않았고 맵(STAGE_MAPS)도 그대로다.",
];

/** Stage 4·5 추가 튜닝(bal-02-v1). Stage 1~3 값·공통 수치는 불변. */
export const TUNING_HISTORY_V2: readonly string[] = [
  "S4 첫 안(고속형 단일 위주, 기지 HP 32): B1 이 W1 에 7누수 후 전 웨이브 0누수(B1 은 설치 상한 6 에서 골드가 남음), B2(초보)는 이익 구조상 궁수 41기까지 쌓아 100% 로 이김 → '고속은 궁수가 정답' 이라 BALX-04 불가.",
  "S4 고속형 수를 키움(웨이브 4·5 에 80~110기): B1 22% 로 무너지는데 B2 는 91% 유지(궁수 누적). 경제가 후반 압박을 흡수 → 기준 충족 방향이 아님.",
  "S4 후반에 중장(체력 강화)·군집·제어 저항 일반형을 섞고(고속 비중은 절반 이상 유지, 53%) 초반 고속·군집 러시를 키움: 궁수만 쓰는 B2 가 W2·W3 에서 누수로 무너지고 B1 은 5~6 누수. 기지 HP 32 → 30 → 24 로 B2 패배 확정(B1 79%).",
  "S4 W1 전투 22초 < 30초 → 고속 9기 간격 1800 → 11기 2600ms 로 늘려 30초 확보.",
  "S5 첫 안(중장 8~12기 위주): 전투 85~106초, 스테이지 478~510초. 경로 54칸·중장 600mt/s(끝까지 88초) 때문에 BALX-07 불가 → claude-main 질의(2026-11-27): ①'중장 비중' = 기본 체력 합 기준, ②S5 만 웨이브 전투 ≤ 90초·스테이지 ≤ 380초, 경로 유지.",
  "S5 중장 3~10기 + 고속·군집·일반형 호위 대량(기본 체력 합 기준 중장 최대 유지): 호위가 B1 누수 압박을 만들고 중장은 일찍 죽는다. 준비 8초, 기지 HP 36 → 30 → 28 → 18. 시도 값→결과: 호위 120~160기/ 간격 150~250ms 에서 B3c(마법만)가 B1 보다 좋았다(마법 범위 공격이 밀집 호위를 쓸어냄: B1 89~93% vs B3c 96%).",
  "마법만 쓰는 봇이 B1 을 이기는 문제 해결: 일반형 간격을 500 → 700~1000ms, 중장 간격 1500 → 2000~2500ms 로 벌려 범위 공격 효율을 낮추고, W2 에 속도 강화 고속형(마법 포탄이 못 맞춤)을 넣어 B1(궁수 포함)이 더 잘 버티게 함. W2 중장은 체력 강화 없이 3기(체력 강화 4기는 전투 88초로 시간 초과). 결과 B1 78% > B3c 33%.",
  "S5 스테이지 시간 389~398초 → 379초: W2~W4 일반형 호위 수·간격 줄임(전투 시간은 마지막 일반형·중장이 죽는 시점이 좌우). 이후 리뷰(F1)로 S5 첫 웨이브 준비를 8초 → 15초로 늘리고 S5 총 시간 상한을 390초로 올렸다(claude-main 결정).",
  "봇 규칙·맵·공통 수치(타워·적·특성·경제)는 바꾸지 않았다.",
];

const stageLabel = (s: number): string => `S${s + 1}`;

function runTable(d: BalanceData): string {
  const rows = [`| 봇 | ${STAGES.map((s) => `S${s + 1}`).join(" | ")} |`, `|---|${STAGES.map(() => "---").join("|")}|`];
  for (const id of BOT_ORDER) {
    rows.push(`| ${id} | ${STAGES.map((s) => `${out(d.runs[id][s])} ${pct(d.runs[id][s])} · ${Math.round(d.runs[id][s].seconds)}s · W${d.runs[id][s].reachedWave}`).join(" | ")} |`);
  }
  return rows.join("\n");
}

function b1Detail(d: BalanceData): string {
  const rows = ["| 스테이지 | 웨이브별 전투(초) | 누수(웨이브별) | 총 시간 | W1 시작 타워 | 레벨 Lv1~4 | 골드 수입(처치+웨이브) | 지출(설치+강화) | 남은 골드 |", "|---|---|---|---|---|---|---|---|---|"];
  for (const s of STAGES) {
    const r = d.runs.B1[s];
    rows.push(
      `| ${stageLabel(s)} | ${r.waves.map((w) => w.combatSeconds).join(" / ")} | ${r.waves.map((w) => w.leaks).join(" / ")} | ${r.seconds}s | ${r.towersAtFirstWave} | ${r.levelDist.join("/")} | ${r.incomeKill}+${r.incomeWaveClear} | ${r.spentBuild}+${r.spentUpgrade} | ${r.finalGold} |`,
    );
  }
  const share = ["", "| 스테이지 | " + TOWERS.join(" | ") + " |", "|---|" + TOWERS.map(() => "---").join("|") + "|"];
  for (const s of STAGES) {
    const r = d.runs.B1[s];
    const total = TOWERS.reduce((n, t) => n + r.damageByTower[t], 0) || 1;
    share.push(`| ${stageLabel(s)} | ${TOWERS.map((t) => `${Math.round((r.damageByTower[t] * 1000) / total) / 10}%`).join(" | ")} |`);
  }
  return rows.join("\n") + "\n\n타워별 피해 비중(B1):\n" + share.join("\n");
}

function roleTable(d: BalanceData): string {
  const rows = ["| 적 | 타워 | 설치 수 | 처치/전체 | 처치/1000골드 | 피해/골드 | 누수 |", "|---|---|---|---|---|---|---|"];
  for (const r of d.roles) rows.push(`| ${r.enemy} | ${r.tower} | ${r.towers} | ${r.kills}/${r.total} | ${r.killsPerKGold.toFixed(1)} | ${r.damagePerGold.toFixed(2)} | ${r.leaks} |`);
  return rows.join("\n");
}

function valueTable(bundle: ContentBundle): string {
  const t = ["| 타워 | 설치 | 강화(Lv2/3/4) | Lv1 피해 | 주기(ms) | 사거리(mt) |", "|---|---|---|---|---|---|"];
  for (const x of bundle.towers) t.push(`| ${x.type} | ${x.buildCost} | ${x.upgradeCosts.join("/")} | ${x.levels.base.damage} | ${x.levels.base.attackPeriodMs} | ${x.levels.base.rangeMt} |`);
  const e = ["", "| 적 | HP | 속도(mt/s) | 기지 피해 | 처치 보상 |", "|---|---|---|---|---|"];
  for (const x of bundle.enemies) e.push(`| ${x.type} | ${x.hp} | ${x.speedMtPerSec} | ${x.baseDamage} | ${x.killReward} |`);
  const s = ["", "| 스테이지 | 초기 골드 | 기지 HP | 웨이브 수 |", "|---|---|---|---|"];
  for (const x of bundle.stages) s.push(`| ${x.stageId} | ${x.initialGold} | ${x.baseHp} | ${x.waves.length} (준비 ${x.waves.map((w) => w.prepMs / 1000).join("/")}s) |`);
  return [...t, ...e, ...s].join("\n");
}

export function buildReport(bundle: ContentBundle, data: BalanceData = collectData(bundle)): string {
  const crit = evaluateCriteria(bundle, data);
  const L: string[] = [];
  L.push(`# BAL-01 밸런스 검증 보고서 (${bundle.contentVersion})`);
  L.push("", "> 후보 수치, 사용자 승인 전. `npm run balance` 가 생성한다(결정적: 같은 번들이면 같은 결과).", "");
  L.push("## 1. 통과 기준 요약", "", "| 기준 | 결과 | 근거 |", "|---|---|---|");
  for (const c of crit) L.push(`| ${c.id} ${c.title} | ${c.pass ? "통과" : "실패"} | ${c.detail.replaceAll("|", "/")} |`);
  L.push("", `전체: ${crit.filter((c) => c.pass).length}/${crit.length} 통과`, "");
  L.push("## 2. 봇 × 스테이지 결과", "", "(결과 · 남은 기지 HP · 총 시간 · 도달 웨이브)", "", runTable(data), "");
  L.push("## 3. B1 상세", "", b1Detail(data), "");
  L.push("## 4. 역할 측정 (스테이지 2 경로, 골드 800, 단일 적×단일 타워)", "", roleTable(data), "");
  L.push("## 5. 후보 수치 요약", "", valueTable(bundle), "");
  L.push("## 6. 튜닝 이력 (시도한 값 → 결과)", "", "Stage 1~3(bal-01-v1)", "", ...TUNING_HISTORY_V1.map((h, i) => `${i + 1}. ${h}`), "", "Stage 4·5(bal-02-v1)", "", ...TUNING_HISTORY_V2.map((h, i) => `${i + 1}. ${h}`), "");
  return L.join("\n");
}
