import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { PLEOS_COLORS } from "../../brand/colors";
import type { AxisMegastructureQuality, AxisMegastructureState } from "./AxisMegastructureState";

interface QualityProfile { dpr: number; panelBudget: number; greebleBudget: number; aoSamples: number; dust: number }
const QUALITY: Record<AxisMegastructureQuality, QualityProfile> = {
  low: { dpr: 1, panelBudget: 720, greebleBudget: 420, aoSamples: 8, dust: 220 },
  medium: { dpr: 1.25, panelBudget: 1400, greebleBudget: 900, aoSamples: 12, dust: 360 },
  high: { dpr: 1.65, panelBudget: 2400, greebleBudget: 1650, aoSamples: 16, dust: 540 },
  ultra: { dpr: 2, panelBudget: 3600, greebleBudget: 2500, aoSamples: 24, dust: 720 },
};

interface SurfaceRegion {
  name: string;
  center: THREE.Vector3;
  u: THREE.Vector3;
  v: THREE.Vector3;
  normal: THREE.Vector3;
  width: number;
  height: number;
  distanceFromAxis: number;
  density: number;
}

interface RectCell { x: number; y: number; width: number; height: number; level: number }

interface SurfaceInstance {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
  birth: number;
  level: number;
  distance: number;
  tone: number;
  recess: number;
  energy: number;
}

interface InstanceLayer {
  mesh: THREE.InstancedMesh;
  records: SurfaceInstance[];
  response: "macro" | "panel" | "greeble" | "circuit" | "cavity";
}

const POST_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uContrast: { value: 1.08 },
    uVignette: { value: .26 },
    uSharpen: { value: .18 },
    uDistanceContrast: { value: .8 },
  },
  vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: `
    uniform sampler2D tDiffuse;uniform vec2 uResolution;uniform float uContrast;uniform float uVignette;uniform float uSharpen;uniform float uDistanceContrast;varying vec2 vUv;
    void main(){
      vec3 color=texture2D(tDiffuse,vUv).rgb;vec2 px=1.0/max(uResolution,vec2(1.));
      vec3 blur=(texture2D(tDiffuse,vUv+vec2(px.x,0.)).rgb+texture2D(tDiffuse,vUv-vec2(px.x,0.)).rgb+texture2D(tDiffuse,vUv+vec2(0.,px.y)).rgb+texture2D(tDiffuse,vUv-vec2(0.,px.y)).rgb)*.25;
      color+=max(color-blur,vec3(0.))*uSharpen;color=(color-.5)*uContrast+.5;
      float depthMood=mix(1.,smoothstep(.02,.88,vUv.y),uDistanceContrast*.04);color*=depthMood;
      float vignette=smoothstep(.79,.28,length((vUv-.5)*vec2(.9,.78)));color*=mix(1.,vignette,uVignette);
      gl_FragColor=vec4(max(color,vec3(0.)),1.);
    }`,
};

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => { value += 0x6d2b79f5; let result = value; result = Math.imul(result ^ result >>> 15, result | 1); result ^= result + Math.imul(result ^ result >>> 7, result | 61); return ((result ^ result >>> 14) >>> 0) / 4294967296; };
}

