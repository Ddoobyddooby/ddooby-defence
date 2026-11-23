// Phaser 렌더 어댑터. 브라우저에서만 호출된다 (GameCanvas의 useEffect에서 동적 import).
// 게임 규칙·상태의 진실 원천은 src/game/core이며, 이 계층은 그리기와 입력 전달만 맡는다.
import { GRID_COLS, GRID_ROWS } from "@/game/core/grid";

// 표시용 임시 타일 픽셀 크기. 실제 렌더 해상도는 TBD-UI.
const TILE_PX = 48;

export async function createGame(parent: HTMLElement) {
  const Phaser = await import("phaser");

  class GridPreviewScene extends Phaser.Scene {
    constructor() {
      super("grid-preview");
    }

    create() {
      const g = this.add.graphics();
      g.lineStyle(1, 0xffffff, 0.15);
      for (let c = 0; c <= GRID_COLS; c++) {
        g.lineBetween(c * TILE_PX, 0, c * TILE_PX, GRID_ROWS * TILE_PX);
      }
      for (let r = 0; r <= GRID_ROWS; r++) {
        g.lineBetween(0, r * TILE_PX, GRID_COLS * TILE_PX, r * TILE_PX);
      }
    }
  }

  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: GRID_COLS * TILE_PX,
    height: GRID_ROWS * TILE_PX,
    backgroundColor: "#1f2a1f",
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [GridPreviewScene],
  });
}
