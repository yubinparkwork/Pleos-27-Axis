float distributionGGX(vec3 normal, vec3 halfway, float roughness) {
  float a = roughness * roughness;
  float a2 = a * a;
  float nDotH = max(dot(normal, halfway), 0.0);
  float denominator = nDotH * nDotH * (a2 - 1.0) + 1.0;
  return a2 / max(PI * denominator * denominator, 1e-5);
}

float geometrySchlickGGX(float nDotV, float roughness) {
  float r = roughness + 1.0;
  float k = (r * r) / 8.0;
  return nDotV / max(nDotV * (1.0 - k) + k, 1e-5);
}

float geometrySmith(vec3 normal, vec3 viewDirection, vec3 lightDirection, float roughness) {
  return geometrySchlickGGX(max(dot(normal, viewDirection), 0.0), roughness)
    * geometrySchlickGGX(max(dot(normal, lightDirection), 0.0), roughness);
}

vec3 evaluatePbr(
  vec3 baseColor,
  vec3 normal,
  vec3 viewDirection,
  vec3 lightDirection,
  vec3 radiance,
  float roughness,
  float diffuseStrength,
  float specularStrength,
  vec3 specularTint
) {
  vec3 halfway = safeNormalize(viewDirection + lightDirection);
  float nDotL = max(dot(normal, lightDirection), 0.0);
  float nDotV = max(dot(normal, viewDirection), 0.0);
  vec3 f0 = vec3(0.04) * mix(vec3(1.0), max(specularTint, vec3(0.0)), 0.75);
  vec3 fresnel = fresnelSchlick(max(dot(halfway, viewDirection), 0.0), f0);
  float distribution = distributionGGX(normal, halfway, roughness);
  float geometry = geometrySmith(normal, viewDirection, lightDirection, roughness);
  vec3 specular = distribution * geometry * fresnel / max(4.0 * nDotV * nDotL, 1e-4);
  float specularLevel = max(specularStrength, 0.0);
  vec3 diffuse = (vec3(1.0) - fresnel * saturate(specularLevel)) * baseColor * diffuseStrength / PI;
  return (diffuse + specular * specularLevel) * radiance * nDotL;
}
