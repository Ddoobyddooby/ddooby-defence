// SIM-01 — 실제 시도 코어에 TECH-02 리플레이 검증(7.3·7.4)을 적용한다.
import { describe, expect, it } from "vitest";
import { ATTEMPT_CODE_VERSION, createAttempt } from "./attempt";
import { seg, uniformStage2, STAGE2_ID } from "./testing/bundles";
import { killAt } from "./testing/inject";
import { firstMismatch, initialStateHashOf, runReplay, type ReplayRecord } from "../sim/replay";

const bundle = uniformStage2({ prepMs: 150, clearReward: 20, segments: [seg(0, 0, 1), seg(100, 0, 1, "fast", "hpBoost")] });
const ATTEMPT_ID = 3;
// 조기 시작(틱 1) 뒤 입력 없는 구간: 틱 1 생성, 3 생성, 8 도달 …, 웨이브 1 완료는 fast 가 느려서 훨씬 뒤라 12틱 동안 전투 지속.
const END_TICK = 12;

function record(overrides: Partial<ReplayRecord> = {}): ReplayRecord {
  const core = createAttempt(bundle, STAGE2_ID, ATTEMPT_ID);
  return {
    formatVersion: 1,
    codeVersion: ATTEMPT_CODE_VERSION,
    contentHash: core.contentHash,
    stageId: STAGE2_ID,
    attemptId: ATTEMPT_ID,
    initialStateHash: initialStateHashOf(core.snapshot()),
    endTick: END_TICK,
    commands: [{ applyTick: 1, seq: 1, kind: "startWave", payload: {} }],
    ...overrides,
  };
}

const expectation = (): { formatVersion: number; codeVersion: string; contentHash: string } => ({
  formatVersion: 1,
  codeVersion: ATTEMPT_CODE_VERSION,
  contentHash: createAttempt(bundle, STAGE2_ID, ATTEMPT_ID).contentHash,
});

const run = (rec: ReplayRecord, hooks = {}) =>
  runReplay(rec, expectation(), (r) => createAttempt(bundle, r.stageId, r.attemptId, hooks));

describe("실제 시도 코어 리플레이", () => {
  it("같은 기록을 새 코어로 2회 실행하면 틱 0..endTick 의 상태·이벤트·해시가 전부 같다", () => {
    const a = run(record());
    const b = run(record());
    expect(a.ticks).toHaveLength(END_TICK + 1);
    expect(a.ticks.map((t) => t.hash)).toEqual(b.ticks.map((t) => t.hash));
    expect(firstMismatch(a, b)).toBeNull();
    // 조기 시작이 반영됐고 이후 입력 없는 틱도 진행된다
    expect(a.ticks[1].events.map((e) => (e as { type: string }).type)).toEqual(["waveStarted", "enemySpawned"]);
    expect((a.ticks[END_TICK].state as { tick: number }).tick).toBe(END_TICK);
  });
  it("명령 변조(applyTick 1 → 2)하면 첫 불일치 틱은 1", () => {
    const base = run(record());
    const tampered = run(record({ commands: [{ applyTick: 2, seq: 1, kind: "startWave", payload: {} }] }));
    const m = firstMismatch(base, tampered);
    expect(m?.tick).toBe(1);
  });
  it("명령 하나를 늦게 추가하면(틱 9 의 wrongPhase 거부) 그 틱이 첫 불일치", () => {
    const base = run(record());
    const extra = run(
      record({
        commands: [
          { applyTick: 1, seq: 1, kind: "startWave", payload: {} },
          { applyTick: 9, seq: 2, kind: "startWave", payload: {} },
        ],
      }),
    );
    expect(firstMismatch(base, extra)?.tick).toBe(9);
  });
  it("훅(TEST_ONLY 처치 주입)을 바꾸면 그 틱부터 불일치", () => {
    const base = run(record());
    const killed = run(record(), killAt({ tick: 5, enemyId: 1 }));
    expect(firstMismatch(base, killed)?.tick).toBe(5);
  });
  it("초기 상태 해시가 다르면 실행 거부, 결과 확정 뒤 endTick 이 남으면 종료 불일치", () => {
    expect(() => run(record({ initialStateHash: "0000000000000000" }))).toThrow(/초기|initial/i);
    const defeatBundle = uniformStage2({ prepMs: 150, clearReward: 20, segments: [seg(0, 0, 1)] }, { normalDamage: 25 });
    const core = createAttempt(defeatBundle, STAGE2_ID, 1);
    const rec: ReplayRecord = {
      formatVersion: 1,
      codeVersion: ATTEMPT_CODE_VERSION,
      contentHash: core.contentHash,
      stageId: STAGE2_ID,
      attemptId: 1,
      initialStateHash: initialStateHashOf(core.snapshot()),
      endTick: 9, // 결과는 틱 8 에 확정
      commands: [{ applyTick: 1, seq: 1, kind: "startWave", payload: {} }],
    };
    const go = (r: ReplayRecord) =>
      runReplay(r, { formatVersion: 1, codeVersion: ATTEMPT_CODE_VERSION, contentHash: core.contentHash }, (x) => createAttempt(defeatBundle, x.stageId, x.attemptId));
    expect(() => go(rec)).toThrow();
    const ok = go({ ...rec, endTick: 8 });
    expect((ok.ticks[8].state as { phase: string }).phase).toBe("defeat");
  });
});