function smoothstep(a: number, b: number, value: number): number {
  const t = THREE.MathUtils.clamp((value - a) / Math.max(.00001, b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

function cloneState(state: AxisMegastructureState): AxisMegastructureState { return JSON.parse(JSON.stringify(state)) as AxisMegastructureState; }

function basisQuaternion(surface: SurfaceRegion): THREE.Quaternion {
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(surface.u, surface.v, surface.normal));
}

class ComputationalSurfaceMaterial extends THREE.MeshStandardMaterial {
  private readonly uniforms = {
    time: { value: 0 }, density: { value: 1 }, f1: { value: 1.6 }, f2: { value: 4.8 }, f3: { value: 13 }, f4: { value: 34 }, f5: { value: 91 },
    thickness: { value: .038 }, complexity: { value: .86 }, interruption: { value: .42 }, branching: { value: .68 }, nodeChance: { value: .035 },
    brightness: { value: 4.2 }, emissive: { value: .11 }, cyan: { value: .07 }, magenta: { value: .2 }, contrast: { value: .88 },
    bounce: { value: .72 }, cavity: { value: .64 }, axisPosition: { value: new THREE.Vector3(0, -1.35, -80) }, activation: { value: 1 }, baseDarkness: { value: .94 }, roughVariation: { value: .38 }, hierarchy: { value: 0 },
  };

  constructor(parameters: THREE.MeshStandardMaterialParameters) {
    super(parameters);
    this.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, {
        uMegaTime: this.uniforms.time, uMegaDensity: this.uniforms.density,
        uMegaF1: this.uniforms.f1, uMegaF2: this.uniforms.f2, uMegaF3: this.uniforms.f3, uMegaF4: this.uniforms.f4, uMegaF5: this.uniforms.f5,
        uMegaThickness: this.uniforms.thickness, uMegaComplexity: this.uniforms.complexity, uMegaInterruption: this.uniforms.interruption,
        uMegaBranching: this.uniforms.branching, uMegaNodeChance: this.uniforms.nodeChance, uMegaBrightness: this.uniforms.brightness,
        uMegaEmissive: this.uniforms.emissive, uMegaCyan: this.uniforms.cyan, uMegaMagenta: this.uniforms.magenta, uMegaContrast: this.uniforms.contrast,
        uMegaBounce: this.uniforms.bounce, uMegaCavity: this.uniforms.cavity, uMegaAxisPosition: this.uniforms.axisPosition,
        uMegaActivation: this.uniforms.activation, uMegaBaseDarkness: this.uniforms.baseDarkness, uMegaRoughVariation: this.uniforms.roughVariation, uMegaHierarchy: this.uniforms.hierarchy,
      });
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vMegaWorld;varying vec3 vMegaNormal;")
        .replace("#include <defaultnormal_vertex>", "#include <defaultnormal_vertex>\nvMegaNormal=normalize(inverseTransformDirection(transformedNormal,viewMatrix));")
        .replace("#include <project_vertex>", `#include <project_vertex>
          vec4 megaWorldPosition=vec4(transformed,1.);
          #ifdef USE_INSTANCING
            megaWorldPosition=instanceMatrix*megaWorldPosition;
          #endif
          vMegaWorld=(modelMatrix*megaWorldPosition).xyz;
        `);
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>
          varying vec3 vMegaWorld;varying vec3 vMegaNormal;
          uniform float uMegaTime,uMegaDensity,uMegaF1,uMegaF2,uMegaF3,uMegaF4,uMegaF5,uMegaThickness,uMegaComplexity,uMegaInterruption,uMegaBranching,uMegaNodeChance,uMegaBrightness,uMegaEmissive,uMegaCyan,uMegaMagenta,uMegaContrast,uMegaBounce,uMegaCavity,uMegaActivation,uMegaBaseDarkness,uMegaRoughVariation,uMegaHierarchy;uniform vec3 uMegaAxisPosition;
          float megaHash(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
          float megaTrace(vec2 p,float frequency,float salt){
            vec2 q=p*frequency+vec2(salt,salt*.371);vec2 cell=floor(q);vec2 f=fract(q);float h=megaHash(cell+salt);
            float horizontal=1.-smoothstep(uMegaThickness,uMegaThickness*2.25,abs(f.y-(.18+.64*megaHash(cell+salt+4.7))));
            float vertical=1.-smoothstep(uMegaThickness,uMegaThickness*2.25,abs(f.x-(.18+.64*megaHash(cell+salt+9.1))));
            float stepped=mix(horizontal,vertical,step(.5,h));float gate=step(uMegaInterruption*.72,megaHash(cell+floor(f*3.)+salt*2.));
            vec2 edge=min(f,1.-f);float nested=1.-smoothstep(uMegaThickness*.7,uMegaThickness*2.,min(edge.x,edge.y));
            return max(stepped*gate,nested*step(.82-uMegaBranching*.18,megaHash(cell+salt+17.)));
          }
          float megaStack(vec3 world,vec3 normal){
            vec3 weight=pow(abs(normal),vec3(5.));weight/=max(.0001,weight.x+weight.y+weight.z);
            float xy=megaTrace(world.xy,uMegaF1,1.1)+megaTrace(world.xy,uMegaF2,3.7)*.72+megaTrace(world.xy,uMegaF3,7.3)*.5+megaTrace(world.xy,uMegaF4,13.9)*.28+megaTrace(world.xy,uMegaF5,29.1)*.15;
            float xz=megaTrace(world.xz,uMegaF1,2.2)+megaTrace(world.xz,uMegaF2,5.1)*.72+megaTrace(world.xz,uMegaF3,11.7)*.5+megaTrace(world.xz,uMegaF4,19.3)*.28+megaTrace(world.xz,uMegaF5,37.7)*.15;
            float yz=megaTrace(world.yz,uMegaF1,4.4)+megaTrace(world.yz,uMegaF2,8.9)*.72+megaTrace(world.yz,uMegaF3,17.1)*.5+megaTrace(world.yz,uMegaF4,31.7)*.28+megaTrace(world.yz,uMegaF5,61.3)*.15;
            return clamp((xy*weight.z+xz*weight.y+yz*weight.x)*uMegaDensity*.56,0.,1.);
          }
        `)
        .replace("void main() {", "void main() {\nfloat megaSurfacePattern=0.;")
        .replace("#include <map_fragment>", `#include <map_fragment>
          megaSurfacePattern=megaStack(vMegaWorld,normalize(vMegaNormal));
          float megaDark=mix(.18,.62,1.-uMegaBaseDarkness);diffuseColor.rgb*=megaDark+megaSurfacePattern*uMegaContrast*.16;diffuseColor.rgb+=vec3(.016,.011,.021)*uMegaHierarchy;
        `)
        .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
          roughnessFactor=clamp(roughnessFactor+(megaHash(floor(vMegaWorld.xy*uMegaF4))-.5)*uMegaRoughVariation+megaSurfacePattern*.08,.08,.98);
        `)
        .replace("#include <lights_fragment_end>", `#include <lights_fragment_end>
          float megaAxisDistance=length(vMegaWorld.xy-uMegaAxisPosition.xy);float megaBand=pow(.5+.5*sin(vMegaWorld.z*.18+uMegaTime*.24),8.);
          float megaBounceField=exp(-megaAxisDistance*.13)*(.16+megaBand*.84)*uMegaBounce*uMegaCavity;
          vec3 megaBounceColor=mix(vec3(.055,.001,.012),vec3(.045,.008,.08),.38);reflectedLight.indirectDiffuse+=megaBounceColor*megaBounceField;
        `)
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
          float megaRare=step(1.-uMegaEmissive,megaHash(floor(vMegaWorld.xz*uMegaF3)+floor(vMegaWorld.y*uMegaF2)));
          float megaNode=step(1.-uMegaNodeChance,megaHash(floor(vMegaWorld.xy*uMegaF5)+floor(vMegaWorld.z*uMegaF4)));
          float megaPulse=.28+.72*pow(.5+.5*sin(uMegaTime*1.3-vMegaWorld.z*.31),8.);float megaEnergy=(megaSurfacePattern*megaRare+megaNode)*uMegaActivation;
          float megaColorChoice=megaHash(floor(vMegaWorld.yz*uMegaF2)+13.);vec3 megaMagenta=vec3(1.,.012,.075);vec3 megaViolet=vec3(.20,.05,1.);vec3 megaCool=vec3(.72,.9,1.);
          vec3 megaEmissionColor=mix(megaViolet,megaMagenta,step(1.-uMegaMagenta,megaColorChoice));megaEmissionColor=mix(megaEmissionColor,megaCool,step(1.-uMegaCyan,megaColorChoice));
          totalEmissiveRadiance+=megaEmissionColor*megaEnergy*uMegaBrightness*mix(.52,megaPulse,uMegaComplexity);
        `);
    };
    this.customProgramCacheKey = () => "pleos-computational-surface-v2";
  }

  update(time: number, state: AxisMegastructureState, emissionScale: number, hierarchy: number): void {
    const micro = state.micro;
    this.uniforms.time.value = time * state.generation.propagationSpeed;
    this.uniforms.density.value = micro.enabled ? micro.density : 0;
    this.uniforms.f1.value = micro.frequency1; this.uniforms.f2.value = micro.frequency2; this.uniforms.f3.value = micro.frequency3; this.uniforms.f4.value = micro.frequency4; this.uniforms.f5.value = micro.frequency5;
    this.uniforms.thickness.value = micro.lineThickness; this.uniforms.complexity.value = micro.pathComplexity; this.uniforms.interruption.value = micro.pathInterruption;
    this.uniforms.branching.value = micro.branching; this.uniforms.nodeChance.value = micro.nodeProbability; this.uniforms.brightness.value = micro.brightness * emissionScale;
    this.uniforms.emissive.value = micro.emissivePercentage; this.uniforms.cyan.value = micro.cyanPercentage; this.uniforms.magenta.value = micro.magentaPercentage; this.uniforms.contrast.value = micro.surfaceContrast;
    this.uniforms.bounce.value = state.lighting.bounceStrength; this.uniforms.cavity.value = state.lighting.cavityIllumination; this.uniforms.axisPosition.value.set(state.axis.positionX, state.axis.positionY, state.axis.positionZ);
    this.uniforms.activation.value = state.generation.enabled ? state.generation.emissionResponse : 1; this.uniforms.baseDarkness.value = state.material.baseDarkness; this.uniforms.roughVariation.value = state.material.roughnessVariation * (.55 + state.material.normalStrength * .9); this.uniforms.hierarchy.value = hierarchy;
    this.roughness = THREE.MathUtils.clamp(state.material.roughness - state.material.specular * .035, .06, .98); this.metalness = state.material.metalness; this.envMapIntensity = state.material.reflectionStrength * (.45 + state.material.specular * .75); this.needsUpdate = false;
  }
}

export class AxisMegastructureRenderer {
  readonly canvas: HTMLCanvasElement;
  private state: AxisMegastructureState;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(74, 1, .06, 360);
  private readonly composer: EffectComposer;
  private readonly gtao: GTAOPass;
  private readonly bloom: UnrealBloomPass;
  private readonly post: ShaderPass;
  private readonly smaa: SMAAPass;
  private readonly world = new THREE.Group();
  private readonly architecture = new THREE.Group();
  private readonly axisRoot = new THREE.Group();
  private readonly atmosphereRoot = new THREE.Group();
  private readonly instanceLayers: InstanceLayer[] = [];
  private readonly materials: ComputationalSurfaceMaterial[] = [];
  private readonly ambient = new THREE.HemisphereLight(PLEOS_COLORS.darkGray1, PLEOS_COLORS.black, .1);
  private readonly coolRim = new THREE.RectAreaLight(PLEOS_COLORS.blue1, 4, 12, 36);
  private readonly internalLights: THREE.PointLight[] = [];
  private readonly axisReadabilityLights: THREE.RectAreaLight[] = [];
  private readonly pointer = new THREE.Vector2();
  private readonly pointerSmooth = new THREE.Vector2();
  private environmentTarget: THREE.WebGLRenderTarget | null = null;
  private debugField: THREE.Mesh | null = null;
  private axisChannels: THREE.InstancedMesh | null = null;
  private axisSilhouetteMaterial: THREE.MeshStandardMaterial | null = null;
  private buildKey = "";
  private width = 1;
  private height = 1;
  private dpr = 1;
  private fps = 60;
  private lastTime = 0;
  private phase = "MONOLITH";

  constructor(state: AxisMegastructureState) {
    this.state = cloneState(state);
    RectAreaLightUniformsLib.init();
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: "high-performance" });
    this.canvas = this.renderer.domElement; this.canvas.className = "axis-megastructure-canvas"; this.canvas.tabIndex = 0;
    this.canvas.setAttribute("role", "img"); this.canvas.setAttribute("aria-label", "거대한 PLEOS AXIS와 재귀적으로 분할된 연속 계산 구조 협곡");
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; this.renderer.info.autoReset = false;
    this.scene.add(this.world, this.ambient, this.coolRim); this.world.add(this.architecture, this.axisRoot, this.atmosphereRoot);
    this.coolRim.position.set(0, 8, -56); this.coolRim.lookAt(0, -2, -80);
    for (const z of [-14, -58, -112]) {
      const light = new THREE.PointLight(PLEOS_COLORS.red2, 4, 34, 2.1); light.position.set(z === -58 ? 2.4 : -2.1, -2.2, z); this.internalLights.push(light); this.scene.add(light);
    }
    const pmrem = new THREE.PMREMGenerator(this.renderer); this.environmentTarget = pmrem.fromScene(new RoomEnvironment(), .05); this.scene.environment = this.environmentTarget.texture; pmrem.dispose();
    this.composer = new EffectComposer(this.renderer); this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.gtao = new GTAOPass(this.scene, this.camera, 1, 1); this.composer.addPass(this.gtao);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), .36, .18, 1.18); this.composer.addPass(this.bloom);
    this.post = new ShaderPass(POST_SHADER); this.composer.addPass(this.post); this.smaa = new SMAAPass(); this.composer.addPass(this.smaa); this.composer.addPass(new OutputPass());
    this.canvas.addEventListener("pointermove", this.onPointerMove); this.canvas.addEventListener("pointerleave", this.onPointerLeave);
    this.rebuild(); this.applyState();
  }

  setState(state: AxisMegastructureState, rebuild = true): void { this.state = cloneState(state); if (rebuild && this.computeBuildKey() !== this.buildKey) this.rebuild(); this.applyState(); }
  forceRebuild(): void { this.rebuild(); this.applyState(); }

  resize(width: number, height: number): void {
    const profile = QUALITY[this.state.performance.quality]; this.applySize(Math.max(1, width), Math.max(1, height), Math.min(devicePixelRatio || 1, profile.dpr));
  }

  render(time: number, delta = 1 / 60): void {
    const safeDelta = Math.min(.1, Math.max(1 / 240, delta)); this.fps += (Math.min(120, 1 / safeDelta) - this.fps) * .055; this.lastTime = time;
    this.updateScene(time); this.renderer.info.reset(); if (this.state.performance.postprocessing) this.composer.render(); else this.renderer.render(this.scene, this.camera);
  }

  async exportPng(width: number, height: number, time: number): Promise<string> {
    if (width > this.renderer.capabilities.maxTextureSize || height > this.renderer.capabilities.maxTextureSize) throw new Error(`요청 크기 ${width}×${height}px가 GPU 한계를 초과합니다.`);
    const previous = { width: this.width, height: this.height, dpr: this.dpr, time: this.lastTime }; this.applySize(width, height, 1); this.updateScene(time);
    if (this.state.performance.postprocessing) this.composer.render(); else this.renderer.render(this.scene, this.camera);
    const data = this.canvas.toDataURL("image/png"); this.applySize(previous.width, previous.height, previous.dpr); this.updateScene(previous.time); return data;
  }

  inspect(): object {
    const counts = this.instanceLayers.reduce((result, layer) => ({ ...result, [layer.response]: (result[layer.response] ?? 0) + layer.records.length }), {} as Record<string, number>);
    return {
      ready: true, renderer: "Three.js WebGL2 · continuous masses · recursive surface subdivision · five-frequency circuit shader · GTAO · restrained bloom · SMAA",
      seed: this.state.seed, phase: this.phase,
      coverageTarget: "80–95% enclosed architecture", continuity: { regions: 6, floatingDebris: 0, wireframeEdges: 0 },
      hierarchy: { macro: 6, ...counts, proceduralCircuitFrequencies: 5 },
      performance: { quality: this.state.performance.quality, fps: Math.round(this.fps), dpr: this.dpr, drawCalls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles },
      post: { gtao: this.gtao.enabled, bloom: this.bloom.enabled, smaa: this.smaa.enabled },
      debugInfluence: this.state.generation.debugInfluence,
    };
  }

  dispose(): void {
    this.canvas.removeEventListener("pointermove", this.onPointerMove); this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
    this.disposeGroup(this.architecture); this.disposeGroup(this.axisRoot); this.disposeGroup(this.atmosphereRoot); this.internalLights.forEach((light) => light.removeFromParent());
    this.environmentTarget?.dispose(); this.gtao.dispose(); this.bloom.dispose(); this.post.dispose(); this.smaa.dispose(); this.composer.dispose(); this.renderer.dispose();
  }

  private rebuild(): void {
    this.disposeGroup(this.architecture); this.disposeGroup(this.axisRoot); this.disposeGroup(this.atmosphereRoot); this.instanceLayers.length = 0; this.materials.length = 0; this.axisReadabilityLights.length = 0; this.axisChannels = null; this.axisSilhouetteMaterial = null; this.debugField = null;
    const surfaces = this.buildContinuousMasses(); this.buildRecursiveSurfaces(surfaces); this.buildAxis(); this.buildAtmosphere(); this.buildKey = this.computeBuildKey();
  }

  private buildContinuousMasses(): SurfaceRegion[] {
    const state = this.state; const canyonHalf = (3.55 + (1 - state.macro.canyonWidth) * 2.1) / Math.max(.62, state.macro.wallProximity); const span = 226 * state.macro.macroDepth; const cross = 31 * state.macro.macroScale; const thickness = 10 * state.macro.macroScale; const irregularity = state.macro.irregularity;
    const material = this.createSurfaceMaterial("#09070b", .48);
    const geometry = new THREE.BoxGeometry(1, 1, 1); const records: SurfaceInstance[] = [];
    const addMass = (position: THREE.Vector3, scale: THREE.Vector3, tone: number): void => { records.push({ position, scale, quaternion: new THREE.Quaternion(), birth: 0, level: 0, distance: 0, tone, recess: 0, energy: 0 }); };
    addMass(new THREE.Vector3(-canyonHalf - thickness * .5, irregularity * .34, -87 - irregularity * 3.1), new THREE.Vector3(thickness * state.macro.leftMass, cross * (1 + irregularity * .035), span), .12);
    addMass(new THREE.Vector3(canyonHalf + thickness * .5, -irregularity * .42, -87 + irregularity * 4.2), new THREE.Vector3(thickness * state.macro.rightMass, cross * (1 - irregularity * .025), span), .2);
    addMass(new THREE.Vector3(irregularity * .75, canyonHalf + thickness * .5, -87 - irregularity * 2.4), new THREE.Vector3(cross, thickness * state.macro.upperMass, span), .28);
    addMass(new THREE.Vector3(-irregularity * .55, -canyonHalf - thickness * .5, -87 + irregularity * 1.8), new THREE.Vector3(cross, thickness * state.macro.foregroundMass, span), .08);
    addMass(new THREE.Vector3(0, 0, -199), new THREE.Vector3(cross, cross, 10), .34);
    addMass(new THREE.Vector3(-canyonHalf * 1.05, -canyonHalf * .8, 11), new THREE.Vector3(thickness * .86, thickness * .7, 20), .16);
    const mesh = this.createLayer(geometry, material, records, "macro", "Six connected monolithic canyon regions"); mesh.mesh.castShadow = true; mesh.mesh.receiveShadow = true;
    const zCenter = -87; const wallHeight = cross * .96; const wallLength = span * .98;
    return [
      { name: "LEFT WALL", center: new THREE.Vector3(-canyonHalf + .015, irregularity * .34, zCenter - irregularity * 3.1), u: new THREE.Vector3(0, 0, -1), v: new THREE.Vector3(0, 1, 0), normal: new THREE.Vector3(1, 0, 0), width: wallLength, height: wallHeight, distanceFromAxis: canyonHalf, density: state.macro.leftMass * state.macro.density },
      { name: "RIGHT WALL", center: new THREE.Vector3(canyonHalf - .015, -irregularity * .42, zCenter + irregularity * 4.2), u: new THREE.Vector3(0, 0, 1), v: new THREE.Vector3(0, 1, 0), normal: new THREE.Vector3(-1, 0, 0), width: wallLength, height: wallHeight, distanceFromAxis: canyonHalf, density: state.macro.rightMass * state.macro.density },
      { name: "UPPER MASS", center: new THREE.Vector3(irregularity * .75, canyonHalf - .015, zCenter - irregularity * 2.4), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, 1), normal: new THREE.Vector3(0, -1, 0), width: wallHeight, height: wallLength, distanceFromAxis: canyonHalf + 2, density: state.macro.upperMass * state.macro.density },
      { name: "LOWER MASS", center: new THREE.Vector3(-irregularity * .55, -canyonHalf + .015, zCenter + irregularity * 1.8), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, -1), normal: new THREE.Vector3(0, 1, 0), width: wallHeight, height: wallLength, distanceFromAxis: canyonHalf - 1, density: state.macro.foregroundMass * state.macro.density },
      { name: "FAR MASS", center: new THREE.Vector3(0, 0, -193.9), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 1, 0), normal: new THREE.Vector3(0, 0, 1), width: wallHeight, height: wallHeight, distanceFromAxis: 8, density: .86 * state.macro.density },
    ];
  }

  private buildRecursiveSurfaces(surfaces: SurfaceRegion[]): void {
    const state = this.state; const profile = QUALITY[state.performance.quality]; const random = mulberry32(state.seed); const panels: SurfaceInstance[] = []; const cavities: SurfaceInstance[] = []; const greebles: SurfaceInstance[] = []; const circuits: SurfaceInstance[] = []; let activePanelLimit = profile.panelBudget; let activeGreebleLimit = profile.greebleBudget; let activeCircuitLimit = 640;
    const splitRatios = [.15, .25, .33, .4, .6, .67, .75, .85];
    const emitLeaf = (surface: SurfaceRegion, cell: RectCell): void => {
      if (panels.length >= activePanelLimit || random() > state.panels.density * surface.density || random() < state.macro.voidAmount) return;
      const gap = state.subdivision.gap + state.subdivision.inset * (cell.level / Math.max(1, state.subdivision.depth)); const width = Math.max(.025, cell.width - gap * 2); const height = Math.max(.025, cell.height - gap * 2);
      const world = surface.center.clone().addScaledVector(surface.u, cell.x).addScaledVector(surface.v, cell.y); const quaternion = basisQuaternion(surface); const zOrder = THREE.MathUtils.clamp((18 - world.z) / 220, 0, 1); const distanceFactor = THREE.MathUtils.clamp(surface.distanceFromAxis / Math.max(1, state.generation.radius), 0, 1); const influenceDelay = Math.pow(distanceFactor, 1 / Math.max(.08, state.generation.influenceFalloff));
      const clearance = state.axis.width * (.62 + state.axis.visibilityHierarchy * .52); const inAxisBand = Math.abs(world.x - state.axis.positionX) < clearance; const inFarSilhouette = surface.name === "FAR MASS" && inAxisBand && Math.abs(world.y - state.axis.positionY) < state.axis.depth * 1.8; const inAxialCorridor = (surface.name === "UPPER MASS" || surface.name === "LOWER MASS") && inAxisBand;
      if (inFarSilhouette || (inAxialCorridor && random() < THREE.MathUtils.clamp(.24 + state.axis.visibilityHierarchy * .32, .24, .72))) return;
      const birth = THREE.MathUtils.clamp(.04 + zOrder * .46 / Math.max(.2, state.generation.propagationSpeed) + cell.level * .055 * state.generation.recursionResponse + influenceDelay * .14 + random() * state.generation.randomness * .08, .02, .88);
      let extrusion = 0; let recess = 0;
      if (random() < state.panels.extrusionProbability) extrusion = THREE.MathUtils.lerp(state.panels.extrusionMin, state.panels.extrusionMax, random()) * state.panels.depthVariation;
      else if (random() < state.panels.recessProbability) recess = THREE.MathUtils.lerp(state.panels.recessMin, state.panels.recessMax, random());
      const scaleJitter = 1 - state.panels.scaleVariation * (.04 + random() * .14); const panelScale = (recess > 0 ? .78 + random() * .12 : 1) * scaleJitter; const thickness = state.panels.thickness + extrusion;
      cavities.push({ position: world.clone().addScaledVector(surface.normal, .004), quaternion, scale: new THREE.Vector3(width, height, .018), birth, level: cell.level, distance: surface.distanceFromAxis, tone: .02, recess, energy: 0 });
      panels.push({ position: world.clone().addScaledVector(surface.normal, .015 + extrusion * .5), quaternion, scale: new THREE.Vector3(width * panelScale, height * panelScale, Math.max(.025, thickness)), birth: birth + .014, level: cell.level, distance: surface.distanceFromAxis, tone: random(), recess, energy: random() });
      if (state.greeble.enabled) {
        const areaFactor = Math.min(4, Math.sqrt(width * height) * .3); const count = Math.min(7, Math.floor((random() * 2.5 + areaFactor) * state.greeble.density * (distanceFactor * .45 + .7) * (.65 + state.greeble.repetition * .85)));
        for (let index = 0; index < count && greebles.length < activeGreebleLimit; index += 1) {
          const greebleJitter = 1 + (random() - .5) * state.greeble.irregularity * .7; const gw = THREE.MathUtils.lerp(state.greeble.minScale, state.greeble.maxScale, random()) * Math.min(1, width * .42) * greebleJitter; const gh = THREE.MathUtils.lerp(state.greeble.minScale, state.greeble.maxScale, random()) * Math.min(1, height * .42) / Math.max(.65, greebleJitter);
          const gu = (random() - .5) * Math.max(0, width - gw * 2); const gv = (random() - .5) * Math.max(0, height - gh * 2); const gWorld = world.clone().addScaledVector(surface.u, gu).addScaledVector(surface.v, gv).addScaledVector(surface.normal, thickness + state.greeble.height * .5);
          const localRotation = random() < state.greeble.orientationBias ? (random() > .5 ? Math.PI * .5 : 0) : (random() - .5) * Math.PI; const gQuaternion = quaternion.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), localRotation));
          greebles.push({ position: gWorld, quaternion: gQuaternion, scale: new THREE.Vector3(gw, gh, .025 + state.greeble.height * (.35 + random() * .65)), birth: birth + .08 + random() * .12, level: cell.level + 1, distance: surface.distanceFromAxis, tone: random(), recess: random() < state.greeble.recessProbability ? .2 : 0, energy: random() });
        }
      }
      if (random() < state.micro.emissivePercentage * 1.5 && circuits.length < activeCircuitLimit) {
        const horizontal = random() > .46; const cw = horizontal ? width * (.18 + random() * .62) : .012 + state.micro.lineThickness * .2; const ch = horizontal ? .012 + state.micro.lineThickness * .2 : height * (.18 + random() * .62);
        const cWorld = world.clone().addScaledVector(surface.normal, thickness + .025).addScaledVector(surface.u, (random() - .5) * width * .38).addScaledVector(surface.v, (random() - .5) * height * .38);
        circuits.push({ position: cWorld, quaternion, scale: new THREE.Vector3(Math.max(.018, cw), Math.max(.018, ch), .012), birth: birth + .16 + random() * .12, level: cell.level + 2, distance: surface.distanceFromAxis, tone: random(), recess: 0, energy: .65 + random() * .35 });
      }
    };
    const subdivide = (surface: SurfaceRegion, cell: RectCell, limit: number): void => {
      if (panels.length >= activePanelLimit) return;
      const maxSize = Math.max(cell.width, cell.height); const force = maxSize > state.subdivision.maxCellSize * 12; const localProbability = state.subdivision.probability * (.78 + state.subdivision.localDensityVariation * random() * .34);
      if (!state.subdivision.enabled || cell.level >= limit || (!force && random() > localProbability) || Math.min(cell.width, cell.height) < state.subdivision.minCellSize * 1.7) { emitLeaf(surface, cell); return; }
      const aspect = cell.width / Math.max(.001, cell.height); let splitWidth = aspect > 1.65 || (aspect > .65 && random() < state.subdivision.horizontalProbability / Math.max(.001, state.subdivision.horizontalProbability + state.subdivision.verticalProbability)); if (aspect < .58) splitWidth = false;
      const rawRatio = splitRatios[Math.floor(random() * splitRatios.length)]; const ratio = THREE.MathUtils.lerp(.5, rawRatio, state.subdivision.irregularity);
      if (splitWidth) {
        const first = cell.width * ratio; const second = cell.width - first;
        subdivide(surface, { x: cell.x - cell.width * .5 + first * .5, y: cell.y, width: first, height: cell.height, level: cell.level + 1 }, limit);
        subdivide(surface, { x: cell.x + cell.width * .5 - second * .5, y: cell.y, width: second, height: cell.height, level: cell.level + 1 }, limit);
      } else {
        const first = cell.height * ratio; const second = cell.height - first;
        subdivide(surface, { x: cell.x, y: cell.y - cell.height * .5 + first * .5, width: cell.width, height: first, level: cell.level + 1 }, limit);
        subdivide(surface, { x: cell.x, y: cell.y + cell.height * .5 - second * .5, width: cell.width, height: second, level: cell.level + 1 }, limit);
      }
    };
    for (const surface of surfaces) {
      activePanelLimit = Math.min(profile.panelBudget, panels.length + Math.ceil(profile.panelBudget / surfaces.length));
      activeGreebleLimit = Math.min(profile.greebleBudget, greebles.length + Math.ceil(profile.greebleBudget / surfaces.length));
      activeCircuitLimit = Math.min(640, circuits.length + Math.ceil(640 / surfaces.length));
      const longU = surface.width > surface.height; const columns = longU ? 12 : 3; const rows = longU ? 3 : 12; const distanceFactor = THREE.MathUtils.clamp(surface.distanceFromAxis / Math.max(1, state.generation.radius), 0, 1); const limit = Math.max(2, Math.round(state.subdivision.depth * (.62 + distanceFactor * .38)));
      for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
        const width = surface.width / columns; const height = surface.height / rows;
        subdivide(surface, { x: -surface.width * .5 + width * (column + .5), y: -surface.height * .5 + height * (row + .5), width, height, level: 0 }, limit);
      }
    }
    const cavityMaterial = new THREE.MeshStandardMaterial({ color: "#010103", roughness: .9, metalness: .08, vertexColors: true });
    const panelMaterial = this.createSurfaceMaterial("#0b090d", 1); const greebleMaterial = this.createSurfaceMaterial("#0d0a10", .72);
    this.createLayer(new THREE.BoxGeometry(1, 1, 1), cavityMaterial, cavities, "cavity", "Continuous dark recess and gap layer");
    this.createLayer(new THREE.BoxGeometry(1, 1, 1), panelMaterial, panels, "panel", "Recursively subdivided surface panels");
    this.createLayer(new THREE.BoxGeometry(1, 1, 1), greebleMaterial, greebles, "greeble", "Surface-anchored instanced greebles");
    const circuitMaterial = new THREE.MeshBasicMaterial({ color: PLEOS_COLORS.white, vertexColors: true, transparent: true, opacity: .72, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: true });
    this.createLayer(new THREE.BoxGeometry(1, 1, 1), circuitMaterial, circuits, "circuit", "Rare embedded high-energy circuit channels");
  }

  private buildAxis(): void {
    const state = this.state; const axis = state.axis; const group = new THREE.Group(); group.position.set(axis.positionX, axis.positionY, axis.positionZ); group.rotation.set(THREE.MathUtils.degToRad(axis.rotationX), THREE.MathUtils.degToRad(axis.rotationY), THREE.MathUtils.degToRad(axis.rotationZ)); this.axisRoot.add(group);
    const hierarchy = THREE.MathUtils.lerp(.84, 1.18, axis.visibilityHierarchy); const material = this.createSurfaceMaterial("#121017", .52 + axis.surfaceComplexity * .55, axis.visibilityHierarchy); const mass = axis.visualMass * hierarchy; const core = new THREE.Mesh(new THREE.BoxGeometry(axis.width * mass, axis.depth * mass, axis.length), material); core.name = "Monumental continuous PLEOS AXIS backbone"; core.castShadow = true; core.receiveShadow = true; group.add(core);
    const shoulderMaterial = this.createSurfaceMaterial("#100d14", .55, axis.visibilityHierarchy * .72); const shoulders = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), shoulderMaterial, 4); const shoulderTransforms = [
      [-(axis.width * .72), axis.depth * .12, 0, axis.width * .36, axis.depth * .42, axis.length * .96], [axis.width * .72, axis.depth * .12, 0, axis.width * .36, axis.depth * .42, axis.length * .96],
      [0, axis.depth * .62, 0, axis.width * .58, axis.depth * .22, axis.length * .92], [0, -axis.depth * .58, 0, axis.width * .72, axis.depth * .18, axis.length * .9],
    ];
    shoulderTransforms.forEach((values, index) => shoulders.setMatrixAt(index, new THREE.Matrix4().compose(new THREE.Vector3(values[0], values[1], values[2]), new THREE.Quaternion(), new THREE.Vector3(values[3], values[4], values[5])))); shoulders.instanceMatrix.needsUpdate = true; shoulders.castShadow = true; shoulders.receiveShadow = true; shoulders.name = "AXIS parallel structural shoulders"; group.add(shoulders);
    const channelCount = Math.max(1, Math.round(axis.channelCount)); const channelGeometry = new THREE.BoxGeometry(1, 1, 1); const channelMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(PLEOS_COLORS.red2).lerp(new THREE.Color(PLEOS_COLORS.blue3), .26), transparent: true, opacity: .82, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.axisChannels = new THREE.InstancedMesh(channelGeometry, channelMaterial, channelCount); this.axisChannels.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.axisChannels.frustumCulled = false; this.axisChannels.name = "Recessed AXIS energy channels";
    for (let index = 0; index < channelCount; index += 1) {
      const x = (index - (channelCount - 1) * .5) * axis.channelSpacing * axis.width; this.axisChannels.setMatrixAt(index, new THREE.Matrix4().compose(new THREE.Vector3(x, axis.depth * .515, 0), new THREE.Quaternion(), new THREE.Vector3(axis.width * .035, axis.depth * .018, axis.length * .98)));
    }
    this.axisChannels.instanceMatrix.needsUpdate = true; group.add(this.axisChannels);
    this.axisSilhouetteMaterial = new THREE.MeshStandardMaterial({ color: "#1b1620", roughness: .3, metalness: .72, emissive: new THREE.Color(PLEOS_COLORS.blue3).multiplyScalar(.12), emissiveIntensity: .12, toneMapped: true });
    const silhouetteRails = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.axisSilhouetteMaterial, 2); const railX = axis.width * mass * .505;
    silhouetteRails.setMatrixAt(0, new THREE.Matrix4().compose(new THREE.Vector3(-railX, axis.depth * mass * .51, 0), new THREE.Quaternion(), new THREE.Vector3(axis.width * .045, axis.depth * .035, axis.length * .985)));
    silhouetteRails.setMatrixAt(1, new THREE.Matrix4().compose(new THREE.Vector3(railX, axis.depth * mass * .51, 0), new THREE.Quaternion(), new THREE.Vector3(axis.width * .045, axis.depth * .035, axis.length * .985)));
    silhouetteRails.instanceMatrix.needsUpdate = true; silhouetteRails.name = "AXIS silhouette separation rails"; group.add(silhouetteRails);
    const jointCount = Math.max(8, Math.round(8 + axis.surfaceComplexity * 16)); const joints = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), shoulderMaterial.clone(), jointCount); for (let index = 0; index < jointCount; index += 1) {
      const z = -axis.length * .46 + index / (jointCount - 1) * axis.length * .92; joints.setMatrixAt(index, new THREE.Matrix4().compose(new THREE.Vector3(0, 0, z), new THREE.Quaternion(), new THREE.Vector3(axis.width * 1.38, axis.depth * 1.32, .18 + (index % 4) * .08)));
    }
    joints.instanceMatrix.needsUpdate = true; joints.name = "AXIS structural interruptions"; group.add(joints);
    [[.34, PLEOS_COLORS.blue3, .78], [-.28, PLEOS_COLORS.red2, .52]].forEach(([zFactor, color, strength]) => {
      const light = new THREE.RectAreaLight(color as string, Number(strength), axis.width * 3.2, 34); light.position.set(0, axis.depth * 3.4, axis.length * Number(zFactor)); light.lookAt(0, 0, axis.length * (Number(zFactor) - .2)); light.name = "AXIS directional readability light"; this.axisReadabilityLights.push(light); group.add(light);
    });
    this.debugField = new THREE.Mesh(new THREE.CylinderGeometry(axis.width * 2.7, axis.width * 2.7, axis.length, 24, 1, true), new THREE.MeshBasicMaterial({ color: PLEOS_COLORS.blue3, transparent: true, opacity: .08, wireframe: true, depthWrite: false })); this.debugField.rotation.x = Math.PI * .5; this.debugField.visible = state.generation.debugInfluence; this.debugField.name = "DEBUG · AXIS generation influence"; group.add(this.debugField);
  }

  private buildAtmosphere(): void {
    const profile = QUALITY[this.state.performance.quality]; const random = mulberry32(this.state.seed + 731); const positions = new Float32Array(profile.dust * 3); const colors = new Float32Array(profile.dust * 3);
    const magenta = new THREE.Color(PLEOS_COLORS.red2); const violet = new THREE.Color(PLEOS_COLORS.blue3); const cool = new THREE.Color(PLEOS_COLORS.blue1);
    for (let index = 0; index < profile.dust; index += 1) { positions[index * 3] = (random() - .5) * 11; positions[index * 3 + 1] = (random() - .5) * 12; positions[index * 3 + 2] = 16 - random() * 230; const color = magenta.clone().lerp(violet, random()).lerp(cool, random() > .985 ? .8 : 0).multiplyScalar(.08 + random() * .32); color.toArray(colors, index * 3); }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3)); geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3)); const material = new THREE.PointsMaterial({ size: .018, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: .42, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: true });
    const points = new THREE.Points(geometry, material); points.name = "Sparse atmospheric depth cues"; this.atmosphereRoot.add(points);
  }

  private createSurfaceMaterial(color: string, emissionScale: number, hierarchy = 0): ComputationalSurfaceMaterial {
    const material = new ComputationalSurfaceMaterial({ color, roughness: this.state.material.roughness, metalness: this.state.material.metalness, envMapIntensity: this.state.material.reflectionStrength, vertexColors: true }); (material.userData as { emissionScale?: number; hierarchy?: number }).emissionScale = emissionScale; (material.userData as { hierarchy?: number }).hierarchy = hierarchy; this.materials.push(material); return material;
  }

  private createLayer(geometry: THREE.BufferGeometry, material: THREE.Material, records: SurfaceInstance[], response: InstanceLayer["response"], name: string): InstanceLayer {
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, records.length)); mesh.count = records.length; mesh.name = name; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.castShadow = response === "panel" || response === "cavity"; mesh.receiveShadow = response !== "circuit";
    const black = new THREE.Color("#020204"); const surface = new THREE.Color("#121017"); const magenta = new THREE.Color(PLEOS_COLORS.red2); const violet = new THREE.Color(PLEOS_COLORS.blue3); const cyan = new THREE.Color(PLEOS_COLORS.blue1);
    records.forEach((record, index) => { const color = response === "circuit" ? magenta.clone().lerp(violet, .35).lerp(cyan, record.tone > 1 - this.state.micro.cyanPercentage ? .92 : 0).multiplyScalar(.65 + record.energy * 1.8) : black.clone().lerp(surface, .12 + record.tone * .22); mesh.setColorAt(index, color); }); if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.architecture.add(mesh); const layer = { mesh, records, response }; this.instanceLayers.push(layer); return layer;
  }

  private updateScene(time: number): void {
    const generation = this.state.generation; const duration = Math.max(1, generation.duration); const raw = generation.loopEnabled ? ((time % duration) + duration) % duration / duration : THREE.MathUtils.clamp(time / duration, 0, 1); const cycle = Math.pow(raw, 1 / Math.max(.1, generation.activationFrequency)); const object = new THREE.Object3D();
    if (cycle < .12) this.phase = "MONOLITH"; else if (cycle < .34) this.phase = "STRUCTURAL DIVISION"; else if (cycle < .54) this.phase = "NESTED PANELS"; else if (cycle < .72) this.phase = "GREEBLE RESOLUTION"; else if (cycle < .92) this.phase = "CIRCUIT ACTIVATION"; else this.phase = "STABILIZED";
    for (const layer of this.instanceLayers) {
      const response = layer.response === "panel" ? generation.panelResponse : layer.response === "greeble" ? generation.greebleResponse : layer.response === "circuit" ? generation.circuitResponse : generation.recursionResponse;
      layer.records.forEach((record, index) => {
        if (layer.response === "macro") { object.position.copy(record.position); object.quaternion.copy(record.quaternion); object.scale.copy(record.scale); object.updateMatrix(); layer.mesh.setMatrixAt(index, object.matrix); return; }
        const start = generation.enabled ? record.birth / Math.max(.2, generation.activationSpeed) : 0; const reveal = generation.enabled ? smoothstep(start, start + .08 + generation.stagger * .07, cycle) : 1; const fade = generation.loopEnabled ? 1 - smoothstep(.965, 1, cycle) : 1; const resolved = Math.max(.0001, reveal * fade);
        object.position.copy(record.position); object.quaternion.copy(record.quaternion); object.scale.copy(record.scale);
        if (layer.response === "cavity") object.scale.z *= Math.max(.005, resolved * response);
        else { object.scale.x *= .94 + resolved * .06; object.scale.y *= .94 + resolved * .06; object.scale.z *= Math.max(.004, resolved * response); object.position.addScaledVector(new THREE.Vector3(0, 0, 1).applyQuaternion(record.quaternion), record.recess > 0 ? -.01 * (1 - resolved) : 0); }
        object.updateMatrix(); layer.mesh.setMatrixAt(index, object.matrix);
      });
      layer.mesh.instanceMatrix.needsUpdate = true;
      if (layer.response === "circuit") { layer.mesh.visible = this.state.micro.enabled; const material = layer.mesh.material as THREE.MeshBasicMaterial; material.opacity = .26 + smoothstep(.68, .92, cycle) * .62 * generation.emissionResponse; }
    }
    this.materials.forEach((material) => material.update(time, this.state, Number((material.userData as { emissionScale?: number }).emissionScale ?? 1), Number((material.userData as { hierarchy?: number }).hierarchy ?? 0)));
    if (this.axisChannels) { const material = this.axisChannels.material as THREE.MeshBasicMaterial; const pulse = .38 + Math.pow(.5 + .5 * Math.sin(time * generation.propagationSpeed * 2.1), 10) * .62; material.opacity = THREE.MathUtils.clamp(.24 + pulse * this.state.axis.emission * .18, .18, .88); material.color.copy(new THREE.Color(PLEOS_COLORS.red2).lerp(new THREE.Color(PLEOS_COLORS.blue3), .18 + pulse * .24)).multiplyScalar(.65 + this.state.axis.localIllumination * .62); }
    this.internalLights.forEach((light, index) => { const violetMix = index % 2 === 1 ? .72 : .12; light.color.copy(new THREE.Color(PLEOS_COLORS.red2).lerp(new THREE.Color(PLEOS_COLORS.blue3), violetMix)); light.intensity = THREE.MathUtils.lerp(this.state.lighting.magentaInternal, this.state.lighting.violetInternal, violetMix) * this.state.axis.localIllumination * (.72 + Math.sin(time * .31 + index * 1.8) * .12); light.distance = 24 + this.state.lighting.lightFalloff * 9; });
    this.axisReadabilityLights.forEach((light, index) => { light.intensity = this.state.lighting.violetInternal * this.state.axis.localIllumination * this.state.axis.visibilityHierarchy * (index === 0 ? .72 : .42); });
    if (this.axisSilhouetteMaterial) this.axisSilhouetteMaterial.emissiveIntensity = .045 + this.state.axis.visibilityHierarchy * .075 + this.state.axis.emission * .015;
    if (this.debugField) this.debugField.visible = generation.debugInfluence; this.updateCamera(time);
  }

  private updateCamera(time: number): void {
    this.pointerSmooth.lerp(this.pointer, .045); const state = this.state.camera; this.camera.fov = state.fov; this.camera.near = state.near; this.camera.far = state.far;
    this.camera.position.set(state.positionX + Math.sin(time * state.motionSpeed) * state.drift + this.pointerSmooth.x * state.parallax, state.positionY + Math.cos(time * state.motionSpeed * .73) * state.drift * .55 + this.pointerSmooth.y * state.parallax, state.positionZ + Math.sin(time * state.motionSpeed * .37) * state.drift * .2);
    this.camera.up.set(Math.sin(THREE.MathUtils.degToRad(state.roll)), Math.cos(THREE.MathUtils.degToRad(state.roll)), 0); this.camera.lookAt(state.targetX, state.targetY, state.targetZ); this.camera.aspect = this.width / this.height; this.camera.updateProjectionMatrix();
  }

  private applyState(): void {
    const state = this.state; const effectiveFogDensity = state.atmosphere.fogDensity * state.atmosphere.fogFalloff * THREE.MathUtils.clamp(36 / Math.max(4, state.atmosphere.fogStart), .5, 2); this.scene.background = new THREE.Color(PLEOS_COLORS.black); this.scene.fog = state.atmosphere.fogEnabled ? new THREE.FogExp2(new THREE.Color(PLEOS_COLORS.black).lerp(new THREE.Color(PLEOS_COLORS.blue4), state.atmosphere.violetContribution * .22), effectiveFogDensity) : null;
    this.renderer.toneMappingExposure = state.lighting.exposure; this.ambient.intensity = state.lighting.ambientIntensity; this.coolRim.intensity = state.lighting.rimStrength + state.lighting.coolHighlight * .35;
    this.bloom.enabled = state.bloom.enabled && state.performance.postprocessing; this.bloom.threshold = state.bloom.threshold + (1 - state.bloom.softKnee) * .045; this.bloom.strength = state.bloom.strength * (.86 + state.bloom.softKnee * .14); this.bloom.radius = state.bloom.radius + state.bloom.softKnee * .035;
    this.gtao.enabled = state.ao.enabled && state.performance.postprocessing; this.gtao.blendIntensity = state.ao.intensity * state.ao.cavityStrength; this.gtao.updateGtaoMaterial({ radius: state.ao.radius, distanceExponent: state.ao.distanceFalloff, thickness: 1.1, distanceFallOff: state.ao.distanceFalloff, samples: QUALITY[state.performance.quality].aoSamples, screenSpaceRadius: true });
    this.post.enabled = state.performance.postprocessing; this.post.uniforms.uContrast.value = 1.02 + state.micro.surfaceContrast * .12; this.post.uniforms.uVignette.value = .2 + state.atmosphere.fogDarkness * .14; this.post.uniforms.uSharpen.value = .12 + state.material.surfaceMicroVariation * .16; this.post.uniforms.uDistanceContrast.value = state.atmosphere.distanceContrast;
    this.smaa.enabled = state.performance.postprocessing && state.performance.quality !== "low";
  }

  private applySize(width: number, height: number, dpr: number): void { this.width = width; this.height = height; this.dpr = dpr; this.renderer.setPixelRatio(dpr); this.renderer.setSize(width, height, false); this.composer.setPixelRatio(dpr); this.composer.setSize(width, height); this.camera.aspect = width / height; this.camera.updateProjectionMatrix(); this.post.uniforms.uResolution.value.set(width * dpr, height * dpr); }
  private computeBuildKey(): string { return JSON.stringify({ seed: this.state.seed, axis: this.state.axis, macro: this.state.macro, subdivision: this.state.subdivision, panels: this.state.panels, greeble: this.state.greeble, quality: this.state.performance.quality }); }
  private disposeGroup(group: THREE.Group): void { const materials = new Set<THREE.Material>(); group.traverse((object) => { const mesh = object as THREE.Mesh; mesh.geometry?.dispose(); const material = mesh.material; if (Array.isArray(material)) material.forEach((item) => materials.add(item)); else if (material) materials.add(material); }); materials.forEach((material) => material.dispose()); group.clear(); }
  private onPointerMove = (event: PointerEvent): void => { const rect = this.canvas.getBoundingClientRect(); this.pointer.set(((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1, -(((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1)); };
  private onPointerLeave = (): void => { this.pointer.set(0, 0); };
}
