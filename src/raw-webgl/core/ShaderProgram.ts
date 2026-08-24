import type { ParallelShaderCompileExtension } from "./GLCapabilities";
import type { ManagedGLResource } from "./ResourceManager";

export interface ShaderProgramOptions {
  readonly vertexSource: string;
  readonly fragmentSource: string;
  readonly label?: string;
  readonly attributeLocations?: Readonly<Record<string, number>>;
  readonly parallelCompileExtension?: ParallelShaderCompileExtension | null;
}

export interface ProgramStateBinder {
  useProgram(program: WebGLProgram | null): void;
}

export type ShaderStageName = "vertex" | "fragment";

export class ShaderCompileError extends Error {
  public readonly stage: ShaderStageName;
  public readonly shaderLabel: string;
  public readonly compilerLog: string;
  public readonly numberedSource: string;

  public constructor(stage: ShaderStageName, label: string, log: string, source: string) {
    const numberedSource = numberShaderSource(source);
    super(`${label} ${stage} shader compilation failed:\n${log}\n\n${numberedSource}`);
    this.name = "ShaderCompileError";
    this.stage = stage;
    this.shaderLabel = label;
    this.compilerLog = log;
    this.numberedSource = numberedSource;
  }
}

export class ShaderLinkError extends Error {
  public readonly programLabel: string;
  public readonly linkerLog: string;

  public constructor(label: string, log: string) {
    super(`${label} program link failed:\n${log}`);
    this.name = "ShaderLinkError";
    this.programLabel = label;
    this.linkerLog = log;
  }
}

export function numberShaderSource(source: string): string {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const width = String(lines.length).length;
  return lines
    .map((line, index) => `${String(index + 1).padStart(width, " ")} | ${line}`)
    .join("\n");
}

export class ShaderProgram implements ManagedGLResource {
  public readonly label: string;
  public readonly restorePriority = 20;

  private readonly gl: WebGL2RenderingContext;
  private readonly vertexSource: string;
  private readonly fragmentSource: string;
  private readonly attributeLocations: Readonly<Record<string, number>>;
  private readonly parallelCompileExtension: ParallelShaderCompileExtension | null;
  private program: WebGLProgram | null = null;
  private readonly uniformLocations = new Map<string, WebGLUniformLocation | null>();
  private readonly attributeLocationCache = new Map<string, number>();
  private isDisposed = false;

  public constructor(gl: WebGL2RenderingContext, options: ShaderProgramOptions) {
    this.gl = gl;
    this.label = options.label ?? "Unnamed";
    this.vertexSource = options.vertexSource;
    this.fragmentSource = options.fragmentSource;
    this.attributeLocations = options.attributeLocations ?? {};
    this.parallelCompileExtension = options.parallelCompileExtension ?? null;
    this.program = this.buildProgram();
  }

  public get handle(): WebGLProgram {
    if (!this.program || this.isDisposed) {
      throw new Error(`${this.label} shader program is unavailable.`);
    }
    return this.program;
  }

  public get disposed(): boolean {
    return this.isDisposed;
  }

  public use(state?: ProgramStateBinder): void {
    if (state) state.useProgram(this.handle);
    else this.gl.useProgram(this.handle);
  }

  public uniform(name: string, required = false): WebGLUniformLocation | null {
    if (!this.uniformLocations.has(name)) {
      this.uniformLocations.set(name, this.gl.getUniformLocation(this.handle, name));
    }
    const location = this.uniformLocations.get(name) ?? null;
    if (required && location === null) {
      throw new Error(`Required uniform '${name}' is inactive or missing in ${this.label}.`);
    }
    return location;
  }

  public attribute(name: string, required = false): number {
    if (!this.attributeLocationCache.has(name)) {
      this.attributeLocationCache.set(name, this.gl.getAttribLocation(this.handle, name));
    }
    const location = this.attributeLocationCache.get(name) ?? -1;
    if (required && location < 0) {
      throw new Error(`Required attribute '${name}' is inactive or missing in ${this.label}.`);
    }
    return location;
  }

  public bindUniformBlock(blockName: string, bindingPoint: number, required = false): number {
    const blockIndex = this.gl.getUniformBlockIndex(this.handle, blockName);
    if (blockIndex === this.gl.INVALID_INDEX) {
      if (required) {
        throw new Error(`Required uniform block '${blockName}' is missing in ${this.label}.`);
      }
      return -1;
    }
    this.gl.uniformBlockBinding(this.handle, blockIndex, bindingPoint);
    return blockIndex;
  }

  public isLinkComplete(): boolean {
    if (!this.parallelCompileExtension) return true;
    return Boolean(
      this.gl.getProgramParameter(
        this.handle,
        this.parallelCompileExtension.COMPLETION_STATUS_KHR,
      ),
    );
  }

  public async waitForLink(): Promise<void> {
    while (!this.isLinkComplete()) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    this.assertLinked(this.handle);
  }

  public restore(): void {
    if (this.isDisposed) return;
    this.program = this.buildProgram();
    this.uniformLocations.clear();
    this.attributeLocationCache.clear();
  }

  public dispose(): void {
    if (this.isDisposed) return;
    if (this.program) this.gl.deleteProgram(this.program);
    this.program = null;
    this.uniformLocations.clear();
    this.attributeLocationCache.clear();
    this.isDisposed = true;
  }

  private buildProgram(): WebGLProgram {
    const vertexShader = this.compileShader(this.gl.VERTEX_SHADER, "vertex", this.vertexSource);
    const fragmentShader = this.compileShader(
      this.gl.FRAGMENT_SHADER,
      "fragment",
      this.fragmentSource,
    );
    const program = this.gl.createProgram();
    if (!program) {
      this.gl.deleteShader(vertexShader);
      this.gl.deleteShader(fragmentShader);
      throw new Error(`Unable to allocate ${this.label} WebGLProgram.`);
    }

    this.gl.attachShader(program, vertexShader);
    this.gl.attachShader(program, fragmentShader);
    for (const [name, location] of Object.entries(this.attributeLocations)) {
      this.gl.bindAttribLocation(program, location, name);
    }
    this.gl.linkProgram(program);
    this.gl.detachShader(program, vertexShader);
    this.gl.detachShader(program, fragmentShader);
    this.gl.deleteShader(vertexShader);
    this.gl.deleteShader(fragmentShader);

    try {
      this.assertLinked(program);
      return program;
    } catch (error) {
      this.gl.deleteProgram(program);
      throw error;
    }
  }

  private compileShader(type: number, stage: ShaderStageName, source: string): WebGLShader {
    const shader = this.gl.createShader(type);
    if (!shader) throw new Error(`Unable to allocate ${this.label} ${stage} WebGLShader.`);
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      const log = this.gl.getShaderInfoLog(shader) || "No compiler log was provided.";
      this.gl.deleteShader(shader);
      throw new ShaderCompileError(stage, this.label, log, source);
    }
    return shader;
  }

  private assertLinked(program: WebGLProgram): void {
    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      const log = this.gl.getProgramInfoLog(program) || "No linker log was provided.";
      throw new ShaderLinkError(this.label, log);
    }
  }
}
