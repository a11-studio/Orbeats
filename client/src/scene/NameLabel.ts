import * as THREE from 'three';

/**
 * Manages HTML overlay name tags positioned via world-to-screen projection.
 * Labels have a constant pixel size regardless of blob scale or camera distance.
 */
export class NameTagManager {
  private container: HTMLElement;
  private tags = new Map<string, { el: HTMLElement; name: string }>();
  private camera: THREE.Camera;
  private activeThisFrame = new Set<string>();
  private readonly _vec = new THREE.Vector3();

  constructor(camera: THREE.Camera) {
    this.camera = camera;

    this.container = document.createElement('div');
    this.container.id = 'nametag-container';
    this.container.style.cssText =
      'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:hidden;z-index:5;';
    document.body.appendChild(this.container);
  }

  /**
   * Update (or create) a name tag for the given entity.
   * Call once per visible entity per frame.
   * worldX/Y/Z is the anchor point in world space (just above the sphere top).
   */
  update(id: string, name: string, worldX: number, worldY: number, worldZ: number): void {
    this.activeThisFrame.add(id);

    let entry = this.tags.get(id);
    if (!entry) {
      const el = document.createElement('div');
      el.className = 'nameTag';
      el.textContent = name;
      this.container.appendChild(el);
      entry = { el, name };
      this.tags.set(id, entry);
    } else if (entry.name !== name) {
      entry.el.textContent = name;
      entry.name = name;
    }

    // Project world position to NDC
    this._vec.set(worldX, worldY, worldZ);
    this._vec.project(this.camera);

    // Behind camera → hide
    if (this._vec.z > 1) {
      entry.el.style.display = 'none';
      return;
    }

    const screenX = (this._vec.x * 0.5 + 0.5) * window.innerWidth;
    const screenY = (-this._vec.y * 0.5 + 0.5) * window.innerHeight;

    // Off-screen (with margin) → hide
    if (
      screenX < -120 ||
      screenX > window.innerWidth + 120 ||
      screenY < -60 ||
      screenY > window.innerHeight + 60
    ) {
      entry.el.style.display = 'none';
      return;
    }

    entry.el.style.display = '';
    entry.el.style.left = `${screenX}px`;
    entry.el.style.top = `${screenY}px`;
  }

  /**
   * Call once at the end of each frame to remove tags
   * for entities that were not updated this frame.
   */
  endFrame(): void {
    for (const [id, entry] of this.tags) {
      if (!this.activeThisFrame.has(id)) {
        entry.el.remove();
        this.tags.delete(id);
      }
    }
    this.activeThisFrame.clear();
  }

  /** Remove all tags (e.g. on new game reset). */
  clear(): void {
    for (const entry of this.tags.values()) {
      entry.el.remove();
    }
    this.tags.clear();
    this.activeThisFrame.clear();
  }
}
