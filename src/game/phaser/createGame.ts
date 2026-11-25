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
    // 크기는 BattleCanvas 의 ResizeObserver 가 호스트 요소 실측값으로 scale.resize() 한다(재생성 금지).
    // Phaser 자체의 부모 추적(RESIZE)은 React 레이아웃보다 먼저 부모를 읽어 낡은 폭(HUD 폭 반영 전)이 남는 문제가 실측돼 쓰지 않는다.
    scale: { mode: Phaser.Scale.NONE },
    input: { touch: { capture: true } },
    disableContextMenu: true,
    scene: [createBattleScene(Phaser, session)],
  });
}
