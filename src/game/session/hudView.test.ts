// UI-01 — hudView 가 스냅샷·콘텐츠에서만 값을 파생하는지. 기대값은 DEV_PLACEHOLDER 의 리터럴로 직접 계산(archer: 설치 100, Lv1 damage 12·주기 800ms·사거리 3500, 강화 80, 환급 floor(100×0.7)=70).
import { describe, expect, it } from "vitest";
import { DEV_PLACEHOLDER } from "../content/devBundle";
import { createAttempt } from "../core/attempt";
import { expandWave } from "../core/content/expandWave";
import { formatHundredths, formatTenths, hudView, NO_PENDING, pendingKey, prepRemainingText } from "./hudView";
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
      towerId: 1, type: "archer", name: "궁수탑", level: 1, damage: 12, periodText: "0.80", rangeText: "3.50", aoeText: null, slowText: null,
      targetingMode: "first", upgradeCost: 80, canAffordUpgrade: true, canUpgrade: true, refund: 70, canSell: true,
    });
  });
  it("종류별 상세: mage 는 폭발 반경, frost 는 둔화 표시", () => {
    const { core, content, snap } = fresh();
    core.submit("build", { towerType: "mage", tile: { col: 0, row: 0 } });
    core.submit("build", { towerType: "frost", tile: { col: 1, row: 0 } });
    core.step();
    const s = snap();
    expect(hudView(s, content, { ...EMPTY_UI, selectedTowerId: 1 }, "x").detail).toMatchObject({ aoeText: "1.20", slowText: null, damage: 18 });
    expect(hudView(s, content, { ...EMPTY_UI, selectedTowerId: 2 }, "x").detail).toMatchObject({ aoeText: null, slowText: "35% / 2.00초", damage: 4 });
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

describe("리뷰 UI-01 F4: 총 웨이브·총 생성 수는 콘텐츠·expandWave 에서 파생", () => {
  it("waveTotal = content.stage.waves.length (콘텐츠가 3웨이브면 3)", () => {
    const { content, snap } = fresh();
    const three = { ...content, stage: { ...content.stage, waves: content.stage.waves.slice(0, 3) } };
    expect(hudView(snap(), three, EMPTY_UI, "x").waveTotal).toBe(3);
    expect(hudView(snap(), content, EMPTY_UI, "x").waveTotal).toBe(5);
  });
  it("전투 중 총 생성 수 = expandWave 길이(웨이브 1: 6, 웨이브 2: 6+3=9)", () => {
    const { core, content, snap } = fresh();
    core.submit("startWave", {});
    core.step();
    const h = hudView(snap(), content, EMPTY_UI, "x");
    expect(h.combat?.totalSpawn).toBe(6);
    expect(expandWave(content.stage.waves[0], 0)).toHaveLength(6);
    expect(expandWave(content.stage.waves[1], 0)).toHaveLength(9);
    expect(expandWave(content.stage.waves[2], 0)).toHaveLength(13);
  });
});

describe("리뷰 UI-01 F5: 50ms·250mt 단위가 보이는 표기", () => {
  it("formatHundredths: 750ms → 0.75, 800 → 0.80, 3750mt → 3.75", () => {
    expect(formatHundredths(75)).toBe("0.75");
    expect(formatHundredths(80)).toBe("0.80");
    expect(formatHundredths(375)).toBe("3.75");
    expect(formatHundredths(0)).toBe("0.00");
  });
  it("archer 공격 주기 Lv1..4 = 0.80·0.80·0.75·0.70초(Lv3 강화가 변화 없는 것처럼 보이지 않는다), 사거리 3.50→3.75→4.00→4.25", () => {
    const rich = structuredClone(DEV_PLACEHOLDER) as unknown as { stages: { initialGold: number }[] };
    rich.stages[0].initialGold = 1000;
    const core = createAttempt(rich, STAGE1, 1);
    core.submit("build", { towerType: "archer", tile: { col: 0, row: 0 } });
    core.step();
    const seen: string[][] = [];
    for (let lv = 1; lv <= 4; lv++) {
      const d = hudView(core.snapshot() as unknown as Snapshot, core.stageContent, { ...EMPTY_UI, selectedTowerId: 1 }, "x").detail!;
      seen.push([d.periodText, d.rangeText]);
      core.submit("upgrade", { towerId: 1 });
      core.step();
    }
    expect(seen).toEqual([["0.80", "3.50"], ["0.80", "3.75"], ["0.75", "4.00"], ["0.70", "4.25"]]);
  });
});

describe("리뷰 UI-01 F6: 대기 중 같은 명령은 버튼 비활성", () => {
  it("pending 키가 있으면 조기 시작·강화·판매가 비활성(코어 판정과 무관한 표시)", () => {
    const { core, content, snap } = fresh();
    core.submit("build", { towerType: "archer", tile: { col: 0, row: 0 } });
    core.step();
    const ui = { ...EMPTY_UI, selectedTowerId: 1 };
    const free = hudView(snap(), content, ui, "x", NO_PENDING);
    expect(free.prep?.canStartNow).toBe(true);
    expect(free.detail).toMatchObject({ canUpgrade: true, canSell: true });
    const busy = hudView(snap(), content, ui, "x", new Set([pendingKey.startWave, pendingKey.upgrade(1), pendingKey.sell(1)]));
    expect(busy.prep?.canStartNow).toBe(false);
    expect(busy.detail).toMatchObject({ canUpgrade: false, canSell: false });
    // 다른 타워의 대기는 영향 없음
    expect(hudView(snap(), content, ui, "x", new Set([pendingKey.upgrade(2)])).detail?.canUpgrade).toBe(true);
  });
});
