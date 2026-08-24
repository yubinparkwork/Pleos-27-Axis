import type { GLCapabilities } from "./GLCapabilities";
import { Framebuffer, GLRenderbuffer } from "./Framebuffer";
import { Texture2D } from "./Texture";
import type { ManagedGLResource } from "./ResourceManager";

export type RenderTargetFormat = "rgba16f" | "rgba8";

export interface RenderTargetOptions {
  readonly width: number;
  readonly height: number;
  readonly hdr?: boolean;
  readonly depth?: boolean;
  readonly label?: string;
}

export interface FramebufferStateBinder {
  bindFramebuffer(framebuffer: WebGLFramebuffer | null): void;
  setViewport(x: number, y: number, width: number, height: number): void;
}

export class RenderTarget implements ManagedGLResource {
  public readonly label: string;
  public readonly restorePriority = 5;
  public readonly colorTexture: Texture2D;
  public readonly framebuffer: Framebuffer;
  public readonly depthBuffer: GLRenderbuffer | null;
  public readonly actualFormat: RenderTargetFormat;
  public readonly hdr: boolean;
  public width: number;
  public height: number;

  private readonly gl: WebGL2RenderingContext;
  private isDisposed = false;

  public constructor(
    gl: WebGL2RenderingContext,
    capabilities: GLCapabilities,
    options: RenderTargetOptions,
  ) {
    this.gl = gl;
    this.label = options.label ?? "RenderTarget";
    this.width = options.width;
    this.height = options.height;
    this.hdr = Boolean(options.hdr && capabilities.hdrColorBuffer);
    this.actualFormat = this.hdr ? "rgba16f" : "rgba8";

    this.colorTexture = new Texture2D(gl, {
      width: this.width,
      height: this.height,
      internalFormat: this.hdr ? gl.RGBA16F : gl.RGBA8,
      format: gl.RGBA,
      type: this.hdr ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE,
      minFilter: gl.LINEAR,
      magFilter: gl.LINEAR,
      label: `${this.label} Color`,
    });
    this.depthBuffer = options.depth === false
      ? null
      : new GLRenderbuffer(gl, {
          width: this.width,
          height: this.height,
          internalFormat: gl.DEPTH_COMPONENT24,
          label: `${this.label} Depth`,
        });
    this.framebuffer = new Framebuffer(gl, `${this.label} Framebuffer`);
    this.framebuffer.attachColor(0, this.colorTexture);
    if (this.depthBuffer) {
      this.framebuffer.attachRenderbuffer(gl.DEPTH_ATTACHMENT, this.depthBuffer);
    }
    this.framebuffer.assertComplete();
  }

  public get disposed(): boolean {
    return this.isDisposed;
  }

  public bind(state?: FramebufferStateBinder): void {
    if (state) {
      state.bindFramebuffer(this.framebuffer.handle);
      state.setViewport(0, 0, this.width, this.height);
    } else {
      this.framebuffer.bind();
      this.gl.viewport(0, 0, this.width, this.height);
    }
  }

  public resize(width: number, height: number): boolean {
    if (width === this.width && height === this.height) return false;
    this.colorTexture.resize(width, height);
    this.depthBuffer?.resize(width, height);
    this.width = width;
    this.height = height;
    this.framebuffer.assertComplete();
    return true;
  }

  public clear(color: readonly [number, number, number, number], depth = 1): void {
    this.bind();
    this.gl.clearColor(color[0], color[1], color[2], color[3]);
    this.gl.clearDepth(depth);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | (this.depthBuffer ? this.gl.DEPTH_BUFFER_BIT : 0));
  }

  public restore(): void {
    if (this.isDisposed) return;
    this.colorTexture.restore();
    this.depthBuffer?.restore();
    this.framebuffer.restore();
    this.framebuffer.assertComplete();
  }

  public dispose(): void {
    if (this.isDisposed) return;
    this.framebuffer.dispose();
    this.depthBuffer?.dispose();
    this.colorTexture.dispose();
    this.isDisposed = true;
  }
}
