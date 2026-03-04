import * as THREE from 'three';
import { massToRadius } from '@orbeats/shared';

const sphereGeo = new THREE.SphereGeometry(1, 32, 32);

/** Smoothing constant for position lerp (lower = smoother, less jitter). */
const POS_LERP_K = 6;
/** Smoothing constant for scale lerp. */
const SCALE_LERP_K = 8;

export class PlayerMesh {
  mesh: THREE.Mesh;
  private _initialized = false;

  constructor(color: number = 0xff3333) {
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.12,
      metalness: 0.35,
      emissive: new THREE.Color(color).multiplyScalar(0.08),
    });

    this.mesh = new THREE.Mesh(sphereGeo, material);
    this.mesh.castShadow = true;
  }

  update(x: number, z: number, mass: number, dt: number = 0): void {
    const r = massToRadius(mass);

    if (!this._initialized || dt === 0) {
      // First frame or dt not provided → hard snap
      this.mesh.position.set(x, r, z);
      this.mesh.scale.setScalar(r);
      this._initialized = true;
    } else {
      const posAlpha = 1 - Math.exp(-POS_LERP_K * dt);
      this.mesh.position.x += (x - this.mesh.position.x) * posAlpha;
      this.mesh.position.y += (r - this.mesh.position.y) * posAlpha;
      this.mesh.position.z += (z - this.mesh.position.z) * posAlpha;

      const scaleAlpha = 1 - Math.exp(-SCALE_LERP_K * dt);
      const curScale = this.mesh.scale.x;
      this.mesh.scale.setScalar(curScale + (r - curScale) * scaleAlpha);
    }
  }

  addToScene(scene: THREE.Scene): void {
    scene.add(this.mesh);
  }

  removeFromScene(scene: THREE.Scene): void {
    scene.remove(this.mesh);
  }
}
