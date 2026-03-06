import * as THREE from 'three';

/**
 * Tracks mouse/touch position and converts to a world-space direction vector.
 * Also tracks spacebar for the split mechanic.
 */
export class InputManager {
  /** Normalized direction vector (x, z) */
  dirX: number = 0;
  dirZ: number = 0;

  /** True for one frame when spacebar is pressed */
  splitRequested: boolean = false;

  private mouseX: number = 0;
  private mouseY: number = 0;
  private active: boolean = false;

  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private mouseNDC = new THREE.Vector2();
  private intersection = new THREE.Vector3();

  constructor() {
    window.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      this.active = true;
    });

    window.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) {
        this.mouseX = e.touches[0].clientX;
        this.mouseY = e.touches[0].clientY;
        this.active = true;
      }
    }, { passive: true });

    window.addEventListener('touchstart', (e) => {
      if (e.touches.length > 0) {
        this.mouseX = e.touches[0].clientX;
        this.mouseY = e.touches[0].clientY;
        this.active = true;
      }
    }, { passive: true });

    // Spacebar → split
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        this.splitRequested = true;
      }
    });
  }

  /** Consume the split flag (resets after reading) */
  consumeSplit(): boolean {
    if (this.splitRequested) {
      this.splitRequested = false;
      return true;
    }
    return false;
  }

  /** Request split (e.g. from double-tap gesture). Same effect as spacebar. */
  requestSplit(): void {
    this.splitRequested = true;
  }

  /**
   * Update direction based on current mouse position, player position, and camera.
   */
  update(camera: THREE.Camera, playerX: number, playerZ: number): void {
    if (!this.active) return;

    // Convert mouse to NDC
    this.mouseNDC.x = (this.mouseX / window.innerWidth) * 2 - 1;
    this.mouseNDC.y = -(this.mouseY / window.innerHeight) * 2 + 1;

    // Raycast to ground plane
    this.raycaster.setFromCamera(this.mouseNDC, camera);
    const hit = this.raycaster.ray.intersectPlane(this.groundPlane, this.intersection);

    if (hit) {
      const dx = this.intersection.x - playerX;
      const dz = this.intersection.z - playerZ;
      const mag = Math.sqrt(dx * dx + dz * dz);

      if (mag > 0.5) {
        this.dirX = dx / mag;
        this.dirZ = dz / mag;
      } else {
        this.dirX = 0;
        this.dirZ = 0;
      }
    }
  }
}
