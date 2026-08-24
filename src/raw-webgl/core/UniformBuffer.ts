import type { GLBufferData } from "./Buffer";
import { GLBuffer } from "./Buffer";

export interface UniformBufferOptions {
  readonly byteLength: number;
  readonly usage?: number;
  readonly bindingPoint?: number;
  readonly label?: string;
}

export class UniformBuffer extends GLBuffer {
  public readonly bindingPoint: number | null;

  public constructor(gl: WebGL2RenderingContext, options: UniformBufferOptions) {
    super(gl, {
      target: gl.UNIFORM_BUFFER,
      usage: options.usage ?? gl.DYNAMIC_DRAW,
      byteLength: options.byteLength,
      retainDataForRestore: true,
      label: options.label ?? "UniformBuffer",
    });
    this.bindingPoint = options.bindingPoint ?? null;
    if (this.bindingPoint !== null) this.bindBase(this.bindingPoint);
  }

  public bindBase(bindingPoint = this.bindingPoint): void {
    if (bindingPoint === null) {
      throw new Error(`${this.label} has no default uniform-buffer binding point.`);
    }
    this.gl.bindBufferBase(this.gl.UNIFORM_BUFFER, bindingPoint, this.handle);
  }

  public bindRange(bindingPoint: number, byteOffset: number, byteLength: number): void {
    this.gl.bindBufferRange(
      this.gl.UNIFORM_BUFFER,
      bindingPoint,
      this.handle,
      byteOffset,
      byteLength,
    );
  }

  public upload(data: GLBufferData, byteOffset = 0): void {
    this.update(data, byteOffset);
  }

  public override restore(): void {
    super.restore();
    if (this.bindingPoint !== null) this.bindBase(this.bindingPoint);
  }
}
