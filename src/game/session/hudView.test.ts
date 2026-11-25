// UI-01 — hudView 가 스냅샷·콘텐츠에서만 값을 파생하는지. 기대값은 DEV_PLACEHOLDER 의 리터럴로 직접 계산(archer: 설치 100, Lv1 damage 12·주기 800ms·사거리 3500, 강화 80, 환급 floor(100×0.7)=70).
import { describe, expect, it } from "vitest";
import { DEV_PLACEHOLDER } from "../content/devBundle";
import { createAttempt } from "../core/attempt";
import { formatTenths, hudView, prepRemainingText } from "./hudView";
import { EMPTY_UI, type Snapshot } from "./types";

const STAGE1 = DEV_PLACEHOLDER.stages[0].stageId;
const fresh = () => {
  const core = createAttempt(DEV_PLACEHOLDER, STAGE1, 1);
  return { core, content: core.stageContent, snap: () => core.snapshot() as unknown as Snapshot };
};

describe("formatTenths·prepRemainingText", () => {
  it("틱 × 0.05 초를 소수 1자리로, 남은 시간은 올림", () => {
    expect(prepRemainingText(400)).toBe("20.0");
    expect(prepRemainingText(3)).toBe("0.2"); // 0.15 → 올림
    expect(prepRemainingText(1)).toBe("0.1");
    expect(prepRemainingText(0)).toBe("0.0");
    expect(formatTenths(35)).toBe("3.5");
    expect(formatTenths(8)).toBe("0.8");
  });
});

describe("hudView (UI-CONTRACT 7절)", () => {
  it("준비 단계 초기: 상단 정보·준비 정보·타워 목록(가격·affordable)", () => {
    const { content, snap } = fresh();
    const h = hudView(snap(), content, EMPTY_UI, "초원 전초기지");
    expect(h).toMatchObject({
      stageName: "초원 전초기지", waveIndex: 1, waveTotal: 5, phase: "preparation", phaseLabel: "준비", paused: false,
      gold: 300, baseHp: 20, maxBaseHp: 20, controlsEnabled: true, isResult: false, mode: "default", combat: null, detail: null,
      prep: { remainingText: "20.0", canStartNow: true },
    });
    expect(h.towers.map((t) => [t.type, t.name, t.cost, t.affordable])).toEqual([
      ["archer", "궁수탑", 100, true], ["ballista", "발리스타", 160, true], ["mage", "마법탑", 150, true], ["frost", "서리탑", 110, true],
    ]);
  });
  it("골드 부족이면 affordable false(설치 후 골드 200 → ballista 160 은 가능, 두 번째 설치 뒤 100 → 160 불가)", () => {
    const { core, content, snap } = fresh();
    core.submit("build", { towerType: "archer", tile: { col: 0, row: 0 } });
    core.submit("build", { towerType: "archer", tile: { col: 1, row: 0 } });
    core.step();
    const h = hudView(snap(), content, EMPTY_UI, "x");
    expect(h.gold).toBe(100);
    expect(h.towers.map((t) => t.affordable)).toEqual([true, false, false, false]);
  });
  it("전투 단계: 생성 진행·생존 적 수(웨이브 1 총 6마리), 준비 정보 없음", () => {
    const { core, content, snap } = fresh();
    core.submit("startWave", {});
    core.step();
    const h = hudView(snap(), content, EMPTY_UI, "x");
    expect(h).toMatchObject({ phase: "combat", phaseLabel: "전투", prep: null, combat: { spawned: 1, totalSpawn: 6, alive: 1 } });
  });
  it("일시정지 표시: 단계명이 '일시정지'가 되고 조작이 비활성이며 조기 시작 불가", () => {
    const { core, content, snap } = fresh();
    core.pause();
    const h = hudView(snap(), content, EMPTY_UI, "x");
    expect(h).toMatchObject({ paused: true, phaseLabel: "일시정지", controlsEnabled: false, prep: { canStartNow: false } });
  });
  it("타워 상세(archer Lv1, 준비): 능력치·강화 가격·환급·판매 가능·타깃", () => {
    const { core, content, snap } = fresh();
    core.submit("build", { towerType: "archer", tile: { col: 0, row: 0 } });
    core.step();
    const h = hudView(snap(), content, { ...EMPTY_UI, selectedTowerId: 1 }, "x");
    expect(h.detail).toMatchObject({
      towerId: 1, type: "archer", name: "궁수탑", level: 1, damage: 12, periodText: "0.8", rangeText: "3.5", aoeText: null, slowText: null,
      targetingMode: "first", upgradeCost: 80, canAffordUpgrade: true, canUpgrade: true, refund: 70, canSell: true,
    });
  });
  it("종류별 상세: mage 는 폭발 반경, frost 는 둔화 표시", () => {
    const { core, content, snap } = fresh();
    core.submit("build", { towerType: "mage", tile: { col: 0, row: 0 } });
    core.submit("build", { towerType: "frost", tile: { col: 1, row: 0 } });
    core.step();
    const s = snap();
    expect(hudView(s, content, { ...EMPTY_UI, selectedTowerId: 1 }, "x").detail).toMatchObject({ aoeText: "1.2", slowText: null, damage: 18 });
    expect(hudView(s, content, { ...EMPTY_UI, selectedTowerId: 2 }, "x").detail).toMatchObject({ aoeText: null, slowText: "35% / 2.0", damage: 4 });
  });
  it("Lv4 는 강화 불가(upgradeCost null), 전투 중에는 판매 불가", () => {
    const rich = structuredClone(DEV_PLACEHOLDER) as unknown as { stages: { initialGold: number }[] };
    rich.stages[0].initialGold = 1000; // 설치 100 + 강화 80+120+180
    const core = createAttempt(rich, STAGE1, 1);
    const content = core.stageContent;
    const snap = () => core.snapshot() as unknown as Snapshot;
    core.submit("build", { towerType: "archer", tile: { col: 0, row: 0 } });
    core.step();
    for (let i = 0; i < 3; i++) {
      core.submit("upgrade", { towerId: 1 });
      core.step();
    }
    const prep = hudView(snap(), content, { ...EMPTY_UI, selectedTowerId: 1 }, "x");
    expect(prep.detail).toMatchObject({ level: 4, upgradeCost: null, canUpgrade: false, canSell: true });
    core.submit("startWave", {});
    core.step();
    expect(hudView(snap(), content, { ...EMPTY_UI, selectedTowerId: 1 }, "x").detail).toMatchObject({ canSell: false });
  });
  it("없는 타워 선택은 detail null", () => {
    const { content, snap } = fresh();
    expect(hudView(snap(), content, { ...EMPTY_UI, selectedTowerId: 9 }, "x").detail).toBeNull();
  });
  it("설치 모드는 mode·placeType·목록 selected 에 반영", () => {
    const { content, snap } = fresh();
    const h = hudView(snap(), content, { ...EMPTY_UI, placeType: "mage" }, "x");
    expect(h).toMatchObject({ mode: "place", placeType: "mage" });
    expect(h.towers.find((t) => t.selected)?.type).toBe("mage");
    expect(hudView(snap(), content, { ...EMPTY_UI, sellConfirmId: 1 }, "x").mode).toBe("sellConfirm");
  });
});
