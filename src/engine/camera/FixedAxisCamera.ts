import * as THREE from "three/webgpu";
import type { RawCameraState } from "../../studio/state/RawStudioState";
import { clampFinite } from "../config/EngineTypes";
import { LockedZoomInteraction } from "../interaction/LockedZoomInteraction";

const BASE_ORTHO_ZOOM = 0.36;
const DESIGN_HEIGHT = 4.28;

export class FixedAxisCamera {
  readonly camera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.01, 80);
  private host: HTMLElement | null = null;
  private state: RawCameraState;
  private readonly interaction: LockedZoomInteraction;

  constructor(initialState: Readonly<RawCameraState>, private readonly onChange?: (camera: RawCameraState) => void) {
    this.state = structuredClone(initialState);
    this.interaction = new LockedZoomInteraction(this.handleZoom);
    this.apply(initialState);
  }

  mount(host: HTMLElement): void {
    this.host = host;
    this.interaction.mount(host);
  }

  apply(next: Readonly<RawCameraState>): void {
    this.state = structuredClone(next);
    this.camera.position.set(next.position[0], next.position[1], next.position[2]);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(next.target[0], next.target[1], next.target[2]);
    this.camera.near = Math.max(0.001, next.near);
    this.camera.far = Math.max(this.camera.near + 1, next.far);
    this.camera.updateProjectionMatrix();
  }

  resize(width: number, height: number): void {
    const aspect = Math.max(width, 1) / Math.max(height, 1);
    const zoom = clampFinite(this.state.orthoZoom / BASE_ORTHO_ZOOM, 0.28, 5);
    const halfHeight = DESIGN_HEIGHT * 0.5 / zoom;
    this.camera.left = -halfHeight * aspect;
    this.camera.right = halfHeight * aspect;
    this.camera.top = halfHeight;
    this.camera.bottom = -halfHeight;
    this.camera.updateProjectionMatrix();
  }

  fit(): RawCameraState {
    const next = structuredClone(this.state);
    next.orthoZoom = BASE_ORTHO_ZOOM;
    this.apply(next);
    this.resize(this.host?.clientWidth ?? 1, this.host?.clientHeight ?? 1);
    return structuredClone(next);
  }

  reset(): RawCameraState {
    return this.fit();
  }

  dispose(): void {
    this.interaction.dispose();
    this.host = null;
  }

  private readonly handleZoom = (multiplier: number): void => {
    const next = structuredClone(this.state);
    next.orthoZoom = clampFinite(next.orthoZoom * multiplier, 0.11, 1.8);
    this.apply(next);
    this.resize(this.host?.clientWidth ?? 1, this.host?.clientHeight ?? 1);
    this.onChange?.(structuredClone(next));
  };
}
