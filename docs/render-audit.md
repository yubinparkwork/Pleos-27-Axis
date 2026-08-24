# PLEOS Optical Renderer Audit

Audit date: 2026-08-20 (Asia/Seoul)
Baseline image: [`artifacts/optical/before.png`](../artifacts/optical/before.png)

This audit records the application immediately before the High-End Optical Crystal upgrade. The two supplied crystal images are visual-quality references only and are not sampled by the production renderer.

## Runtime and backend

| Item | Observed state |
|---|---|
| Renderer | `THREE.WebGLRenderer` |
| Three.js | `0.180.0` |
| WebGPU | Unavailable in the active in-app browser (`navigator.gpu === undefined`) |
| GPU preference | WebGL context requests `powerPreference: "high-performance"` |
| Active fallback | WebGL 2 |
| GPU adapter identity | Not exposed by the active browser; no adapter name is claimed |
| WebGL maximum texture size | 16,384 px, previously reported by the live renderer |
| Context loss | `webglcontextlost` / `webglcontextrestored` handlers installed |
| Browser console | Zero errors at baseline capture |

The code does not monkey-patch Three.js or claim that the high-performance request guarantees discrete-GPU selection.

## Geometry

- Active construction: two equal-edge, orthogonal corner cubes for the full 30-degree six-ray form.
- Shared topology: both solids contain the exact Axis origin; projected incident edges are 30, 90, 150, 210, 270, and 330 degrees.
- Mesh state: closed front/back/side volume with flat structural normals.
- Cube face subdivision before this pass: 22 x 22 per face, 5,808 triangles per cube.
- Reduced official ray sets fall back to closed sector-cell solids.
- Missing before this pass: true geometric bevel, variable physical wall thickness, hierarchical crystal deformation, adaptive 96-256 final subdivision.

## Material and lighting

- Baseline optical material: custom highp `ShaderMaterial`.
- Existing response: world normal/view direction, dielectric Fresnel, GGX-like direct specular, 3-channel refracted environment approximation, thickness absorption, spectral edge field, restrained grain/dither.
- Non-optical surfaces: `MeshPhysicalMaterial` presets.
- Environment: local `RoomEnvironment` prefiltered with `PMREMGenerator`; no external network HDR.
- Light rig: hemisphere, white key/fill/rim, warm/cool/center spectral point lights.
- Missing before this pass: editable real reflection-card geometry, HDR/EXR environment upload, 5-9 spectral samples, explicit thin-film thickness model, real geometric bevel response.

## Color and post

- Working calculations: linear shader/PBR calculations.
- Display output: `THREE.SRGBColorSpace`.
- Baseline tone mapping: `AgXToneMapping` for spectral mode, `NoToneMapping` otherwise.
- Post-processing: no composer; selective bloom/haze is local to the optical shader.
- Visible raster canvas: browser framebuffer with WebGL antialiasing; DPR capped at 2.

## Targets and export

- Raster export target before this pass: `RGBA8 / UnsignedByteType`, sRGB, 0-4x MSAA, optional 2x supersampling.
- EXR: scene-linear `RGBA16F / HalfFloatType` through `EXRExporter`.
- Exact offscreen export exists for PNG, JPEG, WebP, and EXR.
- Motion preview: deterministic fixed timestep PNG sequence ZIP.
- Missing before this pass: progressive temporal accumulation, tile renderer, 6144 square preset, actual 8192 artifact for this optical construction.

## Upgrade decision

WebGPU is not available in the active browser, so the implementation must remain honest WebGL2 Compatibility mode. The immediate quality order is:

1. closed-volume and bevel verification;
2. high-density axis-locked optical deformation;
3. physical reflection/refraction/attenuation refinement;
4. reflection-card environment;
5. half-float HDR intermediate and progressive accumulation;
6. 4K/8K export verification.
