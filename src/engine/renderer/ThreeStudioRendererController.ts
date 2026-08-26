import type { RawStudioCommand, RawStudioController } from "../../studio/ui/RawStudioApp";
import type { RawStudioChange, RawStudioState } from "../../studio/state/RawStudioState";
import { PremiumRenderer, type PremiumRendererOptions } from "./PremiumRenderer";

export interface ThreeStudioRendererControllerOptions extends PremiumRendererOptions {}

export class ThreeStudioRendererController implements RawStudioController {
  private renderer: PremiumRenderer | null = null;
  private currentState: RawStudioState;

  constructor(private readonly options: ThreeStudioRendererControllerOptions) {
    this.currentState = structuredClone(options.state);
  }

  get instance(): PremiumRenderer | null {
    return this.renderer;
  }

  mount(stageHost: HTMLElement): void {
    this.renderer?.dispose();
    this.renderer = new PremiumRenderer({ ...this.options, state: this.currentState });
    this.renderer.mount(stageHost);
  }

  update(state: Readonly<RawStudioState>, change: RawStudioChange): void {
    this.currentState = structuredClone(state);
    this.renderer?.updateState(state, change);
  }

  async command(command: RawStudioCommand, state: Readonly<RawStudioState>): Promise<void | RawStudioState> {
    const renderer = this.requireRenderer();
    if (command.type === "export" || command.type === "recompile-shaders") {
      await renderer.command(command);
      return;
    }
    const next = structuredClone(state) as RawStudioState;
    next.camera = command.type === "fit-camera" ? renderer.fitCamera() : renderer.resetCamera();
    this.currentState = next;
    return next;
  }

  dispose(): void {
    this.renderer?.dispose();
    this.renderer = null;
  }

  private requireRenderer(): PremiumRenderer {
    if (!this.renderer) throw new Error("Three.js 렌더러가 연결되지 않았습니다.");
    return this.renderer;
  }
}
