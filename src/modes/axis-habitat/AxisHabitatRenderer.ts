import * as THREE from "three";
import gsap from "gsap";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { MeshBVH, acceleratedRaycast } from "three-mesh-bvh";
import { AXIS_DIRECTION_FAMILIES } from "../../axis";
import { PLEOS_COLORS } from "../../brand/colors";
import type { AxisHabitatQuality, AxisHabitatState } from "./AxisHabitatState";

interface QualityProfile {
  subdivisionCap: number;
  dustScale: number;
  dpr: number;
  shadowSize: number;
  msaaSamples: number;
}

interface FormationPalette {
  background: string;
  fog: string;
  floor: string;
  solids: readonly [string, string, string];
  lines: string;
  accent: string;
  dust: string;
}

interface Fragment {
  home: THREE.Vector3;
  spawn: THREE.Vector3;
  explode: THREE.Vector3;
  axis: THREE.Vector3;
  rotationSign: number;
  delay: number;
  solid: number;
  localIndex: number;
  current: THREE.Vector3;
}

interface FragmentSet {
  surface: THREE.InstancedMesh;
  wire: THREE.InstancedMesh;
  surfaceMaterial: THREE.MeshPhysicalMaterial;
  wireMaterial: THREE.MeshBasicMaterial;
  fragments: Fragment[];
}

interface LuminousSegment {
  start: THREE.Vector3;
  end: THREE.Vector3;
  color: THREE.Color;
  solid: number;
  delay: number;
  duration: number;
  width: number;
  brightness: number;
}

interface LuminousHotspot {
  position: THREE.Vector3;
  solid: number;
  delay: number;
  intensity: number;
  color: THREE.Color;
}

interface TimelineState {
  lineProgress: number;
  assemble: number;
  surface: number;
  explode: number;
  connectors: number;
  energy: number;
  settle: number;
}

type BvhGeometry = THREE.BufferGeometry & { boundsTree?: MeshBVH };
type FirstHitRaycaster = THREE.Raycaster & { firstHitOnly?: boolean };
type ScaffoldMaterial = THREE.ShaderMaterial & {
  uniforms: {
    uProgress: { value: number };
    uOpacity: { value: number };
    uColor: { value: THREE.Color };
  };
};
type LuminousLineMaterial = THREE.ShaderMaterial & {
  uniforms: {
    uIntensity: { value: number };
    uOpacity: { value: number };
  };
};

const QUALITY: Readonly<Record<Exclude<AxisHabitatQuality, "auto">, QualityProfile>> = {
  performance: { subdivisionCap: 4, dustScale: .45, dpr: 1, shadowSize: 1024, msaaSamples: 0 },
  balanced: { subdivisionCap: 5, dustScale: .72, dpr: 1, shadowSize: 1536, msaaSamples: 0 },
  quality: { subdivisionCap: 6, dustScale: 1, dpr: 1.15, shadowSize: 2048, msaaSamples: 2 },
  ultra: { subdivisionCap: 6, dustScale: 1.18, dpr: 1.35, shadowSize: 4096, msaaSamples: 4 },
};

const PALETTES: Readonly<Record<AxisHabitatState["preset"], FormationPalette>> = {
  "frosted-formation": {
    background: PLEOS_COLORS.black,
    fog: PLEOS_COLORS.black,
    floor: PLEOS_COLORS.darkGray1,
    solids: [PLEOS_COLORS.lightGray2, PLEOS_COLORS.blue1, PLEOS_COLORS.lightGray1],
    lines: PLEOS_COLORS.white,
    accent: PLEOS_COLORS.blue2,
    dust: PLEOS_COLORS.white,
  },
  "obsidian-signal": {
    background: PLEOS_COLORS.black,
    fog: PLEOS_COLORS.darkGray1,
    floor: PLEOS_COLORS.darkGray1,
    solids: [PLEOS_COLORS.lightGray3, PLEOS_COLORS.lightGray1, PLEOS_COLORS.blue2],
    lines: PLEOS_COLORS.white,
    accent: PLEOS_COLORS.blue2,
    dust: PLEOS_COLORS.blue1,
  },
  "blue-archive": {
    background: PLEOS_COLORS.black,
    fog: PLEOS_COLORS.black,
    floor: PLEOS_COLORS.darkGray1,
    solids: [PLEOS_COLORS.lightGray1, PLEOS_COLORS.lightGray3, PLEOS_COLORS.blue2],
    lines: PLEOS_COLORS.blue1,
    accent: PLEOS_COLORS.white,
    dust: PLEOS_COLORS.blue1,
  },
};

const CUBE_BASIS = { directions: [30, 90, 150] as const, depthSigns: [1, -1, 1] as const };
const TOUCH_CORNERS: ReadonlyArray<readonly [number, number, number]> = [[0, 0, 0], [1, 1, 0], [0, 1, 1]];
const SCREEN_AXES = [90, 210, 330] as const;
const SPAN = 1.35;

const SCAFFOLD_VERTEX = `
  attribute float aOrder;
  varying float vOrder;
  void main() {
    vOrder = aOrder;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SCAFFOLD_FRAGMENT = `
  uniform vec3 uColor;
  uniform float uProgress;
  uniform float uOpacity;
  varying float vOrder;
  void main() {
    if (vOrder > uProgress) discard;
    float head = 1.0 - smoothstep(0.0, 0.09, uProgress - vOrder);
    gl_FragColor = vec4(uColor + head * 0.35, uOpacity * (0.62 + head * 0.38));
  }
`;

const DUST_VERTEX = `
  attribute float aPhase;
  attribute float aScale;
  uniform float uTime;
  uniform float uPointSize;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    p.y += sin(uTime * 0.24 + aPhase * 14.0) * 0.18;
    p.x += cos(uTime * 0.17 + aPhase * 23.0) * 0.12;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(uPointSize * aScale * (130.0 / max(1.0, -mv.z)), 1.0, 5.0);
    vAlpha = 0.045 + aScale * 0.11;
  }
`;

const DUST_FRAGMENT = `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float alpha = smoothstep(0.5, 0.06, length(p)) * vAlpha;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

const FLARE_VERTEX = `
  attribute float aDelay;
  attribute float aIntensity;
  uniform float uReveal;
  uniform float uPointScale;
  varying float vEnergy;
  varying vec3 vColor;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float gate = smoothstep(aDelay, aDelay + 0.055, uReveal);
    float arrival = exp(-abs(uReveal - aDelay - 0.035) * 42.0);
    vEnergy = gate * (0.18 + arrival * aIntensity);
    vColor = color;
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(uPointScale * (0.72 + aIntensity * 0.16) * (130.0 / max(1.0, -mv.z)), 8.0, 150.0);
  }
`;

const LUMINOUS_LINE_VERTEX = `
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vDepth;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vColor = aColor;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const LUMINOUS_LINE_FRAGMENT = `
  uniform float uIntensity;
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vDepth;
  void main() {
    float depthFade = 1.0 - smoothstep(8.0, 23.0, vDepth);
    vec3 hdr = vColor * uIntensity;
    gl_FragColor = vec4(hdr, uOpacity * (0.38 + depthFade * 0.62));
  }
`;

const FLARE_FRAGMENT = `
  uniform float uFlash;
  uniform float uStreak;
  varying float vEnergy;
  varying vec3 vColor;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float radial = exp(-length(p) * 11.0);
    float core = exp(-length(p) * 44.0);
    float horizontal = exp(-abs(p.y) * 92.0) * exp(-abs(p.x) * 3.8) * uStreak;
    float vertical = exp(-abs(p.x) * 135.0) * exp(-abs(p.y) * 7.0) * 0.22;
    float diagonal = exp(-abs(p.x + p.y) * 105.0) * exp(-length(p) * 4.5) * 0.12;
    float alpha = (radial * 0.26 + core + horizontal + vertical + diagonal) * vEnergy * uFlash;
    if (alpha < 0.008) discard;
    vec3 whiteHot = mix(vColor, vec3(1.0), clamp(core * 2.4, 0.0, 1.0));
    gl_FragColor = vec4(whiteHot * (1.0 + core * 5.0), alpha);
  }
`;

const OPTICAL_POST = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uDispersion: { value: .2 },
    uVignette: { value: .15 },
    uGrain: { value: .03 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uDispersion;
    uniform float uVignette;
    uniform float uGrain;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
    void main() {
      vec4 center = texture2D(tDiffuse, vUv);
      float luminance = dot(center.rgb, vec3(0.2126, 0.7152, 0.0722));
      float highlight = smoothstep(0.72, 2.4, luminance);
      vec2 radial = normalize(vUv - 0.5 + vec2(0.00001)) * 0.0018 * uDispersion * highlight;
      float r = texture2D(tDiffuse, vUv + radial).r;
      float g = center.g;
      float b = texture2D(tDiffuse, vUv - radial).b;
      vec3 color = vec3(r, g, b);
      float vignette = 1.0 - smoothstep(0.26, 0.78, length(vUv - 0.5)) * uVignette;
      float grain = (hash(vUv * vec2(1873.0, 997.0) + uTime) - 0.5) * uGrain;
      gl_FragColor = vec4(color * vignette + grain, center.a);
    }
  `,
};

