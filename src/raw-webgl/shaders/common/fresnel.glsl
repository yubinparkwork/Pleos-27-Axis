vec3 fresnelSchlick(float cosTheta, vec3 f0) {
  return f0 + (1.0 - f0) * pow(1.0 - saturate(cosTheta), 5.0);
}

float dielectricF0(float ior) {
  float value = (ior - 1.0) / (ior + 1.0);
  return value * value;
}
