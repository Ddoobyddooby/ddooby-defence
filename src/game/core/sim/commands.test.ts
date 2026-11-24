// Q04(큐 저장 순서 무관·seq 숫자순), Q09(즉시 거부), Q12(seq 한계), Q13(복사·동결), Q14(구조 오류), 접수 규칙.
import { describe, expect, it } from "vitest";
import {
  CommandStructureError,
  drainCommands,
  submitCommand,
  validateCommandInput,
  type Command,
  type SubmitContext,
} from "./commands";
import { SimStateError } from "./errors";
import { createIdCounters } from "./ids";

const M = Number.MAX_SAFE_INTEGER;
const ctx = (over: Partial<SubmitContext> = {}): SubmitContext => ({
  completedTick: 0,
  phase: "prep",
  paused: false,
  stepping: false,
  ...over,
});
const build = (col: number) => ({ towerType: "archer", tile: { col, row: 0 } });

describe("접수: seq·applyTick (4절, 2.1절)", () => {
  it("seq는 1부터 단조 증가, applyTick = completedTick + 1", () => {
    const q: Command[] = [];
    const c = createIdCounters();
    const a = submitCommand(q, c, "build", build(0), ctx());
    const b = submitCommand(q, c, "sell", { towerId: 1 }, ctx({ completedTick: 6 }));
    expect(a.ok && [a.command.seq, a.command.applyTick]).toEqual([1, 1]);
    expect(b.ok && [b.command.seq, b.command.applyTick]).toEqual([2, 7]);
    expect(c.nextCommandSeq).toBe(3);
    expect(q).toHaveLength(2);
  });
  it("step 실행 중 접수는 SimStateError, 카운터·큐 불변", () => {
    const q: Command[] = [];
    const c = createIdCounters();
    expect(() => submitCommand(q, c, "startWave", {}, ctx({ stepping: true }))).toThrow(SimStateError);
    expect(c.nextCommandSeq).toBe(1);
    expect(q).toHaveLength(0);
  });
});

describe("Q09: 일시정지·결과 단계의 접수 즉시 거부 (seq 미부여)", () => {
  for (const [label, over, reason] of [
    ["일시정지", { paused: true }, "paused"],
    ["결과 단계", { phase: "result" }, "resultPhase"],
    ["결과 단계 + 일시정지", { phase: "result", paused: true }, "resultPhase"],
  ] as const) {
    it(`${label}: build/startWave/upgrade/sell/setTargeting 모두 거부`, () => {
      const q: Command[] = [];
      const c = createIdCounters();
      const inputs: [string, unknown][] = [
        ["build", build(0)],
        ["startWave", {}],
        ["upgrade", { towerId: 1 }],
        ["sell", { towerId: 1 }],
        ["setTargeting", { towerId: 1, mode: "first" }],
      ];
      for (const [kind, payload] of inputs) {
        expect(submitCommand(q, c, kind, payload, ctx(over))).toEqual({ ok: false, reason });
      }
      expect(c.nextCommandSeq).toBe(1);
      expect(q).toHaveLength(0);
    });
  }
  it("구조 오류는 상태와 무관하게 throw (일시정지 중에도 잘못된 payload를 조용히 삼키지 않음)", () => {
    expect(() => submitCommand([], createIdCounters(), "nope", {}, ctx({ paused: true }))).toThrow(CommandStructureError);
  });
});

describe("Q12: seq 카운터 한계", () => {
  it("nextCommandSeq=M이면 접수는 RangeError, 큐·카운터 불변 (wrap·재사용 없음)", () => {
    const q: Command[] = [];
    const c = createIdCounters();
    c.nextCommandSeq = M;
    expect(() => submitCommand(q, c, "startWave", {}, ctx())).toThrow(RangeError);
    expect(c.nextCommandSeq).toBe(M);
    expect(q).toHaveLength(0);
  });
  it("applyTick 계산이 넘치면(completedTick=M) 오류, seq 소비 없음", () => {
    const c = createIdCounters();
    expect(() => submitCommand([], c, "startWave", {}, ctx({ completedTick: M }))).toThrow(RangeError);
    expect(c.nextCommandSeq).toBe(1);
  });
});

describe("Q13: payload 복사·동결", () => {
  it("접수 후 호출자가 원본 객체를 바꿔도 큐의 명령은 그대로", () => {
    const q: Command[] = [];
    const payload = { towerType: "archer", tile: { col: 3, row: 4 } };
    const r = submitCommand(q, createIdCounters(), "build", payload, ctx());
    payload.tile.col = 99;
    expect(r.ok && r.command.kind === "build" && r.command.payload.tile).toEqual({ col: 3, row: 4 });
    expect(q[0].kind === "build" && q[0].payload.tile.col).toBe(3);
  });
  it("접수된 명령은 깊게 동결되어 있어 변경 시도는 TypeError", () => {
    const q: Command[] = [];
    submitCommand(q, createIdCounters(), "build", build(1), ctx());
    const cmd = q[0] as unknown as { seq: number; payload: { tile: { col: number } } };
    expect(Object.isFrozen(cmd)).toBe(true);
    expect(() => {
      cmd.seq = 5;
    }).toThrow(TypeError);
    expect(() => {
      cmd.payload.tile.col = 7;
    }).toThrow(TypeError);
  });
});

