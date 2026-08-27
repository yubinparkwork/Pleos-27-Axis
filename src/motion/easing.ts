export const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / Math.max(1e-6, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function smootherstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / Math.max(1e-6, edge1 - edge0));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function bell(progress: number, center: number, width: number): number {
  const distance = Math.abs(progress - center);
  return 1 - smootherstep(0, Math.max(width, 1e-6), distance);
}

export function loopSine(progress: number, phase = 0): number {
  return Math.sin((progress + phase) * Math.PI * 2);
}

export function interval(progress: number, start: number, end: number, feather = 0.08): number {
  return smoothstep(start, Math.min(end, start + feather), progress) *
    (1 - smoothstep(Math.max(start, end - feather), end, progress));
}
