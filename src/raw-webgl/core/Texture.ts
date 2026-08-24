import type { ManagedGLResource } from "./ResourceManager";

export interface Texture2DOptions {
  readonly width: number;
  readonly height: number;
  readonly internalFormat: number;
  readonly format: number;
  readonly type: number;
  readonly minFilter?: number;
  readonly magFilter?: number;
  readonly wrapS?: number;
  readonly wrapT?: number;
  readonly mipmaps?: boolean;
  readonly data?: TexturePixelData | null;
  readonly label?: string;
}

export type TexturePixelData =
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array;

function clonePixelData(data: TexturePixelData): TexturePixelData {
  if (data instanceof Int8Array) return new Int8Array(data);
  if (data instanceof Uint8ClampedArray) return new Uint8ClampedArray(data);
  if (data instanceof Uint8Array) return new Uint8Array(data);
  if (data instanceof Int16Array) return new Int16Array(data);
  if (data instanceof Uint16Array) return new Uint16Array(data);
  if (data instanceof Int32Array) return new Int32Array(data);
  if (data instanceof Uint32Array) return new Uint32Array(data);
  return new Float32Array(data);
}

export class Texture2D implements ManagedGLResource {
  public readonly label: string;
  public readonly restorePriority = 0;
  public width: number;
  public height: number;

  private readonly gl: WebGL2RenderingContext;
  private texture: WebGLTexture | null = null;
  private readonly internalFormat: number;
  private readonly format: number;
  private readonly type: number;
  private readonly minFilter: number;
  private readonly magFilter: number;
  private readonly wrapS: number;
  private readonly wrapT: number;
  private readonly mipmaps: boolean;
  private retainedData: TexturePixelData | null;
  private isDisposed = false;

  public constructor(gl: WebGL2RenderingContext, options: Texture2DOptions) {
    this.gl = gl;
    this.label = options.label ?? "Texture2D";
    this.width = options.width;
    this.height = options.height;
    this.internalFormat = options.internalFormat;
    this.format = options.format;
    this.type = options.type;
    this.minFilter = options.minFilter ?? gl.LINEAR;
    this.magFilter = options.magFilter ?? gl.LINEAR;
    this.wrapS = options.wrapS ?? gl.CLAMP_TO_EDGE;
    this.wrapT = options.wrapT ?? gl.CLAMP_TO_EDGE;
    this.mipmaps = options.mipmaps ?? false;
    this.retainedData = options.data ? clonePixelData(options.data) : null;
    this.validateSize(this.width, this.height);
    this.texture = this.createHandle();
    this.allocate(options.data ?? null);
  }

  public get handle(): WebGLTexture {
    if (!this.texture || this.isDisposed) throw new Error(`${this.label} is unavailable.`);
    return this.texture;
  }

  public get disposed(): boolean {
    return this.isDisposed;
  }

  public bind(unit = 0): void {
    this.gl.activeTexture(this.gl.TEXTURE0 + unit);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.handle);
  }

  public resize(width: number, height: number): void {
    this.validateSize(width, height);
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.retainedData = null;
    this.allocate(null);
  }

  public restore(): void {
    if (this.isDisposed) return;
    this.texture = this.createHandle();
    this.allocate(this.retainedData);
  }

  public dispose(): void {
    if (this.isDisposed) return;
    if (this.texture) this.gl.deleteTexture(this.texture);
    this.texture = null;
    this.retainedData = null;
    this.isDisposed = true;
  }

  private allocate(data: TexturePixelData | null): void {
    this.bind();
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.minFilter);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.magFilter);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.wrapS);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.wrapT);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.internalFormat,
      this.width,
      this.height,
      0,
      this.format,
      this.type,
      data,
    );
    if (this.mipmaps) this.gl.generateMipmap(this.gl.TEXTURE_2D);
  }

  private createHandle(): WebGLTexture {
    const texture = this.gl.createTexture();
    if (!texture) throw new Error(`Unable to allocate ${this.label}.`);
    return texture;
  }

  private validateSize(width: number, height: number): void {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
      throw new RangeError(`${this.label} dimensions must be positive integers.`);
    }
  }
}
