// SIM-03 — 기록 생성기 (SIM-CONTRACT 15.1).
import { describe, expect, it } from "vitest";
import { ATTEMPT_CODE_VERSION, createAttempt } from "./attempt";
import { createRecordedAttempt, recordAttempt, REPLAY_FORMAT_VERSION } from "./record";
import { seg, STAGE2_ID, uniformStage2 } from "./testing/bundles";
import { SimStateError } from "../sim/errors";
import { firstMismatch, initialStateHashOf, runReplay, validateReplayRecord } from "../sim/replay";

const ONE_NORMAL = { prepMs: 150, clearReward: 20, segments: [seg(0, 0, 1)] };
const bundle = (): unknown => uniformStage2(ONE_NORMAL);
const DEFEAT = (): unknown => uniformStage2(ONE_NORMAL, { normalDamage: 25 }); // 틱 8 에 기지 도달 → 패배

describe("createRecordedAttempt (15.1)", () => {
  it("접수 ok 명령만 기록: 일시정지 거부·결과 단계 거부는 기록되지 않고, 적용 시 거부된 명령(seq 소비)은 기록된다", () => {
    const rec = createRecordedAttempt(bundle(), STAGE2_ID, 5);
    const c = rec.core;
    expect(c.submit("build", { towerType: "archer", tile: { col: 0, row: 0 } }).ok).toBe(true);
    c.pause();
    expect(c.submit("upgrade", { towerId: 1 })).toEqual({ ok: false, reason: "paused" });
    c.resume();
    expect(c.submit("sell", { towerId: 99 }).ok).toBe(true); // 적용 시 towerNotFound 로 거부되지만 seq 를 받았다
    c.step();
    expect(rec.finish().commands).toEqual([
      { applyTick: 1, seq: 1, kind: "build", payload: { towerType: "archer", tile: { col: 0, row: 0 } } },
      { applyTick: 1, seq: 2, kind: "sell", payload: { towerId: 99 } },
    ]);
    expect(rec.trace().ticks[1].events.map((e) => (e as { type: string; reason?: string }).reason ?? (e as { type: string }).type)).toContain("towerNotFound");

    const over = createRecordedAttempt(DEFEAT(), STAGE2_ID, 1);
    over.core.submit("startWave", {});
    for (let t = 0; t < 8; t++) over.core.step();
    expect(over.core.isResult()).toBe(true);
    expect(over.core.submit("startWave", {})).toEqual({ ok: false, reason: "resultPhase" });
    const record = over.finish();
    expect(record.commands).toHaveLength(1);
    expect(record.endTick).toBe(8); // 결과 틱 R
  });

  it("payload 는 접수 시 동결 사본: 호출자가 나중에 원본을 바꿔도 기록은 그대로이고, 기록은 깊게 동결된다", () => {
    const rec = createRecordedAttempt(bundle(), STAGE2_ID, 1);
    const payload = { towerType: "archer", tile: { col: 2, row: 0 } };
    rec.core.submit("build", payload);
    payload.tile.col = 9;
    payload.towerType = "mage";
    rec.core.step();
    const record = rec.finish();
    expect(record.commands[0].payload).toEqual({ towerType: "archer", tile: { col: 2, row: 0 } });
    expect(Object.isFrozen(record)).toBe(true);
    expect(Object.isFrozen(record.commands)).toBe(true);
    expect(Object.isFrozen(record.commands[0])).toBe(true);
    expect(Object.isFrozen(record.commands[0].payload)).toBe(true);
    // finish() 는 호출 시점의 복사: 이후 진행해도 이미 받은 기록은 안 변한다
    rec.core.step();
    expect(record.endTick).toBe(1);
    expect(rec.finish().endTick).toBe(2);
  });

  it("헤더: formatVersion 1·ATTEMPT_CODE_VERSION·contentHash·stageId·attemptId·initialStateHash(스냅샷 0)·endTick=completedTick", () => {
    const core0 = createAttempt(bundle(), STAGE2_ID, 7);
    const rec = createRecordedAttempt(bundle(), STAGE2_ID, 7);
    const r = rec.finish();
    expect(r).toMatchObject({ formatVersion: REPLAY_FORMAT_VERSION, codeVersion: ATTEMPT_CODE_VERSION, contentHash: core0.contentHash, stageId: STAGE2_ID, attemptId: 7, endTick: 0, commands: [] });
    expect(REPLAY_FORMAT_VERSION).toBe(1);
    expect(r.initialStateHash).toBe(initialStateHashOf(core0.snapshot()));
  });

  it("기록은 validateReplayRecord 를 통과하고, 새 코어 재생이 원 실행의 틱 0..endTick 상태·이벤트·해시와 완전히 같다", () => {
    const rec = createRecordedAttempt(bundle(), STAGE2_ID, 3);
    const c = rec.core;
    c.submit("build", { towerType: "archer", tile: { col: 0, row: 0 } });
    c.submit("startWave", {});
    for (let t = 0; t < 12; t++) c.step();
    c.submit("setTargeting", { towerId: 1, mode: "last" });
    for (let t = 0; t < 4; t++) c.step();
    const record = rec.finish();
    const expectation = { formatVersion: 1, codeVersion: ATTEMPT_CODE_VERSION, contentHash: c.contentHash };
    expect(() => validateReplayRecord(record, expectation)).not.toThrow();
    const original = rec.trace();
    expect(original.ticks).toHaveLength(record.endTick + 1);
    const replayed = runReplay(record, expectation, (r) => createAttempt(bundle(), r.stageId, r.attemptId));
    expect(firstMismatch(original, replayed)).toBeNull();
    expect(replayed.ticks.map((t) => t.hash)).toEqual(original.ticks.map((t) => t.hash));
    expect(original.ticks.some((t) => t.events.some((e) => (e as { type: string }).type === "projectileFired"))).toBe(true);
  });

  it("core 는 createAttempt 코어와 같은 공개 면을 가진다(일시정지·원장·스냅샷)", () => {
    const rec = createRecordedAttempt(bundle(), STAGE2_ID, 1);
    expect(rec.core.attemptId).toBe(1);
    expect(rec.core.phase).toBe("preparation");
    rec.core.pause();
    expect(rec.core.paused).toBe(true);
    expect(() => rec.core.step()).toThrow(SimStateError);
    rec.core.resume();
    expect(rec.core.ledger()).toEqual([]);
    expect(rec.core.stageContent.stage.stageId).toBe(STAGE2_ID);
  });

  it("step() 실행 중 finish() 는 오류(상태·기록 불변), 새 시도가 아닌 코어는 기록 시작 거부, 제품 경로는 훅을 받지 않는다", () => {
    const holder: { finish?: () => unknown } = {};
    const core = createAttempt(bundle(), STAGE2_ID, 1, {
      fire() {
        holder.finish?.();
        return undefined;
      },
    });
    const rec = recordAttempt(core);
    holder.finish = rec.finish;
    rec.core.submit("startWave", {});
    expect(() => rec.core.step()).toThrow(SimStateError);
    expect(core.completedTick).toBe(0);
    expect(rec.trace().ticks).toHaveLength(1);
    // 실패한 step 뒤: 미적용 startWave(applyTick 1)는 기록에 넣지 않고(endTick 0) 큐에 남아 있다
    expect(rec.finish()).toMatchObject({ endTick: 0, commands: [] });

    const used = createAttempt(bundle(), STAGE2_ID, 1);
    used.step();
    expect(() => recordAttempt(used)).toThrow(SimStateError);
    expect(createRecordedAttempt.length).toBe(3);
  });
});

