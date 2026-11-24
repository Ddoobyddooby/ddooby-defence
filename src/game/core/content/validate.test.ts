// DATA-01 — 기대값은 SIM-CONTRACT 11절의 표를 옮긴 리터럴이다. 입력 변형은 testing/fixtures.ts 의 경로 도우미로 만든다.
import { describe, expect, it } from "vitest";
import { isStagePlayable, validateContent, validateStageForEntry } from "./validate";
import type { ContentError } from "./types";
import { seg, validBundle, valueAt, withDeleted, withValue, withValues } from "./testing/fixtures";

const paths = (errs: readonly ContentError[]): string[] => errs.map((e) => e.path);
const globalPaths = (b: unknown): string[] => paths(validateContent(b).globalErrors);
const stagePaths = (b: unknown, i: number): string[] => paths(validateContent(b).stages[i].errors);

function expectGlobalError(b: unknown, path: string): void {
  expect(globalPaths(b)).toContain(path);
}
function expectStageError(b: unknown, i: number, path: string): void {
  expect(stagePaths(b, i)).toContain(path);
}

/** 경계 4점: min-1 오류, min 통과, max 통과, max+1 오류. multiple 이 있으면 배수 위반도 오류. */
function expectRange(path: string, min: number, max: number, where: "global" | number, multiple = 1): void {
  const errsFor = (v: unknown): string[] => (where === "global" ? globalPaths(withValue(path, v)) : stagePaths(withValue(path, v), where));
  const full = where === "global" ? path : path.replace(/^stages\[\d+\]\./, `stages[${where}].`);
  const at = (v: unknown): boolean => errsFor(v).includes(full);
  expect(at(min - 1), `${path} = ${min - 1}`).toBe(true);
  expect(at(min), `${path} = ${min}`).toBe(false);
  expect(at(max), `${path} = ${max}`).toBe(false);
  expect(at(max + 1), `${path} = ${max + 1}`).toBe(true);
  if (multiple > 1) expect(at(min + 1), `${path} = ${min + 1} (배수 아님)`).toBe(true);
}

