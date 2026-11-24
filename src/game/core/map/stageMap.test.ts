// MAP-01 — 기대값은 SIM-CONTRACT 10.2의 그림·표를 옮긴 리터럴/손 계산이다(제품 함수로 기대값을 만들지 않는다).
import { describe, expect, it } from "vitest";
import { STAGE_MAPS } from "../../content/stageMaps";
import { buildableCellCount, cellIndex, compileStageMap, isBuildable, MapValidationError, progressToPosition } from "./stageMap";

const EMPTY: ReadonlySet<number> = new Set();
const w = (col: number, row: number) => ({ col, row });

// 10.2 그림(열 번호 줄 제외, 행 0~9). S=출발, #=경로, B=기지, .=설치 가능.
const PICTURES: Record<string, string[]> = {
  "stage-1-meadow-outpost": [
    "..................",
    "..................",
    "S###############..",
    "...............#..",
    "...............#..",
    "..##############..",
    "..#...............",
    "..#...............",
    "..###############B",
    "..................",
  ],
  "stage-2-snowfall-pass": [
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
  ],
  "stage-3-dusk-ruins": [
    "..................",
    "..######..........",
    "..#....#..........",
    "..#....#....####..",
    "..#....#....#..#..",
    "..#....#....#..#..",
    "..#....#....#..##B",
    "..#....######.....",
    "S##...............",
    "..................",
  ],
};
const EXPECT: Record<string, { path: number; buildable: number; lengthMt: number }> = {
  "stage-1-meadow-outpost": { path: 50, buildable: 130, lengthMt: 49000 },
  "stage-2-snowfall-pass": { path: 37, buildable: 143, lengthMt: 36000 },
  "stage-3-dusk-ruins": { path: 38, buildable: 142, lengthMt: 37000 },
};

describe("후보 맵 3종 (10.2)", () => {
  it("맵 3개, stageId 중복 없음", () => {
    expect(STAGE_MAPS.map((m) => m.stageId)).toEqual(Object.keys(PICTURES));
  });
  for (const raw of STAGE_MAPS) {
    describe(raw.stageId, () => {
      const map = compileStageMap(raw);
      const e = EXPECT[raw.stageId];
      it("검증 통과, 경로 칸·설치 가능 칸·총길이가 표와 같다", () => {
        expect(map.pathCells.length).toBe(e.path);
        expect(buildableCellCount(map)).toBe(e.buildable);
        expect(map.pathLengthMt).toBe(e.lengthMt);
      });
      it("그림과 칸 단위로 일치(경로/출발/기지)", () => {
        const pic = PICTURES[raw.stageId];
        const start = map.pathCells[0];
        const base = map.pathCells[map.pathCells.length - 1];
        for (let row = 0; row < 10; row++) {
          let line = "";
          for (let col = 0; col < 18; col++) {
            const onPath = map.pathCells.some((c) => c.col === col && c.row === row);
            if (col === start.col && row === start.row) line += "S";
            else if (col === base.col && row === base.row) line += "B";
            else line += onPath ? "#" : ".";
          }
          expect(line).toBe(pic[row]);
        }
      });
      it("isBuildable 이 그림의 '.' 칸과 정확히 일치", () => {
        const pic = PICTURES[raw.stageId];
        let count = 0;
        for (let row = 0; row < 10; row++) {
          for (let col = 0; col < 18; col++) {
            const expected = pic[row][col] === ".";
            expect(isBuildable(map, w(col, row), EMPTY)).toBe(expected);
            if (expected) count++;
          }
        }
        expect(count).toBe(e.buildable);
      });
    });
  }
});

