import * as THREE from 'three';

/**
 * Generate a CanvasTexture with an angry face for enemy spheres.
 * Returns a texture that can be used on a Sprite.
 */
export function createAngryFaceTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Transparent background
  ctx.clearRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;

  // ── Angry Eyes (V-shaped) ──
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';

  // Left eye - angled V brow
  ctx.beginPath();
  ctx.moveTo(cx - 32, cy - 18);
  ctx.lineTo(cx - 18, cy - 8);
  ctx.lineTo(cx - 32, cy - 2);
  ctx.stroke();

  // Right eye - angled V brow (mirrored)
  ctx.beginPath();
  ctx.moveTo(cx + 32, cy - 18);
  ctx.lineTo(cx + 18, cy - 8);
  ctx.lineTo(cx + 32, cy - 2);
  ctx.stroke();

  // Eye dots (pupils)
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx - 24, cy - 8, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + 24, cy - 8, 4, 0, Math.PI * 2);
  ctx.fill();

  // ── Mouth - jagged angry line ──
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(cx - 22, cy + 18);
  ctx.lineTo(cx - 12, cy + 24);
  ctx.lineTo(cx - 2, cy + 16);
  ctx.lineTo(cx + 8, cy + 24);
  ctx.lineTo(cx + 22, cy + 18);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}
