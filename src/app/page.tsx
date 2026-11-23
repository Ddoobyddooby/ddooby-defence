import { GameCanvas } from "@/game/phaser/GameCanvas";

// 스캐폴딩 확인용 화면: 왼쪽 맵(Phaser) + 오른쪽 HUD(React) 분리 구조만 보여준다.
// 실제 HUD 구성·치수는 SPEC 9절과 TBD-UI를 따른다.
export default function Home() {
  return (
    <main className="flex h-screen w-full bg-neutral-950 text-neutral-100">
      <section className="flex-1 min-w-0">
        <GameCanvas />
      </section>
      <aside className="w-64 shrink-0 border-l border-neutral-800 p-4">
        <h1 className="text-lg font-semibold">Ddooby Defence</h1>
        <p className="mt-2 text-sm text-neutral-400">HUD 자리 (TECH-01 스캐폴딩)</p>
      </aside>
    </main>
  );
}