describe("검증 오류 (각각 별도, 필드 경로 포함, 자동 보정 없음)", () => {
  const ok = { stageId: "t", waypoints: [w(0, 2), w(5, 2), w(5, 6)], reservedCells: [] as ReturnType<typeof w>[] };
  function fieldOf(input: unknown): string {
    try {
      compileStageMap(input);
    } catch (err) {
      expect(err).toBeInstanceOf(MapValidationError);
      return (err as MapValidationError).field;
    }
    throw new Error("검증 오류가 나야 함");
  }
  it("기준 맵은 통과", () => {
    expect(compileStageMap(ok).pathCells.length).toBe(10);
  });
  it("격자 밖 waypoint", () => {
    expect(fieldOf({ ...ok, waypoints: [w(0, 2), w(18, 2)] })).toBe("waypoints[1].col");
    expect(fieldOf({ ...ok, waypoints: [w(0, 2), w(5, 2), w(5, 10)] })).toBe("waypoints[2].row");
    expect(fieldOf({ ...ok, waypoints: [w(-1, 2), w(5, 2)] })).toBe("waypoints[0].col");
  });
  it("대각 구간", () => {
    expect(fieldOf({ ...ok, waypoints: [w(0, 2), w(5, 2), w(6, 5)] })).toBe("waypoints[2]");
  });
  it("길이 0 구간", () => {
    expect(fieldOf({ ...ok, waypoints: [w(0, 2), w(5, 2), w(5, 2)] })).toBe("waypoints[2]");
  });
  it("같은 방향 연속 중간 waypoint", () => {
    expect(fieldOf({ ...ok, waypoints: [w(0, 2), w(3, 2), w(5, 2), w(5, 6)] })).toBe("waypoints[1]");
  });
  it("경로 칸 중복: 교차", () => {
    // (0,1)→(4,1)→(4,3)→(2,3)→(2,0): 마지막 구간이 (2,1)을 다시 지남
    expect(fieldOf({ ...ok, waypoints: [w(0, 1), w(4, 1), w(4, 3), w(2, 3), w(2, 0)] })).toBe("waypoints[4]");
  });
  it("경로 칸 중복: 되돌아감", () => {
    expect(fieldOf({ ...ok, waypoints: [w(0, 2), w(5, 2), w(3, 2)] })).toBe("waypoints[2]");
  });
  it("맞닿은 통로", () => {
    // 위 가로줄(row 2)과 아래 가로줄(row 3)이 붙음
    expect(fieldOf({ ...ok, waypoints: [w(0, 2), w(5, 2), w(5, 4), w(1, 4), w(1, 3), w(4, 3)] })).toBe("waypoints");
    expect(fieldOf({ ...ok, waypoints: [w(0, 2), w(5, 2), w(5, 3), w(0, 3)] })).toBe("waypoints");
  });
  it("꺾임 칸의 이웃은 맞닿음이 아니다(정상)", () => {
    expect(() => compileStageMap({ ...ok, waypoints: [w(0, 2), w(5, 2), w(5, 4), w(1, 4)] })).not.toThrow();
  });
  it("출발점이 가장자리 아님", () => {
    expect(fieldOf({ ...ok, waypoints: [w(1, 2), w(5, 2)] })).toBe("waypoints[0]");
  });
  it("출발점이 위·아래·오른쪽 가장자리면 통과", () => {
    expect(() => compileStageMap({ ...ok, waypoints: [w(3, 0), w(3, 4)] })).not.toThrow();
    expect(() => compileStageMap({ ...ok, waypoints: [w(3, 9), w(3, 4)] })).not.toThrow();
    expect(() => compileStageMap({ ...ok, waypoints: [w(17, 3), w(10, 3)] })).not.toThrow();
  });
  it("waypoint 2개 미만", () => {
    expect(fieldOf({ ...ok, waypoints: [w(0, 2)] })).toBe("waypoints");
    expect(fieldOf({ ...ok, waypoints: [] })).toBe("waypoints");
  });
  it("reservedCells 격자 밖", () => {
    expect(fieldOf({ ...ok, reservedCells: [w(18, 0)] })).toBe("reservedCells[0].col");
    expect(fieldOf({ ...ok, reservedCells: [w(0, 3), w(0, -1)] })).toBe("reservedCells[1].row");
  });
  it("reservedCells 중복(자기끼리, 경로와)", () => {
    expect(fieldOf({ ...ok, reservedCells: [w(8, 8), w(8, 8)] })).toBe("reservedCells[1]");
    expect(fieldOf({ ...ok, reservedCells: [w(3, 2)] })).toBe("reservedCells[0]");
  });
  it("비정수·비수치 좌표", () => {
    expect(fieldOf({ ...ok, waypoints: [w(0, 2), w(5.5, 2)] })).toBe("waypoints[1].col");
    expect(fieldOf({ ...ok, waypoints: [w(0, 2), w(Number.NaN, 2)] })).toBe("waypoints[1].col");
    expect(fieldOf({ ...ok, waypoints: [w(0, 2), { col: "5", row: 2 }] })).toBe("waypoints[1].col");
    expect(fieldOf({ ...ok, waypoints: [w(0, 2), null] })).toBe("waypoints[1]");
  });
  describe("sparse 배열(hole)·undefined·null 거부, 입력 불변", () => {
    const base = [w(0, 2), w(5, 2), w(5, 6)];
    function holey(arr: unknown[], holeAt: number): unknown[] {
      const copy = arr.slice();
      delete copy[holeAt];
      return copy;
    }
    it("waypoints 첫·중간·마지막 hole", () => {
      expect(fieldOf({ ...ok, waypoints: holey(base, 0) })).toBe("waypoints[0]");
      expect(fieldOf({ ...ok, waypoints: holey(base, 1) })).toBe("waypoints[1]");
      expect(fieldOf({ ...ok, waypoints: holey(base, 2) })).toBe("waypoints[2]");
    });
    it("waypoints new Array(n)·명시적 undefined·null", () => {
      expect(fieldOf({ ...ok, waypoints: new Array(3) })).toBe("waypoints[0]");
      expect(fieldOf({ ...ok, waypoints: [w(0, 2), undefined, w(5, 2)] })).toBe("waypoints[1]");
      expect(fieldOf({ ...ok, waypoints: [w(0, 2), w(5, 2), null] })).toBe("waypoints[2]");
    });
    it("reservedCells 첫·중간·마지막 hole", () => {
      const r = [w(8, 8), w(9, 8), w(10, 8)];
      expect(fieldOf({ ...ok, reservedCells: holey(r, 0) })).toBe("reservedCells[0]");
      expect(fieldOf({ ...ok, reservedCells: holey(r, 1) })).toBe("reservedCells[1]");
      expect(fieldOf({ ...ok, reservedCells: holey(r, 2) })).toBe("reservedCells[2]");
    });
    it("reservedCells new Array(1)·명시적 undefined·null", () => {
      expect(fieldOf({ ...ok, reservedCells: new Array(1) })).toBe("reservedCells[0]");
      expect(fieldOf({ ...ok, reservedCells: [w(8, 8), undefined] })).toBe("reservedCells[1]");
      expect(fieldOf({ ...ok, reservedCells: [null] })).toBe("reservedCells[0]");
    });
    it("실패해도 입력은 바뀌지 않는다", () => {
      const reserved = new Array(2);
      reserved[1] = w(8, 8);
      const input = { stageId: "t", waypoints: holey(base, 1), reservedCells: reserved };
      const holes = (a: unknown[]) => Object.keys(a).join(",");
      expect(() => compileStageMap(input)).toThrow(MapValidationError);
      expect(input.waypoints.length).toBe(3);
      expect(holes(input.waypoints)).toBe("0,2");
      expect(holes(reserved)).toBe("1");
    });
  });
  it("구조 오류: stageId·배열·객체", () => {
    expect(fieldOf({ ...ok, stageId: "" })).toBe("stageId");
    expect(fieldOf({ ...ok, waypoints: "x" })).toBe("waypoints");
    expect(fieldOf({ ...ok, reservedCells: undefined })).toBe("reservedCells");
    expect(fieldOf(null)).toBe("map");
  });
  it("입력을 고치거나 보정하지 않는다(원본 불변)", () => {
    const input = { stageId: "t", waypoints: [w(0, 2), w(5, 2)], reservedCells: [] };
    const before = JSON.stringify(input);
    compileStageMap(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe("isBuildable", () => {
  const map = compileStageMap({ stageId: "t", waypoints: [w(0, 2), w(5, 2), w(5, 6)], reservedCells: [w(8, 8)] });
  it("경로·출발·기지·reservedCells·점유 칸은 false", () => {
    expect(isBuildable(map, w(0, 2), EMPTY)).toBe(false); // 출발
    expect(isBuildable(map, w(3, 2), EMPTY)).toBe(false); // 경로
    expect(isBuildable(map, w(5, 4), EMPTY)).toBe(false); // 경로(세로)
    expect(isBuildable(map, w(5, 6), EMPTY)).toBe(false); // 기지
    expect(isBuildable(map, w(8, 8), EMPTY)).toBe(false); // reserved
    expect(isBuildable(map, w(1, 1), new Set([cellIndex(w(1, 1))]))).toBe(false); // 점유
  });
  it("그 외는 true (경로 바로 옆 칸 포함)", () => {
    expect(isBuildable(map, w(1, 1), EMPTY)).toBe(true);
    expect(isBuildable(map, w(3, 3), EMPTY)).toBe(true);
    expect(isBuildable(map, w(17, 9), EMPTY)).toBe(true);
    expect(isBuildable(map, w(1, 1), new Set([cellIndex(w(2, 2))]))).toBe(true);
  });
  it("격자 밖·비정수 칸은 false", () => {
    for (const c of [w(-1, 0), w(0, -1), w(18, 0), w(0, 10), w(1.5, 1), w(1, Number.NaN)]) {
      expect(isBuildable(map, c, EMPTY)).toBe(false);
    }
  });
  it("행 끝 인덱스 오인 없음: (17,y)와 (0,y+1)은 다른 칸", () => {
    const m = compileStageMap({ stageId: "t", waypoints: [w(0, 2), w(5, 2)], reservedCells: [w(17, 4)] });
    expect(isBuildable(m, w(17, 4), EMPTY)).toBe(false);
    expect(isBuildable(m, w(0, 5), EMPTY)).toBe(true);
  });
});

describe("progressToPosition (맵: (0,2)→(5,2)→(5,6), 총길이 9000)", () => {
  const map = compileStageMap({ stageId: "t", waypoints: [w(0, 2), w(5, 2), w(5, 6)], reservedCells: [] });
  it("0 → 출발 칸 중심", () => {
    expect(progressToPosition(map, 0)).toEqual({ x: 500, y: 2500 });
  });
  it("구간 중간(500mt, 2500mt)", () => {
    expect(progressToPosition(map, 500)).toEqual({ x: 1000, y: 2500 });
    expect(progressToPosition(map, 2500)).toEqual({ x: 3000, y: 2500 });
  });
  it("꺾임 칸 정확히(5000mt → (5,2) 중심) — 이전·이후 진행도도 연속", () => {
    expect(progressToPosition(map, 4999)).toEqual({ x: 5499, y: 2500 });
    expect(progressToPosition(map, 5000)).toEqual({ x: 5500, y: 2500 });
    expect(progressToPosition(map, 5001)).toEqual({ x: 5500, y: 2501 });
  });
  it("두 번째 구간 중간", () => {
    expect(progressToPosition(map, 7000)).toEqual({ x: 5500, y: 4500 });
  });
  it("pathLengthMt → 기지 칸 중심", () => {
    expect(map.pathLengthMt).toBe(9000);
    expect(progressToPosition(map, 9000)).toEqual({ x: 5500, y: 6500 });
  });
  it("총길이 초과는 기지 칸 중심으로 고정한다", () => {
    expect(progressToPosition(map, 9001)).toEqual({ x: 5500, y: 6500 });
    expect(progressToPosition(map, 1_000_000)).toEqual({ x: 5500, y: 6500 });
  });
  it("음수는 RangeError, 비정수·NaN·비수치는 TypeError", () => {
    expect(() => progressToPosition(map, -1)).toThrow(RangeError);
    expect(() => progressToPosition(map, 0.5)).toThrow(TypeError);
    expect(() => progressToPosition(map, Number.NaN)).toThrow(TypeError);
    expect(() => progressToPosition(map, Number.POSITIVE_INFINITY)).toThrow(TypeError);
    expect(() => progressToPosition(map, "5" as unknown as number)).toThrow(TypeError);
  });
  it("왼쪽·위쪽으로 가는 구간도 정확 (Stage 1 실제 맵)", () => {
    const s1 = compileStageMap(STAGE_MAPS[0]);
    // (15,2)→(15,5) 3칸 후 (15,5)→(2,5): 진행도 15000+3000 = 18000 이 (15,5) 중심, 이후 왼쪽으로
    expect(progressToPosition(s1, 18000)).toEqual({ x: 15500, y: 5500 });
    expect(progressToPosition(s1, 18500)).toEqual({ x: 15000, y: 5500 });
    expect(progressToPosition(s1, 31000)).toEqual({ x: 2500, y: 5500 });
    // Stage 3 첫 위쪽 구간: (0,8)→(2,8) 2000, 이후 (2,8)→(2,1) 위로
    expect(progressToPosition(compileStageMap(STAGE_MAPS[2]), 2500)).toEqual({ x: 2500, y: 8000 });
  });
  it("실제 맵 3종: 0 → 출발, 총길이 → 기지", () => {
    const starts = [w(0, 2), w(0, 1), w(0, 8)];
    const bases = [w(17, 8), w(17, 8), w(17, 6)];
    STAGE_MAPS.forEach((raw, i) => {
      const m = compileStageMap(raw);
      expect(progressToPosition(m, 0)).toEqual({ x: starts[i].col * 1000 + 500, y: starts[i].row * 1000 + 500 });
      expect(progressToPosition(m, m.pathLengthMt)).toEqual({ x: bases[i].col * 1000 + 500, y: bases[i].row * 1000 + 500 });
    });
  });
});
