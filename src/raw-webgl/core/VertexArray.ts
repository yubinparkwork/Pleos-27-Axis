import { GLBuffer, IndexBuffer } from "./Buffer";
import type { ManagedGLResource } from "./ResourceManager";

export interface VertexAttributeDescriptor {
  readonly location: number;
  readonly buffer: GLBuffer;
  readonly size: 1 | 2 | 3 | 4;
  readonly type?: number;
  readonly normalized?: boolean;
  readonly stride?: number;
  readonly offset?: number;
  readonly divisor?: number;
  readonly integer?: boolean;
}

export interface VertexArrayOptions {
  readonly attributes?: ReadonlyArray<VertexAttributeDescriptor>;
  readonly indexBuffer?: IndexBuffer | null;
  readonly label?: string;
}

export class VertexArray implements ManagedGLResource {
  public readonly label: string;
  public readonly restorePriority = 10;

  private readonly gl: WebGL2RenderingContext;
  private vertexArray: WebGLVertexArrayObject | null = null;
  private readonly attributes: VertexAttributeDescriptor[] = [];
  private indexBuffer: IndexBuffer | null;
  private isDisposed = false;

  public constructor(gl: WebGL2RenderingContext, options: VertexArrayOptions = {}) {
    this.gl = gl;
    this.label = options.label ?? "VertexArray";
    this.indexBuffer = options.indexBuffer ?? null;
    if (options.attributes) this.attributes.push(...options.attributes);
    this.vertexArray = this.createHandle();
    this.configure();
  }

  public get handle(): WebGLVertexArrayObject {
    if (!this.vertexArray || this.isDisposed) throw new Error(`${this.label} is unavailable.`);
    return this.vertexArray;
  }

  public get disposed(): boolean {
    return this.isDisposed;
  }

  public bind(): void {
    this.gl.bindVertexArray(this.handle);
  }

  public unbind(): void {
    this.gl.bindVertexArray(null);
  }

  public setAttributes(attributes: ReadonlyArray<VertexAttributeDescriptor>): void {
    this.attributes.length = 0;
    this.attributes.push(...attributes);
    this.configure();
  }

  public setIndexBuffer(indexBuffer: IndexBuffer | null): void {
    this.indexBuffer = indexBuffer;
    this.configure();
  }

  public restore(): void {
    if (this.isDisposed) return;
    this.vertexArray = this.createHandle();
    this.configure();
  }

  public dispose(): void {
    if (this.isDisposed) return;
    if (this.vertexArray) this.gl.deleteVertexArray(this.vertexArray);
    this.vertexArray = null;
    this.attributes.length = 0;
    this.indexBuffer = null;
    this.isDisposed = true;
  }

  private configure(): void {
    this.bind();
    for (const attribute of this.attributes) {
      if (attribute.location < 0) continue;
      attribute.buffer.bind();
      this.gl.enableVertexAttribArray(attribute.location);
      if (attribute.integer) {
        if (attribute.type === undefined) {
          throw new Error(`${this.label} integer attribute ${attribute.location} requires an explicit integer type.`);
        }
        this.gl.vertexAttribIPointer(
          attribute.location,
          attribute.size,
          attribute.type,
          attribute.stride ?? 0,
          attribute.offset ?? 0,
        );
      } else {
        this.gl.vertexAttribPointer(
          attribute.location,
          attribute.size,
          attribute.type ?? this.gl.FLOAT,
          attribute.normalized ?? false,
          attribute.stride ?? 0,
          attribute.offset ?? 0,
        );
      }
      if (attribute.divisor !== undefined) {
        this.gl.vertexAttribDivisor(attribute.location, attribute.divisor);
      }
    }
    this.gl.bindBuffer(
      this.gl.ELEMENT_ARRAY_BUFFER,
      this.indexBuffer ? this.indexBuffer.handle : null,
    );
    this.unbind();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
  }

  private createHandle(): WebGLVertexArrayObject {
    const vertexArray = this.gl.createVertexArray();
    if (!vertexArray) throw new Error(`Unable to allocate ${this.label}.`);
    return vertexArray;
  }
}
