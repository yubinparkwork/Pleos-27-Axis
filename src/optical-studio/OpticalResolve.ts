const vertexSource = `#version 300 es
out vec2 vUv;
void main() {
  vec2 position = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = position;
  gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
}`;

const encodingSource = `
uniform bool uPacked;
vec3 decodeRadiance(vec3 value) {
  return uPacked ? value / max(vec3(1.0) - value, vec3(1.0 / 255.0)) : max(value, vec3(0.0));
}
vec3 encodeRadiance(vec3 value) {
  return uPacked ? value / (vec3(1.0) + value) : value;
}
`;

const averageSource = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSource;
uniform vec2 uSourceSize;
uniform int uSampleScale;
layout(location = 0) out vec4 outColor;
` + encodingSource + `
void main() {
  vec3 sum = vec3(0.0);
  vec2 base = floor(gl_FragCoord.xy) * float(uSampleScale);
  for (int y = 0; y < 4; ++y) for (int x = 0; x < 4; ++x) {
    if (x >= uSampleScale || y >= uSampleScale) continue;
    vec2 uv = (base + vec2(float(x) + 0.5, float(y) + 0.5)) / uSourceSize;
    sum += decodeRadiance(texture(uSource, uv).rgb);
  }
  // Supersamples are averaged in linear light, never as tone-mapped sRGB.
  outColor = vec4(encodeRadiance(sum / float(uSampleScale * uSampleScale)), 1.0);
}`;

const blurSource = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSource;
uniform vec2 uDirection;
uniform bool uExtract;
layout(location = 0) out vec4 outColor;
` + encodingSource + `
void main() {
  vec3 radiance = vec3(0.0);
  float normalization = 0.0;
  // Finite support is a tile-export contract: 12 logical pixels per axis.
  // Only measured highlight radiance scatters, not the complete glass image.
  for (int index = -12; index <= 12; ++index) {
    float offset = float(index);
    float weight = exp(-0.5 * offset * offset / 16.0);
    vec3 sampleColor = decodeRadiance(texture(uSource, vUv + uDirection * offset).rgb);
    if (uExtract) {
      float peak = max(sampleColor.r, max(sampleColor.g, sampleColor.b));
      float knee = smoothstep(0.6, 1.2, peak);
      sampleColor *= knee * max(peak - 0.6, 0.0) / max(peak, 1e-6);
    }
    radiance += sampleColor * weight;
    normalization += weight;
  }
  outColor = vec4(encodeRadiance(radiance / normalization), 1.0);
}`;