describe("finish() 와 미적용 명령 (리뷰 SIM-03 F2, 15.1)", () => {
  const expectation = (core: { contentHash: string }) => ({ formatVersion: 1, codeVersion: ATTEMPT_CODE_VERSION, contentHash: core.contentHash });
  /** finish() 결과는 항상 검증을 통과하고, 새 코어 재생이 원 실행의 틱 0..endTick trace 와 같다. */
  function expectConsistent(rec: ReturnType<typeof createRecordedAttempt>, b: unknown = bundle()): ReturnType<ReturnType<typeof createRecordedAttempt>["finish"]> {
    const record = rec.finish();
    expect(() => validateReplayRecord(record, expectation(rec.core))).not.toThrow();
    const replayed = runReplay(record, expectation(rec.core), (r) => createAttempt(b, r.stageId, r.attemptId));
    expect(replayed.ticks).toHaveLength(record.endTick + 1);
    expect(firstMismatch({ ticks: rec.trace().ticks.slice(0, record.endTick + 1) }, replayed)).toBeNull();
    for (const c of record.commands) expect(c.applyTick).toBeLessThanOrEqual(record.endTick);
    return record;
  }

  it("최초 접수 직후(step 없음): 기록에는 명령이 없고 endTick 0, step 뒤 finish 에 포함", () => {
    const rec = createRecordedAttempt(bundle(), STAGE2_ID, 1);
    rec.core.submit("startWave", {});
    expect(expectConsistent(rec)).toMatchObject({ endTick: 0, commands: [] });
    expect(rec.core.snapshot().queue).toHaveLength(1); // 코어 큐에 보존
    rec.core.step();
    expect(expectConsistent(rec)).toMatchObject({ endTick: 1, commands: [{ applyTick: 1, seq: 1, kind: "startWave", payload: {} }] });
  });

  it("진행 중 다음 틱 명령을 접수한 직후: 그 명령만 빠지고 앞선 명령은 포함, step 뒤 포함", () => {
    const rec = createRecordedAttempt(bundle(), STAGE2_ID, 1);
    rec.core.submit("startWave", {});
    for (let t = 0; t < 3; t++) rec.core.step();
    rec.core.submit("build", { towerType: "archer", tile: { col: 0, row: 0 } }); // applyTick 4
    expect(expectConsistent(rec)).toMatchObject({ endTick: 3, commands: [{ seq: 1, applyTick: 1 }] });
    rec.core.step();
    expect(expectConsistent(rec)).toMatchObject({ endTick: 4, commands: [{ seq: 1 }, { seq: 2, applyTick: 4, kind: "build" }] });
  });

  it("접수 후 일시정지: 큐에 남은 명령은 기록에서 빠지고, 재개해 step 한 뒤 포함", () => {
    const rec = createRecordedAttempt(bundle(), STAGE2_ID, 1);
    rec.core.step();
    rec.core.submit("startWave", {}); // applyTick 2
    rec.core.pause();
    expect(expectConsistent(rec)).toMatchObject({ endTick: 1, commands: [] });
    rec.core.resume();
    rec.core.step();
    expect(expectConsistent(rec)).toMatchObject({ endTick: 2, commands: [{ applyTick: 2, kind: "startWave" }] });
  });

  it("step 실패(예외) 뒤: 큐에 남은 명령은 빠지고, 재시도에 성공한 뒤 포함", () => {
    let armed = true;
    const core = createAttempt(bundle(), STAGE2_ID, 1, {
      fire(ctx: { tick: number }) {
        if (armed && ctx.tick === 2) throw new Error("hook boom");
        return undefined;
      },
    });
    const rec = recordAttempt(core);
    rec.core.submit("startWave", {});
    rec.core.step(); // 틱 1 성공
    rec.core.submit("build", { towerType: "archer", tile: { col: 0, row: 0 } }); // applyTick 2
    expect(() => rec.core.step()).toThrow("hook boom");
    expect(expectConsistent(rec)).toMatchObject({ endTick: 1, commands: [{ seq: 1 }] });
    armed = false;
    rec.core.step();
    expect(expectConsistent(rec)).toMatchObject({ endTick: 2, commands: [{ seq: 1 }, { seq: 2, applyTick: 2 }] });
  });
});
