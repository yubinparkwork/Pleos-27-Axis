import { detectGLCapabilities, type GLCapabilities } from "./GLCapabilities";

export type GPURequestMode = "high-performance-requested" | "compatibility";

export interface GLContextStatus {
  readonly renderer: "Raw WebGL2";
  readonly gpuRequestMode: GPURequestMode;
  readonly contextLost: boolean;
  readonly drawingBufferWidth: number;
  readonly drawingBufferHeight: number;
  readonly capabilities: GLCapabilities;
}

export interface GLContextEventCallbacks {
  readonly onContextLost?: (event: WebGLContextEvent) => void;
  readonly onContextRestored?: (gl: WebGL2RenderingContext, capabilities: GLCapabilities) => void;
  readonly onContextCreationError?: (message: string, event: WebGLContextEvent) => void;
}

export interface GLContextOptions extends GLContextEventCallbacks {
  readonly primaryAttributes?: WebGLContextAttributes;
}

export const PRIMARY_WEBGL2_ATTRIBUTES: Readonly<WebGLContextAttributes> = Object.freeze({
  alpha: false,
  antialias: false,
  depth: true,
  stencil: false,
  premultipliedAlpha: false,
  preserveDrawingBuffer: false,
  powerPreference: "high-performance",
  failIfMajorPerformanceCaveat: true,
});

export class WebGL2UnavailableError extends Error {
  public constructor(message = "WebGL2 is unavailable on this browser or GPU.") {
    super(message);
    this.name = "WebGL2UnavailableError";
  }
}

type LostListener = (event: WebGLContextEvent) => void;
type RestoredListener = (gl: WebGL2RenderingContext, capabilities: GLCapabilities) => void;
type CreationErrorListener = (message: string, event: WebGLContextEvent) => void;

export class GLContext {
  public readonly canvas: HTMLCanvasElement;
  public readonly gl: WebGL2RenderingContext;
  public readonly gpuRequestMode: GPURequestMode;
  public capabilities: GLCapabilities;

  private lost = false;
  private disposed = false;
  private readonly lostListeners = new Set<LostListener>();
  private readonly restoredListeners = new Set<RestoredListener>();
  private readonly creationErrorListeners = new Set<CreationErrorListener>();
  private readonly creationErrors: string[] = [];

  public constructor(canvas: HTMLCanvasElement, options: GLContextOptions = {}) {
    this.canvas = canvas;

    if (options.onContextLost) this.lostListeners.add(options.onContextLost);
    if (options.onContextRestored) this.restoredListeners.add(options.onContextRestored);
    if (options.onContextCreationError) {
      this.creationErrorListeners.add(options.onContextCreationError);
    }

    canvas.addEventListener("webglcontextlost", this.handleContextLost);
    canvas.addEventListener("webglcontextrestored", this.handleContextRestored);
    canvas.addEventListener("webglcontextcreationerror", this.handleContextCreationError);

    const primaryAttributes: WebGLContextAttributes = {
      ...PRIMARY_WEBGL2_ATTRIBUTES,
      ...options.primaryAttributes,
      powerPreference: "high-performance",
      failIfMajorPerformanceCaveat: true,
    };

    let gl = canvas.getContext("webgl2", primaryAttributes);
    let gpuRequestMode: GPURequestMode = "high-performance-requested";

    if (!gl) {
      gl = canvas.getContext("webgl2", {
        ...primaryAttributes,
        failIfMajorPerformanceCaveat: false,
      });
      gpuRequestMode = "compatibility";
    }

    if (!gl) {
      this.removeDOMListeners();
      const detail = this.creationErrors.at(-1);
      throw new WebGL2UnavailableError(
        detail ? `WebGL2 context creation failed: ${detail}` : undefined,
      );
    }

    this.gl = gl;
    this.gpuRequestMode = gpuRequestMode;
    this.capabilities = detectGLCapabilities(gl);
  }

  public get isContextLost(): boolean {
    return this.lost || this.gl.isContextLost();
  }

  public get status(): GLContextStatus {
    return {
      renderer: "Raw WebGL2",
      gpuRequestMode: this.gpuRequestMode,
      contextLost: this.isContextLost,
      drawingBufferWidth: this.gl.drawingBufferWidth,
      drawingBufferHeight: this.gl.drawingBufferHeight,
      capabilities: this.capabilities,
    };
  }

  public onContextLost(listener: LostListener): () => void {
    this.lostListeners.add(listener);
    return () => this.lostListeners.delete(listener);
  }

  public onContextRestored(listener: RestoredListener): () => void {
    this.restoredListeners.add(listener);
    return () => this.restoredListeners.delete(listener);
  }

  public onContextCreationError(listener: CreationErrorListener): () => void {
    this.creationErrorListeners.add(listener);
    return () => this.creationErrorListeners.delete(listener);
  }

  public resizeDrawingBuffer(
    cssWidth: number,
    cssHeight: number,
    devicePixelRatio = window.devicePixelRatio || 1,
    qualityLimit = 2,
  ): boolean {
    const safeDpr = Math.max(0.25, Math.min(devicePixelRatio, qualityLimit));
    const width = Math.max(1, Math.round(cssWidth * safeDpr));
    const height = Math.max(1, Math.round(cssHeight * safeDpr));
    if (this.canvas.width === width && this.canvas.height === height) return false;
    this.canvas.width = width;
    this.canvas.height = height;
    return true;
  }

  public forceContextLoss(): boolean {
    const extension = this.capabilities.extensions.loseContext;
    if (!extension) return false;
    extension.loseContext();
    return true;
  }

  public requestContextRestore(): boolean {
    const extension = this.capabilities.extensions.loseContext;
    if (!extension) return false;
    extension.restoreContext();
    return true;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.removeDOMListeners();
    this.lostListeners.clear();
    this.restoredListeners.clear();
    this.creationErrorListeners.clear();
  }

  private readonly handleContextLost = (event: Event): void => {
    const contextEvent = event as WebGLContextEvent;
    contextEvent.preventDefault();
    this.lost = true;
    for (const listener of this.lostListeners) listener(contextEvent);
  };

  private readonly handleContextRestored = (): void => {
    this.lost = false;
    this.capabilities = detectGLCapabilities(this.gl);
    for (const listener of this.restoredListeners) {
      listener(this.gl, this.capabilities);
    }
  };

  private readonly handleContextCreationError = (event: Event): void => {
    const contextEvent = event as WebGLContextEvent;
    const message = contextEvent.statusMessage || "Unknown WebGL context creation error";
    this.creationErrors.push(message);
    for (const listener of this.creationErrorListeners) listener(message, contextEvent);
  };

  private removeDOMListeners(): void {
    this.canvas.removeEventListener("webglcontextlost", this.handleContextLost);
    this.canvas.removeEventListener("webglcontextrestored", this.handleContextRestored);
    this.canvas.removeEventListener("webglcontextcreationerror", this.handleContextCreationError);
  }
}
