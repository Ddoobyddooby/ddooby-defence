// Phaser 렌더 어댑터. 브라우저에서만 호출된다 (BattleCanvas 의 useEffect 에서 동적 import).
// 게임 규칙·상태의 진실 원천은 src/game/core 이며, 이 계층은 그리기와 입력 전달만 맡는다.
import type { GameSession } from "../session/session";
import { createBattleScene } from "./scene";

export async function createGame(parent: HTMLElement, session: GameSession) {
  const Phaser = await import("phaser");
  const width = Math.max(1, parent.clientWidth);
  const height = Math.max(1, parent.clientHeight);
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width,
    height,
    backgroundColor: "#101820",
    // 부모 크기를 따라가는 RESIZE: 창 크기·회전이 바뀌면 같은 인스턴스가 다시 배치한다(재생성 금지).
    scale: { mode: Phaser.Scale.RESIZE },
    input: { touch: { capture: true } },
    disableContextMenu: true,
    scene: [createBattleScene(Phaser, session)],
  });
}
