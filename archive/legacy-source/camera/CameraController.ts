import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { CameraSettings } from "../state/threeDStudioState";
import { REFERENCE_ASPECT } from "../geometry/newAxisCoordinates";

export class CameraController {
  readonly orthographic = new THREE.OrthographicCamera(-REFERENCE_ASPECT, REFERENCE_ASPECT, 1, -1, .05, 100);
  readonly perspective = new THREE.PerspectiveCamera(42, REFERENCE_ASPECT, .05, 100);
  private active: THREE.OrthographicCamera | THREE.PerspectiveCamera = this.orthographic;
  private readonly controls: OrbitControls;

  constructor(canvas: HTMLCanvasElement) {
    this.controls = new OrbitControls(this.active, canvas); this.controls.enableDamping = true; this.controls.dampingFactor = .08; this.controls.enabled = true;
  }

  update(settings: CameraSettings, aspect: number, syncPose = true): THREE.Camera {
    const next = settings.mode === "orthographic" ? this.orthographic : this.perspective;
    if (next !== this.active) { this.controls.object = next; this.active = next; syncPose = true; }
    if (syncPose) {
      this.active.position.fromArray(settings.position); this.controls.target.fromArray(settings.target); this.active.rotation.order = "YXZ";
      this.active.lookAt(this.controls.target); this.active.rotateZ(THREE.MathUtils.degToRad(settings.roll));
    }
    this.orthographic.left = -REFERENCE_ASPECT; this.orthographic.right = REFERENCE_ASPECT; this.orthographic.top = 1; this.orthographic.bottom = -1;
    this.orthographic.zoom = settings.zoom; this.orthographic.near = settings.near; this.orthographic.far = settings.far; this.orthographic.updateProjectionMatrix();
    this.perspective.aspect = aspect; this.perspective.fov = settings.fov; this.perspective.zoom = settings.zoom; this.perspective.near = settings.near; this.perspective.far = settings.far; this.perspective.updateProjectionMatrix();
    this.controls.enabled = settings.orbit && !settings.locked; this.controls.enableDamping = settings.damping; this.controls.update(); return this.active;
  }

  tick(): boolean { if (!this.controls.enabled) return false; return this.controls.update(); }
  get camera(): THREE.Camera { return this.active; }
  get position(): [number, number, number] { return this.active.position.toArray() as [number, number, number]; }
  get target(): [number, number, number] { return this.controls.target.toArray() as [number, number, number]; }
  dispose(): void { this.controls.dispose(); }
}
