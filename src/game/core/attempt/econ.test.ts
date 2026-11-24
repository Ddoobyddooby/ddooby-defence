// ECON-01 — 기대값은 SIM-CONTRACT 13절의 표와 TEST_ONLY 가격(archer 설치 100·강화 [150,250,400], ballista 200, frost 120,
// refundRateBp 7000)으로 손 계산한 리터럴이다. 스테이지 2: initialGold 350, 경로 행 1(열 0~14) 등, (0,0)·(0,2)·(1,0) 은 설치 가능.
import { describe, expect, it } from "vitest";
import { createAttempt } from "./attempt";
import { killAt } from "./testing/inject";
import { seg, STAGE2_ID, uniformStage2, withValues } from "./testing/bundles";
import { CommandStructureError } from "../sim/commands";

const ONE_NORMAL = { prepMs: 150, clearReward: 20, segments: [seg(0, 0, 1)] };
const base = (): unknown => uniformStage2(ONE_NORMAL);
const rich = (gold: number, extra: (readonly [string, unknown])[] = []): unknown => withValues([["stages[1].initialGold", gold], ...extra], base());
const B = (col: number, row: number, towerType = "archer") => ({ towerType, tile: { col, row } });
type Ev = Record<string, unknown>;
const find = (events: readonly Ev[], type: string): Ev | undefined => events.find((e) => e.type === type);
const rejection = (events: readonly Ev[]): Ev | undefined => find(events, "commandRejected");