const fragmentSource = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSource;
uniform sampler2D uBloomSource;
uniform vec2 uTexelSize;
uniform float uBloom;
layout(location = 0) out vec4 outColor;
` + encodingSource + `
vec3 displayAt(vec2 uv) {
  vec3 radiance = decodeRadiance(texture(uSource, uv).rgb);
  if (uBloom > 0.0) radiance += decodeRadiance(texture(uBloomSource, uv).rgb) * uBloom;
  // A smooth photographic shoulder, applied only after HDR accumulation and
  // supersampling, leaves a broad transition between pink light and white core.
  // There is no ambient fill, object emission, or additive display-space paint.
  vec3 color = radiance * (2.51 * radiance + 0.03) / (radiance * (2.43 * radiance + 0.59) + 0.14);
  color = clamp(color, 0.0, 1.0);
  return mix(color * 12.92, 1.055 * pow(color, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), color));
}
float luma(vec3 color) {
  return max(color.r, max(color.g, color.b));
}
void main() {
  vec3 center = displayAt(vUv);
  vec3 nw = displayAt(vUv + vec2(-1.0, 1.0) * uTexelSize);
  vec3 ne = displayAt(vUv + vec2(1.0, 1.0) * uTexelSize);
  vec3 sw = displayAt(vUv + vec2(-1.0, -1.0) * uTexelSize);
  vec3 se = displayAt(vUv + vec2(1.0, -1.0) * uTexelSize);
  vec3 north = displayAt(vUv + vec2(0.0, 1.0) * uTexelSize);
  vec3 south = displayAt(vUv - vec2(0.0, 1.0) * uTexelSize);
  vec3 east = displayAt(vUv + vec2(1.0, 0.0) * uTexelSize);
  vec3 west = displayAt(vUv - vec2(1.0, 0.0) * uTexelSize);
  float lm = luma(center);
  float lnw = luma(nw), lne = luma(ne), lsw = luma(sw), lse = luma(se);
  float minimum = min(lm, min(min(lnw, lne), min(lsw, lse)));
  float maximum = max(lm, max(max(lnw, lne), max(lsw, lse)));
  if (maximum - minimum < max(0.0312, maximum * 0.125)) {
    outColor = vec4(center, 1.0);
    return;
  }
  vec2 direction = vec2(-((lnw + lne) - (lsw + lse)), (lnw + lsw) - (lne + lse));
  float reduction = max((lnw + lne + lsw + lse) * (0.25 * 0.125), 1.0 / 128.0);
  float reciprocal = 1.0 / (min(abs(direction.x), abs(direction.y)) + reduction);
  // FXAA remains bounded to one resolved texel, with no temporal history.
  direction = clamp(direction * reciprocal, vec2(-2.0), vec2(2.0)) * uTexelSize;
  vec3 candidateA = 0.5 * (displayAt(vUv + direction * (-1.0 / 6.0)) + displayAt(vUv + direction * (1.0 / 6.0)));
  vec3 candidateB = candidateA * 0.5 + 0.25 * (displayAt(vUv - direction * 0.5) + displayAt(vUv + direction * 0.5));
  float candidateLuma = luma(candidateB);
  vec3 resolved = candidateLuma < minimum || candidateLuma > maximum ? candidateA : candidateB;
  vec3 neighbours = (2.0 * (north + south + east + west) + nw + ne + sw + se) / 12.0;
  float subpixel = clamp(abs(luma(neighbours) - lm) / max(maximum - minimum, 1e-5), 0.0, 1.0);
  subpixel = smoothstep(0.12, 0.75, subpixel);
  outColor = vec4(mix(resolved, neighbours, 0.7 * subpixel * subpixel), 1.0);
}`;

interface Target { framebuffer: WebGLFramebuffer; texture: WebGLTexture }
interface Pass { program: WebGLProgram; source: WebGLUniformLocation; packed: WebGLUniformLocation }

/** Linear FP16 radiance -> box supersampling -> bounded bloom -> display FXAA.
 * RGBA8 uses c/(1+c) packing: functional but explicitly not equivalent to HDR.
 */
export class OpticalResolve {
  static readonly bloomRadiusPixels = 12;
  private readonly scene: Target;
  private readonly average: Target;
  private readonly bloomHorizontal: Target;
  private readonly bloomVertical: Target;
  private readonly resolvePass: Pass;
  private readonly averagePass: Pass;
  private readonly blurPass: Pass;
  private readonly vao: WebGLVertexArrayObject;
  private readonly sourceSizeLocation: WebGLUniformLocation;
  private readonly sampleScaleLocation: WebGLUniformLocation;
  private readonly bloomSourceLocation: WebGLUniformLocation;
  private readonly texelLocation: WebGLUniformLocation;
  private readonly bloomLocation: WebGLUniformLocation;
  private readonly blurDirectionLocation: WebGLUniformLocation;
  private readonly blurExtractLocation: WebGLUniformLocation;
  private readonly maxTextureSize: number;
  private hdr: boolean;
  private width = 0;
  private height = 0;
  private outputWidth = 0;
  private outputHeight = 0;
  private bloomWidth = 0;
  private bloomHeight = 0;
  private disposed = false;

  get supportsHDR(): boolean { return this.hdr; }

  /** Guard in OUTPUT pixels, including the bilinear/FXAA reach. */
  static requiredGuardPixels(pixelScale = 1, bloom = 0): number {
    return bloom > 0 ? Math.ceil(OpticalResolve.bloomRadiusPixels * pixelScale) + 2 : 2;
  }

  constructor(private readonly gl: WebGL2RenderingContext) {
    const targets: Target[] = [], programs: WebGLProgram[] = [], shaders: WebGLShader[] = [];
    let vao: WebGLVertexArrayObject | null = null;
    const location = (program: WebGLProgram, name: string): WebGLUniformLocation => {
      const result = gl.getUniformLocation(program, name);
      if (result === null) throw new Error('광학 HDR 입력 ' + name + '을 연결하지 못했습니다.');
      return result;
    };
    const compile = (type: number, source: string): WebGLShader => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error('광학 HDR 셰이더를 만들지 못했습니다.');
      shaders.push(shader);
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('광학 HDR 셰이더 컴파일 실패: ' + gl.getShaderInfoLog(shader));
      return shader;
    };
    const createPass = (source: string): Pass => {
      const program = gl.createProgram();
      if (!program) throw new Error('광학 HDR 프로그램을 만들지 못했습니다.');
      programs.push(program);
      gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, source));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('광학 HDR 프로그램 연결 실패: ' + gl.getProgramInfoLog(program));
      return { program, source: location(program, 'uSource'), packed: location(program, 'uPacked') };
    };
    const createTarget = (): Target => {
      const framebuffer = gl.createFramebuffer(), texture = gl.createTexture();
      if (!framebuffer || !texture) {
        if (framebuffer) gl.deleteFramebuffer(framebuffer);
        if (texture) gl.deleteTexture(texture);
        throw new Error('광학 HDR 버퍼를 만들지 못했습니다.');
      }
      const target = { framebuffer, texture }; targets.push(target);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return target;
    };
    try {
      this.hdr = Boolean(gl.getExtension('EXT_color_buffer_float'));
      this.resolvePass = createPass(fragmentSource); this.averagePass = createPass(averageSource); this.blurPass = createPass(blurSource);
      this.sourceSizeLocation = location(this.averagePass.program, 'uSourceSize');
      this.sampleScaleLocation = location(this.averagePass.program, 'uSampleScale');
      this.bloomSourceLocation = location(this.resolvePass.program, 'uBloomSource');
      this.texelLocation = location(this.resolvePass.program, 'uTexelSize');
      this.bloomLocation = location(this.resolvePass.program, 'uBloom');
      this.blurDirectionLocation = location(this.blurPass.program, 'uDirection');
      this.blurExtractLocation = location(this.blurPass.program, 'uExtract');
      this.scene = createTarget(); this.average = createTarget();
      this.bloomHorizontal = createTarget(); this.bloomVertical = createTarget();
      vao = gl.createVertexArray();
      if (!vao) throw new Error('광학 HDR 화면 버퍼를 만들지 못했습니다.');
      this.vao = vao;
      this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    } catch (error) {
      for (const target of targets) { gl.deleteFramebuffer(target.framebuffer); gl.deleteTexture(target.texture); }
      for (const program of programs) gl.deleteProgram(program);
      if (vao) gl.deleteVertexArray(vao);
      throw error;
    } finally {
      for (const shader of shaders) gl.deleteShader(shader);
      gl.bindTexture(gl.TEXTURE_2D, null);
    }
  }

  private allocate(target: Target, width: number, height: number): boolean {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, target.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, this.hdr ? gl.RGBA16F : gl.RGBA8, width, height, 0, gl.RGBA, this.hdr ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target.texture, 0);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  }

  begin(width: number, height: number): void {
    this.assertAvailable();
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > this.maxTextureSize || height > this.maxTextureSize) throw new Error('광학 HDR 버퍼 크기가 GPU 범위를 벗어났습니다.');
    const gl = this.gl;
    if (width !== this.width || height !== this.height) {
      let allocated = this.allocate(this.scene, width, height);
      if (!allocated && this.hdr) {
        this.hdr = false;
        this.outputWidth = this.outputHeight = this.bloomWidth = this.bloomHeight = 0;
        allocated = this.allocate(this.scene, width, height);
      }
      if (!allocated) {
        this.width = this.height = 0; gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        throw new Error('광학 HDR 버퍼를 할당하지 못했습니다. 출력 크기를 줄여 주세요.');
      }
      this.width = width; this.height = height;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.scene.framebuffer); gl.viewport(0, 0, width, height);
    gl.disable(gl.SCISSOR_TEST); gl.colorMask(true, true, true, true);
  }

  private bind(pass: Pass, source: Target, destination: Target | null, width: number, height: number): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, destination?.framebuffer ?? null);
    gl.viewport(0, 0, width, height); gl.useProgram(pass.program);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, source.texture);
    gl.uniform1i(pass.source, 0); gl.uniform1i(pass.packed, this.hdr ? 0 : 1);
  }

  /** pixelScale = output pixels per 1080-reference pixel, including full-image
   * size for export tiles. It never depends on tile width or sample count.
   */
  finish(fullWidth: number, fullHeight: number, bloom = 0, pixelScale = 1, outputInset = 0): void {
    this.assertAvailable();
    const sampleScale = this.width / fullWidth;
    if (!Number.isInteger(fullWidth) || !Number.isInteger(fullHeight) || fullWidth < 1 || fullHeight < 1 || !Number.isInteger(sampleScale) || sampleScale < 1 || sampleScale > 4 || this.height / fullHeight !== sampleScale || !Number.isFinite(bloom) || bloom < 0 || !Number.isFinite(pixelScale) || pixelScale <= 0) throw new Error('광학 HDR 출력 크기 또는 샘플 배율이 올바르지 않습니다.');
    if (!Number.isInteger(outputInset) || outputInset < 0 || outputInset * 2 >= fullWidth || outputInset * 2 >= fullHeight) throw new Error('광학 HDR 출력 여백이 올바르지 않습니다.');
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.STENCIL_TEST); gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND); gl.disable(gl.SCISSOR_TEST); gl.disable(gl.DITHER);
    gl.colorMask(true, true, true, true); gl.bindVertexArray(this.vao);
    let resolvedSource = this.scene;
    if (sampleScale > 1) {
      if (this.outputWidth !== fullWidth || this.outputHeight !== fullHeight) {
        if (!this.allocate(this.average, fullWidth, fullHeight)) throw new Error('광학 샘플 결합 버퍼를 할당하지 못했습니다.');
        this.outputWidth = fullWidth; this.outputHeight = fullHeight;
      }
      this.bind(this.averagePass, this.scene, this.average, fullWidth, fullHeight);
      gl.uniform2f(this.sourceSizeLocation, this.width, this.height);
      gl.uniform1i(this.sampleScaleLocation, sampleScale); gl.drawArrays(gl.TRIANGLES, 0, 3);
      resolvedSource = this.average;
    }
    if (bloom > 0) {
      if (this.bloomWidth !== fullWidth || this.bloomHeight !== fullHeight) {
        if (!this.allocate(this.bloomHorizontal, fullWidth, fullHeight) || !this.allocate(this.bloomVertical, fullWidth, fullHeight)) {
          this.bloomWidth = this.bloomHeight = 0; gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          throw new Error('광학 하이라이트 버퍼를 할당하지 못했습니다. 출력 크기를 줄여 주세요.');
        }
        this.bloomWidth = fullWidth; this.bloomHeight = fullHeight;
      }
      this.bind(this.blurPass, resolvedSource, this.bloomHorizontal, fullWidth, fullHeight);
      gl.uniform2f(this.blurDirectionLocation, pixelScale / fullWidth, 0); gl.uniform1i(this.blurExtractLocation, 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.bind(this.blurPass, this.bloomHorizontal, this.bloomVertical, fullWidth, fullHeight);
      gl.uniform2f(this.blurDirectionLocation, 0, pixelScale / fullHeight); gl.uniform1i(this.blurExtractLocation, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    this.bind(this.resolvePass, resolvedSource, null, fullWidth, fullHeight);
    // Every render includes real off-artboard radiance in its guard band.
    // Crop only the final presentation; intermediate filters retain that light
    // so preview borders and export tile borders use exactly the same samples.
    gl.viewport(-outputInset, -outputInset, fullWidth, fullHeight);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, bloom > 0 ? this.bloomVertical.texture : resolvedSource.texture);
    gl.uniform1i(this.bloomSourceLocation, 1); gl.uniform1f(this.bloomLocation, bloom);
    gl.uniform2f(this.texelLocation, 1 / fullWidth, 1 / fullHeight);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindTexture(gl.TEXTURE_2D, null); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, null); gl.bindVertexArray(null);
  }

  private assertAvailable(): void {
    if (this.disposed || this.gl.isContextLost()) throw new Error('광학 HDR GPU 연결을 사용할 수 없습니다. 페이지를 새로고침해 주세요.');
  }

  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    for (const target of [this.scene, this.average, this.bloomHorizontal, this.bloomVertical]) { this.gl.deleteFramebuffer(target.framebuffer); this.gl.deleteTexture(target.texture); }
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteProgram(this.resolvePass.program); this.gl.deleteProgram(this.averagePass.program); this.gl.deleteProgram(this.blurPass.program);
    this.width = this.height = this.outputWidth = this.outputHeight = this.bloomWidth = this.bloomHeight = 0;
  }
}
