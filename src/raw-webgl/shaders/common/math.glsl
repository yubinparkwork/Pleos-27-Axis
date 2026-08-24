const float PI = 3.141592653589793;

float saturate(float value) { return clamp(value, 0.0, 1.0); }
vec3 saturate3(vec3 value) { return clamp(value, vec3(0.0), vec3(1.0)); }

float luminance(vec3 value) {
  return dot(value, vec3(0.2126, 0.7152, 0.0722));
}

float gaussian(float value, float mean, float deviation) {
  float normalized = (value - mean) / max(deviation, 1e-5);
  return exp(-0.5 * normalized * normalized);
}

vec3 safeNormalize(vec3 value) {
  float magnitudeSquared = dot(value, value);
  return magnitudeSquared > 1e-10 ? value * inversesqrt(magnitudeSquared) : vec3(0.0, 0.0, 1.0);
}

void makeOrthonormalBasis(vec3 direction, out vec3 tangent, out vec3 bitangent) {
  vec3 axis = abs(direction.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  tangent = safeNormalize(cross(axis, direction));
  bitangent = safeNormalize(cross(direction, tangent));
}
