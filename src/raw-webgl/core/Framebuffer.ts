import { Texture2D } from "./Texture";
import type { ManagedGLResource } from "./ResourceManager";

interface TextureAttachment {
  readonly kind: "texture";
  readonly attachment: number;
  readonly texture: Texture2D;
  readonly level: number;
}

interface RenderbufferAttachment {
  readonly kind: "renderbuffer";
  readonly attachment: number;
  readonly renderbuffer: GLRenderbuffer;
}

type FramebufferAttachment = TextureAttachment | RenderbufferAttachment;

export class FramebufferIncompleteError extends Error {
  public readonly status: number;

  public constructor(label: string, status: number, reason: string) {
    super(`${label} is incomplete: ${reason} (0x${status.toString(16)}).`);
    this.name = "FramebufferIncompleteError";
    this.status = status;
  }
}

export interface GLRenderbufferOptions {
  readonly width: number;
  readonly height: number;
  readonly internalFormat: number;
  readonly samples?: number;
  readonly label?: string;
}

export class GLRenderbuffer implements ManagedGLResource {
  public readonly label: string;
  public readonly restorePriority = 0;
  public width: number;
  public height: number;

  private readonly gl: WebGL2RenderingContext;
  private readonly internalFormat: number;
  private readonly samples: number;
  private renderbuffer: WebGLRenderbuffer | null = null;
  private isDisposed = false;

  public constructor(gl: WebGL2RenderingContext, options: GLRenderbufferOptions) {
    this.gl = gl;
    this.label = options.label ?? "Renderbuffer";
    this.width = options.width;
    this.height = options.height;
    this.internalFormat = options.internalFormat;
    this.samples = Math.max(0, options.samples ?? 0);
    this.validateSize(this.width, this.height);
    this.renderbuffer = this.createHandle();
    this.allocate();
  }

  public get handle(): WebGLRenderbuffer {
    if (!this.renderbuffer || this.isDisposed) throw new Error(`${this.label} is unavailable.`);
    return this.renderbuffer;
  }

  public get disposed(): boolean {
    return this.isDisposed;
  }

  public resize(width: number, height: number): void {
    this.validateSize(width, height);
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.allocate();
  }

  public restore(): void {
    if (this.isDisposed) return;
    this.renderbuffer = this.createHandle();
    this.allocate();
  }

  public dispose(): void {
    if (this.isDisposed) return;
    if (this.renderbuffer) this.gl.deleteRenderbuffer(this.renderbuffer);
    this.renderbuffer = null;
    this.isDisposed = true;
  }

  private allocate(): void {
    this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, this.handle);
    if (this.samples > 0) {
      this.gl.renderbufferStorageMultisample(
        this.gl.RENDERBUFFER,
        this.samples,
        this.internalFormat,
        this.width,
        this.height,
      );
    } else {
      this.gl.renderbufferStorage(
        this.gl.RENDERBUFFER,
        this.internalFormat,
        this.width,
        this.height,
      );
    }
    this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, null);
  }

  private createHandle(): WebGLRenderbuffer {
    const renderbuffer = this.gl.createRenderbuffer();
    if (!renderbuffer) throw new Error(`Unable to allocate ${this.label}.`);
    return renderbuffer;
  }

  private validateSize(width: number, height: number): void {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
      throw new RangeError(`${this.label} dimensions must be positive integers.`);
    }
  }
}

export class Framebuffer implements ManagedGLResource {
  public readonly label: string;
  public readonly restorePriority = 10;

  private readonly gl: WebGL2RenderingContext;
  private framebuffer: WebGLFramebuffer | null = null;
  private readonly attachments = new Map<number, FramebufferAttachment>();
  private drawBufferList: number[] = [];
  private isDisposed = false;

  public constructor(gl: WebGL2RenderingContext, label = "Framebuffer") {
    this.gl = gl;
    this.label = label;
    this.framebuffer = this.createHandle();
  }

