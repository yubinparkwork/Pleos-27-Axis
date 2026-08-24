import type { GLStateCache, ShaderProgram } from "../core";

export function uniform1f(gl: WebGL2RenderingContext, program: ShaderProgram, name: string, value: number): void {
  const location = program.uniform(name);
  if (location !== null) gl.uniform1f(location, value);
}

export function uniform1i(gl: WebGL2RenderingContext, program: ShaderProgram, name: string, value: number): void {
  const location = program.uniform(name);
  if (location !== null) gl.uniform1i(location, value);
}

export function uniform2f(gl: WebGL2RenderingContext, program: ShaderProgram, name: string, x: number, y: number): void {
  const location = program.uniform(name);
  if (location !== null) gl.uniform2f(location, x, y);
}

export function uniform3f(
  gl: WebGL2RenderingContext,
  program: ShaderProgram,
  name: string,
  value: readonly [number, number, number],
): void {
  const location = program.uniform(name);
  if (location !== null) gl.uniform3f(location, value[0], value[1], value[2]);
}

export function uniformMat4(gl: WebGL2RenderingContext, program: ShaderProgram, name: string, value: Float32Array): void {
  const location = program.uniform(name);
  if (location !== null) gl.uniformMatrix4fv(location, false, value);
}

export function bindSampler2D(
  gl: WebGL2RenderingContext,
  state: GLStateCache,
  program: ShaderProgram,
  name: string,
  texture: WebGLTexture,
  unit: number,
): void {
  state.bindTexture2D(unit, texture);
  uniform1i(gl, program, name, unit);
}
