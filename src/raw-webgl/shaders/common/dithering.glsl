float interleavedGradientNoise(vec2 pixel) {
  return fract(52.9829189 * fract(0.06711056 * pixel.x + 0.00583715 * pixel.y));
}

vec3 applyDither(vec3 color, vec2 pixel, float strength) {
  float subtleStrength = clamp(strength, 0.0, 1.0);
  return color + (interleavedGradientNoise(pixel) - 0.5) * subtleStrength / 255.0;
}
