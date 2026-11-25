import { STR } from "./strings.ko";

/** 세로 방향·640×320 미만: 게임 대신 안내(UI-CONTRACT 3절). */
export function OrientationNotice({ problem }: { problem: "portrait" | "tooSmall" }) {
  return (
    <main className="flex h-dvh w-full flex-col items-center justify-center gap-3 bg-neutral-950 p-6 text-center text-neutral-100" role="alert">
      <div className="text-5xl" aria-hidden>
        ⟳
      </div>
      <h1 className="text-xl font-semibold">{problem === "portrait" ? STR.orientation.portrait : STR.orientation.tooSmall}</h1>
      <p className="max-w-xs text-sm text-neutral-400">{STR.orientation.detail}</p>
    </main>
  );
}