describe("build", () => {
  it("성공(준비 단계): 골드·타워·actuallyPaid·이벤트·원장 리터럴", () => {
    const core = createAttempt(base(), STAGE2_ID, 1);
    core.submit("build", B(0, 0));
    const ev = core.step();
    expect(ev).toEqual([
      { eventSeq: 1, tick: 1, type: "towerBuilt", cell: { col: 0, row: 0 }, cost: 100, towerId: 1, towerType: "archer" },
      { eventSeq: 2, tick: 1, type: "economySettled", seq: 1, towerId: 1, delta: -100, goldAfter: 250, key: "a1:build:c1" },
    ]);
    expect(core.snapshot()).toMatchObject({
      gold: 250,
      consumedEconomyEvents: ["build:c1"],
      towers: [{ actuallyPaid: 100, cell: { col: 0, row: 0 }, level: 1, targetingMode: "first", towerId: 1, type: "archer" }],
    });
    expect(core.snapshot().counters).toMatchObject({ nextTowerId: 2, nextEventSeq: 3, nextCommandSeq: 2 });
    expect(core.ledger()).toEqual([{ tick: 1, eventSeq: 2, key: "a1:build:c1", delta: -100, goldAfter: 250 }]);
  });
  it("성공(전투 단계)", () => {
    const core = createAttempt(base(), STAGE2_ID, 1);
    core.submit("startWave", {});
    core.step();
    expect(core.phase).toBe("combat");
    core.submit("build", B(0, 0, "ballista"));
    const ev = core.step();
    expect(find(ev, "towerBuilt")).toMatchObject({ towerId: 1, towerType: "ballista", cost: 200 });
    expect(core.snapshot()).toMatchObject({ gold: 150, towers: [{ type: "ballista", actuallyPaid: 200 }] });
  });
  it("거부 4종: 격자 밖·설치 불가·점유·골드 부족 — seq·eventSeq 소비, towerId·골드·원장 불변", () => {
    const cases: [string, ReturnType<typeof B>, string][] = [
      ["격자 밖(col 18)", B(18, 0), "outOfGrid"],
      ["격자 밖(row 10)", B(0, 10), "outOfGrid"],
      ["경로 칸 (3,1)", B(3, 1), "notBuildable"],
      ["출발 칸 (0,1)", B(0, 1), "notBuildable"],
      ["기지 칸 (17,8)", B(17, 8), "notBuildable"],
    ];
    for (const [label, payload, reason] of cases) {
      const core = createAttempt(base(), STAGE2_ID, 1);
      core.submit("build", payload);
      const ev = core.step();
      expect(ev, label).toEqual([{ eventSeq: 1, tick: 1, type: "commandRejected", kind: "build", reason, seq: 1 }]);
      expect(core.snapshot(), label).toMatchObject({ gold: 350, towers: [], consumedEconomyEvents: [] });
      expect(core.snapshot().counters, label).toMatchObject({ nextTowerId: 1, nextCommandSeq: 2, nextEventSeq: 2 });
      expect(core.ledger()).toEqual([]);
    }
    // 점유
    const core = createAttempt(base(), STAGE2_ID, 1);
    core.submit("build", B(0, 0));
    core.step();
    core.submit("build", B(0, 0, "ballista"));
    expect(rejection(core.step())).toMatchObject({ reason: "occupied", seq: 2 });
    expect(core.snapshot()).toMatchObject({ gold: 250 });
    expect(core.snapshot().towers).toHaveLength(1);
    // 골드 부족: ballista 200 두 번
    const poor = createAttempt(base(), STAGE2_ID, 1);
    poor.submit("build", B(0, 0, "ballista"));
    poor.step();
    poor.submit("build", B(1, 0, "ballista"));
    expect(rejection(poor.step())).toMatchObject({ reason: "insufficientGold" });
    expect(poor.snapshot().gold).toBe(150);
  });
  it("검사 순서: 격자 밖 > 설치 불가 > 점유 > 골드 부족", () => {
    // initialGold 50: archer(100) 는 항상 골드 부족
    const poor = createAttempt(rich(50), STAGE2_ID, 1);
    poor.submit("build", B(3, 1)); // 경로 칸 + 골드 부족 → notBuildable
    poor.submit("build", B(18, 0)); // 격자 밖 + 골드 부족 → outOfGrid
    poor.submit("build", B(0, 0)); // 정상 칸 + 골드 부족 → insufficientGold
    expect(poor.step().map((e) => e.reason)).toEqual(["notBuildable", "outOfGrid", "insufficientGold"]);
    // initialGold 100: 한 개 짓고 나면 골드 0, 같은 칸 → 점유(골드 부족보다 먼저)
    const exact = createAttempt(rich(100), STAGE2_ID, 1);
    exact.submit("build", B(0, 0));
    exact.submit("build", B(0, 0));
    const ev = exact.step();
    expect(find(ev, "towerBuilt")).toBeDefined();
    expect(rejection(ev)).toMatchObject({ reason: "occupied", seq: 2 });
    expect(exact.snapshot().gold).toBe(0);
  });
  it("같은 틱 같은 칸 2개 → 첫째 성공·둘째 occupied; 같은 틱 골드가 한 개분뿐 → 첫째만 성공", () => {
    const same = createAttempt(base(), STAGE2_ID, 1);
    same.submit("build", B(0, 0));
    same.submit("build", B(0, 0));
    const ev = same.step();
    expect(ev.map((e) => e.type)).toEqual(["towerBuilt", "economySettled", "commandRejected"]);
    expect(rejection(ev)).toMatchObject({ reason: "occupied", eventSeq: 3 });
    const gold = createAttempt(rich(150), STAGE2_ID, 1);
    gold.submit("build", B(0, 0));
    gold.submit("build", B(1, 0));
    const ev2 = gold.step();
    expect(ev2.map((e) => [e.type, e.reason ?? null])).toEqual([["towerBuilt", null], ["economySettled", null], ["commandRejected", "insufficientGold"]]);
    expect(gold.snapshot()).toMatchObject({ gold: 50 });
  });
});

