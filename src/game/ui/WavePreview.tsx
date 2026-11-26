"use client";

import { useState } from "react";
import { ENEMY_COLORS, TRAIT_COLORS } from "../phaser/palette";
import { assetUrl, enemyKey, TRAIT_SPRITE } from "../phaser/assets";
import type { WaveGroup } from "../session/wavePreview";
import { ENEMY_NAMES, STR, TRAIT_NAMES } from "./strings.ko";

const hex = (n: number): string => `#${n.toString(16).padStart(6, "0")}`;
// 그림 파일이 없는 이름은 한 번 실패하면 다시 요청하지 않는다(대체 도형으로 계속 표시).
const missing = new Set<string>();

/** 스프라이트가 있으면 그림, 없거나 로드 실패면 대체 요소. */
function Sprite({ name, alt, fallback }: { name: string; alt: string; fallback: React.ReactNode }) {
  const [failed, setFailed] = useState(() => missing.has(name));
  if (failed) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={assetUrl(name)}
      alt={alt}
      className="size-4 shrink-0 object-contain"
      onError={() => {
        missing.add(name);
        setFailed(true);
      }}
    />
  );
}

/** 맵 위쪽 가운데 반투명 띠(UI-CONTRACT 7.1). 준비 단계에서만(groups !== null). 터치를 막지 않는다. */
export function WavePreview({ groups }: { groups: readonly WaveGroup[] | null }) {
  if (groups === null || groups.length === 0) return null;
  return (
    <div
      className="pointer-events-none absolute left-1/2 top-1 z-[4] flex max-w-[calc(100%-1rem)] -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded bg-black/55 px-2 py-0.5 text-xs text-neutral-100"
      data-testid="wave-preview"
    >
      <span className="font-semibold text-neutral-300">{STR.hud.nextWave}</span>
      {groups.map((g) => (
        <span key={`${g.enemyType}-${g.trait ?? "none"}`} className="flex items-center gap-0.5" data-testid="wave-preview-group" aria-label={`${ENEMY_NAMES[g.enemyType]}${g.trait === null ? "" : ` ${TRAIT_NAMES[g.trait]}`} ${g.count}`}>
          <Sprite name={enemyKey(g.enemyType)} alt={ENEMY_NAMES[g.enemyType]} fallback={<span className="inline-block size-3.5 shrink-0 rounded-full border border-black/60" style={{ backgroundColor: hex(ENEMY_COLORS[g.enemyType]) }} />} />
          <span className="font-semibold tabular-nums">×{g.count}</span>
          {g.trait !== null && (
            <Sprite
              name={TRAIT_SPRITE[g.trait]}
              alt={TRAIT_NAMES[g.trait]}
              fallback={
                <span className="rounded-sm px-0.5 text-[10px] font-bold leading-tight text-black" style={{ backgroundColor: hex(TRAIT_COLORS[g.trait]) }}>
                  {TRAIT_NAMES[g.trait]}
                </span>
              }
            />
          )}
        </span>
      ))}
    </div>
  );
}
