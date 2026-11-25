import { GameApp } from "@/game/ui/GameApp";

// 화면 흐름(스테이지 선택 → 전투 → 결과)은 클라이언트 컴포넌트 GameApp 이 세션(src/game/session)을 구독해 그린다. UI-CONTRACT 4절.
export default function Home() {
  return <GameApp />;
}
