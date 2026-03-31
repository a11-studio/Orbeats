import * as THREE from 'three';
import { createFloor } from './Floor.js';

const CAMERA_HEIGHT = 88;
const CAMERA_BACK = 65;
/** Orbit speed for entry preview (rad/sec) — one full rotation ~90s */
const PREVIEW_ORBIT_SPEED = 0.07;

// ── WebGL Support Detection ──────────────────────────────
function isWebGLAvailable(): boolean {
  try {
    const testCanvas = document.createElement('canvas');
    const gl =
      testCanvas.getContext('webgl2') ||
      testCanvas.getContext('webgl') ||
      testCanvas.getContext('experimental-webgl');
    return gl instanceof WebGLRenderingContext || gl instanceof WebGL2RenderingContext;
  } catch {
    return false;
  }
}

function showWebGLError(): void {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 99999;
    display: flex; align-items: center; justify-content: center; flex-direction: column;
    background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
    font-family: 'Plus Jakarta Sans', 'DM Sans', system-ui, sans-serif;
    color: #fff; text-align: center; padding: 32px;
  `;
  overlay.innerHTML = `
    <h1 style="font-size:48px;margin-bottom:16px;color:#ea580c;">WebGL Not Available</h1>
    <p style="font-size:20px;max-width:500px;opacity:0.8;line-height:1.6;">
      WebGL is not available in this browser or device.<br/>
      Please try a different browser, enable hardware acceleration in your browser settings,
      or update your graphics drivers.
    </p>
  `;
  document.body.innerHTML = '';
  document.body.appendChild(overlay);
}

// ── SceneManager ─────────────────────────────────────────
export class SceneManager {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;

  // Camera follow target (lerped for smooth movement)
  private cameraTargetX: number = 0;
  private cameraTargetZ: number = 0;
  private desiredPos = new THREE.Vector3();

  // Entry preview: slow orbit around arena center
  private previewAngle: number = 0;

  // Directional light (follows player for stable shadows)
  private dirLight!: THREE.DirectionalLight;

  constructor() {
    // ── 1. WebGL support check ──────────────────────
    const webglSupported = isWebGLAvailable();
    console.log('WebGL supported:', webglSupported);

    if (!webglSupported) {
      showWebGLError();
      throw new Error('WebGL is not available — cannot create renderer.');
    }

    // ── 2. Safe viewport dimensions ─────────────────
    const width = Math.max(window.innerWidth, 1);
    const height = Math.max(window.innerHeight, 1);
    console.log(`Viewport: ${width}x${height}, devicePixelRatio: ${window.devicePixelRatio}`);

    // ── 3. Create an explicit canvas ────────────────
    const canvas = document.createElement('canvas');
    canvas.id = 'game-canvas';
    canvas.width = width;
    canvas.height = height;
    canvas.style.display = 'block';
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.touchAction = 'none';

    // ── 4. Scene ────────────────────────────────────
    this.scene = new THREE.Scene();
    /* Off-canvas sky + fog — cool gray (#CFD1DA), distinct from white floor (Floor.ts) */
    const skyColor = 0xcfd1da;
    this.scene.background = new THREE.Color(skyColor);
    this.scene.fog = new THREE.Fog(skyColor, 200, 500);

    // ── 5. Camera ───────────────────────────────────
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 800);
    this.camera.position.set(0, CAMERA_HEIGHT, CAMERA_BACK);
    this.camera.lookAt(0, 0, 0);

    // ── 6. Renderer with explicit canvas + safe opts ─
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
      });
    } catch (e) {
      console.error('Failed to create WebGLRenderer:', e);
      showWebGLError();
      throw e;
    }

    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    // ── 7. Append to DOM ────────────────────────────
    const viewport = document.getElementById('game-viewport') ?? document.body;
    viewport.appendChild(canvas);

    console.log('Renderer created successfully');
    console.log(
      'GL_RENDERER:',
      this.renderer.getContext().getParameter(this.renderer.getContext().RENDERER),
    );
    console.log(
      'GL_VENDOR:',
      this.renderer.getContext().getParameter(this.renderer.getContext().VENDOR),
    );

    // ── 8. Lighting ─────────────────────────────────
    this.setupLights();

    // ── 9. Floor ────────────────────────────────────
    this.scene.add(createFloor());

    // ── 10. Resize handler ──────────────────────────
    window.addEventListener('resize', () => this.onResize());
  }

  private setupLights(): void {
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0xffffff, 0xccccdd, 0.6);
    this.scene.add(hemi);

    // Main directional light — follows the player so shadows
    // are always crisp in the visible area.
    this.dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    this.dirLight.position.set(40, 100, 30);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 4096;
    this.dirLight.shadow.mapSize.height = 4096;
    this.dirLight.shadow.camera.near = 10;
    this.dirLight.shadow.camera.far = 250;
    this.dirLight.shadow.camera.left = -80;
    this.dirLight.shadow.camera.right = 80;
    this.dirLight.shadow.camera.top = 80;
    this.dirLight.shadow.camera.bottom = -80;
    this.dirLight.shadow.bias = -0.0005;
    this.dirLight.shadow.normalBias = 0.02;
    // The target must be added to the scene for updateMatrixWorld to work
    this.scene.add(this.dirLight.target);
    this.scene.add(this.dirLight);

    const fill = new THREE.DirectionalLight(0xaabbff, 0.3);
    fill.position.set(-30, 40, -20);
    this.scene.add(fill);
  }

  /** Camera smoothing factor (lower = smoother follow) */
  private readonly cameraSmoothing = 0.065;

  /** Entry preview: subtle orbit around arena center. Call each frame while on join screen. */
  updatePreviewCamera(dt: number): void {
    this.previewAngle += PREVIEW_ORBIT_SPEED * dt;
    const radius = CAMERA_BACK;
    const x = radius * Math.sin(this.previewAngle);
    const z = radius * Math.cos(this.previewAngle);
    this.camera.position.set(x, CAMERA_HEIGHT, z);
    this.camera.lookAt(0, 0, 0);

    this.dirLight.position.set(x + 40, 100, z + 30);
    this.dirLight.target.position.set(0, 0, 0);
    this.dirLight.target.updateMatrixWorld();
  }

  /** Reset camera target for smooth transition into gameplay follow */
  resetCameraTarget(x: number, z: number): void {
    this.cameraTargetX = x;
    this.cameraTargetZ = z;
  }

  followTarget(x: number, z: number, _mass: number, _dt: number, _velX: number = 0, _velZ: number = 0): void {
    this.cameraTargetX += (x - this.cameraTargetX) * this.cameraSmoothing;
    this.cameraTargetZ += (z - this.cameraTargetZ) * this.cameraSmoothing;

    this.desiredPos.set(
      this.cameraTargetX,
      CAMERA_HEIGHT,
      this.cameraTargetZ + CAMERA_BACK,
    );
    this.camera.position.lerp(this.desiredPos, this.cameraSmoothing);
    this.camera.lookAt(this.cameraTargetX, 0, this.cameraTargetZ);

    this.dirLight.position.set(
      this.cameraTargetX + 40,
      100,
      this.cameraTargetZ + 30,
    );
    this.dirLight.target.position.set(
      this.cameraTargetX,
      0,
      this.cameraTargetZ,
    );
    this.dirLight.target.updateMatrixWorld();
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private onResize(): void {
    const width = Math.max(window.innerWidth, 1);
    const height = Math.max(window.innerHeight, 1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }
}