  public get handle(): WebGLFramebuffer {
    if (!this.framebuffer || this.isDisposed) throw new Error(`${this.label} is unavailable.`);
    return this.framebuffer;
  }

  public get disposed(): boolean {
    return this.isDisposed;
  }

  public bind(target = this.gl.FRAMEBUFFER): void {
    this.gl.bindFramebuffer(target, this.handle);
  }

  public unbind(target = this.gl.FRAMEBUFFER): void {
    this.gl.bindFramebuffer(target, null);
  }

  public attachColor(index: number, texture: Texture2D, level = 0): void {
    if (!Number.isInteger(index) || index < 0) {
      throw new RangeError("Color attachment index must be a non-negative integer.");
    }
    const attachment = this.gl.COLOR_ATTACHMENT0 + index;
    this.attachments.set(attachment, { kind: "texture", attachment, texture, level });
    if (!this.drawBufferList.includes(attachment)) {
      this.drawBufferList.push(attachment);
      this.drawBufferList.sort((a, b) => a - b);
    }
    this.applyAttachments();
  }

  public attachDepthTexture(texture: Texture2D, level = 0): void {
    const attachment = this.gl.DEPTH_ATTACHMENT;
    this.attachments.set(attachment, { kind: "texture", attachment, texture, level });
    this.applyAttachments();
  }

  public attachRenderbuffer(attachment: number, renderbuffer: GLRenderbuffer): void {
    this.attachments.set(attachment, { kind: "renderbuffer", attachment, renderbuffer });
    this.applyAttachments();
  }

  public assertComplete(): void {
    this.bind();
    const status = this.gl.checkFramebufferStatus(this.gl.FRAMEBUFFER);
    if (status !== this.gl.FRAMEBUFFER_COMPLETE) {
      throw new FramebufferIncompleteError(this.label, status, this.describeStatus(status));
    }
  }

  public restore(): void {
    if (this.isDisposed) return;
    this.framebuffer = this.createHandle();
    this.applyAttachments();
  }

  public dispose(): void {
    if (this.isDisposed) return;
    if (this.framebuffer) this.gl.deleteFramebuffer(this.framebuffer);
    this.framebuffer = null;
    this.attachments.clear();
    this.drawBufferList = [];
    this.isDisposed = true;
  }

  private applyAttachments(): void {
    this.bind();
    for (const descriptor of this.attachments.values()) {
      if (descriptor.kind === "texture") {
        this.gl.framebufferTexture2D(
          this.gl.FRAMEBUFFER,
          descriptor.attachment,
          this.gl.TEXTURE_2D,
          descriptor.texture.handle,
          descriptor.level,
        );
      } else {
        this.gl.framebufferRenderbuffer(
          this.gl.FRAMEBUFFER,
          descriptor.attachment,
          this.gl.RENDERBUFFER,
          descriptor.renderbuffer.handle,
        );
      }
    }
    this.gl.drawBuffers(this.drawBufferList.length > 0 ? this.drawBufferList : [this.gl.NONE]);
    this.assertComplete();
  }

  private createHandle(): WebGLFramebuffer {
    const framebuffer = this.gl.createFramebuffer();
    if (!framebuffer) throw new Error(`Unable to allocate ${this.label}.`);
    return framebuffer;
  }

  private describeStatus(status: number): string {
    switch (status) {
      case this.gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT:
        return "incomplete attachment";
      case this.gl.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT:
        return "missing attachment";
      case this.gl.FRAMEBUFFER_INCOMPLETE_DIMENSIONS:
        return "attachment dimensions do not match";
      case this.gl.FRAMEBUFFER_UNSUPPORTED:
        return "attachment format combination is unsupported";
      case this.gl.FRAMEBUFFER_INCOMPLETE_MULTISAMPLE:
        return "multisample state is inconsistent";
      default:
        return "unknown framebuffer status";
    }
  }
}
