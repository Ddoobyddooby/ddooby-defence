// SIM-01 리뷰 F1~F4 — 훅 쓰기 함수 수명, step 중 조작 금지, 명령 단위 원자성, 생성 경로.
import { describe, expect, it } from "vitest";
import * as publicApi from "./index";
import { AttemptCore, createAttempt } from "./attempt";
import { seg, STAGE2_ID, uniformStage2 } from "./testing/bundles";
import { SimStateError } from "../sim/errors";
import type { AttemptHooks, CommandHookContext, FireHookContext } from "./types";

const ONE_NORMAL = { prepMs: 150, clearReward: 20, segments: [seg(0, 0, 1)] };
const bundle = (): unknown => uniformStage2(ONE_NORMAL);
const tick = (n: number, core: { step(): unknown }): void => {
  for (let i = 0; i < n; i++) core.step();
};
const asHook = <K extends keyof AttemptHooks>(fn: unknown): AttemptHooks[K] => fn as AttemptHooks[K];

describe("F1 훅 쓰기 함수 수명", () => {
  it("fire 의 damage 를 저장해 step 반환 뒤 호출 → 오류, 적 HP·스냅샷 불변", () => {
    let saved: FireHookContext["damage"] | undefined;
    const core = createAttempt(bundle(), STAGE2_ID, 1, {
      fire(ctx) {
        saved ??= ctx.damage;
        return undefined;
      },
    });
    core.submit("startWave", {});
    core.step();
    const before = core.snapshot();
    expect(() => saved?.(1, 100)).toThrow(SimStateError);
    expect(core.snapshot()).toEqual(before);
    expect((before.enemies as { hp: number }[])[0].hp).toBe(100);
  });
  it("command 훅의 emit·settle 을 저장해 다른 단계(같은 step 의 fire)에서 호출 → step 전체 실패·롤백", () => {
    let saved: CommandHookContext | undefined;
    const core = createAttempt(bundle(), STAGE2_ID, 1, {
      handleCommand(ctx) {
        saved = ctx;
        return "unsupportedKind";
      },
      fire() {
        saved?.settle("late", 5, "economySettled", {});
        return undefined;
      },
    });
    core.submit("build", { tile: { col: 0, row: 0 } });
    const before = core.snapshot();
    expect(() => core.step()).toThrow(SimStateError);
    expect(core.completedTick).toBe(0);
    expect(core.snapshot()).toEqual(before);
    expect(core.ledger()).toEqual([]);
  });
  it("저장한 damage 를 다음 틱의 다른 훅에서 호출 → 오류·상태 불변", () => {
    let saved: FireHookContext["damage"] | undefined;
    const core = createAttempt(bundle(), STAGE2_ID, 1, {
      expireSlows(ctx) {
        if (ctx.tick === 2) saved?.(1, 100);
        return undefined;
      },
      fire(ctx) {
        saved ??= ctx.damage;
        return undefined;
      },
    });
    core.submit("startWave", {});
    core.step();
    const before = core.snapshot();
    expect(() => core.step()).toThrow(SimStateError);
    expect(core.completedTick).toBe(1);
    expect(core.snapshot()).toEqual(before);
  });
  it("결과 후 저장한 settle·emit 호출 → 오류, 골드·원장·카운터 불변", () => {
    let saved: CommandHookContext | undefined;
    const core = createAttempt(uniformStage2(ONE_NORMAL, { normalDamage: 25 }), STAGE2_ID, 1, {
      handleCommand(ctx) {
        saved = ctx;
        return "unsupportedKind";
      },
    });
    core.submit("build", { tile: { col: 0, row: 0 } });
    core.submit("startWave", {});
    tick(8, core);
    expect(core.phase).toBe("defeat");
    const before = core.snapshot();
    expect(() => saved?.settle("late", 1000, "economySettled", {})).toThrow(SimStateError);
    expect(() => saved?.emit("economySettled", {})).toThrow(SimStateError);
    expect(core.snapshot()).toEqual(before);
    expect(core.ledger()).toEqual([]);
  });
  it("예외로 끝난 훅의 함수 재사용 → 오류, 상태 불변", () => {
    let saved: FireHookContext["damage"] | undefined;
    const core = createAttempt(bundle(), STAGE2_ID, 1, {
      fire(ctx) {
        saved = ctx.damage;
        throw new Error("hook failed");
      },
    });
    core.submit("startWave", {});
    const before = core.snapshot();
    expect(() => core.step()).toThrow("hook failed");
    expect(core.snapshot()).toEqual(before);
    expect(() => saved?.(1, 1)).toThrow(SimStateError);
    expect(core.snapshot()).toEqual(before);
  });
  it("async fire: step 실패, tick·스냅샷·원장·카운터 불변(microtask 뒤에도)", async () => {
    const core = createAttempt(bundle(), STAGE2_ID, 1, {
      fire: asHook<"fire">((ctx: FireHookContext) => {
        if (ctx.tick !== 2) return undefined;
        return (async () => {
          await Promise.resolve();
          ctx.damage(1, 100);
        })();
      }),
    });
    core.submit("startWave", {});
    core.step();
    const before = core.snapshot();
    expect(() => core.step()).toThrow(SimStateError);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(core.completedTick).toBe(1);
    expect(core.snapshot()).toEqual(before);
    expect(core.ledger()).toEqual([]);
    expect((core.snapshot().enemies as { hp: number }[])[0].hp).toBe(100);
  });
  it("async handleCommand·expireSlows·enemySpeed 도 프로토콜 오류로 step 실패", async () => {
    const make = (hooks: AttemptHooks) => {
      const core = createAttempt(bundle(), STAGE2_ID, 1, hooks);
      core.submit("build", { tile: { col: 0, row: 0 } });
      core.submit("startWave", {});
      return core;
    };
    const cases: AttemptHooks[] = [
      { handleCommand: asHook<"handleCommand">(async () => null) },
      { expireSlows: asHook<"expireSlows">(async () => undefined) },
      { enemySpeed: asHook<"enemySpeed">(async () => 5000) },
    ];
    for (const hooks of cases) {
      const core = make(hooks);
      const before = core.snapshot();
      expect(() => core.step()).toThrow(SimStateError);
      expect(core.snapshot()).toEqual(before);
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
});

describe("F2 step 중 pause/resume/submit 금지", () => {
  const kinds: [string, (call: () => void) => AttemptHooks][] = [
    ["command", (call) => ({ handleCommand: () => (call(), "unsupportedKind") })],
    ["slow", (call) => ({ expireSlows: () => (call(), undefined) })],
    ["fire", (call) => ({ fire: () => (call(), undefined) })],
    ["speed", (call) => ({ enemySpeed: () => (call(), 5000) })],
  ];
  for (const [name, make] of kinds) {
    for (const op of ["pause", "resume", "submit"] as const) {
      it(`${name} 훅에서 ${op}() → 즉시 SimStateError, step 전체 실패·상태 불변(paused 포함)`, () => {
        const holder: { core?: ReturnType<typeof createAttempt> } = {};
        const call = (): void => {
          if (op === "submit") holder.core?.submit("startWave", {});
          else holder.core?.[op]();
        };
        const core = createAttempt(bundle(), STAGE2_ID, 1, make(call));
        holder.core = core;
        core.submit("build", { tile: { col: 0, row: 0 } });
        core.submit("startWave", {});
        const before = core.snapshot();
        expect(() => core.step()).toThrow(SimStateError);
        expect(core.completedTick).toBe(0);
        expect(core.snapshot()).toEqual(before);
        expect(core.paused).toBe(false);
      });
    }
  }
  it("틱 밖 pause·큐 보존·재개는 그대로", () => {
    const core = createAttempt(bundle(), STAGE2_ID, 1);
    core.submit("startWave", {});
    core.pause();
    expect(core.snapshot().queue).toHaveLength(1);
    core.resume();
    expect(core.step()[0]).toMatchObject({ type: "waveStarted" });
  });
});

describe("F3 명령 단위 원자성(훅이 거부 사유를 돌려주면 그 명령의 변경을 되돌림)", () => {
  const BUILD = { tile: { col: 0, row: 0 } };
  it("settle 후 거부 → 골드·원장·소비 키·카운터 불변, commandRejected 의 eventSeq 는 롤백 후 번호", () => {
    const core = createAttempt(bundle(), STAGE2_ID, 1, {
      handleCommand(ctx, c) {
        ctx.settle(`build:c${c.seq}`, -100, "towerBuilt", { seq: c.seq });
        return "occupied";
      },
    });
    core.submit("build", BUILD);
    const ev = core.step();
    expect(ev).toEqual([{ eventSeq: 1, tick: 1, type: "commandRejected", kind: "build", reason: "occupied", seq: 1 }]);
    expect(core.snapshot()).toMatchObject({ gold: 350, consumedEconomyEvents: [] });
    expect(core.snapshot().counters).toMatchObject({ nextEventSeq: 2, nextCommandSeq: 2 });
    expect(core.ledger()).toEqual([]);
  });
  it("emit 후 거부 → 그 이벤트 제거", () => {
    const core = createAttempt(bundle(), STAGE2_ID, 1, {
      handleCommand(ctx) {
        ctx.emit("targetingChanged", { x: 1 });
        return "towerNotFound";
      },
    });
    core.submit("setTargeting", { towerId: 1, mode: "first" });
    expect(core.step()).toEqual([{ eventSeq: 1, tick: 1, type: "commandRejected", kind: "setTargeting", reason: "towerNotFound", seq: 1 }]);
  });
  it("앞 명령 성공 + 뒤 명령 거부: 앞 명령 변경은 유지, 거부 이벤트 eventSeq 는 이어서", () => {
    const core = createAttempt(bundle(), STAGE2_ID, 1, {
      handleCommand(ctx, c) {
        if (c.seq === 1) {
          ctx.settle("build:c1", -100, "towerBuilt", { seq: 1 });
          return null;
        }
        ctx.settle("build:c2", -50, "towerBuilt", { seq: 2 });
        return "occupied";
      },
    });
    core.submit("build", BUILD);
    core.submit("build", { tile: { col: 1, row: 0 } });
    const ev = core.step();
    expect(ev).toEqual([
      { eventSeq: 1, tick: 1, type: "towerBuilt", seq: 1, delta: -100, goldAfter: 250, key: "a1:build:c1" },
      { eventSeq: 2, tick: 1, type: "commandRejected", kind: "build", reason: "occupied", seq: 2 },
    ]);
    expect(core.snapshot()).toMatchObject({ gold: 250, consumedEconomyEvents: ["build:c1"] });
    expect(core.ledger().map((l) => [l.key, l.delta, l.goldAfter])).toEqual([["a1:build:c1", -100, 250]]);
  });
  it("거부된 명령이 쓴 정산 키를 뒤 명령이 다시 쓸 수 있다", () => {
    const results: boolean[] = [];
    const core = createAttempt(bundle(), STAGE2_ID, 1, {
      handleCommand(ctx, c) {
        results.push(ctx.settle("shared", -100, "towerBuilt", { seq: c.seq }));
        return c.seq === 1 ? "occupied" : null;
      },
    });
    core.submit("build", BUILD);
    core.submit("build", { tile: { col: 1, row: 0 } });
    const ev = core.step();
    expect(results).toEqual([true, true]);
    expect(ev).toEqual([
      { eventSeq: 1, tick: 1, type: "commandRejected", kind: "build", reason: "occupied", seq: 1 },
      { eventSeq: 2, tick: 1, type: "towerBuilt", seq: 2, delta: -100, goldAfter: 250, key: "a1:shared" },
    ]);
    expect(core.snapshot().consumedEconomyEvents).toEqual(["shared"]);
  });
  it("정산 후 throw → step 전체 롤백(큐 보존)", () => {
    const core = createAttempt(bundle(), STAGE2_ID, 1, {
      handleCommand(ctx) {
        ctx.settle("x", -100, "towerBuilt", {});
        throw new Error("boom");
      },
    });
    core.submit("build", BUILD);
    const before = core.snapshot();
    expect(() => core.step()).toThrow("boom");
    expect(core.snapshot()).toEqual(before);
    expect(core.snapshot().queue).toHaveLength(1);
    expect(core.ledger()).toEqual([]);
  });
  it("알 수 없는 거부 사유 → 프로토콜 오류로 step 전체 롤백", () => {
    const core = createAttempt(bundle(), STAGE2_ID, 1, { handleCommand: () => "bogus" as never });
    core.submit("build", BUILD);
    const before = core.snapshot();
    expect(() => core.step()).toThrow(SimStateError);
    expect(core.snapshot()).toEqual(before);
  });
});

describe("F4 생성 경로는 createAttempt 하나", () => {
  it("공개 API 에 AttemptCore 생성자가 없고, 직접 호출은 토큰 불일치로 오류", () => {
    expect("AttemptCore" in publicApi).toBe(false);
    expect(typeof publicApi.createAttempt).toBe("function");
    const real = createAttempt(bundle(), STAGE2_ID, 1);
    expect(() => new AttemptCore(Symbol("fake"), real.stageContent, real.contentHash, 5)).toThrow(SimStateError);
  });
  it("생성 후 입력 묶음의 적·웨이브 값을 바꿔도 시도 동작·contentHash 불변", () => {
    const input = bundle() as { enemies: { hp: number }[]; stages: { waves: { segments: { count: number; intervalMs: number }[] }[] }[] };
    const core = createAttempt(input, STAGE2_ID, 1);
    const hash = core.contentHash;
    input.enemies[0].hp = 999;
    input.stages[1].waves[0].segments[0].count = 1;
    input.stages[1].waves[0].segments[0].intervalMs = 50;
    expect(core.contentHash).toBe(hash);
    expect(createAttempt(bundle(), STAGE2_ID, 1).contentHash).toBe(hash);
    core.submit("startWave", {});
    core.step();
    expect(core.snapshot().enemies).toEqual([
      { id: 1, enemyType: "normal", trait: null, hp: 100, maxHp: 100, speedPerTick: 5000, pathProgress: 5000, baseDamage: 1, killReward: 5 },
    ]);
  });
});
