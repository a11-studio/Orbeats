/**
 * Self-contained merge-animation system.
 *
 * When a split cell or enemy disappears from the server snapshot, it should
 * visually shrink toward its parent entity rather than popping out instantly.
 *
 * When a blob is eaten (no parent), it bursts outward with fragment pieces.
 *
 * Previously ~80 lines were inlined inside the main game loop.
 * This class owns all the state (entityParentIds, anims[]) and exposes
 * four methods that the game loop calls at the appropriate points.
 */

import * as THREE from 'three';
import type { EntityState } from '@orbeats/shared';
import type { EnemyMesh } from './EnemyMesh.js';
import type { PlayerMesh } from './PlayerMesh.js';

interface MergeAnim {
  type: 'player' | 'enemy';
  object: THREE.Object3D;
  startX: number;
  startZ: number;
  startScale: number;
  parentId: string;
  startTime: number;
}

/** Fragment burst when blob is eaten — temporary meshes explode outward. */
interface BurstAnim {
  container: THREE.Group;
  fragments: { mesh: THREE.Mesh; dir: THREE.Vector3 }[];
  spreadRadius: number;
  fragmentSize: number;
  startTime: number;
}

const MERGE_ANIM_DURATION = 300; // ms
const BURST_DURATION = 280; // ms — punchy, readable
const BURST_FRAGMENT_COUNT = 14;
const BURST_FRAGMENT_SIZE_RATIO = 0.26; // fragment radius = 26% of blob radius
const BURST_SPREAD_RATIO = 2.6; // fragments reach 2.6× blob radius

const fragmentGeo = new THREE.SphereGeometry(1, 12, 8);

function createBurstFragment(color: number, size: number): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.12,
    metalness: 0.35,
    emissive: new THREE.Color(color).multiplyScalar(0.08),
    transparent: true,
    depthWrite: false,
    opacity: 1,
  });
  const mesh = new THREE.Mesh(fragmentGeo, mat);
  mesh.scale.setScalar(size);
  return mesh;
}

/** Pick evenly distributed outward directions for burst. */
function burstDirections(count: number): THREE.Vector3[] {
  const dirs: THREE.Vector3[] = [];
  const goldenRatio = (1 + Math.sqrt(5)) / 2;
  const angleIncrement = Math.PI * 2 * goldenRatio;
  for (let i = 0; i < count; i++) {
    const t = i / count;
    const inclination = Math.acos(1 - 2 * (t + 0.5) / count);
    const azimuth = angleIncrement * i;
    const x = Math.sin(inclination) * Math.cos(azimuth);
    const y = Math.cos(inclination);
    const z = Math.sin(inclination) * Math.sin(azimuth);
    dirs.push(new THREE.Vector3(x, y, z).normalize());
  }
  return dirs;
}

export class MergeAnimManager {
  private anims: MergeAnim[] = [];
  private burstAnims: BurstAnim[] = [];

  /**
   * Last-known parentId for each rendered entity — used to detect merges
   * when the entity disappears from the next snapshot.
   */
  readonly entityParentIds = new Map<string, string | null>();

  /** Call for each alive entity during the entity-render loop. */
  trackEntity(id: string, parentId: string | null): void {
    this.entityParentIds.set(id, parentId);
  }

  /**
   * Start a fragment burst at the given center. Used for eaten blobs (enemy + player).
   * Original blob must already be hidden/removed by caller.
   */
  startBurst(
    scene: THREE.Scene,
    centerX: number,
    centerY: number,
    centerZ: number,
    blobRadius: number,
    color: number,
  ): void {
    const container = new THREE.Group();
    container.position.set(centerX, centerY, centerZ);

    const fragmentSize = blobRadius * BURST_FRAGMENT_SIZE_RATIO;
    const spreadRadius = blobRadius * BURST_SPREAD_RATIO;
    const dirs = burstDirections(BURST_FRAGMENT_COUNT);

    const fragments: { mesh: THREE.Mesh; dir: THREE.Vector3 }[] = [];
    for (const dir of dirs) {
      const mesh = createBurstFragment(color, fragmentSize);
      mesh.position.set(0, 0, 0);
      container.add(mesh);
      fragments.push({ mesh, dir });
    }

    scene.add(container);
    this.burstAnims.push({
      container,
      fragments,
      spreadRadius,
      fragmentSize,
      startTime: performance.now(),
    });
  }

