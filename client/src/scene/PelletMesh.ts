import * as THREE from 'three';
import {
  PELLET_RADIUS,
  PELLET_COUNT,
  SPECIAL_PELLET_RADIUS,
} from '@orbeats/shared';
import type { PelletState } from '@orbeats/shared';

const MAX_PELLETS = PELLET_COUNT + 120;
const MAX_RARE_CANDIES = 20;
const sphereGeo = new THREE.SphereGeometry(1, 12, 12);

/** Diamond geometry for rare 100pt pellet */
const rareDiamondGeo = new THREE.OctahedronGeometry(1, 0);

/** Backward compat: treat legacy 'special' as special_10 */
function pelletType(p: PelletState): 'normal' | 'special_10' | 'rare_100' {
  const t = p.type as string | undefined;
  if (t === 'rare_100') return 'rare_100';
  if (t === 'special_10' || t === 'special') return 'special_10';
  return 'normal';
}

/**
 * Renders pellets using InstancedMesh per type.
 * - Normal: standard colors
 * - Special 10pt: vivid green, emissive glow, slightly larger
 * - Rare 100pt: diamond crystal, rotating, shiny
 */
export class PelletMeshManager {
  private normalMesh: THREE.InstancedMesh;
  private specialMesh: THREE.InstancedMesh;
  private rareCandyGroup: THREE.Group;
  private rareCandies: THREE.Mesh[] = [];
  private dummy: THREE.Object3D = new THREE.Object3D();
  private colorAttrs: {
    normal: THREE.InstancedBufferAttribute;
    special: THREE.InstancedBufferAttribute;
  };

  private lastRenderedVersion: number = -1;

  constructor(scene: THREE.Scene) {
    const normalMat = new THREE.MeshStandardMaterial({
      metalness: 0.1,
      roughness: 0.45,
      emissive: 0x222222,
      emissiveIntensity: 0.15,
    });
    const specialMat = new THREE.MeshStandardMaterial({
      metalness: 0.1,
      roughness: 0.5,
      emissive: 0x008687,
      emissiveIntensity: 0.4,
    });

    const rareDiamondMat = new THREE.MeshStandardMaterial({
      color: 0xff2bd6,
      emissive: 0xff2bd6,
      emissiveIntensity: 1.2,
      metalness: 0.4,
      roughness: 0.2,
    });

    this.normalMesh = new THREE.InstancedMesh(sphereGeo, normalMat, MAX_PELLETS);
    this.specialMesh = new THREE.InstancedMesh(sphereGeo, specialMat, MAX_PELLETS);

    for (const m of [this.normalMesh, this.specialMesh]) {
      m.castShadow = false;
      m.receiveShadow = false;
      m.count = 0;
      m.frustumCulled = false;
      scene.add(m);
    }

    this.colorAttrs = {
      normal: new THREE.InstancedBufferAttribute(new Float32Array(MAX_PELLETS * 3), 3),
      special: new THREE.InstancedBufferAttribute(new Float32Array(MAX_PELLETS * 3), 3),
    };
    this.normalMesh.instanceColor = this.colorAttrs.normal;
    this.specialMesh.instanceColor = this.colorAttrs.special;

    this.rareCandyGroup = new THREE.Group();
    this.rareCandyGroup.frustumCulled = false;
    scene.add(this.rareCandyGroup);

    for (let i = 0; i < MAX_RARE_CANDIES; i++) {
      const mesh = new THREE.Mesh(rareDiamondGeo, rareDiamondMat);
      mesh.visible = false;
      this.rareCandyGroup.add(mesh);
      this.rareCandies.push(mesh);
    }
  }

  update(pellets: PelletState[], storeVersion: number): void {
    const now = performance.now() / 1000;

    const normal: PelletState[] = [];
    const special: PelletState[] = [];
    const rare: PelletState[] = [];
    for (const p of pellets) {
      const t = pelletType(p);
      if (t === 'rare_100') rare.push(p);
      else if (t === 'special_10') special.push(p);
      else normal.push(p);
    }

    const color = new THREE.Color();

    this.normalMesh.count = Math.min(normal.length, MAX_PELLETS);
    for (let i = 0; i < this.normalMesh.count; i++) {
      const p = normal[i];
      const r = PELLET_RADIUS;
      this.dummy.position.set(p.x, r, p.z);
      this.dummy.scale.setScalar(r);
      this.dummy.updateMatrix();
      this.normalMesh.setMatrixAt(i, this.dummy.matrix);
      color.setHex(p.color);
      this.colorAttrs.normal.setXYZ(i, color.r, color.g, color.b);
    }

    this.specialMesh.count = Math.min(special.length, MAX_PELLETS);
    for (let i = 0; i < this.specialMesh.count; i++) {
      const p = special[i];
      const r = SPECIAL_PELLET_RADIUS;
      this.dummy.position.set(p.x, r, p.z);
      this.dummy.scale.setScalar(r);
      this.dummy.updateMatrix();
      this.specialMesh.setMatrixAt(i, this.dummy.matrix);
      color.setHex(p.color);
      this.colorAttrs.special.setXYZ(i, color.r, color.g, color.b);
    }

    const baseSize = PELLET_RADIUS * 9;
    const pulse = 1 + Math.sin(now * 4) * 0.15;
    const diamondScale = baseSize * pulse;
    for (let i = 0; i < this.rareCandies.length; i++) {
      const mesh = this.rareCandies[i];
      if (i < rare.length) {
        const p = rare[i];
        mesh.visible = true;
        mesh.position.set(p.x, diamondScale, p.z);
        mesh.scale.setScalar(diamondScale);
        mesh.rotation.y += 0.02;
        mesh.rotation.x += 0.01;
      } else {
        mesh.visible = false;
      }
    }

    if (storeVersion !== this.lastRenderedVersion) {
      this.lastRenderedVersion = storeVersion;
    }

    this.normalMesh.instanceMatrix.needsUpdate = true;
    this.colorAttrs.normal.needsUpdate = true;
    this.specialMesh.instanceMatrix.needsUpdate = true;
    this.colorAttrs.special.needsUpdate = true;
  }
}
