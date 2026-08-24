uniform vec3 uCardDirection[5];
uniform vec3 uCardRight[5];
uniform vec3 uCardUp[5];
uniform vec3 uCardColor[5];
uniform vec4 uCardData[5];
uniform float uEnvironmentIntensity;
uniform float uEnvironmentRotation;

vec3 rotateEnvironmentY(vec3 direction, float angle) {
  float cosine = cos(angle);
  float sine = sin(angle);
  return vec3(cosine * direction.x - sine * direction.z, direction.y, sine * direction.x + cosine * direction.z);
}

vec3 environmentColor(vec3 sampleDirection) {
  vec3 direction = safeNormalize(rotateEnvironmentY(sampleDirection, uEnvironmentRotation));
  float horizon = pow(1.0 - abs(direction.y), 2.4);
  vec3 result = mix(vec3(0.0045), vec3(0.032), horizon);
  for (int index = 0; index < 5; index += 1) {
    float facing = dot(direction, safeNormalize(uCardDirection[index]));
    vec2 projected = vec2(dot(direction, uCardRight[index]), dot(direction, uCardUp[index])) / max(facing, 0.025);
    vec2 normalizedPosition = abs(projected) / max(uCardData[index].xy, vec2(0.002));
    float edge = max(normalizedPosition.x, normalizedPosition.y);
    float card = (1.0 - smoothstep(1.0, 1.0 + max(uCardData[index].z, 0.002), edge)) * smoothstep(0.0, 0.08, facing);
    result += uCardColor[index] * card * uCardData[index].w;
  }
  return result * uEnvironmentIntensity;
}

vec3 environmentColorRough(vec3 sampleDirection, float roughness) {
  vec3 direction = safeNormalize(sampleDirection);
  float spread = clamp(roughness * roughness * 0.62, 0.0, 0.58);
  if (spread < 1e-4) return environmentColor(direction);

  vec3 tangent;
  vec3 bitangent;
  makeOrthonormalBasis(direction, tangent, bitangent);
  vec3 color = environmentColor(direction) * 0.4;
  color += environmentColor(safeNormalize(direction + tangent * spread)) * 0.15;
  color += environmentColor(safeNormalize(direction - tangent * spread)) * 0.15;
  color += environmentColor(safeNormalize(direction + bitangent * spread)) * 0.15;
  color += environmentColor(safeNormalize(direction - bitangent * spread)) * 0.15;
  return color;
}
