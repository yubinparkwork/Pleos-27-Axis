export interface AnisotropicFilteringExtension {
  readonly TEXTURE_MAX_ANISOTROPY_EXT: number;
  readonly MAX_TEXTURE_MAX_ANISOTROPY_EXT: number;
}

export interface ParallelShaderCompileExtension {
  readonly COMPLETION_STATUS_KHR: number;
}

export interface DisjointTimerQueryExtension {
  readonly QUERY_COUNTER_BITS_EXT: number;
  readonly TIME_ELAPSED_EXT: number;
  readonly TIMESTAMP_EXT: number;
  readonly GPU_DISJOINT_EXT: number;
}

export interface LoseContextExtension {
  loseContext(): void;
  restoreContext(): void;
}

export interface DebugRendererInfoExtension {
  readonly UNMASKED_VENDOR_WEBGL: number;
  readonly UNMASKED_RENDERER_WEBGL: number;
}

export interface GLExtensions {
  readonly colorBufferFloat: object | null;
  readonly anisotropicFiltering: AnisotropicFilteringExtension | null;
  readonly parallelShaderCompile: ParallelShaderCompileExtension | null;
  readonly disjointTimerQuery: DisjointTimerQueryExtension | null;
  readonly loseContext: LoseContextExtension | null;
  readonly debugRendererInfo: DebugRendererInfoExtension | null;
}

export interface GLCapabilities {
  readonly extensions: GLExtensions;
  readonly floatColorBuffer: boolean;
  readonly hdrColorBuffer: boolean;
  readonly anisotropicFiltering: boolean;
  readonly parallelShaderCompile: boolean;
  readonly timerQuery: boolean;
  readonly contextLossControl: boolean;
  readonly maxTextureSize: number;
  readonly maxRenderbufferSize: number;
  readonly maxSamples: number;
  readonly maxVertexUniformVectors: number;
  readonly maxFragmentUniformVectors: number;
  readonly maxCombinedTextureImageUnits: number;
  readonly maxUniformBufferBindings: number;
  readonly uniformBufferOffsetAlignment: number;
  readonly maxAnisotropy: number;
  readonly vendor: string | null;
  readonly renderer: string | null;
  readonly version: string;
  readonly shadingLanguageVersion: string;
}

function getNumberParameter(gl: WebGL2RenderingContext, parameter: number): number {
  const value: unknown = gl.getParameter(parameter);
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function getStringParameter(gl: WebGL2RenderingContext, parameter: number): string | null {
  const value: unknown = gl.getParameter(parameter);
  return typeof value === "string" ? value : null;
}

function getExtension<T>(gl: WebGL2RenderingContext, name: string): T | null {
  return gl.getExtension(name) as T | null;
}

export function detectGLCapabilities(gl: WebGL2RenderingContext): GLCapabilities {
  const colorBufferFloat = getExtension<object>(gl, "EXT_color_buffer_float");
  const anisotropicFiltering = getExtension<AnisotropicFilteringExtension>(
    gl,
    "EXT_texture_filter_anisotropic",
  );
  const parallelShaderCompile = getExtension<ParallelShaderCompileExtension>(
    gl,
    "KHR_parallel_shader_compile",
  );
  const disjointTimerQuery = getExtension<DisjointTimerQueryExtension>(
    gl,
    "EXT_disjoint_timer_query_webgl2",
  );
  const loseContext = getExtension<LoseContextExtension>(gl, "WEBGL_lose_context");
  const debugRendererInfo = getExtension<DebugRendererInfoExtension>(
    gl,
    "WEBGL_debug_renderer_info",
  );

  const maxAnisotropy = anisotropicFiltering
    ? getNumberParameter(gl, anisotropicFiltering.MAX_TEXTURE_MAX_ANISOTROPY_EXT)
    : 1;

  return {
    extensions: {
      colorBufferFloat,
      anisotropicFiltering,
      parallelShaderCompile,
      disjointTimerQuery,
      loseContext,
      debugRendererInfo,
    },
    floatColorBuffer: colorBufferFloat !== null,
    hdrColorBuffer: colorBufferFloat !== null,
    anisotropicFiltering: anisotropicFiltering !== null,
    parallelShaderCompile: parallelShaderCompile !== null,
    timerQuery: disjointTimerQuery !== null,
    contextLossControl: loseContext !== null,
    maxTextureSize: getNumberParameter(gl, gl.MAX_TEXTURE_SIZE),
    maxRenderbufferSize: getNumberParameter(gl, gl.MAX_RENDERBUFFER_SIZE),
    maxSamples: getNumberParameter(gl, gl.MAX_SAMPLES),
    maxVertexUniformVectors: getNumberParameter(gl, gl.MAX_VERTEX_UNIFORM_VECTORS),
    maxFragmentUniformVectors: getNumberParameter(gl, gl.MAX_FRAGMENT_UNIFORM_VECTORS),
    maxCombinedTextureImageUnits: getNumberParameter(gl, gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS),
    maxUniformBufferBindings: getNumberParameter(gl, gl.MAX_UNIFORM_BUFFER_BINDINGS),
    uniformBufferOffsetAlignment: getNumberParameter(gl, gl.UNIFORM_BUFFER_OFFSET_ALIGNMENT),
    maxAnisotropy: Math.max(1, maxAnisotropy),
    vendor: debugRendererInfo
      ? getStringParameter(gl, debugRendererInfo.UNMASKED_VENDOR_WEBGL)
      : null,
    renderer: debugRendererInfo
      ? getStringParameter(gl, debugRendererInfo.UNMASKED_RENDERER_WEBGL)
      : null,
    version: getStringParameter(gl, gl.VERSION) ?? "WebGL 2",
    shadingLanguageVersion: getStringParameter(gl, gl.SHADING_LANGUAGE_VERSION) ?? "GLSL ES 3.00",
  };
}

export function describeGLCapabilities(capabilities: GLCapabilities): ReadonlyArray<string> {
  return [
    `HDR: ${capabilities.hdrColorBuffer ? "Enabled" : "Disabled (RGBA8 fallback required)"}`,
    `Float Color Buffer: ${capabilities.floatColorBuffer ? "Supported" : "Unsupported"}`,
    `Max Texture Size: ${capabilities.maxTextureSize}`,
    `Max Renderbuffer Size: ${capabilities.maxRenderbufferSize}`,
    `Max Samples: ${capabilities.maxSamples}`,
  ];
}
