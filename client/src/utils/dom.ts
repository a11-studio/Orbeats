/**
 * Typed DOM element getter. Throws a clear error in dev if the element is missing
 * rather than silently returning null and crashing later.
 */
export function getEl<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`[DOM] Element #${id} not found`);
  return el as T;
}
