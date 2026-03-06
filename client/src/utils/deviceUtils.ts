/**
 * Mobile detection for responsive UI and touch gestures.
 * Uses pointer: coarse (touch devices) OR viewport width <= 768px.
 * Re-evaluates on resize; use getter for current value.
 */
export function isMobile(): boolean {
  return (
    window.matchMedia('(pointer: coarse)').matches ||
    window.innerWidth <= 768
  );
}