describe("build 좌표 접수 범위(F1)", () => {
  it("음수·거대 음수·격자 밖 좌표는 접수 후 outOfGrid, 거부 뒤 골드·타워·원장·소비 키·nextTowerId 불변", () => {
    const cases: [number, number][] = [
      [-1, 0],
      [0, -1],
      [-Number.MAX_SAFE_INTEGER, 0],
      [0, -Number.MAX_SAFE_INTEGER],
      [18, 0],
      [0, 10],
      [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
    ];
    for (const [col, row] of cases) {
      const core = createAttempt(base(), STAGE2_ID, 1);
      expect(core.submit("build", B(col, row))).toMatchObject({ ok: true, command: { seq: 1 } });
      const ev = core.step();
      expect(ev, `${col},${row}`).toEqual([{ eventSeq: 1, tick: 1, type: "commandRejected", kind: "build", reason: "outOfGrid", seq: 1 }]);
      expect(core.snapshot()).toMatchObject({ gold: 350, towers: [], consumedEconomyEvents: [] });
      expect(core.snapshot().counters).toMatchObject({ nextTowerId: 1, nextCommandSeq: 2, nextEventSeq: 2 });
      expect(core.ledger()).toEqual([]);
    }
  });
  it("null·boolean·문자열·소수·비안전 정수는 접수 구조 오류(seq 미소비)", () => {
    const core = createAttempt(base(), STAGE2_ID, 1);
    for (const bad of [null, true, "0", 1.5, Number.NaN, Number.POSITIVE_INFINITY, 9007199254740992, -9007199254740992]) {
      expect(() => core.submit("build", { towerType: "archer", tile: { col: bad, row: 0 } })).toThrow(CommandStructureError);
      expect(() => core.submit("build", { towerType: "archer", tile: { col: 0, row: bad } })).toThrow(CommandStructureError);
    }
    expect(core.snapshot().counters).toMatchObject({ nextCommandSeq: 1 });
    expect(core.snapshot().queue).toEqual([]);
  });
});

describe("upgrade", () => {
  it("Lv1→4 누적 actuallyPaid 100→250→500→900, 골드 0, Lv4 에서 maxLevel(골드 부족보다 먼저)", () => {
    const core = createAttempt(rich(900), STAGE2_ID, 1);
    core.submit("build", B(0, 0));
    core.step();
    const trace: unknown[] = [];
    for (let i = 0; i < 3; i++) {
      core.submit("upgrade", { towerId: 1 });
      const ev = core.step();
      const t = (core.snapshot().towers as { level: number; actuallyPaid: number }[])[0];
      trace.push([t.level, t.actuallyPaid, core.snapshot().gold, (find(ev, "towerUpgraded") as Ev).cost]);
    }
    expect(trace).toEqual([[2, 250, 650, 150], [3, 500, 400, 250], [4, 900, 0, 400]]);
    core.submit("upgrade", { towerId: 1 });
    const ev = core.step();
    expect(ev).toEqual([{ eventSeq: 11, tick: 5, type: "commandRejected", kind: "upgrade", reason: "maxLevel", seq: 5 }]);
    expect(core.snapshot()).toMatchObject({ gold: 0, towers: [{ level: 4, actuallyPaid: 900 }] });
    expect(core.snapshot().consumedEconomyEvents).toEqual(["build:c1", "upgrade:c2", "upgrade:c3", "upgrade:c4"]);
  });
  it("이벤트 리터럴 한 건", () => {
    const core = createAttempt(base(), STAGE2_ID, 1);
    core.submit("build", B(0, 0));
    core.step();
    core.submit("upgrade", { towerId: 1 });
    expect(core.step()).toEqual([
      { eventSeq: 3, tick: 2, type: "towerUpgraded", cost: 150, level: 2, towerId: 1 },
      { eventSeq: 4, tick: 2, type: "economySettled", seq: 2, towerId: 1, delta: -150, goldAfter: 100, key: "a1:upgrade:c2" },
    ]);
  });
  it("골드 부족·없는 타워 거부(상태 불변)", () => {
    const core = createAttempt(rich(200), STAGE2_ID, 1);
    core.submit("build", B(0, 0));
    core.step();
    core.submit("upgrade", { towerId: 1 }); // 150 > 100
    core.submit("upgrade", { towerId: 9 });
    const ev = core.step();
    expect(ev.map((e) => e.reason)).toEqual(["insufficientGold", "towerNotFound"]);
    expect(core.snapshot()).toMatchObject({ gold: 100, towers: [{ level: 1, actuallyPaid: 100 }] });
  });
  it("전투 중에도 성공", () => {
    const core = createAttempt(base(), STAGE2_ID, 1);
    core.submit("build", B(0, 0));
    core.submit("startWave", {});
    core.step();
    core.submit("upgrade", { towerId: 1 });
    expect(find(core.step(), "towerUpgraded")).toMatchObject({ level: 2 });
    expect(core.phase).toBe("combat");
  });
});

describe("sell", () => {
  const rate = (bp: number, gold = 350) => withValues([["economy.refundRateBp", bp], ["stages[1].initialGold", gold]], base());
  it("준비 단계 성공: 환급은 내림 한 번(6667bp·100 → 66, 반올림이면 67), 칸 해제", () => {
    const core = createAttempt(rate(6667), STAGE2_ID, 1);
    core.submit("build", B(0, 0));
    core.step();
    core.submit("sell", { towerId: 1 });
    expect(core.step()).toEqual([
      { eventSeq: 3, tick: 2, type: "towerSold", refund: 66, towerId: 1 },
      { eventSeq: 4, tick: 2, type: "economySettled", seq: 2, towerId: 1, delta: 66, goldAfter: 316, key: "a1:sell:t1" },
    ]);
    expect(core.snapshot()).toMatchObject({ gold: 316, towers: [] });
    expect(core.snapshot().consumedEconomyEvents).toEqual(["build:c1", "sell:t1"]);
  });
  it("강화한 타워는 누적 지출 기준(250 × 6667bp = 166.675 → 166)", () => {
    const core = createAttempt(rate(6667, 1000), STAGE2_ID, 1);
    core.submit("build", B(0, 0));
    core.step();
    core.submit("upgrade", { towerId: 1 });
    core.step();
    expect(core.snapshot().gold).toBe(750);
    core.submit("sell", { towerId: 1 });
    expect(find(core.step(), "towerSold")).toMatchObject({ refund: 166 });
    expect(core.snapshot().gold).toBe(916);
  });
  it("전투 중 wrongPhase(없는 타워여도 단계가 먼저), 타워·골드 불변", () => {
    const core = createAttempt(base(), STAGE2_ID, 1);
    core.submit("build", B(0, 0));
    core.submit("startWave", {});
    core.step();
    core.submit("sell", { towerId: 1 });
    core.submit("sell", { towerId: 99 });
    const ev = core.step();
    expect(ev.map((e) => e.reason)).toEqual(["wrongPhase", "wrongPhase"]);
    expect(core.snapshot()).toMatchObject({ gold: 250 });
    expect(core.snapshot().towers).toHaveLength(1);
  });
  it("같은 틱 sell 2개 → 둘째 towerNotFound, 판매 후 같은 칸 재설치(새 towerId)", () => {
    const core = createAttempt(base(), STAGE2_ID, 1);
    core.submit("build", B(0, 0));
    core.step();
    core.submit("sell", { towerId: 1 });
    core.submit("sell", { towerId: 1 });
    const ev = core.step();
    expect(ev.map((e) => e.type)).toEqual(["towerSold", "economySettled", "commandRejected"]);
    expect(rejection(ev)).toMatchObject({ reason: "towerNotFound", seq: 3 });
    expect(core.snapshot().gold).toBe(320); // 250 + floor(100×7000/10000)=70
    core.submit("build", B(0, 0));
    expect(find(core.step(), "towerBuilt")).toMatchObject({ towerId: 2 });
    expect(core.snapshot().gold).toBe(220);
  });
  it("환급률 0: 성공하고 delta 0 으로 정산 기록", () => {
    const core = createAttempt(rate(0), STAGE2_ID, 1);
    core.submit("build", B(0, 0));
    core.step();
    core.submit("sell", { towerId: 1 });
    const ev = core.step();
    expect(find(ev, "towerSold")).toMatchObject({ refund: 0 });
    expect(find(ev, "economySettled")).toMatchObject({ delta: 0, goldAfter: 250, key: "a1:sell:t1" });
    expect(core.snapshot().consumedEconomyEvents).toContain("sell:t1");
    expect(core.ledger().map((l) => l.delta)).toEqual([-100, 0]);
  });
});

describe("setTargeting", () => {
  it("성공·같은 값도 성공·없는 타워·전투 중", () => {
    const core = createAttempt(base(), STAGE2_ID, 1);
    core.submit("build", B(0, 0));
    core.submit("setTargeting", { towerId: 1, mode: "strong" });
    core.submit("setTargeting", { towerId: 1, mode: "strong" });
    core.submit("setTargeting", { towerId: 5, mode: "last" });
    const ev = core.step();
    expect(ev.map((e) => [e.type, e.mode ?? e.reason ?? null])).toEqual([
      ["towerBuilt", null],
      ["economySettled", null],
      ["targetingChanged", "strong"],
      ["targetingChanged", "strong"],
      ["commandRejected", "towerNotFound"],
    ]);
    expect((core.snapshot().towers as { targetingMode: string }[])[0].targetingMode).toBe("strong");
    expect(core.snapshot().gold).toBe(250); // 경제 거래 없음
    core.submit("startWave", {});
    core.step();
    core.submit("setTargeting", { towerId: 1, mode: "close" });
    expect(find(core.step(), "targetingChanged")).toMatchObject({ mode: "close", towerId: 1 });
  });
});

describe("구조 오류(접수 시 예외, seq 미소비)", () => {
  it("미지 towerType·mode, payload 누락", () => {
    const core = createAttempt(base(), STAGE2_ID, 1);
    for (const [kind, payload] of [
      ["build", { towerType: "cannon", tile: { col: 0, row: 0 } }],
      ["build", { tile: { col: 0, row: 0 } }],
      ["build", { towerType: "archer" }],
      ["setTargeting", { towerId: 1, mode: "weak" }],
      ["upgrade", {}],
    ] as const) {
      expect(() => core.submit(kind, payload)).toThrow(CommandStructureError);
    }
    expect(core.snapshot().counters).toMatchObject({ nextCommandSeq: 1 });
    expect(core.snapshot().queue).toEqual([]);
  });
});

describe("동시 사건: 처치 골드는 같은 틱 1단계 명령에 쓰이지 않는다", () => {
  it("틱 1 에 처치로 늘어나는 골드(+5+20)가 필요한 build 는 거부, 틱 2 에는 성공", () => {
    // ballista 200: 초기 골드 190 → 틱 1 처치 후 215
    const b = withValues([["stages[1].initialGold", 190]], base());
    const core = createAttempt(b, STAGE2_ID, 1, killAt({ tick: 1, enemyId: 1 }));
    core.submit("startWave", {});
    core.submit("build", B(0, 0, "ballista"));
    expect(rejection(core.step())).toMatchObject({ reason: "insufficientGold", seq: 2 });
    expect(core.snapshot().gold).toBe(215);
    core.submit("build", B(0, 0, "ballista"));
    core.step();
    expect(core.snapshot()).toMatchObject({ gold: 15, towers: [{ type: "ballista" }] });
  });
});

describe("재도전", () => {
  it("새 시도에는 타워·actuallyPaid·소비 키가 없다", () => {
    const b = rich(1000);
    const first = createAttempt(b, STAGE2_ID, 1);
    first.submit("build", B(0, 0));
    first.step();
    first.submit("upgrade", { towerId: 1 });
    first.step();
    const retry = createAttempt(b, STAGE2_ID, 2);
    expect(retry.snapshot()).toMatchObject({ gold: 1000, towers: [], consumedEconomyEvents: [], attemptId: 2 });
    expect(retry.snapshot().counters).toEqual({ nextCommandSeq: 1, nextEnemyId: 1, nextEventSeq: 1, nextProjectileId: 1, nextTowerId: 1 });
    expect(retry.ledger()).toEqual([]);
    retry.submit("build", B(0, 0)); // 이전 시도의 점유가 없다
    expect(find(retry.step(), "towerBuilt")).toMatchObject({ towerId: 1 });
  });
});

describe("불변식(13.3): 무작위(시드 고정) 명령 열 + 각 틱 후 검사", () => {
  // Stage 2 그림(10.2): S/#/B 는 경로 칸. 독립 oracle 로 그림 리터럴을 쓴다.
  const PICTURE = [
    "..................",
    "S##############...",
    "..............#...",
    "..............#...",
    "........#######...",
    "........#.........",
    "........#.........",
    "........#.........",
    "........#########B",
    "..................",
  ];
  const onPath = (col: number, row: number): boolean => PICTURE[row][col] !== ".";
  const BUILD = { archer: 100, ballista: 200, mage: 180, frost: 120 } as const;
  const UPG = { archer: [150, 250, 400], ballista: [300, 500, 800], mage: [250, 400, 700], frost: [160, 260, 420] } as const;

  function lcg(seed: number): () => number {
    let x = seed;
    return () => {
      x = (x * 48271) % 2147483647;
      return x;
    };
  }

  for (const seed of [1, 7, 12345]) {
    it(`시드 ${seed}: 골드·actuallyPaid·점유·경로 불변식`, () => {
      const rnd = lcg(seed);
      const core = createAttempt(rich(600, [["economy.refundRateBp", 6667]]), STAGE2_ID, 1, killAt({ tick: 12, enemyId: 1 }));
      const types = ["archer", "ballista", "mage", "frost"] as const;
      const modes = ["first", "last", "close", "strong"] as const;
      const paid = new Map<number, number>();
      for (let tick = 1; tick <= 60; tick++) {
        const n = rnd() % 4;
        for (let i = 0; i < n; i++) {
          const pick = rnd() % 6;
          const towerId = (rnd() % 6) + 1;
          if (pick <= 1) core.submit("build", B(rnd() % 19, rnd() % 11, types[rnd() % 4]));
          else if (pick === 2) core.submit("upgrade", { towerId });
          else if (pick === 3) core.submit("sell", { towerId });
          else if (pick === 4) core.submit("setTargeting", { towerId, mode: modes[rnd() % 4] });
          else if (tick === 5) core.submit("startWave", {});
        }
        core.step();
        const s = core.snapshot() as {
          gold: number;
          towers: { towerId: number; type: keyof typeof BUILD; level: number; actuallyPaid: number; cell: { col: number; row: number } }[];
        };
        // gold == initialGold + Σ delta, 골드 ≥ 0
        expect(s.gold).toBe(600 + core.ledger().reduce((a, l) => a + l.delta, 0));
        expect(s.gold).toBeGreaterThanOrEqual(0);
        expect(Number.isSafeInteger(s.gold)).toBe(true);
        const cells = new Set<string>();
        for (const t of s.towers) {
          const expectedPaid = BUILD[t.type] + UPG[t.type].slice(0, t.level - 1).reduce((a, b) => a + b, 0);
          expect(t.actuallyPaid, `tick ${tick} tower ${t.towerId}`).toBe(expectedPaid);
          expect(t.level).toBeGreaterThanOrEqual(1);
          expect(t.level).toBeLessThanOrEqual(4);
          expect(onPath(t.cell.col, t.cell.row)).toBe(false);
          expect(cells.has(`${t.cell.col},${t.cell.row}`)).toBe(false);
          cells.add(`${t.cell.col},${t.cell.row}`);
          paid.set(t.towerId, t.actuallyPaid);
        }
        // 소비 키는 한 번만
        const keys = core.snapshot().consumedEconomyEvents as string[];
        expect(new Set(keys).size).toBe(keys.length);
        if (core.isResult()) break;
      }
      expect(core.ledger().length).toBeGreaterThan(0);
    });
  }
});

describe("리플레이(build·upgrade·sell·setTargeting 포함)", () => {
  it("새 코어 2회 틱별 동일, 명령 변조 시 첫 불일치 틱", async () => {
    const { ATTEMPT_CODE_VERSION } = await import("./attempt");
    const { runReplay, initialStateHashOf, firstMismatch } = await import("../sim/replay");
    const bundle = rich(500);
    const core0 = createAttempt(bundle, STAGE2_ID, 5);
    type Cmd = { applyTick: number; seq: number; kind: "build" | "upgrade" | "sell" | "setTargeting" | "startWave"; payload: unknown };
    const commands: Cmd[] = [
      { applyTick: 1, seq: 1, kind: "build", payload: B(0, 0) },
      { applyTick: 1, seq: 2, kind: "build", payload: B(1, 0, "ballista") },
      { applyTick: 2, seq: 3, kind: "upgrade", payload: { towerId: 1 } },
      { applyTick: 3, seq: 4, kind: "setTargeting", payload: { towerId: 2, mode: "close" } },
      { applyTick: 3, seq: 5, kind: "sell", payload: { towerId: 1 } },
      { applyTick: 4, seq: 6, kind: "build", payload: B(0, 2, "frost") },
      { applyTick: 5, seq: 7, kind: "sell", payload: { towerId: 2 } }, // 전투 중 → wrongPhase
    ];
    const record = (cmds: Cmd[]) => ({
      formatVersion: 1,
      codeVersion: ATTEMPT_CODE_VERSION,
      contentHash: core0.contentHash,
      stageId: STAGE2_ID,
      attemptId: 5,
      initialStateHash: initialStateHashOf(core0.snapshot()),
      endTick: 8,
      commands: cmds,
    });
    const expectation = { formatVersion: 1, codeVersion: ATTEMPT_CODE_VERSION, contentHash: core0.contentHash };
    const run = (cmds: Cmd[]) => runReplay(record(cmds), expectation, (r) => createAttempt(bundle, r.stageId, r.attemptId));
    const a = run(commands);
    const b = run(commands);
    expect(a.ticks.map((t) => t.hash)).toEqual(b.ticks.map((t) => t.hash));
    expect(firstMismatch(a, b)).toBeNull();
    const last = a.ticks[8].state as { towers: { type: string }[]; gold: number };
    expect(last.towers.map((t) => t.type)).toEqual(["ballista", "frost"]);
    const tampered = commands.map((c) => (c.seq === 3 ? { ...c, payload: { towerId: 2 } } : c)); // 업그레이드 대상 변경(150 → 300)
    expect(firstMismatch(a, run(tampered))?.tick).toBe(2);
  });
});
