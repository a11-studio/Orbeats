/**
 * Self-contained merge-animation system.
 *
 * When a split cell or enemy disappears from the server snapshot, it should
 * visually shrink toward its parent entity rather than popping out instantly.
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

const MERGE_ANIM_DURATION = 300; // ms

export class MergeAnimManager {
  private anims: MergeAnim[] = [];

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

      const parentId = this.entityParentIds.get(id);
      if (parentId) {
        this.anims.push({
          type: 'enemy',
          object: enemy.group,
          startX: enemy.group.position.x,
          startZ: enemy.group.position.z,
          startScale: enemy.sphere.scale.x,
          parentId,
          startTime: now,
        });
        // Keep mesh in scene (animation will remove it on completion)
      } else {
        enemy.removeFromScene(scene);
      }
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
   * Per-frame update — advances all active merge animations.
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
    this.entityParentIds.clear();
  }
}
