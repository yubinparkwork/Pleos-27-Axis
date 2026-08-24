# Optical crystal upgrade report

Date: 2026-08-20

## Outcome

The approved 30° Variation 1 is rendered as two equal-edge, closed rounded solids meeting at one exact Axis node. No line primitive is used. Other approved ray sets retain the closed joined-hexahedra fallback.

The optical path now includes dielectric Fresnel, GGX-style direct reflection, RGB dispersion, angle-dependent thin-film interference, thickness variation, Beer-style attenuation, internal return, edge-specific roughness/boost, surface waviness and controlled imperfection. Six new presets are exposed in the Spectral inspector.

## Active runtime

- Backend: WebGL 2 fallback. `navigator.gpu` is unavailable in the tested in-app browser, so no WebGPU adapter identity is claimed.
- GPU maximum texture: 16384 px.
- Preview target: RGBA8 / sRGB, AgX tone mapping for optical mode.
- EXR target: RGBA16F half-float / Linear sRGB.
- Final PNG: Halton sub-pixel progressive accumulation at 64, 128 or 256 requested samples. For large frames the exporter applies a documented memory-safe cap.
- 8192×8192 export: successful on this runtime without tiling because it is below the 16384 px hardware limit.
- Measured exact offscreen export: 2048 diagnostic 268 ms in the QA report; a repeated 8192×8192 Optical Crystal job completed in 2048 ms wall time. These numbers describe this machine/browser session, not a portable guarantee.

## Geometry validation

- Closed rounded boxes: two.
- Shared analytic contact: `[0, 0, 0.06]` in the normalized scene frame.
- Projected incident directions: `30°, 90°, 150°, 210°, 270°, 330°`.
- Large warp, fracture ridge and micro detail are masked away from the Axis node and principal edges.
- `npm run verify:solid` validates all eight approved Axis definitions and the two-cube contact construction.

## Browser validation

- Main editor opened at `http://127.0.0.1:5173/`.
- WebGL/shader console errors: 0.
- Optical Crystal, Experimental Prism, comparison mode and 64-sample Final Render were exercised directly.
- 2K, 4K and 8K PNG outputs were opened and visually inspected.

## Artifacts

All requested diagnostic and master PNGs are in `artifacts/optical/`. The 2K/4K/8K files are exact offscreen renders; the reference comparison is an editor-only screenshot and is never part of a production export.

## Known gaps

This pass is not a path tracer. Multi-bounce refraction, physically solved screen-space caustics, depth of field, selective post bloom and over-limit tiled EXR export remain future work. Current rainbow bands are a view/normal/thickness-driven spectral approximation rather than wavelength-traced transport. Because WebGPU is unavailable in the active browser, this report does not declare the reference-grade WebGPU target complete.
