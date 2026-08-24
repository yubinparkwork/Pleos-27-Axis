import {
  dollyCamera,
  orbitCamera,
  panCamera,
  type CameraState,
} from "../math";

export interface OrbitControllerOptions {
  readonly onChange?: () => void;
  readonly rotateSpeed?: number;
  readonly panSpeed?: number;
  readonly zoomSpeed?: number;
}

/** Small pointer controller kept deliberately outside the renderer. */
export class OrbitController {
  private readonly element: HTMLElement;
  private readonly camera: CameraState;
  private readonly onChange: () => void;
  private readonly rotateSpeed: number;
  private readonly panSpeed: number;
  private readonly zoomSpeed: number;
  private pointerId: number | null = null;
  private lastX = 0;
  private lastY = 0;
  private dragging = false;
  private readonly abortController = new AbortController();

  public constructor(
    element: HTMLElement,
    camera: CameraState,
    options: OrbitControllerOptions = {},
  ) {
    this.element = element;
    this.camera = camera;
    this.onChange = options.onChange ?? (() => undefined);
    this.rotateSpeed = options.rotateSpeed ?? 1;
    this.panSpeed = options.panSpeed ?? 1;
    this.zoomSpeed = options.zoomSpeed ?? 0.0015;
    const listenerOptions = { signal: this.abortController.signal };
    element.addEventListener("pointerdown", this.handlePointerDown, listenerOptions);
    element.addEventListener("pointermove", this.handlePointerMove, listenerOptions);
    element.addEventListener("pointerup", this.handlePointerUp, listenerOptions);
    element.addEventListener("pointercancel", this.handlePointerUp, listenerOptions);
    element.addEventListener("wheel", this.handleWheel, { ...listenerOptions, passive: false });
    element.addEventListener("contextmenu", this.handleContextMenu, listenerOptions);
  }

  public dispose(): void {
    this.abortController.abort();
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (this.camera.locked || this.pointerId !== null) return;
    this.pointerId = event.pointerId;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    this.dragging = true;
    this.element.setPointerCapture(event.pointerId);
    this.element.classList.add("is-dragging");
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (!this.dragging || this.pointerId !== event.pointerId || this.camera.locked) return;
    const width = Math.max(1, this.element.clientWidth);
    const height = Math.max(1, this.element.clientHeight);
    const dx = event.clientX - this.lastX;
    const dy = event.clientY - this.lastY;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    if (event.shiftKey || event.button === 2 || (event.buttons & 2) !== 0) {
      panCamera(
        this.camera,
        (-dx / width) * this.panSpeed,
        (dy / height) * this.panSpeed,
        width / height,
      );
    } else {
      orbitCamera(
        this.camera,
        (-dx / width) * Math.PI * this.rotateSpeed,
        (-dy / height) * Math.PI * this.rotateSpeed,
      );
    }
    this.onChange();
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (this.pointerId !== event.pointerId) return;
    if (this.element.hasPointerCapture(event.pointerId)) {
      this.element.releasePointerCapture(event.pointerId);
    }
    this.pointerId = null;
    this.dragging = false;
    this.element.classList.remove("is-dragging");
  };

  private readonly handleWheel = (event: WheelEvent): void => {
    if (this.camera.locked) return;
    event.preventDefault();
    dollyCamera(this.camera, event.deltaY * this.zoomSpeed);
    this.onChange();
  };

  private readonly handleContextMenu = (event: MouseEvent): void => event.preventDefault();
}
