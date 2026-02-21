import * as THREE from 'three';
import {
  PELLET_RADIUS,
  PELLET_COUNT,
  SPECIAL_PELLET_RADIUS,
  RARE_CANDY_RADIUS,
} from '@agar3d/shared';
import type { PelletState } from '@agar3d/shared';

const MAX_PELLETS = PELLET_COUNT + 120;
const MAX_RARE_CANDIES = 20;
const sphereGeo = new THREE.SphereGeometry(1, 12, 12);

/** Shared geometries for salónka candy (core oval + wrapper cones + stripe) */
const rareCoreGeo = new THREE.SphereGeometry(1, 10, 10);
const rareConeGeo = new THREE.ConeGeometry(0.35, 0.5, 6);
const rareStripeGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.12, 8);

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
 * - Special 10pt: electric cyan, emissive glow, slightly larger
 * - Rare 100pt: hot pink, larger, pulsate animation
 */
export class PelletMeshManager {
  private normalMesh: THREE.InstancedMesh;
  private specialMesh: THREE.InstancedMesh;
  private rareCandyGroup: THREE.Group;
  private rareCandies: THREE.Group[] = [];
  private dummy: THREE.Object3D = new THREE.Object3D();
  private colorAttrs: {
    normal: THREE.InstancedBufferAttribute;
    special: THREE.InstancedBufferAttribute;
  };

  private lastRenderedVersion: number = -1;

  constructor(scene: THREE.Scene) {
    const normalMat = new THREE.MeshStandardMaterial({
      metalness: 0.1,
      roughness: 0.6,
      emissive: 0x111111,
    });
    const specialMat = new THREE.MeshStandardMaterial({
      metalness: 0.1,
      roughness: 0.5,
      emissive: 0x00f0ff,
      emissiveIntensity: 0.4,
    });

    const coreMat = new THREE.MeshStandardMaterial({
      metalness: 0.2,
      roughness: 0.35,
      color: 0xff2bd6,
      emissive: 0xff2bd6,
      emissiveIntensity: 0.35,
    });
    const wrapperMat = new THREE.MeshStandardMaterial({
      metalness: 0.25,
      roughness: 0.3,
      color: 0x00f0ff,
      emissive: 0x00f0ff,
      emissiveIntensity: 0.4,
    });
    const stripeMat = new THREE.MeshStandardMaterial({
      metalness: 0.1,
      roughness: 0.5,
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 0.2,
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
      const group = new THREE.Group();
      const core = new THREE.Mesh(rareCoreGeo, coreMat);
      core.scale.set(1.2, 1, 1);
      group.add(core);
      const stripe = new THREE.Mesh(rareStripeGeo, stripeMat);
      stripe.rotation.x = Math.PI / 2;
      group.add(stripe);
      const leftCone = new THREE.Mesh(rareConeGeo, wrapperMat);
      leftCone.position.set(-0.5, 0, 0);
      leftCone.rotation.z = Math.PI / 2;
      group.add(leftCone);
      const rightCone = new THREE.Mesh(rareConeGeo, wrapperMat);
      rightCone.position.set(0.5, 0, 0);
      rightCone.rotation.z = -Math.PI / 2;
      group.add(rightCone);
      group.visible = false;
      this.rareCandyGroup.add(group);
      this.rareCandies.push(group);
    }
  }

  update(pellets: PelletState[], storeVersion: number): void {
    const now = performance.now() / 1000;
    const pulsate = 1.075 + 0.075 * Math.sin(now * 2.5);

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

    const baseR = RARE_CANDY_RADIUS;
    const s = baseR * pulsate;
    for (let i = 0; i < this.rareCandies.length; i++) {
      const group = this.rareCandies[i];
      if (i < rare.length) {
        const p = rare[i];
        group.visible = true;
        group.position.set(p.x, baseR, p.z);
        group.scale.setScalar(s);
        group.rotation.y = now * 0.3;
      } else {
        group.visible = false;
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
