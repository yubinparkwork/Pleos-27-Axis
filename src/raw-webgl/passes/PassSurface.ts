import type { GLStateCache, RenderTarget, ShaderProgram } from "../core";
import type { LightingState } from "../lighting/lightingPresets";

export interface PassSurface {
  readonly target: RenderTarget | null;
  readonly width: number;
  readonly height: number;
}

export interface LightingUniformUploader {
  upload(program: ShaderProgram, lighting: Readonly<LightingState>): void;
}

export function bindPassSurface(
  state: GLStateCache,
  surface: PassSurface,
): void {
  state.bindFramebuffer(surface.target?.framebuffer.handle ?? null);
  state.setViewport(0, 0, surface.width, surface.height);
}

export function prepareFullscreenState(
  state: GLStateCache,
  surface: PassSurface,
): void {
  bindPassSurface(state, surface);
  state.bindVertexArray(null);
  state.setDepthTest(false);
  state.setDepthWrite(false);
  state.setCullFace(false);
  state.setBlend(false);
}
