import type { RawStudioCommand, RawStudioController } from "../../studio/ui/RawStudioApp";
import type { RawStudioChange, RawStudioState } from "../../studio/state/RawStudioState";
import {
  RawWebGLRenderer,
  type RawRendererStatus,
  type RawWebGLRendererOptions,
} from "./RawWebGLRenderer";

export interface RawStudioRendererControllerOptions {
  readonly initialState: RawStudioState;
  readonly onStatus?: (status: RawRendererStatus) => void;
  readonly onError?: (error: Error) => void;
  readonly onCameraChange?: RawWebGLRendererOptions["onCameraChange"];
}

/** Bridge from the external Studio shell to the production renderer. */
export class RawStudioRendererController implements RawStudioController {
  private renderer: RawWebGLRenderer | null = null;
  private currentState: RawStudioState;

  constructor(private readonly options: RawStudioRendererControllerOptions) {
    this.currentState = structuredClone(options.initialState);
  }

  get instance(): RawWebGLRenderer | null { return this.renderer; }

  mount(stageHost: HTMLElement): void {
    this.renderer?.dispose();
    this.renderer = new RawWebGLRenderer({
      state: this.currentState,
      onStatus: this.options.onStatus,
      onError: this.options.onError,
      onCameraChange: this.options.onCameraChange,
    });
    this.renderer.mount(stageHost);
  }

  update(state: Readonly<RawStudioState>, change: RawStudioChange): void {
    this.currentState = structuredClone(state);
    this.renderer?.updateState(state, change);
  }

  async command(command: RawStudioCommand, state: Readonly<RawStudioState>): Promise<void | RawStudioState> {
    const renderer = this.requireRenderer();
    if (command.type === "export") {
      await renderer.exportPNG();
      return;
    }
    if (command.type === "recompile-shaders") {
      renderer.recompileShaders();
      return;
    }
    const next: RawStudioState = structuredClone(state);
    next.camera = command.type === "fit-camera" ? renderer.fitCamera() : renderer.resetCamera();
    this.currentState = next;
    return next;
  }

  dispose(): void {
    this.renderer?.dispose();
    this.renderer = null;
  }

  private requireRenderer(): RawWebGLRenderer {
    if (!this.renderer) throw new Error("Raw WebGL2 renderer is not mounted.");
    return this.renderer;
  }
}
