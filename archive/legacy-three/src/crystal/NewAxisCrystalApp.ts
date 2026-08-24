import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CrystalAssembly, type CrystalLook } from "./CrystalAssembly";
import { installStudioEnvironment } from "./StudioEnvironment";

export class NewAxisCrystalApp {
  private readonly root: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(32, 1, 0.05, 60);
  private readonly controls: OrbitControls;
  private readonly assembly = new CrystalAssembly();
  private readonly cleanupEnvironment: () => void;
  private readonly resizeObserver: ResizeObserver;
  private animationFrame = 0;
  private look: CrystalLook = "prism";

  constructor(root: HTMLElement) {
    this.root = root;
    this.root.innerHTML = this.template();
    this.stage = this.require<HTMLElement>(".crystal-stage");

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      precision: "highp",
      preserveDrawingBuffer: true,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x050607, 1);
    this.stage.append(this.renderer.domElement);

    this.camera.position.set(0.22, 0.2, 11.2);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.055;
    this.controls.enablePan = false;
    this.controls.minDistance = 7.2;
    this.controls.maxDistance = 16;
    this.controls.minPolarAngle = Math.PI * 0.31;
    this.controls.maxPolarAngle = Math.PI * 0.69;
    this.controls.target.set(0, 0.02, 0);
    this.controls.update();

    this.scene.add(this.assembly);
    this.cleanupEnvironment = installStudioEnvironment(this.scene, this.renderer);
    this.bindUi();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.stage);
    this.resize();
    this.render();
  }

  private template(): string {
    return `
      <section class="crystal-app">
        <div class="crystal-stage" aria-label="Interactive WebGL optical crystal scene"></div>
        <header class="topbar">
          <div class="wordmark"><strong>PLEOS</strong><span>NEW AXIS / OPTICAL STUDY</span></div>
          <div class="render-status">WebGL · physical transmission</div>
        </header>
        <aside class="control-dock" aria-label="Crystal controls">
          <div class="dock-head"><div><h1>Optical crystal</h1><p>Two solids · one shared corner · no line primitive</p></div></div>
          <div class="look-switch" role="group" aria-label="Material look">
            <button data-look="clear">Clear</button>
            <button data-look="prism" class="active">Prism</button>
            <button data-look="smoked">Smoked</button>
          </div>
          <div class="sliders">
            <label>Roughness <output data-output="roughness">0.04</output><input data-control="roughness" aria-label="Roughness" type="range" min="0.02" max="0.28" step="0.01" value="0.04"></label>
            <label>Dispersion <output data-output="dispersion">0.16</output><input data-control="dispersion" aria-label="Dispersion" type="range" min="0" max="0.35" step="0.01" value="0.16"></label>
          </div>
          <div class="dock-actions"><button data-action="reset">Reset view</button><button data-action="export">Save 2800 × 2080</button></div>
        </aside>
        <p class="hint">Drag to orbit · wheel to zoom<br>H hides controls</p>
      </section>`;
  }

  private bindUi(): void {
    this.root.querySelectorAll<HTMLButtonElement>("[data-look]").forEach((button) => {
      button.addEventListener("click", () => this.setLook(button.dataset.look as CrystalLook));
    });
    this.require<HTMLInputElement>("[data-control='roughness']").addEventListener("input", (event) => {
      const value = Number((event.currentTarget as HTMLInputElement).value);
      this.assembly.setRoughness(value);
      this.require<HTMLOutputElement>("[data-output='roughness']").value = value.toFixed(2);
    });
    this.require<HTMLInputElement>("[data-control='dispersion']").addEventListener("input", (event) => {
      const value = Number((event.currentTarget as HTMLInputElement).value);
      this.assembly.setDispersion(value);
      this.require<HTMLOutputElement>("[data-output='dispersion']").value = value.toFixed(2);
    });
    this.require<HTMLButtonElement>("[data-action='reset']").addEventListener("click", () => this.resetCamera());
    this.require<HTMLButtonElement>("[data-action='export']").addEventListener("click", () => void this.exportPng());
    window.addEventListener("keydown", (event) => {
      if (event.key.toLowerCase() === "h") this.root.classList.toggle("controls-hidden");
    });
  }

  setLook(look: CrystalLook): void {
    this.look = look;
    this.assembly.setLook(look);
    this.root.querySelectorAll<HTMLButtonElement>("[data-look]").forEach((button) => button.classList.toggle("active", button.dataset.look === look));
    const preset = look === "clear" ? [0.05, 0.045] : look === "smoked" ? [0.08, 0.055] : [0.04, 0.16];
    const roughness = this.require<HTMLInputElement>("[data-control='roughness']");
    const dispersion = this.require<HTMLInputElement>("[data-control='dispersion']");
    roughness.value = String(preset[0]);
    dispersion.value = String(preset[1]);
    this.require<HTMLOutputElement>("[data-output='roughness']").value = preset[0].toFixed(2);
    this.require<HTMLOutputElement>("[data-output='dispersion']").value = preset[1].toFixed(2);
  }

  private resetCamera(): void {
    this.camera.position.set(0.22, 0.2, 11.2);
    this.controls.target.set(0, 0.02, 0);
    this.controls.update();
  }

  private resize(): void {
    const width = Math.max(1, this.stage.clientWidth);
    const height = Math.max(1, this.stage.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private render = (): void => {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.animationFrame = requestAnimationFrame(this.render);
  };

  async exportPng(): Promise<void> {
    this.root.classList.add("exporting");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const previousRatio = this.renderer.getPixelRatio();
    const previousSize = this.renderer.getSize(new THREE.Vector2());
    const previousAspect = this.camera.aspect;
    try {
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(2800, 2080, false);
      this.camera.aspect = 2800 / 2080;
      this.camera.updateProjectionMatrix();
      this.renderer.render(this.scene, this.camera);
      const blob = await new Promise<Blob>((resolve, reject) => this.renderer.domElement.toBlob((value) => value ? resolve(value) : reject(new Error("PNG encoding failed")), "image/png"));
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `pleos-new-axis-${this.look}-2800x2080.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    } finally {
      this.renderer.setPixelRatio(previousRatio);
      this.renderer.setSize(previousSize.x, previousSize.y, false);
      this.camera.aspect = previousAspect;
      this.camera.updateProjectionMatrix();
      this.root.classList.remove("exporting");
    }
  }

  inspect(): object {
    const context = this.renderer.getContext();
    return {
      renderer: "WebGLRenderer",
      webgl2: this.renderer.capabilities.isWebGL2,
      maxTextureSize: this.renderer.capabilities.maxTextureSize,
      drawingBuffer: [context.drawingBufferWidth, context.drawingBufferHeight],
      toneMapping: "ACESFilmic",
      outputColorSpace: "sRGB",
      look: this.look,
      assembly: this.assembly.inspect(),
    };
  }

  dispose(): void {
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.assembly.dispose();
    this.cleanupEnvironment();
    this.renderer.dispose();
  }

  private require<T extends Element>(selector: string): T {
    const element = this.root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing element: ${selector}`);
    return element;
  }
}
