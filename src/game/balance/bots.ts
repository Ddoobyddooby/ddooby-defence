// BAL-01 검증 봇 (BALANCE 3절). 난수·시계 없음. 봇은 매 틱 시작 전(= 직전 틱 완료 뒤)에 스냅샷을 보고 명령을 접수할 뿐이다.
// 아래 "봇 세부"는 문서 BALANCE 3.2절 아래에 기록한 값과 같다(변경 시 이유를 기록하고 claude-main 확인).
import type { StageContent, TowerType } from "../core/content/types";
import type { ScoredCell } from "./placement";

/** 봇 세부 (BALANCE 3.2 아래 기록). */
export const BOT_PARAMS = {
  /** B1·B3·B4·B5 설치 상한 N(후보 수치를 보기 전에 정함): 이 개수까지는 설치 우선(돈이 모일 때까지 기다림), 상한 이후 강화 우선. */
  towerCap: 6,
  /** B1·B4 구성 순서(반복). */
  composition: ["archer", "frost", "mage", "ballista"] as readonly TowerType[],
  /** B2 는 설치 후 보유 골드의 절반 이상이 남아야 설치한다(cost × 2 ≤ 보유 골드). */
  beginnerKeepNumerator: 2,
} as const;

export type BotId = "B0" | "B1" | "B2" | "B3a" | "B3b" | "B3c" | "B3d" | "B4" | "B5";
/** 봇 또는 역할 측정 시나리오 봇(예: "R-archer")의 식별자. */
export type BotLabel = BotId | `R-${TowerType}`;

export interface BotTower {
  readonly towerId: number;
  readonly type: TowerType;
  readonly level: number;
  readonly col: number;
  readonly row: number;
}

export interface BotView {
  readonly tick: number;
  readonly phase: "preparation" | "combat";
  readonly gold: number;
  readonly waveIndex: number;
  readonly towers: readonly BotTower[];
  readonly stage: StageContent;
  /** 타워 종류별 점수순 설치 후보(점유는 포함되어 있으니 봇이 거른다). */
  readonly ranked: Readonly<Record<TowerType, readonly ScoredCell[]>>;
}

export type BotCommand = { readonly kind: "build"; readonly payload: { towerType: TowerType; tile: { col: number; row: number } } } | { readonly kind: "upgrade"; readonly payload: { towerId: number } } | { readonly kind: "startWave"; readonly payload: Record<string, never> };

export interface Bot {
  readonly id: BotLabel;
  readonly name: string;
  act(view: BotView): BotCommand[];
}

const buildCostOf = (v: BotView, type: TowerType): number => v.stage.global.towers.find((t) => t.type === type)!.buildCost;
const upgradeCostOf = (v: BotView, type: TowerType, level: number): number => v.stage.global.towers.find((t) => t.type === type)!.upgradeCosts[level - 1];

function freeCells(v: BotView, type: TowerType, taken: ReadonlySet<number>): ScoredCell[] {
  return v.ranked[type].filter((c) => !taken.has(c.row * 100 + c.col));
}

/** 가장 낮은 레벨(동률은 먼저 지은 순 = towerId 작은 순)의 강화 가능 타워. */
function upgradeTarget(v: BotView): BotTower | null {
  let best: BotTower | null = null;
  for (const t of v.towers) {
    if (t.level >= 4) continue;
    if (best === null || t.level < best.level || (t.level === best.level && t.towerId < best.towerId)) best = t;
  }
  return best;
}

/**
 * B1 규칙(B3·B4·B5 공통): 상한 N 미만이면 구성 순서대로 가장 점수 높은 빈 칸에 설치(돈이 되는 만큼 한 번에, 모자라면 기다림).
 * 상한에 닿았으면 가장 낮은 레벨 타워부터 강화(돈이 될 때까지 기다림). 판매·타깃 변경 없음.
 */
function balancedAct(v: BotView, types: readonly TowerType[]): BotCommand[] {
  const cmds: BotCommand[] = [];
  const taken = new Set(v.towers.map((t) => t.row * 100 + t.col));
  let gold = v.gold;
  let count = v.towers.length;
  while (count < BOT_PARAMS.towerCap) {
    const type = types[count % types.length];
    const cost = buildCostOf(v, type);
    if (gold < cost) break;
    const cell = freeCells(v, type, taken)[0];
    if (cell === undefined) break;
    cmds.push({ kind: "build", payload: { towerType: type, tile: { col: cell.col, row: cell.row } } });
    taken.add(cell.row * 100 + cell.col);
    gold -= cost;
    count += 1;
  }
  if (cmds.length === 0 && count >= BOT_PARAMS.towerCap) {
    const t = upgradeTarget(v);
    if (t !== null && gold >= upgradeCostOf(v, t.type, t.level)) cmds.push({ kind: "upgrade", payload: { towerId: t.towerId } });
  }
  return cmds;
}

export function createBot(id: BotId): Bot {
  switch (id) {
    case "B0":
      return { id, name: "무대응", act: () => [] };
    case "B1":
      return { id, name: "균형", act: (v) => balancedAct(v, BOT_PARAMS.composition) };
    case "B2":
      return {
        id,
        name: "초보",
        act: (v) => {
          // 가장 싼 타워만, 점수 중간 순위 칸, 강화 없음, 보유 골드의 절반 이상을 남긴다.
          const cheapest = [...v.stage.global.towers].sort((a, b) => a.buildCost - b.buildCost || (a.type < b.type ? -1 : 1))[0];
          if (v.gold < cheapest.buildCost * BOT_PARAMS.beginnerKeepNumerator) return [];
          const taken = new Set(v.towers.map((t) => t.row * 100 + t.col));
          const free = freeCells(v, cheapest.type, taken).filter((c) => c.score > 0);
          const cell = free[Math.floor(free.length / 2)];
          return cell === undefined ? [] : [{ kind: "build", payload: { towerType: cheapest.type, tile: { col: cell.col, row: cell.row } } }];
        },
      };
    case "B3a":
      return { id, name: "궁수만", act: (v) => balancedAct(v, ["archer"]) };
    case "B3b":
      return { id, name: "발리스타만", act: (v) => balancedAct(v, ["ballista"]) };
    case "B3c":
      return { id, name: "마법만", act: (v) => balancedAct(v, ["mage"]) };
    case "B3d":
      return { id, name: "서리만", act: (v) => balancedAct(v, ["frost"]) };
    case "B4": {
      let startedWave = 0;
      return {
        id,
        name: "균형+조기 시작",
        act: (v) => {
          const cmds = balancedAct(v, BOT_PARAMS.composition);
          if (v.phase === "preparation" && v.waveIndex !== startedWave && v.tick > 0) {
            startedWave = v.waveIndex;
            cmds.push({ kind: "startWave", payload: {} });
          }
          return cmds;
        },
      };
    }
    case "B5":
      return { id, name: "균형(서리 제외)", act: (v) => balancedAct(v, BOT_PARAMS.composition.filter((t) => t !== "frost")) };
  }
}