describe("Q14: 구조 검사 (자동 보정·형변환 없음)", () => {
  const bad: [string, unknown, unknown][] = [
    ["알 수 없는 kind", "teleport", {}],
    ["kind가 문자열이 아님", 5, {}],
    ["payload null", "sell", null],
    ["payload 배열", "sell", []],
    ["build: tile 누락", "build", { towerType: "archer" }],
    ["build: towerType 누락", "build", { tile: { col: 1, row: 0 } }],
    ["build: 알 수 없는 towerType", "build", { towerType: "cannon", tile: { col: 1, row: 0 } }],
    ["build: towerType 숫자", "build", { towerType: 1, tile: { col: 1, row: 0 } }],
    ["build: 소수 col", "build", { towerType: "archer", tile: { col: 1.5, row: 0 } }],
    ["build: 문자열 row", "build", { towerType: "archer", tile: { col: 1, row: "0" } }],
    ["build: 음수 col", "build", { towerType: "archer", tile: { col: -1, row: 0 } }],
    ["build: 알 수 없는 필드", "build", { towerType: "archer", tile: { col: 1, row: 0 }, extra: 1 }],
    ["sell: towerId 0", "sell", { towerId: 0 }],
    ["sell: towerId 문자열", "sell", { towerId: "1" }],
    ["upgrade: towerId 누락", "upgrade", {}],
    ["setTargeting: 알 수 없는 mode", "setTargeting", { towerId: 1, mode: "weak" }],
    ["setTargeting: mode 누락", "setTargeting", { towerId: 1 }],
    ["startWave: 비어 있지 않은 payload", "startWave", { x: 1 }],
  ];
  for (const [label, kind, payload] of bad) {
    it(`${label}: CommandStructureError, seq 미소비`, () => {
      const c = createIdCounters();
      const q: Command[] = [];
      expect(() => submitCommand(q, c, kind, payload, ctx())).toThrow(CommandStructureError);
      expect(c.nextCommandSeq).toBe(1);
      expect(q).toHaveLength(0);
    });
  }
  it("오류에는 필드 경로가 담긴다", () => {
    try {
      validateCommandInput("build", { towerType: "archer", tile: { col: 1.5, row: 0 } }, "commands[2]");
      expect.unreachable();
    } catch (e) {
      expect((e as CommandStructureError).path).toBe("commands[2].payload.tile.col");
    }
  });
  it("유효한 payload 5종은 통과", () => {
    expect(validateCommandInput("build", build(0)).kind).toBe("build");
    expect(validateCommandInput("upgrade", { towerId: 1 }).kind).toBe("upgrade");
    expect(validateCommandInput("sell", { towerId: 2 }).kind).toBe("sell");
    expect(validateCommandInput("setTargeting", { towerId: 1, mode: "close" }).kind).toBe("setTargeting");
    expect(validateCommandInput("startWave", {}).kind).toBe("startWave");
  });
});

describe("Q04: 1단계 소비는 seq 숫자 오름차순, 저장 순서 무관", () => {
  const make = (seqs: number[], applyTick = 1): Command[] =>
    seqs.map((seq) => Object.freeze({ kind: "startWave", payload: Object.freeze({}), seq, applyTick }) as Command);

  it("저장 순서 [2,1]이어도 1→2로 소비하고 큐는 비워진다", () => {
    const q = make([2, 1]);
    expect(drainCommands(q, 1).map((c) => c.seq)).toEqual([1, 2]);
    expect(q).toHaveLength(0);
  });
  it("seq 1, 2, 10은 숫자순 (문자열 정렬 1,10,2 변이를 검출)", () => {
    const q = make([10, 2, 1]);
    expect(drainCommands(q, 1).map((c) => c.seq)).toEqual([1, 2, 10]);
  });
  it("applyTick이 다른 명령이 섞인 큐는 불변식 위반 오류이고 큐는 그대로", () => {
    const q = [...make([1], 1), ...make([2], 2)];
    expect(() => drainCommands(q, 1)).toThrow(SimStateError);
    expect(q).toHaveLength(2);
  });
  it("빈 큐는 빈 배열", () => {
    expect(drainCommands([], 5)).toEqual([]);
  });
});
