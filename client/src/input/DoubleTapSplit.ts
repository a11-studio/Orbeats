/**
 * Double-tap gesture to trigger split on mobile.
 * Thresholds: 250–320ms between taps (280ms), 20–30px proximity (25px).
 * Ignore if pointer moved > 10px between down/up (drag, ~8–12px range).
 */
const DOUBLE_TAP_MS = 280;
const TAP_PROXIMITY_PX = 25;
const DRAG_THRESHOLD_PX = 10;

interface LastTap {
  time: number;
  x: number;
  y: number;
}

export function setupDoubleTapSplit(
  canvas: HTMLCanvasElement,
  isActive: () => boolean,
  onSplit: () => void,
): void {
  let lastTap: LastTap | null = null;
  let downX = 0;
  let downY = 0;

  function dist(x1: number, y1: number, x2: number, y2: number): number {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  }

  function handlePointerDown(e: PointerEvent): void {
    if (!isActive()) return;
    downX = e.clientX;
    downY = e.clientY;
  }

  function handlePointerUp(e: PointerEvent): void {
    if (!isActive()) return;
    const target = e.target as Node;
    if (target && document.body.contains(target) && (target as Element).closest?.('[data-ui]')) {
      return;
    }
    const upX = e.clientX;
    const upY = e.clientY;
    const moved = dist(downX, downY, upX, upY);
    if (moved > DRAG_THRESHOLD_PX) return;

    const now = performance.now();
    if (lastTap) {
      const dt = now - lastTap.time;
      const proximity = dist(upX, upY, lastTap.x, lastTap.y);
      if (dt <= DOUBLE_TAP_MS && proximity <= TAP_PROXIMITY_PX) {
        onSplit();
        lastTap = null;
        return;
      }
    }
    lastTap = { time: now, x: upX, y: upY };
  }

  canvas.addEventListener('pointerdown', handlePointerDown, { passive: true });
  canvas.addEventListener('pointerup', handlePointerUp, { passive: true });
}
