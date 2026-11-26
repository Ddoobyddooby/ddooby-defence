// ART-03 — 길 타일 자동 배치(순수 함수). 맵의 경로 칸마다 어떤 그림을 어느 방향으로 깔지 계산한다. 난수 없음(결정적).
// 규격 기준 방향(docs/ART-SPEC.md 3.1): straight = 왼쪽→오른쪽(가로), corner = 왼쪽에서 들어와 아래로 나감. 회전은 시계 방향.
import type { Cell } from "../core/grid";
import type { CompiledStageMap } from "../core/map/stageMap";

export type PathTileBase = "straight" | "corner";
export type PathTileKind = PathTileBase | "spawn" | "gate";
export type Rotation = 0 | 90 | 180 | 270;
type Dir = "N" | "E" | "S" | "W";

export interface PathTile {
  readonly col: number;
  readonly row: number;
  /** 첫 칸 = spawn, 마지막 칸 = gate(투명 그림이라 아래에 base 길 타일을 함께 깐다), 나머지 = straight|corner. */
  readonly kind: PathTileKind;
  /** 아래에 까는 길 그림(직선·모퉁이). 모든 경로 칸에 있다. */
  readonly base: PathTileBase;
  /** base 그림의 시계 방향 회전. */
  readonly rotation: Rotation;
}

const OPP: Readonly<Record<Dir, Dir>> = { N: "S", S: "N", E: "W", W: "E" };
const CW: Readonly<Record<Dir, Dir>> = { N: "E", E: "S", S: "W", W: "N" };

function dirTo(a: Cell, b: Cell): Dir {
  if (b.col > a.col) return "E";
  if (b.col < a.col) return "W";
  return b.row > a.row ? "S" : "N";
}

const key = (a: Dir, b: Dir): string => [a, b].sort().join("");

/** corner 기준(W,S)을 시계 방향으로 돌린 연결 쌍 → 회전각. */
const CORNER_ROT: Readonly<Record<string, Rotation>> = (() => {
  const out: Record<string, Rotation> = {};
  let pair: [Dir, Dir] = ["W", "S"];
  for (const r of [0, 90, 180, 270] as const) {
    out[key(pair[0], pair[1])] = r;
    pair = [CW[pair[0]], CW[pair[1]]];
  }
  return out;
})();

/** 경로 칸마다 길 타일(종류·회전). 끝 칸처럼 이웃이 하나뿐이면 반대 방향으로 이어진다고 보고 직선으로 놓는다. */
export function computePathTiles(map: CompiledStageMap): PathTile[] {
  const cells = map.pathCells;
  const last = cells.length - 1;
  return cells.map((c, i) => {
    const conn: Dir[] = [];
    if (i > 0) conn.push(dirTo(c, cells[i - 1]));
    if (i < last) conn.push(dirTo(c, cells[i + 1]));
    if (conn.length === 1) conn.push(OPP[conn[0]]);
    const [a, b] = conn;
    let base: PathTileBase;
    let rotation: Rotation;
    if (a === OPP[b]) {
      base = "straight";
      rotation = a === "E" || a === "W" ? 0 : 90;
    } else {
      base = "corner";
      rotation = CORNER_ROT[key(a, b)];
    }
    const kind: PathTileKind = i === 0 ? "spawn" : i === last ? "gate" : base;
    return { col: c.col, row: c.row, kind, base, rotation };
  });
}

/** 바닥 변형 1~3: 칸 좌표로만 정한다(같은 칸은 항상 같은 변형). */
export function groundVariant(col: number, row: number): 1 | 2 | 3 {
  return (((col * 7 + row * 13 + col * row * 3) % 3) + 1) as 1 | 2 | 3;
}
