import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { LightingSettings, LightSettings } from "../state/threeDStudioState";

export class StudioLighting {
  private readonly ambient = new THREE.HemisphereLight(0xffffff, 0x080808, .5);
  private readonly key = new THREE.DirectionalLight(0xffffff, 2);
  private readonly fill = new THREE.DirectionalLight(0xffffff, 1);
  private readonly rim = new THREE.DirectionalLight(0xffffff, 1.5);
  private readonly helpers: THREE.DirectionalLightHelper[];
  private readonly environment: THREE.Texture;
  private helpersRequested = false;
  private exporting = false;

  constructor(private readonly scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    this.key.castShadow = true; this.key.shadow.mapSize.set(1024, 1024); this.key.shadow.camera.near = .1; this.key.shadow.camera.far = 20;
    this.scene.add(this.ambient, this.key, this.fill, this.rim, this.key.target, this.fill.target, this.rim.target);
    this.helpers = [new THREE.DirectionalLightHelper(this.key, .28), new THREE.DirectionalLightHelper(this.fill, .28), new THREE.DirectionalLightHelper(this.rim, .28)]; this.helpers.forEach((helper) => this.scene.add(helper));
    const pmrem = new THREE.PMREMGenerator(renderer); this.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture; pmrem.dispose(); this.scene.environment = this.environment;
  }

  update(settings: LightingSettings, transparent = false): void {
    this.ambient.intensity = settings.ambientIntensity;
    this.apply(this.key, settings.key); this.apply(this.fill, settings.fill); this.apply(this.rim, settings.rim);
    this.helpersRequested = settings.helpers; this.updateHelperVisibility();
    this.scene.environmentIntensity = settings.environmentIntensity; this.scene.environmentRotation.y = THREE.MathUtils.degToRad(settings.environmentRotation);
    this.scene.background = transparent ? null : new THREE.Color().setScalar(settings.backgroundLuminance);
  }

  private apply(light: THREE.DirectionalLight, settings: LightSettings): void {
    light.visible = settings.enabled; light.color.set(settings.color); light.intensity = settings.intensity; light.position.fromArray(settings.position);
    light.castShadow = settings.shadow; light.shadow.bias = settings.shadowBias; light.shadow.radius = settings.softness; light.target.position.fromArray(settings.target);
  }

  setExporting(exporting: boolean): void { this.exporting = exporting; this.updateHelperVisibility(); }

  private updateHelperVisibility(): void { this.helpers.forEach((helper) => { helper.visible = this.helpersRequested && !this.exporting; helper.update(); }); }

  dispose(): void { this.environment.dispose(); this.helpers.forEach((helper) => helper.dispose()); }
}
