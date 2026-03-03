import * as THREE from 'three';
import { massToRadius } from '@orbeats/shared';
import { createAngryFaceTexture } from '../utils/FaceTexture.js';

const sphereGeo = new THREE.SphereGeometry(1, 32, 32);
let faceTexture: THREE.CanvasTexture | null = null;

function getFaceTexture(): THREE.CanvasTexture {
  if (!faceTexture) {
    faceTexture = createAngryFaceTexture();
  }
  return faceTexture;
}

/** Smoothing constant for position lerp (higher = snappier). */
const POS_LERP_K = 10;
/** Smoothing constant for scale lerp (slightly softer). */
const SCALE_LERP_K = 8;

export class EnemyMesh {
  group: THREE.Group;
  sphere: THREE.Mesh;
  faceSprite: THREE.Sprite;

  /** First update snaps directly; subsequent updates lerp. */
  private _initialized = false;

  constructor(color: number) {
    this.group = new THREE.Group();

    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.12,
      metalness: 0.35,
      emissive: new THREE.Color(color).multiplyScalar(0.08),
    });

    this.sphere = new THREE.Mesh(sphereGeo, material);
    this.sphere.castShadow = true;
    this.group.add(this.sphere);

    // Face sprite - always faces camera
    const spriteMat = new THREE.SpriteMaterial({
      map: getFaceTexture(),
      transparent: true,
      depthTest: false,
    });
    this.faceSprite = new THREE.Sprite(spriteMat);
    this.faceSprite.scale.set(1.2, 1.2, 1);
    this.group.add(this.faceSprite);
  }

  /**
   * Smooth visual update. On the first call the mesh snaps to the target;
   * on subsequent calls it exponentially lerps toward the target position
   * and scale, eliminating frame-to-frame jitter.
   */
  update(x: number, z: number, mass: number, dt: number): void {
    const r = massToRadius(mass);

    if (!this._initialized) {
      this.group.position.set(x, r, z);
      this.sphere.scale.setScalar(r);
      this._initialized = true;
    } else {
      const posAlpha = 1 - Math.exp(-POS_LERP_K * dt);
      this.group.position.x += (x - this.group.position.x) * posAlpha;
      this.group.position.y += (r - this.group.position.y) * posAlpha;
      this.group.position.z += (z - this.group.position.z) * posAlpha;

      const scaleAlpha = 1 - Math.exp(-SCALE_LERP_K * dt);
      const curScale = this.sphere.scale.x;
      const newScale = curScale + (r - curScale) * scaleAlpha;
      this.sphere.scale.setScalar(newScale);
    }

    // Face sprite tracks the visual scale
    const s = this.sphere.scale.x;
    this.faceSprite.position.set(0, 0, s * 0.05);
    this.faceSprite.scale.setScalar(s * 1.3);
  }

  setColor(color: number): void {
    const mat = this.sphere.material as THREE.MeshStandardMaterial;
    mat.color.setHex(color);
    mat.emissive.setHex(color);
    mat.emissive.multiplyScalar(0.08);
  }

  addToScene(scene: THREE.Scene): void {
    scene.add(this.group);
  }

  removeFromScene(scene: THREE.Scene): void {
    scene.remove(this.group);
  }
}
