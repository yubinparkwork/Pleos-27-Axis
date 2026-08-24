import type { ManagedGLResource } from "./ResourceManager";

export type GLBufferData = ArrayBuffer | ArrayBufferView;

export interface GLBufferOptions {
  readonly target: number;
  readonly usage?: number;
  readonly data?: GLBufferData;
  readonly byteLength?: number;
  readonly retainDataForRestore?: boolean;
  readonly label?: string;
}

function cloneBytes(data: GLBufferData): Uint8Array {
  if (data instanceof ArrayBuffer) return new Uint8Array(data.slice(0));
  const source = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return new Uint8Array(source);
}

export class GLBuffer implements ManagedGLResource {
  public readonly label: string;
  public readonly restorePriority = 0;
  public readonly target: number;
  public readonly usage: number;

  protected readonly gl: WebGL2RenderingContext;
  protected buffer: WebGLBuffer | null = null;
  protected retainedData: Uint8Array | null = null;
  protected allocatedByteLength = 0;
  protected readonly retainDataForRestore: boolean;
  private isDisposed = false;

  public constructor(gl: WebGL2RenderingContext, options: GLBufferOptions) {
    this.gl = gl;
    this.target = options.target;
    this.usage = options.usage ?? gl.STATIC_DRAW;
    this.label = options.label ?? "GLBuffer";
    this.retainDataForRestore = options.retainDataForRestore ?? true;
    this.buffer = this.createHandle();
    if (options.data) this.setData(options.data);
    else if (options.byteLength !== undefined) this.allocate(options.byteLength);
  }

  public get handle(): WebGLBuffer {
    if (!this.buffer || this.isDisposed) throw new Error(`${this.label} is unavailable.`);
    return this.buffer;
  }

  public get byteLength(): number {
    return this.allocatedByteLength;
  }

  public get disposed(): boolean {
    return this.isDisposed;
  }

  public bind(): void {
    this.gl.bindBuffer(this.target, this.handle);
  }

  public unbind(): void {
    this.gl.bindBuffer(this.target, null);
  }

  public allocate(byteLength: number): void {
    if (!Number.isInteger(byteLength) || byteLength < 0) {
      throw new RangeError(`${this.label} byteLength must be a non-negative integer.`);
    }
    this.bind();
    this.gl.bufferData(this.target, byteLength, this.usage);
    this.allocatedByteLength = byteLength;
    this.retainedData = null;
  }

  public setData(data: GLBufferData): void {
    this.bind();
    this.gl.bufferData(this.target, data, this.usage);
    this.allocatedByteLength = data.byteLength;
    this.retainedData = this.retainDataForRestore ? cloneBytes(data) : null;
  }

  public update(data: GLBufferData, byteOffset = 0): void {
    if (byteOffset < 0 || byteOffset + data.byteLength > this.allocatedByteLength) {
      throw new RangeError(`${this.label} sub-data update exceeds allocated storage.`);
    }
    this.bind();
    this.gl.bufferSubData(this.target, byteOffset, data);
    if (this.retainedData) {
      this.retainedData.set(
        data instanceof ArrayBuffer
          ? new Uint8Array(data)
          : new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
        byteOffset,
      );
    }
  }

  public restore(): void {
    if (this.isDisposed) return;
    this.buffer = this.createHandle();
    this.bind();
    if (this.retainedData) {
      this.gl.bufferData(this.target, this.retainedData, this.usage);
    } else if (this.allocatedByteLength > 0) {
      this.gl.bufferData(this.target, this.allocatedByteLength, this.usage);
    }
  }

  public dispose(): void {
    if (this.isDisposed) return;
    if (this.buffer) this.gl.deleteBuffer(this.buffer);
    this.buffer = null;
    this.retainedData = null;
    this.allocatedByteLength = 0;
    this.isDisposed = true;
  }

  protected createHandle(): WebGLBuffer {
    const buffer = this.gl.createBuffer();
    if (!buffer) throw new Error(`Unable to allocate ${this.label}.`);
    return buffer;
  }
}

export class VertexBuffer extends GLBuffer {
  public constructor(
    gl: WebGL2RenderingContext,
    data: GLBufferData,
    options: Omit<GLBufferOptions, "target" | "data"> = {},
  ) {
    super(gl, { ...options, target: gl.ARRAY_BUFFER, data, label: options.label ?? "VertexBuffer" });
  }
}

export type IndexArray = Uint16Array | Uint32Array;

export class IndexBuffer extends GLBuffer {
  public count: number;
  public indexType: number;

  public constructor(
    gl: WebGL2RenderingContext,
    data: IndexArray,
    options: Omit<GLBufferOptions, "target" | "data"> = {},
  ) {
    super(gl, {
      ...options,
      target: gl.ELEMENT_ARRAY_BUFFER,
      data,
      label: options.label ?? "IndexBuffer",
    });
    this.count = data.length;
    this.indexType = data instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
  }

  public setIndices(data: IndexArray): void {
    this.count = data.length;
    this.indexType = data instanceof Uint32Array ? this.gl.UNSIGNED_INT : this.gl.UNSIGNED_SHORT;
    this.setData(data);
  }
}