describe("정상 묶음", () => {
  it("검증 통과: 전역·3 스테이지 오류 0", () => {
    const v = validateContent(validBundle());
    expect(v.globalErrors).toEqual([]);
    expect(v.stages.map((s) => s.errors)).toEqual([[], [], []]);
    expect(v.stages.map((s) => s.stageId)).toEqual(["stage-1-meadow-outpost", "stage-2-snowfall-pass", "stage-3-dusk-ruins"]);
    for (let i = 0; i < 3; i++) expect(isStagePlayable(v, i)).toBe(true);
  });
  it("진입 재검증 통과, 결과는 깊게 동결되고 원본과 분리된다", () => {
    const input = validBundle();
    const r = validateStageForEntry(input, "stage-2-snowfall-pass");
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    expect(r.content.stage.stageId).toBe("stage-2-snowfall-pass");
    expect(r.content.stage.initialGold).toBe(350);
    expect(r.content.stage.baseHp).toBe(25);
    expect(r.content.global.towers.length).toBe(4);
    for (const o of [r.content, r.content.global, r.content.global.towers[2].levels.base, r.content.stage.map.waypoints[0], r.content.stage.waves[2].segments[1]]) {
      expect(Object.isFrozen(o)).toBe(true);
    }
    expect(() => {
      (r.content.stage as { initialGold: number }).initialGold = 1;
    }).toThrow(TypeError);
    // 통과 후 원본 변경이 결과에 영향이 없다.
    (valueAt(input, "stages[1]") as { initialGold: number }).initialGold = 9;
    (valueAt(input, "towers[0].levels.base") as { damage: number }).damage = 999;
    (valueAt(input, "stages[1].waves[0].segments[0]") as { count: number }).count = 77;
    expect(r.content.stage.initialGold).toBe(350);
    expect(r.content.global.towers[0].levels.base.damage).toBe(10);
    expect(r.content.stage.waves[0].segments[0].count).toBe(3);
  });
  it("검증은 입력을 바꾸지 않는다", () => {
    const input = withValues([["stages[0].waves[0].prepMs", 33], ["towers[0].buildCost", "5"]]);
    const before = JSON.stringify(input);
    validateContent(input);
    validateStageForEntry(input, "stage-1-meadow-outpost");
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe("11.1 구조", () => {
  it("타워·적·특성 개수", () => {
    const b = validBundle() as Record<string, unknown[]>;
    expectGlobalError({ ...b, towers: b.towers.slice(0, 3) }, "towers");
    expectGlobalError({ ...b, towers: [...b.towers, b.towers[0]] }, "towers");
    expectGlobalError({ ...b, enemies: b.enemies.slice(0, 3) }, "enemies");
    expectGlobalError({ ...b, traits: b.traits.slice(0, 2) }, "traits");
    expectGlobalError({ ...b, traits: [...b.traits, b.traits[0]] }, "traits");
  });
  it("type 누락·중복·미지값", () => {
    expectGlobalError(withDeleted("towers[0].type"), "towers[0].type");
    expectGlobalError(withValue("towers[1].type", "archer"), "towers[1].type"); // 중복
    expect(globalPaths(withValue("towers[1].type", "archer"))).toContain("towers");
    expectGlobalError(withValue("towers[0].type", "cannon"), "towers[0].type");
    expectGlobalError(withDeleted("enemies[2].type"), "enemies[2].type");
    expectGlobalError(withValue("enemies[1].type", "normal"), "enemies[1].type");
    expectGlobalError(withValue("enemies[0].type", "boss"), "enemies[0].type");
    expectGlobalError(withDeleted("traits[0].type"), "traits[0].type");
    expectGlobalError(withValue("traits[2].type", "hpBoost"), "traits[2].type");
    expectGlobalError(withValue("traits[0].type", "poison"), "traits[0].type");
  });
  it("종류별 필드: mage 만 aoeRadiusMt, frost 만 slow*", () => {
    expectGlobalError(withDeleted("towers[2].levels.base.aoeRadiusMt"), "towers[2].levels.base.aoeRadiusMt");
    expectGlobalError(withDeleted("towers[2].levels.increments[1].aoeRadiusMt"), "towers[2].levels.increments[1].aoeRadiusMt");
    expectGlobalError(withValue("towers[0].levels.base.aoeRadiusMt", 1000), "towers[0].levels.base.aoeRadiusMt");
    expectGlobalError(withValue("towers[1].levels.increments[0].aoeRadiusMt", 0), "towers[1].levels.increments[0].aoeRadiusMt");
    expectGlobalError(withValue("towers[2].levels.base.slowBp", 1000), "towers[2].levels.base.slowBp");
    expectGlobalError(withDeleted("towers[3].levels.base.slowBp"), "towers[3].levels.base.slowBp");
    expectGlobalError(withDeleted("towers[3].levels.base.slowDurationMs"), "towers[3].levels.base.slowDurationMs");
    expectGlobalError(withValue("towers[0].levels.increments[2].slowDurationMs", 0), "towers[0].levels.increments[2].slowDurationMs");
    expectGlobalError(withValue("towers[3].levels.base.aoeRadiusMt", 1), "towers[3].levels.base.aoeRadiusMt");
  });
  it("특성: 다른 특성의 필드는 오류, 자기 필드 누락 오류", () => {
    expectGlobalError(withValue("traits[0].hpBoostBp", 1000), "traits[0].hpBoostBp");
    expectGlobalError(withDeleted("traits[1].hpBoostBp"), "traits[1].hpBoostBp");
    expectGlobalError(withDeleted("traits[2].killRewardBonus"), "traits[2].killRewardBonus");
  });
  it("웨이브: 개수·waveIndex 순서·role 불일치", () => {
    const b = validBundle() as { stages: { waves: unknown[] }[] };
    const four = withValue("stages[0].waves", b.stages[0].waves.slice(0, 4));
    expectStageError(four, 0, "stages[0].waves");
    const six = withValue("stages[2].waves", [...b.stages[2].waves, b.stages[2].waves[0]]);
    expectStageError(six, 2, "stages[2].waves");
    expectStageError(withValue("stages[1].waves[2].waveIndex", 4), 1, "stages[1].waves[2].waveIndex");
    expectStageError(withValue("stages[1].waves[0].waveIndex", 0), 1, "stages[1].waves[0].waveIndex");
    expectStageError(withValue("stages[0].waves[1].role", "basic"), 0, "stages[0].waves[1].role");
    expectStageError(withValue("stages[0].waves[4].role", "boss"), 0, "stages[0].waves[4].role");
    expectStageError(withDeleted("stages[0].waves[0].role"), 0, "stages[0].waves[0].role");
  });
  it("Segment 0개, trait null/미지값/누락", () => {
    expectStageError(withValue("stages[0].waves[0].segments", []), 0, "stages[0].waves[0].segments");
    expect(stagePaths(withValue("stages[2].waves[1].segments[0].trait", null), 2)).toEqual([]);
    expectStageError(withValue("stages[2].waves[1].segments[0].trait", "poison"), 2, "stages[2].waves[1].segments[0].trait");
    expectStageError(withValue("stages[2].waves[1].segments[0].trait", undefined), 2, "stages[2].waves[1].segments[0].trait");
    expectStageError(withDeleted("stages[2].waves[1].segments[0].trait"), 2, "stages[2].waves[1].segments[0].trait");
    expectStageError(withValue("stages[2].waves[1].segments[0].enemyType", "dragon"), 2, "stages[2].waves[1].segments[0].enemyType");
  });
  it("스테이지: 개수·stageId 중복·map.stageId 불일치", () => {
    const b = validBundle() as { stages: unknown[] };
    expectGlobalError({ ...b, stages: b.stages.slice(0, 2) }, "stages");
    expectGlobalError({ ...b, stages: [...b.stages, b.stages[0]] }, "stages");
    expectGlobalError(withValue("stages[1].stageId", "stage-1-meadow-outpost"), "stages[1].stageId");
    expectStageError(withValue("stages[1].map.stageId", "other"), 1, "stages[1].map.stageId");
    expectStageError(withDeleted("stages[2].stageId"), 2, "stages[2].stageId");
  });
  it("알 수 없는 필드·최상위 구조 오류", () => {
    expectStageError(withValue("stages[0].extra", 1), 0, "stages[0].extra");
    expectGlobalError(withValue("extra", 1), "content.extra");
    expectGlobalError(withValue("economy.extra", 1), "economy.extra");
    expect(validateContent(null).globalErrors.map((e) => e.path)).toEqual(["content"]);
    expectGlobalError(withDeleted("economy"), "content.economy");
    expectGlobalError(withValue("contentVersion", ""), "content.contentVersion");
    expectGlobalError(withValue("contentVersion", 3), "content.contentVersion");
  });
});

describe("11.2 필드 범위(하한-1/하한/상한/상한+1)", () => {
  it("골드 필드", () => {
    expectRange("towers[0].buildCost", 1, 1_000_000, "global");
    expectRange("enemies[0].killReward", 1, 1_000_000, "global");
    expectRange("stages[0].initialGold", 1, 1_000_000, 0);
    expectRange("stages[1].baseHp", 1, 1_000_000, 1);
    expectRange("stages[0].waves[0].clearReward", 1, 1_000_000, 0);
    expectRange("traits[0].killRewardBonus", 0, 1_000_000, "global");
  });
  it("강화 비용 개별 범위", () => {
    const at = (v: number, i: number): boolean => globalPaths(withValue(`towers[0].upgradeCosts[${i}]`, v)).includes(`towers[0].upgradeCosts[${i}]`);
    expect([at(0, 0), at(1, 0)]).toEqual([true, false]);
    expect([at(1_000_000, 2), at(1_000_001, 2)]).toEqual([false, true]);
  });
  it("hp·damage·baseDamage", () => {
    expectRange("enemies[0].hp", 1, 1_000_000, "global");
    expectRange("enemies[0].baseDamage", 1, 1_000_000, "global");
    expectRange("towers[0].levels.base.damage", 1, 1_000_000, "global");
  });
  it("사거리·범위 반경: ballista 사거리(순서 오류가 나지 않는 쪽)·mage aoe", () => {
    expectRange("towers[1].levels.base.rangeMt", 1, 25_000, "global");
    expectRange("towers[2].levels.base.aoeRadiusMt", 1, 25_000, "global");
  });
  it("속도 20..100000, 20의 배수", () => {
    expectRange("enemies[0].speedMtPerSec", 20, 100_000, "global", 20);
    expectRange("towers[0].levels.base.projectileSpeedMtPerSec", 20, 100_000, "global", 20);
  });
  it("지속 시간 50..600000, 50의 배수", () => {
    expectRange("towers[0].levels.base.attackPeriodMs", 50, 600_000, "global", 50);
    expectRange("towers[0].levels.base.projectileTtlMs", 50, 600_000, "global", 50);
    expectRange("towers[3].levels.base.slowDurationMs", 50, 600_000, "global", 50);
    expectRange("stages[0].waves[0].prepMs", 50, 600_000, 0, 50);
  });
  it("startMs 0..600000, 50의 배수", () => {
    expectRange("stages[0].waves[0].segments[0].startMs", 0, 600_000, 0, 50);
  });
  it("count 1..1000", () => {
    expectRange("stages[0].waves[0].segments[0].count", 1, 1_000, 0);
  });
  it("intervalMs: count>1 이면 50..600000·배수, count==1 이면 0 도 허용", () => {
    const p = "stages[0].waves[0].segments[0]";
    const bad = (count: number, interval: number): boolean => stagePaths(withValues([[`${p}.count`, count], [`${p}.intervalMs`, interval]]), 0).includes(`${p}.intervalMs`);
    expect([bad(3, 0), bad(3, 49), bad(3, 50), bad(3, 600_000), bad(3, 600_050), bad(3, 75)]).toEqual([true, true, false, false, true, true]);
    expect([bad(1, 0), bad(1, 50), bad(1, 25), bad(1, 600_050), bad(1, -50)]).toEqual([false, false, true, true, true]);
  });
  it("slowBp 1..9999, resistBp·refundRateBp 0..10000, boost 1..90000", () => {
    expectRange("towers[3].levels.base.slowBp", 1, 9_999, "global");
    expectRange("traits[0].resistBp", 0, 10_000, "global");
    expectRange("economy.refundRateBp", 0, 10_000, "global");
    expectRange("traits[1].hpBoostBp", 1, 90_000, "global");
    expectRange("traits[2].speedBoostBp", 1, 90_000, "global");
  });
  it("웨이브당 Segment 64개 통과·65개 오류", () => {
    const make = (n: number): unknown[] => Array.from({ length: n }, () => seg(0, 100, 1));
    const p = "stages[0].waves[1].segments";
    expect(stagePaths(withValue(p, make(64)), 0)).not.toContain(p);
    expect(stagePaths(withValue(p, make(65)), 0)).toContain(p);
  });
  it("웨이브당 적 5000마리 통과·5001마리 오류", () => {
    const p = "stages[0].waves[1].segments";
    const five = [seg(0, 50, 1000), seg(0, 50, 1000), seg(0, 50, 1000), seg(0, 50, 1000), seg(0, 50, 1000)];
    expect(stagePaths(withValue(p, five), 0)).not.toContain(p);
    expect(stagePaths(withValue(p, [...five.slice(0, 4), seg(0, 50, 1000), seg(0, 0, 1)]), 0)).toContain(p);
  });
  it("증분 적용 결과가 범위를 벗어나는 레벨은 그 레벨 경로의 오류(메시지에 레벨 표시)", () => {
    const find = (b: unknown, path: string): ContentError | undefined => validateContent(b).globalErrors.find((e) => e.path === path);
    const lv3 = find(withValue("towers[0].levels.increments[1].damage", 1_000_000), "towers[0].levels.increments[1].damage");
    expect(lv3?.message).toContain("Lv3");
    // 누적 고정: base 999800, 증분 [100,100,100] → Lv2 999900, Lv3 1000000(통과), Lv4 1000100(오류). 비누적이면 전부 통과한다.
    const cum = withValues([["towers[0].levels.base.damage", 999_800], ["towers[0].levels.increments[0].damage", 100], ["towers[0].levels.increments[1].damage", 100], ["towers[0].levels.increments[2].damage", 100]]);
    expect(globalPaths(cum).filter((p) => p.startsWith("towers[0]."))).toEqual(["towers[0].levels.increments[2].damage"]);
    expect(find(cum, "towers[0].levels.increments[2].damage")?.message).toContain("1000100");
    // 하한: Lv1 damage 10 + (−10) = 0 → Lv2 오류, −9 → 1 통과
    expect(find(withValue("towers[0].levels.increments[0].damage", -10), "towers[0].levels.increments[0].damage")?.message).toContain("Lv2");
    expect(find(withValue("towers[0].levels.increments[0].damage", -9), "towers[0].levels.increments[0].damage")).toBeUndefined();
    // 시간: 1000 + 0 + 0 + 25 → 50의 배수 위반(Lv4), 1000 + 50 통과
    expect(find(withValue("towers[0].levels.increments[2].attackPeriodMs", 25), "towers[0].levels.increments[2].attackPeriodMs")?.message).toContain("Lv4");
    expect(find(withValue("towers[0].levels.increments[2].attackPeriodMs", 50), "towers[0].levels.increments[2].attackPeriodMs")).toBeUndefined();
    // frost slowBp: 3000 + 500·… 증분 7000 → Lv2 10000 이면 오류, 6999 → 9999 통과
    expect(find(withValue("towers[3].levels.increments[0].slowBp", 7000), "towers[3].levels.increments[0].slowBp")).toBeDefined();
    expect(find(withValue("towers[3].levels.increments[0].slowBp", 6999), "towers[3].levels.increments[0].slowBp")).toBeUndefined();
    // 증분 자체는 범위 검사 대상이 아니다: 결과만 범위 안이면 큰 음수 증분도 통과
    expect(find(withValues([["towers[1].levels.base.damage", 900_000], ["towers[1].levels.increments[2].damage", -899_000]]), "towers[1].levels.increments[2].damage")).toBeUndefined();
  });
});

describe("F1 map 엄격 필드", () => {
  it("map·waypoint·reservedCells 좌표의 알 수 없는 필드는 정확한 경로 오류, 그 스테이지만 격리", () => {
    for (const [path, expected] of [
      ["stages[1].map.extra", "stages[1].map.extra"],
      ["stages[1].map.waypoints[0].extra", "stages[1].map.waypoints[0].extra"],
    ] as const) {
      const b = withValue(path, 1);
      const v = validateContent(b);
      expect(v.globalErrors).toEqual([]);
      expect(paths(v.stages[1].errors)).toEqual([expected]);
      expect([0, 1, 2].map((i) => isStagePlayable(v, i))).toEqual([true, false, true]);
      expect(validateStageForEntry(b, "stage-2-snowfall-pass").ok).toBe(false);
    }
    const reserved = withValue("stages[1].map.reservedCells", [{ col: 0, row: 0, extra: 1 }]);
    expect(stagePaths(reserved, 1)).toEqual(["stages[1].map.reservedCells[0].extra"]);
    expect(stagePaths(reserved, 0)).toEqual([]);
  });
});

describe("F2 오류 수집 완전성", () => {
  it("base damage null + attackPeriodMs 75: 두 오류 모두", () => {
    const b = withValues([["towers[0].levels.base.damage", null], ["towers[0].levels.base.attackPeriodMs", 75]]);
    // 75 는 누적되어 Lv1~4 모두 50 의 배수 위반(4건) + damage 오류. damage 후속 레벨은 생략.
    expect(globalPaths(b).sort()).toEqual([
      "towers[0].levels.base.attackPeriodMs",
      "towers[0].levels.base.damage",
      "towers[0].levels.increments[0].attackPeriodMs",
      "towers[0].levels.increments[1].attackPeriodMs",
      "towers[0].levels.increments[2].attackPeriodMs",
    ]);
  });
  it("increments[0] damage null + attackPeriodMs 25: Lv2 1025 배수 오류와 damage 오류", () => {
    const b = withValues([["towers[0].levels.increments[0].damage", null], ["towers[0].levels.increments[0].attackPeriodMs", 25]]);
    // 1025 는 Lv2~4 로 이어지므로 attackPeriodMs 오류 3건 + damage 오류 1건
    expect(globalPaths(b).sort()).toEqual([
      "towers[0].levels.increments[0].attackPeriodMs",
      "towers[0].levels.increments[0].damage",
      "towers[0].levels.increments[1].attackPeriodMs",
      "towers[0].levels.increments[2].attackPeriodMs",
    ]);
    const e = validateContent(b).globalErrors.find((x) => x.path === "towers[0].levels.increments[0].attackPeriodMs");
    expect(e?.message).toContain("Lv2");
    expect(e?.message).toContain("1025");
    // damage 가 무효여서 Lv2~4 damage 누적 검사만 생략된다: 같은 레벨의 다른 필드(rangeMt)는 계속 검사
    const c = withValues([["towers[0].levels.increments[0].damage", null], ["towers[0].levels.increments[1].rangeMt", 30_000]]);
    expect(globalPaths(c)).toContain("towers[0].levels.increments[1].rangeMt");
  });
  it("upgradeCosts [null, 0]: 길이 오류 + 각 항목 오류", () => {
    const b = withValue("towers[0].upgradeCosts", [null, 0]);
    expect(globalPaths(b).sort()).toEqual(["towers[0].upgradeCosts", "towers[0].upgradeCosts[0]", "towers[0].upgradeCosts[1]"]);
  });
  it("increments 가 2개여도 존재하는 항목은 각각 검사", () => {
    const b = withValues([["towers[0].levels.increments", [{ damage: null }, { damage: 1 }]]]);
    const ps = globalPaths(b);
    expect(ps).toContain("towers[0].levels.increments");
    expect(ps).toContain("towers[0].levels.increments[0].damage");
    expect(ps).toContain("towers[0].levels.increments[0].attackPeriodMs"); // 누락 필드
  });
  it("waypoints[0].col null + waypoints[1].row null: 둘 다, 그 스테이지만", () => {
    const b = withValues([["stages[1].map.waypoints[0].col", null], ["stages[1].map.waypoints[1].row", null]]);
    expect(stagePaths(b, 1).sort()).toEqual(["stages[1].map.waypoints[0].col", "stages[1].map.waypoints[1].row"]);
    expect(stagePaths(b, 0)).toEqual([]);
  });
  it("맵의 구조 오류가 있으면 기하 검증은 건너뛰고, 없을 때만 기하 오류를 보고", () => {
    // 구조 오류(col null)와 기하 오류(대각)가 함께 있어도 구조 오류만
    const both = withValues([["stages[0].map.waypoints[0].col", null], ["stages[0].map.waypoints[1]", { col: 3, row: 5 }]]);
    expect(stagePaths(both, 0)).toEqual(["stages[0].map.waypoints[0].col"]);
    // 구조가 맞으면 기하 오류 보고
    expect(stagePaths(withValue("stages[0].map.waypoints[1]", { col: 3, row: 5 }), 0)).toEqual(["stages[0].map.waypoints[1]"]);
  });
  it("map.stageId 불일치와 좌표 오류를 함께 보고", () => {
    const b = withValues([["stages[2].map.stageId", "other"], ["stages[2].map.waypoints[1].col", 99]]);
    expect(stagePaths(b, 2).sort()).toEqual(["stages[2].map.stageId", "stages[2].map.waypoints[1].col"]);
  });
});

describe("RR1-F2a type 무효여도 공통 레벨 필드 검사", () => {
  it("type cannon + base.damage null + attackPeriodMs 75: type·누락 type·damage·누적 75 배수 오류, 전용 필드 연쇄 오류 없음", () => {
    const b = withValues([["towers[0].type", "cannon"], ["towers[0].levels.base.damage", null], ["towers[0].levels.base.attackPeriodMs", 75]]);
    expect(globalPaths(b).sort()).toEqual(
      [
        "towers",
        "towers[0].type",
        "towers[0].levels.base.damage",
        "towers[0].levels.base.attackPeriodMs",
        "towers[0].levels.increments[0].attackPeriodMs",
        "towers[0].levels.increments[1].attackPeriodMs",
        "towers[0].levels.increments[2].attackPeriodMs",
      ].sort(),
    );
  });
  it("전용 필드(aoeRadiusMt·slowBp·slowDurationMs)가 있거나 없어도 오류 없이 무시", () => {
    const withExtras = withValues([
      ["towers[0].type", "cannon"],
      ["towers[0].levels.base.aoeRadiusMt", 1500],
      ["towers[0].levels.base.slowBp", 99999],
      ["towers[0].levels.increments[1].slowDurationMs", 7],
    ]);
    expect(globalPaths(withExtras).sort()).toEqual(["towers", "towers[0].type"]);
    // 종류 전용 필드가 아닌 알 수 없는 필드는 여전히 오류
    expect(globalPaths(withValues([["towers[0].type", "cannon"], ["towers[0].levels.base.bogus", 1]]))).toContain("towers[0].levels.base.bogus");
  });
  it("type 이 무효인 타워는 사거리 순서 검사에서 제외(공통 사거리 범위 검사는 수행)", () => {
    const b = withValues([["towers[0].type", "cannon"], ["towers[0].levels.base.rangeMt", 99_999]]);
    expect(globalPaths(b).sort()).toEqual(["towers", "towers[0].levels.base.rangeMt", "towers[0].levels.increments[0].rangeMt", "towers[0].levels.increments[1].rangeMt", "towers[0].levels.increments[2].rangeMt", "towers[0].type"].sort());
    // 순서 오류(위치를 모르므로)는 어느 타워에도 보고되지 않는다
    const lowRange = withValues([["towers[0].type", "cannon"], ["towers[0].levels.base.rangeMt", 1]]);
    expect(globalPaths(lowRange).sort()).toEqual(["towers", "towers[0].type"]);
  });
});

describe("RR1-F2b 맵 필드 오류가 있으면 기하 검증 생략", () => {
  const DIAGONAL = { col: 3, row: 5 }; // (0,2)에서 대각
  it("map.extra + 대각 → extra 오류만", () => {
    const b = withValues([["stages[0].map.extra", 1], ["stages[0].map.waypoints[1]", DIAGONAL]]);
    expect(stagePaths(b, 0)).toEqual(["stages[0].map.extra"]);
  });
  it("waypoints[0].extra + 대각 → extra 오류만", () => {
    const b = withValues([["stages[0].map.waypoints[0].extra", 1], ["stages[0].map.waypoints[1]", DIAGONAL]]);
    expect(stagePaths(b, 0)).toEqual(["stages[0].map.waypoints[0].extra"]);
  });
  it("reservedCells[0].extra + 대각 → extra 오류만", () => {
    const b = withValues([["stages[0].map.reservedCells", [{ col: 0, row: 0, extra: 1 }]], ["stages[0].map.waypoints[1]", DIAGONAL]]);
    expect(stagePaths(b, 0)).toEqual(["stages[0].map.reservedCells[0].extra"]);
  });
  it("map.stageId 불일치 + 대각 → 불일치 오류만", () => {
    const b = withValues([["stages[0].map.stageId", "other"], ["stages[0].map.waypoints[1]", DIAGONAL]]);
    expect(stagePaths(b, 0)).toEqual(["stages[0].map.stageId"]);
  });
  it("맵 밖 필드 오류(initialGold) + 대각은 두 오류 모두 보고", () => {
    const b = withValues([["stages[0].initialGold", 0], ["stages[0].map.waypoints[1]", DIAGONAL]]);
    expect(stagePaths(b, 0).sort()).toEqual(["stages[0].initialGold", "stages[0].map.waypoints[1]"]);
    const c = withValues([["stages[0].waves[0].prepMs", 33], ["stages[0].map.extra", 1]]);
    expect(stagePaths(c, 0).sort()).toEqual(["stages[0].map.extra", "stages[0].waves[0].prepMs"]);
  });
});

describe("C1 스테이지 자리 격리", () => {
  it("hole·undefined·null·객체 아님은 같은 판정: 그 자리만 오류(stageId null), 다른 스테이지 진입 가능", () => {
    for (const make of [() => withDeleted("stages[1]"), () => withValue("stages[1]", undefined), () => withValue("stages[1]", null), () => withValue("stages[1]", 7), () => withValue("stages[1]", "x")]) {
      const b = make();
      const v = validateContent(b);
      expect(v.globalErrors).toEqual([]);
      expect(v.stages.map((s) => s.stageId)).toEqual(["stage-1-meadow-outpost", null, "stage-3-dusk-ruins"]);
      expect(paths(v.stages[1].errors)).toEqual(["stages[1]"]);
      expect([0, 1, 2].map((i) => isStagePlayable(v, i))).toEqual([true, false, true]);
      expect(validateStageForEntry(b, "stage-1-meadow-outpost").ok).toBe(true);
      expect(validateStageForEntry(b, "stage-3-dusk-ruins").ok).toBe(true);
      expect(validateStageForEntry(b, "stage-2-snowfall-pass").ok).toBe(false);
    }
  });
  it("길이 ≠ 3 은 전역 오류(모든 스테이지 차단), stages 가 배열이 아니어도 전역", () => {
    const b = validBundle() as { stages: unknown[] };
    for (const stages of [b.stages.slice(0, 2), [...b.stages, b.stages[0]], [], "x", null]) {
      const bad = { ...b, stages };
      expect(globalPaths(bad)).toContain("stages");
      expect(validateStageForEntry(bad, "stage-1-meadow-outpost").ok).toBe(false);
    }
  });
});

describe("증분 누락 시 중복 오류 없음", () => {
  it("increments 가 없으면 그 오류와 Lv1 범위 오류만 보고하고 Lv2~4 결과 검사는 하지 않는다", () => {
    const b = withValue("towers[0].levels.base.damage", 1_000_001, withDeleted("towers[0].levels.increments"));
    expect(globalPaths(b).sort()).toEqual(["towers[0].levels.base.damage", "towers[0].levels.increments"]);
  });
});

describe("11.3 교차 규칙", () => {
  it("사거리: 같은 레벨 순서 위반(Lv1·Lv3), 동률도 오류", () => {
    // Lv1: ballista 7000 → archer 와 같게(동률) / 더 작게
    expectGlobalError(withValue("towers[1].levels.base.rangeMt", 5000), "towers[0].levels.base.rangeMt");
    expectGlobalError(withValue("towers[1].levels.base.rangeMt", 4000), "towers[0].levels.base.rangeMt");
    // Lv3(누적): archer = 5000+500+500 = 6000, ballista = 7000+500+(−1500) 에 앞선 Lv2 7500 → Lv3 6000 동률
    expectGlobalError(withValue("towers[1].levels.increments[1].rangeMt", -1500), "towers[0].levels.increments[1].rangeMt");
    expectGlobalError(withValue("towers[1].levels.increments[1].rangeMt", -2500), "towers[0].levels.increments[1].rangeMt");
    // 다른 쌍: archer>mage, mage>frost
    expectGlobalError(withValue("towers[2].levels.base.rangeMt", 5000), "towers[2].levels.base.rangeMt");
    expectGlobalError(withValue("towers[3].levels.base.rangeMt", 4000), "towers[3].levels.base.rangeMt");
    expectGlobalError(withValue("towers[3].levels.increments[2].rangeMt", 1500), "towers[3].levels.increments[2].rangeMt");
  });
  it("사거리: 다른 레벨끼리 역전은 허용", () => {
    // archer Lv4(누적) = 5000+500+500+2000 = 8000 > ballista Lv1(7000), 같은 레벨 Lv4 = 8500 에서는 ballista 가 더 길다
    const b = withValue("towers[0].levels.increments[2].rangeMt", 2000);
    expect(globalPaths(b)).toEqual([]);
    // 같은 타워의 Lv1 이 다른 타워의 Lv4 보다 짧아도 무관: frost Lv4 = 3000+3×500 = 4500 > mage Lv1(4000) 이미 현재 fixture 에서 성립
    expect(globalPaths(validBundle())).toEqual([]);
  });
  it("강화 비용 Lv2<Lv3<Lv4 위반(동률 포함)", () => {
    expectGlobalError(withValue("towers[0].upgradeCosts", [150, 150, 400]), "towers[0].upgradeCosts[1]");
    expectGlobalError(withValue("towers[0].upgradeCosts", [150, 250, 250]), "towers[0].upgradeCosts[2]");
    expectGlobalError(withValue("towers[0].upgradeCosts", [300, 250, 400]), "towers[0].upgradeCosts[1]");
    expectGlobalError(withValue("towers[1].upgradeCosts", [300, 500, 400]), "towers[1].upgradeCosts[2]");
    expect(globalPaths(withValue("towers[0].upgradeCosts", [1, 2, 3]))).toEqual([]);
    // 다른 타워끼리 가격 순서는 검사하지 않는다
    expect(globalPaths(withValue("towers[0].upgradeCosts", [900_000, 900_001, 900_002]))).toEqual([]);
  });
  it("Stage 1 은 적 4종·특성 3종이 모두 등장해야 한다(Stage 2·3 은 조건 없음)", () => {
    const replaceAll = (stage: number, key: "enemyType" | "trait", from: string, to: string | null): unknown => {
      let b: unknown = validBundle();
      (b as { stages: { waves: { segments: Record<string, unknown>[] }[] }[] }).stages[stage].waves.forEach((w, wi) =>
        w.segments.forEach((s, si) => {
          if (s[key] === from) b = withValue(`stages[${stage}].waves[${wi}].segments[${si}].${key}`, to, b);
        }),
      );
      return b;
    };
    const noSwarm = replaceAll(0, "enemyType", "swarm", "normal");
    expect(stagePaths(noSwarm, 0)).toEqual(["stages[0].waves"]);
    expect(validateContent(noSwarm).stages[0].errors[0].message).toContain("swarm");
    expect(stagePaths(noSwarm, 1)).toEqual([]);
    expect(globalPaths(noSwarm)).toEqual([]);
    const noSpeed = replaceAll(0, "trait", "speedBoost", null);
    expect(stagePaths(noSpeed, 0)).toEqual(["stages[0].waves"]);
    expect(validateContent(noSpeed).stages[0].errors[0].message).toContain("speedBoost");
    // Stage 2·3 에서 같은 종이 빠져도 오류 없음
    expect(stagePaths(replaceAll(1, "enemyType", "swarm", "normal"), 1)).toEqual([]);
    expect(stagePaths(replaceAll(2, "trait", "hpBoost", null), 2)).toEqual([]);
  });
});

describe("11.4 오류 수집·격리", () => {
  it("오류 여러 개가 모두 수집된다(첫 오류에서 멈추지 않음)", () => {
    const b = withValues([
      ["towers[0].buildCost", 0],
      ["enemies[1].hp", 0],
      ["traits[2].speedBoostBp", 0],
      ["economy.refundRateBp", 10001],
      ["stages[1].initialGold", 0],
      ["stages[1].waves[0].prepMs", 33],
      ["stages[1].waves[4].segments[0].count", 0],
      ["stages[2].map.waypoints[1].col", 99],
    ]);
    const v = validateContent(b);
    expect(paths(v.globalErrors).sort()).toEqual(["economy.refundRateBp", "enemies[1].hp", "towers[0].buildCost", "traits[2].speedBoostBp"]);
    expect(paths(v.stages[1].errors).sort()).toEqual(["stages[1].initialGold", "stages[1].waves[0].prepMs", "stages[1].waves[4].segments[0].count"]);
    expect(paths(v.stages[2].errors)).toEqual(["stages[2].map.waypoints[1].col"]);
    expect(v.stages[0].errors).toEqual([]);
  });
  it("전역 오류 → 모든 스테이지 플레이 불가, 진입도 거부", () => {
    const b = withValue("economy.refundRateBp", 10001);
    const v = validateContent(b);
    expect(v.globalErrors.length).toBe(1);
    expect([0, 1, 2].map((i) => isStagePlayable(v, i))).toEqual([false, false, false]);
    for (const id of ["stage-1-meadow-outpost", "stage-2-snowfall-pass", "stage-3-dusk-ruins"]) {
      const r = validateStageForEntry(b, id);
      expect(r.ok).toBe(false);
      expect(r.ok === false && paths(r.errors)).toEqual(["economy.refundRateBp"]);
    }
  });
  it("Stage 2 만 오류 → Stage 1·3 은 정상, 진입 가능", () => {
    const b = withValue("stages[1].waves[2].clearReward", 0);
    const v = validateContent(b);
    expect(v.globalErrors).toEqual([]);
    expect([0, 1, 2].map((i) => isStagePlayable(v, i))).toEqual([true, false, true]);
    expect(validateStageForEntry(b, "stage-1-meadow-outpost").ok).toBe(true);
    expect(validateStageForEntry(b, "stage-3-dusk-ruins").ok).toBe(true);
    const r = validateStageForEntry(b, "stage-2-snowfall-pass");
    expect(r.ok).toBe(false);
    expect(r.ok === false && paths(r.errors)).toEqual(["stages[1].waves[2].clearReward"]);
  });
  it("hole·undefined·null·문자열 숫자·소수 각각 필드 경로 오류", () => {
    const cases: [string, string][] = [
      ["towers[0].buildCost", "global"],
      ["towers[2].levels.base.aoeRadiusMt", "global"],
      ["towers[0].levels.increments[1].damage", "global"],
      ["enemies[0].hp", "global"],
      ["traits[1].hpBoostBp", "global"],
      ["economy.refundRateBp", "global"],
      ["stages[0].initialGold", "stage0"],
      ["stages[0].baseHp", "stage0"],
      ["stages[0].waves[2].prepMs", "stage0"],
      ["stages[0].waves[2].segments[1].count", "stage0"],
    ];
    for (const [path, where] of cases) {
      const check = (b: unknown): string[] => (where === "global" ? globalPaths(b) : stagePaths(b, 0));
      for (const [label, bad] of [["undefined", undefined], ["null", null], ["문자열 숫자", "5"], ["소수", 1.5], ["NaN", Number.NaN], ["Infinity", Number.POSITIVE_INFINITY]] as const) {
        expect(check(withValue(path, bad)), `${path} = ${label}`).toContain(path);
      }
      expect(check(withDeleted(path)), `${path} 삭제`).toContain(path);
    }
  });
  it("배열 hole 은 항목 경로 오류(필터·보정 없음)", () => {
    expect(globalPaths(withDeleted("towers[1]"))).toContain("towers[1]");
    expect(globalPaths(withDeleted("enemies[3]"))).toContain("enemies[3]");
    expect(globalPaths(withDeleted("traits[0]"))).toContain("traits[0]");
    expect(globalPaths(withDeleted("towers[0].upgradeCosts[1]"))).toContain("towers[0].upgradeCosts[1]");
    expect(globalPaths(withDeleted("towers[0].levels.increments[2]"))).toContain("towers[0].levels.increments[2]");
    expect(globalPaths(withDeleted("stages[1]"))).toEqual([]); // 스테이지 자리 hole 은 전역이 아니라 그 자리만의 오류(C1)
    expect(validateContent(withDeleted("stages[1]")).stages[1].errors.map((e) => e.path)).toEqual(["stages[1]"]);
    expect(stagePaths(withDeleted("stages[0].waves[3]"), 0)).toContain("stages[0].waves[3]");
    expect(stagePaths(withDeleted("stages[0].waves[0].segments[0]"), 0)).toContain("stages[0].waves[0].segments[0]");
    expect(stagePaths(withDeleted("stages[1].map.waypoints[1]"), 1)).toContain("stages[1].map.waypoints[1]");
    expect(stagePaths(withValue("stages[1].map.reservedCells", new Array(1)), 1)).toContain("stages[1].map.reservedCells[0]");
  });
  it("맵 오류는 map 필드 경로로 옮겨 담긴다", () => {
    expectStageError(withValue("stages[0].map.waypoints[1]", { col: 3, row: 5 }), 0, "stages[0].map.waypoints[1]");
    expectStageError(withValue("stages[2].map.waypoints[0].col", 5), 2, "stages[2].map.waypoints[0]");
    expectStageError(withValue("stages[2].map.waypoints", [{ col: 0, row: 8 }]), 2, "stages[2].map.waypoints");
    expectStageError(withValue("stages[1].map", null), 1, "stages[1].map");
    expectStageError(withValue("stages[1].map.reservedCells", [{ col: 0, row: 1 }]), 1, "stages[1].map.reservedCells[0]");
  });
  it("진입 재검증은 사전 검증과 같은 판정·같은 오류", () => {
    const bundles = [
      validBundle(),
      withValue("economy.refundRateBp", 10001),
      withValue("stages[1].waves[2].clearReward", 0),
      withValue("stages[0].waves[0].segments[0].trait", "x"),
      withValues([["towers[1].levels.base.rangeMt", 5000], ["stages[2].initialGold", 0]]),
      withValue("stages[1].stageId", "stage-1-meadow-outpost"),
    ];
    for (const b of bundles) {
      const v = validateContent(b);
      v.stages.forEach((s, i) => {
        if (s.stageId === null) return;
        const r = validateStageForEntry(b, s.stageId);
        expect(r.ok, `stage ${i}`).toBe(isStagePlayable(v, i) && v.stages.findIndex((x) => x.stageId === s.stageId) === i);
        if (!r.ok && v.stages.findIndex((x) => x.stageId === s.stageId) === i) {
          expect(r.errors).toEqual([...v.globalErrors, ...s.errors]);
        }
      });
    }
  });
  it("모르는 stageId 로 진입하면 stageId 경로 오류", () => {
    const r = validateStageForEntry(validBundle(), "nope");
    expect(r.ok).toBe(false);
    expect(r.ok === false && paths(r.errors)).toEqual(["stageId"]);
  });
});
