// ART-03 — 이미지 풀. 프레임마다 begin() → put()… → end() 로, 쓴 만큼만 보이고 나머지는 숨긴다(객체 재사용, 생성·파괴 없음).
// 텍스처가 없으면 put() 은 false 를 돌려주고 호출자가 단순 도형으로 대체한다.
import type * as PhaserNS from "phaser";
import type { EnemyType } from "../core/content/types";
import { ENEMY_ART_METRICS } from "./assets";

export interface PutOptions {
  /** 그림이 놓일 점(px). */
  readonly x: number;
  readonly y: number;
  /** 화면에 그릴 가로·세로 크기(px, 정사각 원본 기준 한 변). */
  readonly size: number;
  /** 그림 안의 기준점(0~1). 기본 (0.5, 0.5). 타워·적은 y 0.85(발/몸체 바닥). */
  readonly originX?: number;
  readonly originY?: number;
  readonly rotation?: number;
  readonly flipX?: boolean;
  readonly alpha?: number;
  /** 같은 풀 안 앞뒤 순서(0~1 미만, 화면 아래쪽일수록 크게). */
  readonly sort?: number;
  /** 세로 배율(눌림 등). */
  readonly scaleYMul?: number;
}

export class ImagePool {
  private readonly items: PhaserNS.GameObjects.Image[] = [];
  private used = 0;
  constructor(
    private readonly scene: PhaserNS.Scene,
    private readonly depth: number,
  ) {}

  begin(): void {
    this.used = 0;
  }

  put(key: string, o: PutOptions): boolean {
    if (!this.scene.textures.exists(key)) return false;
    let img = this.items[this.used];
    if (img === undefined) {
      img = this.scene.add.image(0, 0, key).setDepth(this.depth);
      this.items.push(img);
    }
    this.used += 1;
    img.setTexture(key);
    const w = img.width > 0 ? img.width : 128;
    const s = o.size / w;
    img.setOrigin(o.originX ?? 0.5, o.originY ?? 0.5).setPosition(o.x, o.y).setRotation(o.rotation ?? 0).setFlipX(o.flipX ?? false).setAlpha(o.alpha ?? 1);
    img.setScale(s, s * (o.scaleYMul ?? 1)).setDepth(this.depth + (o.sort ?? 0));
    img.setVisible(true);
    return true;
  }

  end(): void {
    for (let i = this.used; i < this.items.length; i++) this.items[i].setVisible(false);
  }
}

/**
 * 그림 있는 적의 체력 바 배치. 바는 종류별 머리 꼭대기 바로 위에 붙고(오크는 크고 고블린은 작아 높이가 다르다),
 * 폭은 몸 폭에 맞춘다(칸의 0.45~0.9 배). feetY = 발 y, size = 그림 한 변(px), 기준점 y 는 발이 그림 높이의 0.85 인 것을 전제.
 */
export function enemyBarLayout(type: EnemyType, feetY: number, size: number, tile: number): { readonly barTop: number; readonly barW: number } {
  const m = ENEMY_ART_METRICS[type];
  const barW = Math.min(tile * 0.9, Math.max(10, tile * 0.45, size * m.bodyW * 0.8));
  const h = Math.max(2, barW * 0.12);
  const headTopY = feetY - size * 0.85 + size * m.headTop;
  return { barTop: headTopY - h - Math.max(1.5, tile * 0.04), barW };
}
