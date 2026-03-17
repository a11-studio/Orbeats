import * as THREE from 'three';
import type { EntityState } from '@orbeats/shared';

const EDGE_MARGIN = 28; // px from viewport edge
const _vec = new THREE.Vector3();

/** Convert a 24-bit hex number (e.g. 0xff6b35) to a CSS rgb() string */
function hexToRgb(hex: number): string {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return `rgb(${r},${g},${b})`;
}

/**
 * Renders a small arrow on the viewport edge pointing toward the bounty target.
 * The element is pre-rendered in index.html to avoid GPU promotion jank.
 */
export class BountyArrow {
  private el: HTMLElement;
  private polygon: SVGPolygonElement;
  private targetId: string | null = null;
  private lastColor: number = -1;

  constructor() {
    this.el = document.getElementById('bounty-arrow')!;
    this.polygon = this.el.querySelector('polygon')!;
  }

  setTarget(id: string): void {
    this.targetId = id;
    this.lastColor = -1; // force color refresh on next frame
  }

  clearTarget(): void {
    this.targetId = null;
    this.el.style.display = 'none';
  }

  /**
   * Called every frame. Finds the target entity, projects it to screen space,
   * and positions the arrow at the viewport edge if the target is off-screen.
   */
  update(entities: EntityState[], camera: THREE.Camera): void {
    if (!this.targetId) {
      this.el.style.display = 'none';
      return;
    }

    // Use main blob only (parentId === null)
    const target = entities.find(
      (e) => e.id === this.targetId && e.parentId === null && e.alive,
    );
    if (!target) {
      this.el.style.display = 'none';
      return;
    }

    // Update color only when it changes to avoid unnecessary DOM writes
    if (target.color !== this.lastColor) {
      const css = hexToRgb(target.color);
      this.polygon.setAttribute('fill', css);
      this.el.style.filter = `drop-shadow(0 0 5px ${css})`;
      this.lastColor = target.color;
    }

    const W = window.innerWidth;
    const H = window.innerHeight;

    // Project world pos → NDC, then screen px
    _vec.set(target.x, 0, target.z);
    _vec.project(camera);

    // If behind camera, flip direction so arrow still points the right way
    const behindCamera = _vec.z > 1;
    const rawSX = (_vec.x * 0.5 + 0.5) * W;
    const rawSY = (-_vec.y * 0.5 + 0.5) * H;

    const cx = W / 2;
    const cy = H / 2;
    let dx = rawSX - cx;
    let dy = rawSY - cy;
    if (behindCamera) { dx = -dx; dy = -dy; }

    // Arrow rotation angle: atan2 from center → target (0 rad = pointing right)
    const angle = Math.atan2(dy, dx);

    // Check if target is on screen
    const onScreen =
      !behindCamera &&
      rawSX >= EDGE_MARGIN &&
      rawSX <= W - EDGE_MARGIN &&
      rawSY >= EDGE_MARGIN &&
      rawSY <= H - EDGE_MARGIN;

    if (onScreen) {
      this.el.style.display = 'none';
      return;
    }

    // Edge-clamp: find where the ray from center hits the viewport boundary
    const edgeW = cx - EDGE_MARGIN;
    const edgeH = cy - EDGE_MARGIN;
    const absX = Math.abs(dx) || 0.001;
    const absY = Math.abs(dy) || 0.001;

    let ex: number, ey: number;
    if (absX / edgeW > absY / edgeH) {
      ex = cx + Math.sign(dx) * edgeW;
      ey = cy + (dy / absX) * edgeW;
    } else {
      ex = cx + (dx / absY) * edgeH;
      ey = cy + Math.sign(dy) * edgeH;
    }

    this.el.style.display = 'block';
    this.el.style.left = `${ex}px`;
    this.el.style.top = `${ey}px`;
    this.el.style.transform = `translate(-50%, -50%) rotate(${angle}rad)`;
  }
}