function deterministic(index: number, salt: number): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function smooth01(value: number): number {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function makeBasis(span: number): THREE.Vector3[] {
  const depth = span / Math.sqrt(2);
  return CUBE_BASIS.directions.map((angle, index) => {
    const radians = THREE.MathUtils.degToRad(angle);
    return new THREE.Vector3(Math.cos(radians) * span, Math.sin(radians) * span, CUBE_BASIS.depthSigns[index] * depth);
  });
}

function disposeTree(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    const renderable = object as THREE.Mesh | THREE.Points | THREE.Line;
    if (renderable.geometry) geometries.add(renderable.geometry);
    if (Array.isArray(renderable.material)) renderable.material.forEach((item) => materials.add(item));
    else if (renderable.material) materials.add(renderable.material);
  });
  geometries.forEach((geometry) => {
    delete (geometry as BvhGeometry).boundsTree;
    geometry.dispose();
  });
  materials.forEach((material) => material.dispose());
}

function createSurfaceTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Surface texture canvas is unavailable.");
  const image = context.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const index = (y * canvas.width + x) * 4;
      const grain = deterministic(x + y * canvas.width, 31);
      const broad = (Math.sin(x * .19) + Math.cos(y * .17) + 2) * .25;
      const value = Math.round(92 + grain * 98 + broad * 56);
      image.data[index] = value;
      image.data[index + 1] = value;
      image.data[index + 2] = value;
      image.data[index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3.5, 3.5);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function createSurfaceAlbedoTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Surface albedo canvas is unavailable.");
  const image = context.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const index = (y * canvas.width + x) * 4;
      const cloud = Math.sin(x * .047 + Math.cos(y * .021) * 1.7)
        + Math.cos(y * .039 + Math.sin(x * .018) * 2.1)
        + Math.sin((x + y) * .017);
      const mineral = Math.sin(x * .13 - y * .087) * 2.2;
      const value = Math.round(THREE.MathUtils.clamp(224 + cloud * 6.2 + mineral, 194, 248));
      image.data[index] = value;
      image.data[index + 1] = value;
      image.data[index + 2] = value;
      image.data[index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.25, 2.25);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function createEdgeGeometry(thickness = .018): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const add = (sx: number, sy: number, sz: number, x: number, y: number, z: number): void => {
    const geometry = new THREE.BoxGeometry(sx, sy, sz);
    geometry.translate(x, y, z);
    parts.push(geometry);
  };
  for (const y of [-.5, .5]) for (const z of [-.5, .5]) add(1, thickness, thickness, 0, y, z);
  for (const x of [-.5, .5]) for (const z of [-.5, .5]) add(thickness, 1, thickness, x, 0, z);
  for (const x of [-.5, .5]) for (const y of [-.5, .5]) add(thickness, thickness, 1, x, y, 0);
  const merged = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  if (!merged) throw new Error("Unable to build fragment edge geometry.");
  merged.computeVertexNormals();
  return merged;
}