  /**
   * Called after the enemy-render loop.  For any enemy no longer in
   * `activeIds`, either starts a merge animation (if it was a split cell)
   * or removes it from the scene immediately.
   * Mutates `enemyMeshes` (deletes cleaned-up entries).
   */
  pruneEnemies(
    activeIds: Set<string>,
    enemyMeshes: Map<string, EnemyMesh>,
    scene: THREE.Scene,
    now: number,
  ): void {
    for (const [id, enemy] of enemyMeshes) {
      if (activeIds.has(id)) continue;

      const r = enemy.sphere.scale.x;
      const color = (enemy.sphere.material as THREE.MeshStandardMaterial).color.getHex();
      const cx = enemy.group.position.x;
      const cy = enemy.group.position.y;
      const cz = enemy.group.position.z;
      enemy.removeFromScene(scene);
      this.startBurst(scene, cx, cy, cz, r, color);

      enemyMeshes.delete(id);
      this.entityParentIds.delete(id);
    }
  }

  /**
   * Called after the split-cell render loop.  For any split cell no longer
   * in `activeIds`, starts a merge animation toward its parent (or playerId).
   * Mutates `splitMeshes` (deletes cleaned-up entries).
   */
  pruneSplitCells(
    activeIds: Set<string>,
    splitMeshes: Map<string, PlayerMesh>,
    playerId: string,
    now: number,
  ): void {
    for (const [id, mesh] of splitMeshes) {
      if (activeIds.has(id)) continue;

      const parentId = this.entityParentIds.get(id) ?? playerId;
      this.anims.push({
        type: 'player',
        object: mesh.mesh,
        startX: mesh.mesh.position.x,
        startZ: mesh.mesh.position.z,
        startScale: mesh.mesh.scale.x,
        parentId,
        startTime: now,
      });
      splitMeshes.delete(id);
      this.entityParentIds.delete(id);
    }
  }

  /**
   * Per-frame update — advances all active merge and burst animations.
   * Removes completed animations from the scene.
   */
  update(
    playerId: string,
    renderX: number,
    renderZ: number,
    entities: EntityState[],
    scene: THREE.Scene,
    now: number,
  ): void {
    for (let i = this.burstAnims.length - 1; i >= 0; i--) {
      const b = this.burstAnims[i];
      const elapsed = now - b.startTime;
      const t = Math.min(elapsed / BURST_DURATION, 1);
      const easeOut = 1 - (1 - t) * (1 - t);
      const dist = easeOut * b.spreadRadius;
      const opacity = Math.max(0, 1 - t);
      const scale = 1 - t * 0.5;

      for (const { mesh, dir } of b.fragments) {
        mesh.position.copy(dir).multiplyScalar(dist);
        mesh.scale.setScalar(b.fragmentSize * scale);
        (mesh.material as THREE.MeshStandardMaterial).opacity = opacity;
      }

      if (t >= 1) {
        scene.remove(b.container);
        this.burstAnims.splice(i, 1);
      }
    }

    for (let i = this.anims.length - 1; i >= 0; i--) {
      const anim = this.anims[i];
      const elapsed = now - anim.startTime;
      const t = Math.min(elapsed / MERGE_ANIM_DURATION, 1);
      // Ease-in: smooth acceleration toward parent
      const ease = t * t;

      // Resolve parent entity's current visual position
      let targetX = anim.startX;
      let targetZ = anim.startZ;
      if (anim.parentId === playerId) {
        targetX = renderX;
        targetZ = renderZ;
      } else {
        const parentEntity = entities.find((e) => e.id === anim.parentId);
        if (parentEntity) {
          targetX = parentEntity.x;
          targetZ = parentEntity.z;
        }
      }

      // Lerp position + shrink scale
      const ax = anim.startX + (targetX - anim.startX) * ease;
      const az = anim.startZ + (targetZ - anim.startZ) * ease;
      const scale = Math.max(0.01, anim.startScale * (1 - ease));
      anim.object.position.set(ax, scale, az);

      if (anim.object instanceof THREE.Group) {
        // EnemyMesh group: scale sphere child + face sprite
        anim.object.children[0].scale.setScalar(scale);
        if (anim.object.children[1]) {
          (anim.object.children[1] as THREE.Sprite).scale.setScalar(scale * 1.3);
        }
      } else {
        anim.object.scale.setScalar(scale);
      }

      if (t >= 1) {
        scene.remove(anim.object);
        this.anims.splice(i, 1);
      }
    }
  }

  /** Cancel all animations and clear tracking state. Used on game reset. */
  clearAll(scene: THREE.Scene): void {
    for (const anim of this.anims) {
      scene.remove(anim.object);
    }
    this.anims.length = 0;
    for (const b of this.burstAnims) {
      scene.remove(b.container);
    }
    this.burstAnims.length = 0;
    this.entityParentIds.clear();
  }
}
