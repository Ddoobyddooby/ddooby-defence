// SIM-01 리뷰 F1~F4 — 훅 쓰기 함수 수명, step 중 조작 금지, 명령 단위 원자성, 생성 경로.
import { describe, expect, it } from "vitest";
import * as publicApi from "./index";
import { AttemptCore, createAttempt } from "./attempt";
import { seg, STAGE2_ID, uniformStage2 } from "./testing/bundles";
import { SimStateError } from "../sim/errors";
import type { AttemptHooks, FireHookContext } from "./types";

const ONE_NORMAL = { prepMs: 150, clearReward: 20, segments: [seg(0, 0, 1)] };
const bundle = (): unknown => uniformStage2(ONE_NORMAL);
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
  it("저장한 damage 를 다음 틱의 다른 훅에서 호출 → 오류·상태 불변", () => {
    let saved: FireHookContext["damage"] | undefined;
    const core = createAttempt(bundle(), STAGE2_ID, 1, {
      fire(ctx) {
        if (ctx.tick === 2) saved?.(1, 100);
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
});

describe("F2 step 중 pause/resume/submit 금지", () => {
  const kinds: [string, (call: () => void) => AttemptHooks][] = [
    ["fire", (call) => ({ fire: () => (call(), undefined) })],
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
        core.submit("build", { towerType: "archer", tile: { col: 0, row: 0 } });
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
      { id: 1, enemyType: "normal", trait: null, hp: 100, maxHp: 100, speedPerTick: 5000, pathProgress: 5000, baseDamage: 1, killReward: 5, slows: [] },
    ]);
  });
});
