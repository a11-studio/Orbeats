import * as THREE from 'three';
import { ARENA_SIZE } from '@orbeats/shared';

/**
 * Create a glossy tiled grid floor using a CanvasTexture.
 */
export function createFloor(): THREE.Mesh {
  const size = ARENA_SIZE;
  const tileCount = 40;
  const tileSize = size / tileCount;
  const res = 1024;

  // Generate grid texture
  const canvas = document.createElement('canvas');
  canvas.width = res;
  canvas.height = res;
  const ctx = canvas.getContext('2d')!;

  // Background - light gray
  ctx.fillStyle = '#e8e8ec';
  ctx.fillRect(0, 0, res, res);

  // Grid lines
  ctx.strokeStyle = '#d0d0d8';
  ctx.lineWidth = 1.5;
  const step = res / tileCount;
  for (let i = 0; i <= tileCount; i++) {
    const pos = i * step;
    ctx.beginPath();
    ctx.moveTo(pos, 0);
    ctx.lineTo(pos, res);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, pos);
    ctx.lineTo(res, pos);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;

  const geometry = new THREE.PlaneGeometry(size, size);
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.6,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0;
  mesh.receiveShadow = true;

  return mesh;
}