export class AxisHabitatRenderer {
  readonly canvas: HTMLCanvasElement;
  private state: AxisHabitatState;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-3, 3, 3, -3, .05, 80);
  private readonly composer: EffectComposer;
  private readonly bloomSharp: UnrealBloomPass;
  private readonly bloom: UnrealBloomPass;
  private readonly bloomWide: UnrealBloomPass;
  private readonly opticalPass: ShaderPass;
  private readonly smaa: SMAAPass;
  private readonly content = new THREE.Group();
  private readonly formation = new THREE.Group();
  private readonly keyLight = new THREE.DirectionalLight(PLEOS_COLORS.white, 4.1);
  private readonly rimLight = new THREE.DirectionalLight(PLEOS_COLORS.blue1, 2.6);
  private readonly ambientLight = new THREE.HemisphereLight(PLEOS_COLORS.white, PLEOS_COLORS.darkGray2, 1.15);
  private readonly fillLight = new THREE.RectAreaLight(PLEOS_COLORS.lightGray1, 2.2, 5, 5);
  private readonly grazingLight = new THREE.RectAreaLight(PLEOS_COLORS.blue1, 2.8, 2.2, 6.5);
  private readonly raycaster = new THREE.Raycaster() as FirstHitRaycaster;
  private readonly pointer = new THREE.Vector2();
  private readonly pointerSmooth = new THREE.Vector2();
  private readonly cameraTarget = new THREE.Vector3(0, .02, 0);
  private readonly fragmentSets: FragmentSet[] = [];
  private readonly bvhProxies: THREE.Mesh[] = [];
  private readonly surfaceTexture = createSurfaceTexture();
  private readonly surfaceAlbedoTexture = createSurfaceAlbedoTexture();
  private readonly timelineState: TimelineState = { lineProgress: 0, assemble: 0, surface: 0, explode: 0, connectors: 0, energy: 0, settle: 0 };
  private timeline: gsap.core.Timeline;
  private stageRanges: Array<{ end: number; label: string }> = [];
  private motionKey = "";
  private scaffold: THREE.LineSegments | null = null;
  private scaffoldMaterial: ScaffoldMaterial | null = null;
  private connectors: THREE.LineSegments | null = null;
  private connectorMaterial: THREE.LineBasicMaterial | null = null;
  private connectorFragments: Fragment[] = [];
  private luminousSegments: LuminousSegment[] = [];
  private luminousHotspots: LuminousHotspot[] = [];
  private luminousCore: THREE.LineSegments | null = null;
  private luminousGlow: THREE.LineSegments | null = null;
  private luminousHalo: THREE.LineSegments | null = null;
  private luminousCoreMaterial: LuminousLineMaterial | null = null;
  private luminousGlowMaterial: LuminousLineMaterial | null = null;
  private luminousHaloMaterial: LuminousLineMaterial | null = null;
  private flareNodes: THREE.Points | null = null;
  private flareMaterial: THREE.ShaderMaterial | null = null;
  private dust: THREE.Points | null = null;
  private dustMaterial: THREE.ShaderMaterial | null = null;
  private floor: THREE.Mesh | null = null;
  private environmentTarget: THREE.WebGLRenderTarget | null = null;
  private hoveredSolid = -1;
  private phaseProgress = 0;
  private buildKey = "";
  private width = 1;
  private height = 1;
  private baseDpr = 1;
  private currentDpr = 1;
  private fps = 60;
  private frameSamples = 0;
  private resolvedQuality: Exclude<AxisHabitatQuality, "auto"> = "balanced";
  private exporting = false;

  constructor(state: AxisHabitatState) {
    this.state = state;
    RectAreaLightUniformsLib.init();
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    this.canvas = this.renderer.domElement;
    this.canvas.className = "axis-habitat-canvas";
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute("role", "img");
    this.canvas.setAttribute("aria-label", "PLEOS 세 솔리드의 와이어 형성, 조각 분해, 재결합 실시간 장면");
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.info.autoReset = false;
    const maxAnisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.surfaceTexture.anisotropy = maxAnisotropy;
    this.surfaceAlbedoTexture.anisotropy = maxAnisotropy;
    this.scene.add(this.content, this.keyLight, this.rimLight, this.ambientLight, this.fillLight, this.grazingLight);
    this.content.add(this.formation);
    this.keyLight.position.set(-4.8, 7.5, 5.5);
    this.rimLight.position.set(5.5, 3.2, -6.8);
    this.fillLight.position.set(0, 5.8, 2.8);
    this.fillLight.lookAt(0, 0, 0);
    this.grazingLight.position.set(-5.5, .9, -2.8);
    this.grazingLight.lookAt(.2, 0, 0);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.bias = -.0004;
    this.keyLight.shadow.normalBias = .028;
    this.keyLight.shadow.radius = 4;
    this.keyLight.shadow.camera.near = .1;
    this.keyLight.shadow.camera.far = 24;
    this.keyLight.shadow.camera.left = -6;
    this.keyLight.shadow.camera.right = 6;
    this.keyLight.shadow.camera.top = 6;
    this.keyLight.shadow.camera.bottom = -6;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environmentTarget = pmrem.fromScene(new RoomEnvironment(), .045);
    this.scene.environment = this.environmentTarget.texture;
    pmrem.dispose();
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomSharp = new UnrealBloomPass(new THREE.Vector2(1, 1), .12, .12, .98);
    this.composer.addPass(this.bloomSharp);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), .18, .38, .82);
    this.composer.addPass(this.bloom);
    this.bloomWide = new UnrealBloomPass(new THREE.Vector2(1, 1), .08, .82, 1.12);
    this.composer.addPass(this.bloomWide);
    this.opticalPass = new ShaderPass(OPTICAL_POST);
    this.composer.addPass(this.opticalPass);
    this.composer.addPass(new OutputPass());
    this.smaa = new SMAAPass();
    this.composer.addPass(this.smaa);
    this.raycaster.firstHitOnly = true;
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerleave", this.onPointerLeave);
    this.canvas.addEventListener("keydown", this.onKeyDown);
    this.timeline = this.createTimeline();
    this.motionKey = this.computeMotionKey();
    this.rebuild();
    this.applyState();
  }

  setState(state: AxisHabitatState): void {
    this.state = state;
    const nextMotionKey = this.computeMotionKey();
    if (nextMotionKey !== this.motionKey) {
      this.timeline.kill();
      this.timeline = this.createTimeline();
      this.motionKey = nextMotionKey;
    }
    const nextKey = this.computeBuildKey();
    if (nextKey !== this.buildKey) this.rebuild();
    this.applyState();
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.resolvedQuality = this.resolveQuality();
    this.baseDpr = Math.min(devicePixelRatio || 1, QUALITY[this.resolvedQuality].dpr);
    if (!this.state.performance.adaptiveDpr || this.currentDpr > this.baseDpr || this.currentDpr < .75) this.currentDpr = this.baseDpr;
    this.applySize(this.width, this.height, this.currentDpr);
    this.applyCameraProjection();
  }

  render(time: number, delta: number): void {
    const safeDelta = Math.min(.1, Math.max(1 / 240, delta || 1 / 60));
    this.fps += (Math.min(120, 1 / safeDelta) - this.fps) * .055;
    this.frameSamples += 1;
    this.adaptResolution();
    this.phaseProgress = ((time % this.state.motion.duration) + this.state.motion.duration) % this.state.motion.duration / this.state.motion.duration;
    this.timeline.progress(this.phaseProgress, true);
    this.pointerSmooth.lerp(this.pointer, .06);
    this.updateFormation(time);
    this.updateCamera(time);
    if (this.dustMaterial) this.dustMaterial.uniforms.uTime.value = time;
    this.renderer.info.reset();
    if (this.state.performance.postprocessing) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  async exportPng(width: number, height: number, time: number): Promise<string> {
    const max = this.renderer.capabilities.maxTextureSize;
    if (width > max || height > max) throw new Error(`요청 크기 ${width}×${height}px가 GPU 한계 ${max}px를 초과합니다.`);
    this.exporting = true;
    const previous = { width: this.width, height: this.height, dpr: this.currentDpr, progress: this.phaseProgress };
    this.applySize(width, height, 1);
    this.setComposerSamples(4);
    this.applyCameraProjection();
    this.phaseProgress = ((time % this.state.motion.duration) + this.state.motion.duration) % this.state.motion.duration / this.state.motion.duration;
    this.timeline.progress(this.phaseProgress, true);
    this.updateFormation(time);
    this.updateCamera(time);
    if (this.dustMaterial) this.dustMaterial.uniforms.uTime.value = time;
    this.renderer.info.reset();
    if (this.state.performance.postprocessing) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    const data = this.canvas.toDataURL("image/png");
    this.applySize(previous.width, previous.height, previous.dpr);
    this.applyCameraProjection();
    this.timeline.progress(previous.progress, true);
    this.phaseProgress = previous.progress;
    this.updateFormation(previous.progress * this.state.motion.duration);
    this.updateCamera(previous.progress * this.state.motion.duration);
    this.exporting = false;
    return data;
  }

  inspect(): object {
    const info = this.renderer.info;
    const fragmentCount = this.fragmentSets.reduce((sum, set) => sum + set.fragments.length, 0);
    return {
      ready: true,
      renderer: "Three.js WebGL2 instanced PLEOS formation",
      rendererVersion: THREE.REVISION,
      technologies: { svelte: true, three: true, webgl2: this.renderer.capabilities.isWebGL2, gsap: gsap.version, threeMeshBvh: true },
      axisFamily: "30deg",
      approvedDirections: [...AXIS_DIRECTION_FAMILIES["30deg"]],
      sharedOrigin: true,
      solids: 3,
      formation: {
        stage: this.stageName(),
        progress: Number(this.phaseProgress.toFixed(3)),
        fragments: fragmentCount,
        subdivisions: Math.round(Math.cbrt(fragmentCount / 3)),
        instancedDraws: this.fragmentSets.length * 2,
        connectors: this.connectorFragments.length,
        scaffold: Boolean(this.scaffold),
        dustPoints: this.dust?.geometry.getAttribute("position")?.count ?? 0,
        ground: Boolean(this.floor),
        order: this.state.motion.order,
        ease: this.state.motion.ease,
        luminousSegments: this.luminousSegments.length,
        luminousHotspots: this.luminousHotspots.length,
        filamentLayers: this.luminousCore && this.luminousGlow && this.luminousHalo ? 3 : 0,
      },
      bvh: { solidProxies: this.bvhProxies.length, firstHitOnly: true, hoveredSolid: this.hoveredSolid },
      performance: {
        fps: Number(this.fps.toFixed(1)),
        quality: this.resolvedQuality,
        adaptiveDpr: this.state.performance.adaptiveDpr,
        dpr: Number(this.currentDpr.toFixed(2)),
        drawCalls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        postprocessing: this.state.performance.postprocessing,
      },
      appearance: {
        background: PALETTES[this.state.preset].background,
        lineColor: PALETTES[this.state.preset].lines,
        antialiasing: this.state.performance.postprocessing ? "SMAA + preview MSAA" : "native WebGL",
        previewMsaa: QUALITY[this.resolvedQuality].msaaSamples,
        exportMsaa: 4,
        renderingDirection: "HDR luminous spatial architecture",
        postPipeline: "multi-mip selective bloom; ULTRA adds sharp and wide passes; optical dispersion",
        filamentMaterial: this.luminousCoreMaterial ? { intensity: this.luminousCoreMaterial.uniforms.uIntensity.value, opacity: Number(this.luminousCoreMaterial.uniforms.uOpacity.value.toFixed(2)) } : null,
      },
      camera: {
        projection: "orthographic",
        position: this.camera.position.toArray().map((value) => Number(value.toFixed(3))),
        target: this.cameraTarget.toArray().map((value) => Number(value.toFixed(3))),
        glass3dMatch: true,
      },
    };
  }

  dispose(): void {
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
    this.canvas.removeEventListener("keydown", this.onKeyDown);
    this.timeline.kill();
    disposeTree(this.content);
    this.surfaceTexture.dispose();
    this.surfaceAlbedoTexture.dispose();
    this.environmentTarget?.dispose();
    this.scene.environment = null;
    this.composer.passes.forEach((pass) => pass.dispose());
    this.composer.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }

  private createTimeline(): gsap.core.Timeline {
    const state = this.timelineState;
    const timing = this.state.motion.timing;
    const dynamics = this.state.motion.dynamics;
    const duration = (value: number, minimum = .05): number => Math.max(minimum, Number(value) || minimum);
    const draw = duration(timing.draw);
    const assemble = duration(timing.assemble);
    const materialize = duration(timing.materialize);
    const materialHold = Math.max(0, timing.materialHold);
    const explode = duration(timing.explode);
    const suspended = Math.max(0, timing.suspended);
    const returning = duration(timing.return);
    const returnHold = Math.max(0, timing.returnHold);
    const dissolve = duration(timing.dissolve);
    const reset = duration(timing.reset);
    const resetHold = Math.max(0, timing.resetHold);
    const assembleStart = Math.max(0, draw - THREE.MathUtils.clamp(timing.drawAssembleOverlap, 0, draw * .9));
    const assembleEnd = assembleStart + assemble;
    const materialStart = Math.max(assembleStart, assembleEnd - THREE.MathUtils.clamp(timing.assembleMaterialOverlap, 0, assemble * .9));
    const materialEnd = materialStart + materialize;
    const explodeStart = materialEnd + materialHold;
    const explodeEnd = explodeStart + explode;
    const returnStart = explodeEnd + suspended;
    const returnEnd = returnStart + returning;
    const dissolveStart = returnEnd + returnHold;
    const dissolveEnd = dissolveStart + dissolve;
    const resetStart = Math.max(returnEnd, dissolveEnd - THREE.MathUtils.clamp(timing.dissolveResetOverlap, 0, dissolve * .9));
    const resetEnd = resetStart + reset;
    const end = resetEnd + resetHold;
    const connectorStart = explodeStart + explode * THREE.MathUtils.clamp(dynamics.connectorDelay, 0, .95);
    const connectorFadeStart = returnStart + returning * THREE.MathUtils.clamp(dynamics.connectorPersistence, 0, .95);
    const easing = this.motionEases();
    const timeline = gsap.timeline({ paused: true, defaults: { overwrite: false } });
    timeline.set(state, { lineProgress: 0, assemble: 0, surface: 0, explode: 0, connectors: 0, energy: 0, settle: 0 }, 0);
    timeline.to(state, { lineProgress: 1, duration: draw, ease: "power2.out" }, 0);
    timeline.to(state, { assemble: 1, duration: assemble, ease: easing.assemble }, assembleStart);
    timeline.to(state, { surface: 1, duration: materialize, ease: easing.material }, materialStart);
    timeline.to(state, { energy: 1, duration: materialize + materialHold, ease: "sine.inOut" }, materialStart);
    timeline.to(state, { explode: 1, settle: 0, duration: explode, ease: easing.explode }, explodeStart);
    timeline.to(state, { connectors: 1, duration: Math.max(.08, explode * .42), ease: "power2.out" }, connectorStart);
    timeline.to(state, { energy: .55, duration: Math.max(.08, suspended), ease: "sine.inOut" }, explodeEnd);
    timeline.to(state, { explode: 0, settle: 1, duration: returning, ease: easing.return }, returnStart);
    timeline.to(state, { connectors: 0, duration: Math.max(.08, returnEnd - connectorFadeStart), ease: "power2.in" }, connectorFadeStart);
    timeline.to(state, { energy: 1, duration: Math.max(.08, returning * .55), ease: "sine.out" }, returnStart + returning * .45);
    timeline.to(state, { surface: 0, duration: dissolve, ease: easing.material }, dissolveStart);
    timeline.to(state, { assemble: 0, lineProgress: 0, energy: 0, settle: 0, duration: reset, ease: easing.reset }, resetStart);
    timeline.to(state, { energy: 0, duration: Math.max(.01, resetHold) }, resetEnd);
    this.stageRanges = [
      { end: draw / end, label: "DRAWING" },
      { end: materialStart / end, label: "ASSEMBLING" },
      { end: materialEnd / end, label: "MATERIALIZING" },
      { end: explodeStart / end, label: "MATERIAL HOLD" },
      { end: explodeEnd / end, label: "DISASSEMBLING" },
      { end: returnStart / end, label: "SUSPENDED" },
      { end: dissolveStart / end, label: "REASSEMBLING" },
      { end: 1, label: "RESETTING" },
    ];
    return timeline;
  }

  private motionEases(): { assemble: string; material: string; explode: string; return: string; reset: string } {
    if (this.state.motion.ease === "smooth") return { assemble: "sine.inOut", material: "sine.inOut", explode: "sine.inOut", return: "sine.inOut", reset: "sine.inOut" };
    if (this.state.motion.ease === "snappy") return { assemble: "power4.out", material: "power2.out", explode: "power3.in", return: "power4.out", reset: "power3.inOut" };
    if (this.state.motion.ease === "elastic") return { assemble: "back.out(1.35)", material: "sine.inOut", explode: "power3.inOut", return: "back.out(1.5)", reset: "power2.inOut" };
    return { assemble: "power3.inOut", material: "sine.inOut", explode: "power3.inOut", return: "power3.inOut", reset: "power2.inOut" };
  }

  private computeMotionKey(): string {
    return JSON.stringify({ ease: this.state.motion.ease, timing: this.state.motion.timing, connectorDelay: this.state.motion.dynamics.connectorDelay, connectorPersistence: this.state.motion.dynamics.connectorPersistence });
  }

  private computeBuildKey(): string {
    const s = this.state;
    const l = s.luminous;
    return [s.preset, this.resolveQuality(), Math.round(s.structure.subdivisions), s.structure.scale, s.structure.fragmentGap, s.structure.bevel, s.structure.connectorDensity, Math.round(s.atmosphere.dust), l.structureDensity, l.longLineProbability, l.triangleProbability, l.gridRegularity, l.depthSpread, l.randomness, l.colorVariation, l.brightnessRandomness, l.widthRandomness, l.revealRandomness, l.flareProbability].join(":");
  }

  private rebuild(): void {
    disposeTree(this.formation);
    this.formation.clear();
    this.fragmentSets.length = 0;
    this.bvhProxies.length = 0;
    this.connectorFragments = [];
    this.luminousSegments = [];
    this.luminousHotspots = [];
    this.luminousCore = null;
    this.luminousGlow = null;
    this.luminousHalo = null;
    this.luminousCoreMaterial = null;
    this.luminousGlowMaterial = null;
    this.luminousHaloMaterial = null;
    this.flareNodes = null;
    this.flareMaterial = null;
    this.scaffold = null;
    this.scaffoldMaterial = null;
    this.connectors = null;
    this.connectorMaterial = null;
    this.dust = null;
    this.dustMaterial = null;
    this.floor = null;
    this.resolvedQuality = this.resolveQuality();
    const palette = PALETTES[this.state.preset];
    this.buildFragments(palette);
    this.buildLuminousNetwork(palette);
    this.buildScaffold(palette);
    this.buildConnectors(palette);
    this.buildBvhProxies();
    this.buildFloor(palette);
    this.buildDust(palette);
    this.buildKey = this.computeBuildKey();
    void this.renderer.compileAsync(this.scene, this.camera).catch(() => undefined);
  }

  private buildFragments(palette: FormationPalette): void {
    const requested = Math.round(this.state.structure.subdivisions);
    const subdivisions = THREE.MathUtils.clamp(requested, 3, QUALITY[this.resolvedQuality].subdivisionCap);
    const basis = makeBasis(SPAN * this.state.structure.scale);
    const radius = THREE.MathUtils.clamp(this.state.structure.bevel, .008, .11);
    const geometry = new RoundedBoxGeometry(1, 1, 1, this.resolvedQuality === "ultra" ? 4 : 3, radius);
    const edgeGeometry = createEdgeGeometry();
    const count = subdivisions ** 3;
    const cellScale = (1 - this.state.structure.fragmentGap) / subdivisions;
    const basisMatrix = new THREE.Matrix4().set(
      basis[0].x * cellScale, basis[1].x * cellScale, basis[2].x * cellScale, 0,
      basis[0].y * cellScale, basis[1].y * cellScale, basis[2].y * cellScale, 0,
      basis[0].z * cellScale, basis[1].z * cellScale, basis[2].z * cellScale, 0,
      0, 0, 0, 1,
    );
    TOUCH_CORNERS.forEach((corner, solidIndex) => {
      const surfaceMaterial = new THREE.MeshPhysicalMaterial({
        color: palette.solids[solidIndex],
        emissive: new THREE.Color(palette.accent).multiplyScalar(.18),
        emissiveIntensity: .32,
        vertexColors: false,
        roughness: this.state.material.roughness,
        metalness: this.state.material.metalness,
        clearcoat: this.state.material.clearcoat,
        clearcoatRoughness: .09,
        transmission: this.state.material.transmission,
        thickness: .45,
        ior: 1.42,
        envMapIntensity: 1.75,
        specularIntensity: 1,
        specularColor: new THREE.Color(PLEOS_COLORS.white),
        map: this.surfaceAlbedoTexture,
        bumpMap: this.surfaceTexture,
        bumpScale: this.state.material.bump,
        roughnessMap: this.surfaceTexture,
        transparent: true,
        opacity: 0,
        depthWrite: true,
      });
      const wireMaterial = new THREE.MeshBasicMaterial({
        color: palette.lines,
        transparent: true,
        opacity: 0,
        blending: THREE.NormalBlending,
        depthWrite: true,
      });
      const surface = new THREE.InstancedMesh(geometry.clone(), surfaceMaterial, count);
      const wire = new THREE.InstancedMesh(edgeGeometry.clone(), wireMaterial, count);
      surface.name = `PLEOS solid ${solidIndex + 1} instanced fragments`;
      wire.name = `PLEOS solid ${solidIndex + 1} wire cells`;
      surface.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      wire.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      surface.castShadow = true;
      surface.receiveShadow = true;
      wire.renderOrder = 4;
      const fragments: Fragment[] = [];
      const base = new THREE.Vector3()
        .addScaledVector(basis[0], -corner[0])
        .addScaledVector(basis[1], -corner[1])
        .addScaledVector(basis[2], -corner[2]);
      const screenRadians = THREE.MathUtils.degToRad(SCREEN_AXES[solidIndex]);
      const screenDirection = new THREE.Vector3(Math.cos(screenRadians), Math.sin(screenRadians), 0);
      for (let z = 0; z < subdivisions; z += 1) {
        for (let y = 0; y < subdivisions; y += 1) {
          for (let x = 0; x < subdivisions; x += 1) {
            const localIndex = x + y * subdivisions + z * subdivisions * subdivisions;
            const globalIndex = localIndex + solidIndex * count;
            const clusterX = Math.floor(x / 2);
            const clusterY = Math.floor(y / 2);
            const clusterZ = Math.floor(z / 2);
            const clusterIndex = clusterX + clusterY * 8 + clusterZ * 64 + solidIndex * 512;
            const home = base.clone()
              .addScaledVector(basis[0], (x + .5) / subdivisions)
              .addScaledVector(basis[1], (y + .5) / subdivisions)
              .addScaledVector(basis[2], (z + .5) / subdivisions);
            const radial = home.clone().normalize();
            if (radial.lengthSq() < .001) radial.copy(screenDirection);
            const clusterJitter = new THREE.Vector3(
              deterministic(clusterIndex, 2) - .5,
              deterministic(clusterIndex, 3) - .3,
              deterministic(clusterIndex, 4) - .5,
            ).normalize();
            const cellJitter = new THREE.Vector3(
              deterministic(globalIndex, 7) - .5,
              deterministic(globalIndex, 8) - .5,
              deterministic(globalIndex, 9) - .5,
            ).normalize();
            const explode = radial.multiplyScalar(.46 + deterministic(clusterIndex, 5) * .18)
              .addScaledVector(screenDirection, .42 + deterministic(clusterIndex, 6) * .16)
              .addScaledVector(clusterJitter, .4)
              .addScaledVector(cellJitter, .08);
            const spawn = new THREE.Vector3(
              (deterministic(globalIndex, 10) - .5) * 7.5,
              (deterministic(globalIndex, 11) - .5) * 6.2,
              (deterministic(globalIndex, 12) - .5) * 7,
            ).addScaledVector(screenDirection, 1.2);
            const axis = new THREE.Vector3(
              deterministic(clusterIndex, 13) - .5,
              deterministic(clusterIndex, 14) - .5,
              deterministic(clusterIndex, 15) - .5,
            ).normalize();
            fragments.push({
              home,
              spawn,
              explode,
              axis,
              rotationSign: deterministic(clusterIndex, 16) > .5 ? 1 : -1,
              delay: THREE.MathUtils.clamp(deterministic(clusterIndex, 17) * .9 + deterministic(globalIndex, 18) * .1, 0, 1),
              solid: solidIndex,
              localIndex,
              current: home.clone(),
            });
            const homeMatrix = new THREE.Matrix4().makeTranslation(home.x, home.y, home.z).multiply(basisMatrix);
            wire.setMatrixAt(localIndex, homeMatrix);
            surface.setMatrixAt(localIndex, homeMatrix);
          }
        }
      }
      surface.instanceMatrix.needsUpdate = true;
      wire.instanceMatrix.needsUpdate = true;
      this.fragmentSets.push({ surface, wire, surfaceMaterial, wireMaterial, fragments });
      this.formation.add(surface, wire);
    });
    geometry.dispose();
    edgeGeometry.dispose();
  }

  private buildLuminousNetwork(palette: FormationPalette): void {
    const luminous = this.state.luminous;
    const basis = makeBasis(SPAN * this.state.structure.scale);
    const bases = TOUCH_CORNERS.map((corner) => new THREE.Vector3()
      .addScaledVector(basis[0], -corner[0])
      .addScaledVector(basis[1], -corner[1])
      .addScaledVector(basis[2], -corner[2]));
    const spectral = [PLEOS_COLORS.white, palette.lines, palette.accent, "#9ef8ff", "#48c8ff", "#668cff", "#a98bff", "#7dffd1", "#ffe3a1"];
    const qualityScale = this.resolvedQuality === "performance" ? .66 : this.resolvedQuality === "balanced" ? .82 : this.resolvedQuality === "ultra" ? 1.22 : 1;
    const perSolid = Math.max(16, Math.round((18 + luminous.structureDensity * 50) * qualityScale));
    const localToWorld = (solid: number, local: THREE.Vector3): THREE.Vector3 => bases[solid].clone()
      .addScaledVector(basis[0], local.x)
      .addScaledVector(basis[1], local.y)
      .addScaledVector(basis[2], local.z);
    const localPoint = (index: number, salt: number): THREE.Vector3 => {
      const raw = new THREE.Vector3(deterministic(index, salt), deterministic(index, salt + 1), deterministic(index, salt + 2));
      const snapped = raw.clone().multiplyScalar(4).round().multiplyScalar(.25);
      raw.lerp(snapped, luminous.gridRegularity);
      raw.z = .5 + (raw.z - .5) * luminous.depthSpread;
      return raw;
    };
    const addSegment = (solid: number, localStart: THREE.Vector3, localEnd: THREE.Vector3, index: number, emphasis = 1): void => {
      const start = localToWorld(solid, localStart);
      const end = localToWorld(solid, localEnd);
      if (start.distanceToSquared(end) < .008) return;
      const colorIndex = deterministic(index, 205) < .62 ? Math.floor(deterministic(index, 206) * 4) : Math.floor(deterministic(index, 207) * spectral.length);
      const color = new THREE.Color(spectral[colorIndex % spectral.length]).lerp(new THREE.Color(PLEOS_COLORS.white), 1 - luminous.colorVariation);
      const delayBase = (index % Math.max(1, perSolid * 3)) / Math.max(1, perSolid * 3);
      const delay = THREE.MathUtils.clamp(delayBase * .78 + deterministic(index, 208) * luminous.revealRandomness * .22, 0, .93);
      const width = emphasis * (.68 + deterministic(index, 209) * (1 + luminous.widthRandomness));
      const brightnessSeed = deterministic(index, 210);
      const brightness = emphasis * (.16 + Math.pow(brightnessSeed, 2.25) * (1.12 + luminous.brightnessRandomness * 1.6));
      this.luminousSegments.push({ start, end, color, solid, delay, duration: .07 + deterministic(index, 211) * (.18 + luminous.revealRandomness * .28), width, brightness });
      if (deterministic(index, 212) < luminous.flareProbability * emphasis) {
        this.luminousHotspots.push({ position: end.clone(), solid, delay: Math.min(.97, delay + .035), intensity: .7 + deterministic(index, 213) * 1.8 * emphasis, color: color.clone() });
      }
    };
    const boundaries: ReadonlyArray<readonly [THREE.Vector3, THREE.Vector3]> = [
      [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0)], [new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 1, 0)],
      [new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 1)], [new THREE.Vector3(0, 1, 1), new THREE.Vector3(1, 1, 1)],
      [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0)], [new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 1, 0)],
      [new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 1)], [new THREE.Vector3(1, 0, 1), new THREE.Vector3(1, 1, 1)],
      [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1)], [new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 0, 1)],
      [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 1)], [new THREE.Vector3(1, 1, 0), new THREE.Vector3(1, 1, 1)],
    ];
    for (let solid = 0; solid < 3; solid += 1) {
      for (let edge = 0; edge < boundaries.length; edge += 1) {
        if (deterministic(edge + solid * 17, 214) > .58) continue;
        const [a, b] = boundaries[edge];
        const insetA = .04 + deterministic(edge + solid * 31, 215) * .22;
        const insetB = .04 + deterministic(edge + solid * 31, 216) * .22;
        addSegment(solid, a.clone().lerp(b, insetA), b.clone().lerp(a, insetB), solid * 1000 + edge, 1.2 + deterministic(edge, solid + 220) * .45);
      }
      for (let index = 0; index < perSolid; index += 1) {
        const global = solid * 1000 + 100 + index;
        const start = localPoint(global, 221);
        let end: THREE.Vector3;
        const axisAligned = deterministic(global, 224) > luminous.randomness * .72;
        if (axisAligned) {
          end = start.clone();
          const axis = Math.floor(deterministic(global, 225) * 3) as 0 | 1 | 2;
          const direction = deterministic(global, 226) > .5 ? 1 : -1;
          const length = .2 + deterministic(global, 227) * .72;
          end.setComponent(axis, THREE.MathUtils.clamp(end.getComponent(axis) + direction * length, -.14, 1.14));
        } else {
          end = localPoint(global, 228);
        }
        if (deterministic(global, 231) < luminous.longLineProbability) {
          const axis = Math.floor(deterministic(global, 232) * 3) as 0 | 1 | 2;
          const direction = deterministic(global, 233) > .5 ? 1 : -1;
          start.setComponent(axis, direction > 0 ? .84 : .16);
          end = start.clone();
          end.setComponent(axis, direction > 0 ? 1.45 + deterministic(global, 234) * 1.25 : -(.45 + deterministic(global, 234) * 1.25));
        }
        addSegment(solid, start, end, global, 1);
        if (deterministic(global, 235) < luminous.triangleProbability * .34) {
          const third = localPoint(global, 236);
          addSegment(solid, end, third, global + 3000, .72);
          addSegment(solid, third, start, global + 6000, .72);
        }
      }
    }

    const count = this.luminousSegments.length;
    const coreGeometry = new THREE.BufferGeometry();
    const glowGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 6);
    const coreColors = new Float32Array(count * 6);
    const glowColors = new Float32Array(count * 6);
    this.luminousSegments.forEach((segment, index) => {
      const widthEnergy = THREE.MathUtils.lerp(1, segment.width, luminous.widthRandomness * .42);
      const white = new THREE.Color(PLEOS_COLORS.white).lerp(segment.color, .08).multiplyScalar(segment.brightness * widthEnergy);
      const glow = segment.color.clone().multiplyScalar(segment.brightness * widthEnergy);
      coreColors.set(white.toArray(), index * 6);
      coreColors.set(white.toArray(), index * 6 + 3);
      glowColors.set(glow.toArray(), index * 6);
      glowColors.set(glow.toArray(), index * 6 + 3);
    });
    coreGeometry.setAttribute("position", new THREE.BufferAttribute(positions.slice(), 3).setUsage(THREE.DynamicDrawUsage));
    coreGeometry.setAttribute("aColor", new THREE.BufferAttribute(coreColors, 3));
    glowGeometry.setAttribute("position", new THREE.BufferAttribute(positions.slice(), 3).setUsage(THREE.DynamicDrawUsage));
    glowGeometry.setAttribute("aColor", new THREE.BufferAttribute(glowColors, 3));
    const material = (intensity: number, opacity: number, blending: THREE.Blending = THREE.AdditiveBlending): LuminousLineMaterial => new THREE.ShaderMaterial({ vertexShader: LUMINOUS_LINE_VERTEX, fragmentShader: LUMINOUS_LINE_FRAGMENT, uniforms: { uIntensity: { value: intensity }, uOpacity: { value: opacity } }, transparent: true, blending, depthWrite: false, depthTest: blending !== THREE.NormalBlending, toneMapped: false }) as LuminousLineMaterial;
    this.luminousCoreMaterial = material(luminous.coreIntensity, 1, THREE.NormalBlending);
    this.luminousGlowMaterial = material(luminous.glowIntensity, .34);
    this.luminousHaloMaterial = material(luminous.glowIntensity * .7, .09);
    this.luminousCore = new THREE.LineSegments(coreGeometry, this.luminousCoreMaterial);
    this.luminousGlow = new THREE.LineSegments(glowGeometry, this.luminousGlowMaterial);
    this.luminousHalo = new THREE.LineSegments(glowGeometry.clone(), this.luminousHaloMaterial);
    [this.luminousCore, this.luminousGlow, this.luminousHalo].forEach((mesh, layer) => {
      mesh.name = ["White-hot filament cores", "Spectral filament glow", "Wide filament halos"][layer];
      mesh.frustumCulled = false;
      mesh.renderOrder = 8 - layer;
    });
    this.formation.add(this.luminousHalo, this.luminousGlow, this.luminousCore);

    if (this.luminousHotspots.length) {
      const hotspotGeometry = new THREE.BufferGeometry();
      hotspotGeometry.setAttribute("position", new THREE.Float32BufferAttribute(this.luminousHotspots.flatMap((node) => node.position.toArray()), 3));
      hotspotGeometry.setAttribute("color", new THREE.Float32BufferAttribute(this.luminousHotspots.flatMap((node) => node.color.toArray()), 3));
      hotspotGeometry.setAttribute("aDelay", new THREE.Float32BufferAttribute(this.luminousHotspots.map((node) => node.delay), 1));
      hotspotGeometry.setAttribute("aIntensity", new THREE.Float32BufferAttribute(this.luminousHotspots.map((node) => node.intensity), 1));
      this.flareMaterial = new THREE.ShaderMaterial({ vertexShader: FLARE_VERTEX, fragmentShader: FLARE_FRAGMENT, uniforms: { uReveal: { value: 0 }, uPointScale: { value: 44 }, uFlash: { value: 1 }, uStreak: { value: luminous.anamorphicStreak } }, transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, vertexColors: true, toneMapped: false });
      this.flareNodes = new THREE.Points(hotspotGeometry, this.flareMaterial);
      this.flareNodes.name = "Procedural intersection flares and anamorphic streaks";
      this.flareNodes.frustumCulled = false;
      this.flareNodes.renderOrder = 10;
      this.formation.add(this.flareNodes);
    }
  }

  private buildScaffold(palette: FormationPalette): void {
    const segments = 150;
    const positions = new Float32Array(segments * 6);
    const orders = new Float32Array(segments * 2);
    for (let index = 0; index < segments; index += 1) {
      const angle = AXIS_DIRECTION_FAMILIES["30deg"][index % AXIS_DIRECTION_FAMILIES["30deg"].length];
      const radians = THREE.MathUtils.degToRad(angle);
      const radius = 2.1 + deterministic(index, 40) * 3.6;
      const phase = deterministic(index, 41) * Math.PI * 2;
      const start = new THREE.Vector3(
        Math.cos(phase) * radius,
        Math.sin(phase) * radius * .72,
        (deterministic(index, 42) - .5) * 4.8,
      );
      const length = .32 + deterministic(index, 43) * .96;
      const end = start.clone().add(new THREE.Vector3(Math.cos(radians) * length, Math.sin(radians) * length, (deterministic(index, 44) - .5) * .48));
      positions.set(start.toArray(), index * 6);
      positions.set(end.toArray(), index * 6 + 3);
      const order = index / segments;
      orders[index * 2] = order;
      orders[index * 2 + 1] = order;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aOrder", new THREE.BufferAttribute(orders, 1));
    const material = new THREE.ShaderMaterial({
      vertexShader: SCAFFOLD_VERTEX,
      fragmentShader: SCAFFOLD_FRAGMENT,
      uniforms: {
        uProgress: { value: 0 },
        uOpacity: { value: this.state.lines.scaffoldOpacity },
        uColor: { value: new THREE.Color(palette.lines) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    }) as ScaffoldMaterial;
    const scaffold = new THREE.LineSegments(geometry, material);
    scaffold.name = "PLEOS 30 degree construction network";
    scaffold.renderOrder = 3;
    this.scaffold = scaffold;
    this.scaffoldMaterial = material;
    this.formation.add(scaffold);
  }

  private buildConnectors(palette: FormationPalette): void {
    const all = this.fragmentSets.flatMap((set) => set.fragments);
    this.connectorFragments = all.filter((_, index) => deterministic(index, 60) < this.state.structure.connectorDensity);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(Math.max(1, this.connectorFragments.length) * 6), 3));
    const material = new THREE.LineBasicMaterial({
      color: palette.accent,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const connectors = new THREE.LineSegments(geometry, material);
    connectors.name = "PLEOS fragment relationship lines";
    connectors.frustumCulled = false;
    connectors.renderOrder = 5;
    this.connectors = connectors;
    this.connectorMaterial = material;
    this.formation.add(connectors);
  }

  private buildBvhProxies(): void {
    const basis = makeBasis(SPAN * this.state.structure.scale);
    TOUCH_CORNERS.forEach((corner, solidIndex) => {
      const geometry = new THREE.BoxGeometry(1, 1, 1);
      const affine = new THREE.Matrix4().set(
        basis[0].x, basis[1].x, basis[2].x, 0,
        basis[0].y, basis[1].y, basis[2].y, 0,
        basis[0].z, basis[1].z, basis[2].z, 0,
        0, 0, 0, 1,
      );
      const base = new THREE.Vector3()
        .addScaledVector(basis[0], -corner[0])
        .addScaledVector(basis[1], -corner[1])
        .addScaledVector(basis[2], -corner[2]);
      geometry.translate(.5, .5, .5);
      geometry.applyMatrix4(affine);
      geometry.translate(base.x, base.y, base.z);
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      (geometry as BvhGeometry).boundsTree = new MeshBVH(geometry, { targetLeafSize: 4 });
      const material = new THREE.MeshBasicMaterial();
      material.visible = false;
      const proxy = new THREE.Mesh(geometry, material);
      proxy.name = `PLEOS solid ${solidIndex + 1} BVH interaction proxy`;
      proxy.userData.solidIndex = solidIndex;
      proxy.raycast = acceleratedRaycast;
      this.bvhProxies.push(proxy);
      this.formation.add(proxy);
    });
  }

  private buildFloor(palette: FormationPalette): void {
    const geometry = new THREE.CircleGeometry(11, 96);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshPhysicalMaterial({
      color: palette.floor,
      roughness: 1 - this.state.atmosphere.floorReflectivity * .62,
      metalness: this.state.atmosphere.floorReflectivity * .24,
      clearcoat: this.state.atmosphere.floorReflectivity * .36,
      envMapIntensity: .72,
      transparent: true,
      opacity: this.state.preset === "frosted-formation" ? .28 : .48,
    });
    const floor = new THREE.Mesh(geometry, material);
    floor.name = "PLEOS neutral studio ground";
    floor.position.y = -2.05 * this.state.structure.scale;
    floor.receiveShadow = true;
    this.floor = floor;
    this.formation.add(floor);
  }

  private buildDust(palette: FormationPalette): void {
    const requested = Math.max(32, Math.round(this.state.atmosphere.dust * QUALITY[this.resolvedQuality].dustScale));
    const positions = new Float32Array(requested * 3);
    const phases = new Float32Array(requested);
    const scales = new Float32Array(requested);
    for (let index = 0; index < requested; index += 1) {
      const radius = 2.4 + deterministic(index, 70) * 7.2;
      const angle = deterministic(index, 71) * Math.PI * 2;
      positions[index * 3] = Math.cos(angle) * radius;
      positions[index * 3 + 1] = (deterministic(index, 72) - .5) * 7.5;
      positions[index * 3 + 2] = Math.sin(angle) * radius;
      phases[index] = deterministic(index, 73);
      scales[index] = .4 + deterministic(index, 74) * .8;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute("aScale", new THREE.BufferAttribute(scales, 1));
    const material = new THREE.ShaderMaterial({
      vertexShader: DUST_VERTEX,
      fragmentShader: DUST_FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uPointSize: { value: 3.2 },
        uColor: { value: new THREE.Color(palette.dust) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const dust = new THREE.Points(geometry, material);
    dust.name = "GPU atmospheric points";
    dust.frustumCulled = false;
    this.dust = dust;
    this.dustMaterial = material;
    this.formation.add(dust);
  }

  private updateFormation(time: number): void {
    const t = this.timelineState;
    const structure = this.state.structure;
    const dynamics = this.state.motion.dynamics;
    const requested = Math.round(structure.subdivisions);
    const subdivisions = THREE.MathUtils.clamp(requested, 3, QUALITY[this.resolvedQuality].subdivisionCap);
    const basis = makeBasis(SPAN * structure.scale);
    const cellScale = (1 - structure.fragmentGap) / subdivisions;
    const basisMatrix = new THREE.Matrix4().set(
      basis[0].x * cellScale, basis[1].x * cellScale, basis[2].x * cellScale, 0,
      basis[0].y * cellScale, basis[1].y * cellScale, basis[2].y * cellScale, 0,
      basis[0].z * cellScale, basis[1].z * cellScale, basis[2].z * cellScale, 0,
      0, 0, 0, 1,
    );
    const translation = new THREE.Matrix4();
    const rotation = new THREE.Matrix4();
    const matrix = new THREE.Matrix4();
    this.fragmentSets.forEach((set) => {
      set.wire.count = 0;
      set.wireMaterial.opacity = 0;
      // Matter only supplies a ghosted volume cue. The luminous skeleton must remain
      // the dominant reading even during material hold and fragmentation.
      set.surfaceMaterial.opacity = THREE.MathUtils.clamp(t.surface * (.018 + t.explode * .042) * (1 - dynamics.surfaceFade * t.explode * .55), 0, .065);
      set.surface.visible = set.surfaceMaterial.opacity > .004;
      set.surfaceMaterial.depthWrite = false;
      set.fragments.forEach((fragment) => {
        const delay = this.motionDelay(fragment);
        const assembleRange = Math.max(.05, 1 - dynamics.assembleStagger);
        const explodeRange = Math.max(.05, 1 - dynamics.explodeStagger);
        const localAssemble = smooth01((t.assemble - delay * dynamics.assembleStagger) / assembleRange);
        const localExplode = smooth01((t.explode - delay * dynamics.explodeStagger) / explodeRange);
        const settleOvershoot = Math.sin(THREE.MathUtils.clamp(t.settle, 0, 1) * Math.PI) * dynamics.returnOvershoot * .16;
        fragment.current.copy(fragment.home)
          .addScaledVector(fragment.spawn, (1 - localAssemble) * dynamics.spawnSpread)
          .addScaledVector(fragment.explode, (localExplode - settleOvershoot) * structure.explodeDistance);
        const wobble = Math.sin(time * dynamics.turbulenceSpeed + delay * 18) * localExplode * dynamics.turbulence;
        fragment.current.addScaledVector(fragment.axis, wobble);
        const angle = (localExplode - settleOvershoot) * structure.twist * fragment.rotationSign * (.45 + delay);
        translation.makeTranslation(fragment.current.x, fragment.current.y, fragment.current.z);
        rotation.makeRotationAxis(fragment.axis, angle);
        matrix.copy(translation).multiply(rotation).multiply(basisMatrix);
        set.surface.setMatrixAt(fragment.localIndex, matrix);
      });
      set.surface.instanceMatrix.needsUpdate = true;
    });
    this.updateLuminousNetwork(time);
    if (this.scaffoldMaterial) {
      this.scaffoldMaterial.uniforms.uProgress.value = t.lineProgress;
      this.scaffoldMaterial.uniforms.uOpacity.value = this.state.lines.scaffoldOpacity * (.025 + (1 - t.surface) * .28 + t.explode * .1);
    }
    if (this.connectorMaterial && this.connectors) {
      this.connectorMaterial.opacity = t.connectors * this.state.lines.connectorOpacity;
      const positions = this.connectors.geometry.getAttribute("position") as THREE.BufferAttribute;
      this.connectorFragments.forEach((fragment, index) => {
        positions.setXYZ(index * 2, fragment.home.x, fragment.home.y, fragment.home.z);
        positions.setXYZ(index * 2 + 1, fragment.current.x, fragment.current.y, fragment.current.z);
      });
      positions.needsUpdate = true;
      this.connectors.geometry.computeBoundingSphere();
    }
    this.formation.rotation.y = 0;
    this.formation.position.y = Math.sin(time * dynamics.floatSpeed) * dynamics.floatAmount * t.energy;
  }

  private updateLuminousNetwork(time: number): void {
    if (!this.luminousCore || !this.luminousGlow || !this.luminousHalo) return;
    const t = this.timelineState;
    const luminous = this.state.luminous;
    const start = new THREE.Vector3();
    const end = new THREE.Vector3();
    const offset = new THREE.Vector3();
    const corePositions = this.luminousCore.geometry.getAttribute("position") as THREE.BufferAttribute;
    const glowPositions = this.luminousGlow.geometry.getAttribute("position") as THREE.BufferAttribute;
    const haloPositions = this.luminousHalo.geometry.getAttribute("position") as THREE.BufferAttribute;
    const structuralVisibility = THREE.MathUtils.clamp(.44 + (1 - t.surface) * .56 + t.explode * .3, 0, 1);
    this.luminousSegments.forEach((segment, index) => {
      const reveal = smooth01((t.lineProgress - segment.delay) / Math.max(.035, segment.duration));
      const radians = THREE.MathUtils.degToRad(SCREEN_AXES[segment.solid]);
      offset.set(Math.cos(radians), Math.sin(radians), (segment.solid - 1) * .18)
        .multiplyScalar(t.explode * this.state.structure.explodeDistance * .2);
      start.copy(segment.start).add(offset);
      end.copy(segment.start).lerp(segment.end, reveal).add(offset);
      [corePositions, glowPositions, haloPositions].forEach((positions) => {
        positions.setXYZ(index * 2, start.x, start.y, start.z);
        positions.setXYZ(index * 2 + 1, end.x, end.y, end.z);
      });
    });
    corePositions.needsUpdate = true;
    glowPositions.needsUpdate = true;
    haloPositions.needsUpdate = true;
    if (this.luminousCoreMaterial) this.luminousCoreMaterial.uniforms.uOpacity.value = luminous.lineOpacity * structuralVisibility;
    if (this.luminousGlowMaterial) this.luminousGlowMaterial.uniforms.uOpacity.value = luminous.lineOpacity * structuralVisibility * (.26 + luminous.trailLength * .18);
    if (this.luminousHaloMaterial) this.luminousHaloMaterial.uniforms.uOpacity.value = luminous.lineOpacity * structuralVisibility * (.055 + luminous.trailLength * .055);
    if (this.flareMaterial && this.flareNodes) {
      this.flareMaterial.uniforms.uReveal.value = t.lineProgress;
      this.flareMaterial.uniforms.uPointScale.value = 38 + luminous.haloWidth * 180;
      this.flareMaterial.uniforms.uFlash.value = luminous.flashIntensity / 13 * structuralVisibility;
      this.flareMaterial.uniforms.uStreak.value = luminous.anamorphicStreak;
      const positions = this.flareNodes.geometry.getAttribute("position") as THREE.BufferAttribute;
      this.luminousHotspots.forEach((node, index) => {
        const radians = THREE.MathUtils.degToRad(SCREEN_AXES[node.solid]);
        offset.set(Math.cos(radians), Math.sin(radians), (node.solid - 1) * .18)
          .multiplyScalar(t.explode * this.state.structure.explodeDistance * .2);
        positions.setXYZ(index, node.position.x + offset.x, node.position.y + offset.y, node.position.z + offset.z);
      });
      positions.needsUpdate = true;
    }
    if (this.opticalPass) this.opticalPass.uniforms.uTime.value = time;
  }

  private motionDelay(fragment: Fragment): number {
    if (this.state.motion.order === "center-out") return THREE.MathUtils.clamp(fragment.home.length() / 3.6, 0, 1);
    if (this.state.motion.order === "solid-cascade") return THREE.MathUtils.clamp(fragment.solid * .34 + fragment.delay * .3, 0, 1);
    return fragment.delay;
  }

  private updateCamera(_time: number): void {
    this.pointerSmooth.lerp(this.pointer, .055);
    const camera = this.state.camera;
    const px = this.pointerSmooth.x * camera.parallax * .08;
    const py = this.pointerSmooth.y * camera.parallax * .05;
    this.camera.zoom = 12 / Math.max(6, camera.distance) / (1 + this.timelineState.explode * this.state.motion.dynamics.cameraPullback);
    this.camera.position.set(px, py, -12);
    this.cameraTarget.set(px, .02 + py, 0);
    this.camera.lookAt(this.cameraTarget);
    this.camera.updateProjectionMatrix();
  }

  private applyCameraProjection(): void {
    const aspect = this.state.artboard.width / this.state.artboard.height;
    const baseHeight = 6.7 / Math.max(.2, this.state.artboard.scale);
    const baseWidth = baseHeight * aspect;
    this.camera.left = -baseWidth * .5;
    this.camera.right = baseWidth * .5;
    this.camera.top = baseHeight * .5;
    this.camera.bottom = -baseHeight * .5;
    this.camera.updateProjectionMatrix();
  }

  private applyState(): void {
    const palette = PALETTES[this.state.preset];
    this.scene.background = new THREE.Color(palette.background);
    this.scene.fog = new THREE.FogExp2(palette.fog, this.state.atmosphere.fogDensity);
    this.renderer.toneMappingExposure = this.state.lighting.exposure;
    this.keyLight.intensity = this.state.lighting.key;
    this.rimLight.intensity = this.state.lighting.rim;
    this.ambientLight.intensity = this.state.lighting.ambient;
    this.fillLight.intensity = this.state.lighting.ambient * 1.45;
    this.grazingLight.intensity = this.state.lighting.rim * .82;
    const luminous = this.state.luminous;
    const bloomEnergy = this.state.lighting.bloom * (.72 + this.state.lines.glow * .28);
    const coreWidthScale = THREE.MathUtils.clamp(luminous.coreWidth / .018, .35, 2.1);
    const glowWidthScale = THREE.MathUtils.clamp(luminous.glowWidth / .056, .35, 2.15);
    const haloWidthScale = THREE.MathUtils.clamp(luminous.haloWidth / .11, .35, 2.25);
    this.bloomSharp.strength = (.1 + bloomEnergy * .72) * THREE.MathUtils.lerp(.78, 1.22, coreWidthScale * .36);
    this.bloomSharp.radius = THREE.MathUtils.clamp(.06 + coreWidthScale * .045, .06, .18);
    this.bloomSharp.threshold = Math.min(1.4, luminous.bloomThreshold + .14);
    this.bloom.strength = .08 + bloomEnergy * .88;
    this.bloom.radius = THREE.MathUtils.clamp(luminous.bloomRadius * (.72 + glowWidthScale * .28), .04, 1);
    this.bloom.threshold = luminous.bloomThreshold;
    this.bloomWide.strength = (.035 + bloomEnergy * .42) * THREE.MathUtils.lerp(.72, 1.24, haloWidthScale * .34);
    this.bloomWide.radius = THREE.MathUtils.clamp(.66 + haloWidthScale * .18, .68, 1);
    this.bloomWide.threshold = Math.min(1.6, luminous.bloomThreshold + .26);
    const ultraGlow = this.resolveQuality() === "ultra";
    this.bloomSharp.enabled = ultraGlow;
    this.bloomWide.enabled = ultraGlow;
    this.opticalPass.uniforms.uDispersion.value = luminous.chromaticDispersion;
    this.opticalPass.uniforms.uVignette.value = luminous.vignette;
    this.opticalPass.uniforms.uGrain.value = luminous.grain;
    if (this.luminousCoreMaterial) this.luminousCoreMaterial.uniforms.uIntensity.value = luminous.coreIntensity * THREE.MathUtils.lerp(.82, 1.12, coreWidthScale * .3);
    if (this.luminousGlowMaterial) this.luminousGlowMaterial.uniforms.uIntensity.value = luminous.glowIntensity;
    if (this.luminousHaloMaterial) this.luminousHaloMaterial.uniforms.uIntensity.value = luminous.glowIntensity * .7;
    if (this.flareMaterial) this.flareMaterial.uniforms.uStreak.value = luminous.anamorphicStreak;
    this.smaa.enabled = this.state.performance.postprocessing && this.resolveQuality() !== "performance";
    this.fragmentSets.forEach((set) => {
      set.surfaceMaterial.roughness = this.state.material.roughness;
      set.surfaceMaterial.metalness = this.state.material.metalness;
      set.surfaceMaterial.clearcoat = this.state.material.clearcoat;
      set.surfaceMaterial.bumpScale = this.state.material.bump;
      set.surfaceMaterial.transmission = this.state.material.transmission;
      set.surfaceMaterial.emissiveIntensity = .18 + luminous.glowIntensity * .055;
      set.surfaceMaterial.needsUpdate = true;
    });
    const shadowSize = QUALITY[this.resolveQuality()].shadowSize;
    if (this.keyLight.shadow.mapSize.width !== shadowSize) {
      this.keyLight.shadow.mapSize.set(shadowSize, shadowSize);
      this.keyLight.shadow.map?.dispose();
      this.keyLight.shadow.map = null;
    }
  }

  private resolveQuality(): Exclude<AxisHabitatQuality, "auto"> {
    if (this.state.performance.quality !== "auto") return this.state.performance.quality;
    const cores = navigator.hardwareConcurrency || 4;
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
    if (cores <= 4 || memory <= 4) return "performance";
    if (cores >= 10 && memory >= 8) return "quality";
    return "balanced";
  }

  private applySize(width: number, height: number, dpr: number): void {
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(width, height);
    const physicalWidth = Math.max(1, Math.round(width * dpr));
    const physicalHeight = Math.max(1, Math.round(height * dpr));
    this.bloomSharp.setSize(Math.max(1, Math.round(physicalWidth * .5)), Math.max(1, Math.round(physicalHeight * .5)));
    this.bloom.setSize(Math.max(1, Math.round(physicalWidth * .62)), Math.max(1, Math.round(physicalHeight * .62)));
    this.bloomWide.setSize(Math.max(1, Math.round(physicalWidth * .22)), Math.max(1, Math.round(physicalHeight * .22)));
    const samples = this.state.performance.postprocessing ? QUALITY[this.resolveQuality()].msaaSamples : 0;
    this.setComposerSamples(samples);
  }

  private setComposerSamples(samples: number): void {
    this.composer.renderTarget1.samples = samples;
    this.composer.renderTarget2.samples = samples;
  }

  private adaptResolution(): void {
    if (this.exporting || !this.state.performance.adaptiveDpr || this.frameSamples % 90 !== 0) return;
    let next = this.currentDpr;
    if (this.fps < 42) next = Math.max(.75, this.currentDpr - .12);
    else if (this.fps > 57.5 && this.currentDpr < this.baseDpr) next = Math.min(this.baseDpr, this.currentDpr + .06);
    if (Math.abs(next - this.currentDpr) >= .045) {
      this.currentDpr = next;
      this.applySize(this.width, this.height, this.currentDpr);
    }
  }

  private stageName(): string {
    const p = this.phaseProgress;
    return this.stageRanges.find((range) => p < range.end)?.label ?? "RESETTING";
  }

  private updateBvhHit(clientX: number, clientY: number): void {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      (clientX - rect.left) / Math.max(1, rect.width) * 2 - 1,
      -((clientY - rect.top) / Math.max(1, rect.height) * 2 - 1),
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.bvhProxies, false)[0];
    this.hoveredSolid = hit ? Number(hit.object.userData.solidIndex ?? -1) : -1;
  }

  private onPointerMove = (event: PointerEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(
      (event.clientX - rect.left) / Math.max(1, rect.width) * 2 - 1,
      -((event.clientY - rect.top) / Math.max(1, rect.height) * 2 - 1),
    );
    this.updateBvhHit(event.clientX, event.clientY);
  };

  private onPointerLeave = (): void => {
    this.pointer.set(0, 0);
    this.hoveredSolid = -1;
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    const step = event.shiftKey ? .22 : .1;
    if (event.key === "ArrowLeft") this.pointer.x = Math.max(-1, this.pointer.x - step);
    else if (event.key === "ArrowRight") this.pointer.x = Math.min(1, this.pointer.x + step);
    else if (event.key === "ArrowUp") this.pointer.y = Math.min(1, this.pointer.y + step);
    else if (event.key === "ArrowDown") this.pointer.y = Math.max(-1, this.pointer.y - step);
    else return;
    event.preventDefault();
  };
}
