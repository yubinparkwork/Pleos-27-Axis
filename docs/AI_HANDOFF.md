# PLEOS 27 Axis — AI Handoff

## Project Intent

PLEOS 27 Axis is a corporate-promotion key-visual production tool.
The core brand asset is not an individual cube, but the Axis origin, approved angles, and intersection relationship.
Expression is not limited to conventional 3D rendering.
The same Axis identity can support prism 3D, realtime shaders, 2D graphics, motion, and future data-driven expressions.
The system must preserve the shared structural identity while allowing optical and material variation.
Export across square, portrait, landscape, social, and print-oriented formats is a primary requirement.
Production geometry and expression layers should remain separable so new Looks do not erode the Axis contract.

## Active Application

- Entry point: `src/main.ts`
- Default route: `/`
- Active application: MotionStudioApp
- Renderer: Three.js WebGLRenderer + three-gpu-pathtracer
- Preview: Three.js raster + EffectComposer + UnrealBloomPass
- Camera: orthographic (OrthographicCamera)
- Main scene: 3 closed optical solids meeting at one shared vertex
- Legacy routes: `?renderer=raw` and `?renderer=legacy` — Legacy / reference only

## Axis Identity

- Axis family: 30deg
- Shared origin valid: Yes
- Shared-origin contract: [0, 0, 0]
- Projected directions: 30°, 90°, 150°, 210°, 270°, 330°
- Geometry relationship: three closed optical solids meet at one shared vertex.
- Do not change the approved shared origin, 30° projection, default camera, or three-solid silhouette without an explicit brand-structure request.
- Materials, shaders, lighting, motion, and artboard treatment are expression layers and may evolve while the Axis contract remains fixed.

## Current Expressions / Looks

### Clear

- Role: Neutral clear optical glass
- Implementation: MeshPhysicalMaterial preset
- Main file: `src/crystal/CrystalAssembly.ts`
- Render strategy: path-traced-still+raster-preview
- Motion support: Yes, via the shared Motion system

### Prism

- Role: Primary optical prism expression
- Implementation: MeshPhysicalMaterial with dispersion
- Main file: `src/crystal/CrystalAssembly.ts`
- Render strategy: path-traced-still+raster-preview
- Motion support: Yes, via the shared Motion system

### Spectral Flow

- Role: Axis-driven moving spectral light field
- Implementation: MeshPhysicalMaterial.onBeforeCompile custom GLSL
- Main file: `src/crystal/materials/SpectralFlowMaterial.ts`
- Render strategy: high-resolution-raster
- Motion support: Yes, via the shared Motion system

### Soft Spectral

- Role: Soft center-led optical field with blue/cyan spectral response
- Implementation: Independent MeshPhysicalMaterial.onBeforeCompile custom GLSL
- Main file: `src/crystal/materials/SoftSpectralMaterial.ts`
- Render strategy: high-resolution-raster
- Motion support: Yes, via the shared Motion system

### Smoked

- Role: Dark smoked optical glass
- Implementation: MeshPhysicalMaterial preset
- Main file: `src/crystal/CrystalAssembly.ts`
- Render strategy: path-traced-still+raster-preview
- Motion support: Yes, via the shared Motion system

## Motion System

- Runtime: `MotionEngine` + `MotionClock`
- Current preset: `spectral-axis-sweep`
- Available presets: spectral-axis-sweep — 7.2s, strict; shared-vertex-pulse — 5.6s, strict; explode-rejoin — 6.4s, anchored
- Determinism: absolute-time evaluation; fixed export time is `frameIndex / fps`.
- Current duration / FPS: 7.2s / 30 fps
- Playback: realtime raster preview.
- Sequence export: fixed-timestep raster PNG frames.
- Path-traced stills: current absolute motion frame is synchronized before accumulation.

## Artboard / Export

- Virtual artboard: Yes; framing is independent from viewport and Inspector width.
- Supported formats: 정사각형 1:1 (1080 × 1080); 인스타그램 4:5 (1080 × 1350); 세로형 3:4 (1080 × 1440); 가로형 16:9 (1920 × 1080); 세로형 9:16 (1080 × 1920); 사용자 설정 (1080 × 1080)
- Raster PNG: exact artboard or render-region pixels.
- Path-traced still: Clear, Prism, and Smoked.
- High-resolution raster: Spectral Flow.
- Motion sequence: deterministic PNG sequence.
- Transparency: supported.
- PPI: PNG pHYs metadata plus physical-size print scaling.
- Current limitation: GPU maximum texture size still limits single-pass output dimensions.

## Inspector / UI

- SETUP — Axis state, cube gap, bevel, camera lock/reset.
- LOOK — Clear, Prism, Spectral Flow, Smoked and expression-specific controls.
- MOTION — preset, strength, duration, FPS, timeline, loop and transport.
- FORMAT — virtual artboard size, fit, scale, preview zoom, safe guide and transparency.
- EXPORT — raster, path-traced still, print and motion-sequence controls.
- ADVANCED — path-tracing settings, pixel render region, unit conversion, PPI metadata and individual lights.

## Important Files

| File | Responsibility |
| --- | --- |
| `src/main.ts` | Production route selection and browser inspection/export API |
| `src/crystal/MotionStudioApp.ts` | Active scene, renderer lifecycle, UI binding, motion and export strategy |
| `src/crystal/CrystalAssembly.ts` | Three-solid Axis geometry, physical Looks and shared-origin contract |
| `src/crystal/materials/SpectralFlowMaterial.ts` | Independent Spectral Flow shader expression |
| `src/crystal/PrismMotionAdapter.ts` | Applies deterministic motion patches to the three solids |
| `src/crystal/LightingSystem.ts` | Dynamic studio lighting and Pleos lighting presets |
| `src/crystal/StudioEnvironment.ts` | Environment and studio reflection setup |
| `src/crystal/ui/StudioPanel.ts` | Active Inspector markup and controls |
| `src/crystal/CrystalApp.css` | Production application and Inspector styling |
| `src/motion/MotionEngine.ts` | Absolute-time motion evaluation |
| `src/motion/MotionClock.ts` | Realtime and fixed-frame time source |
| `src/motion/MotionPresetRegistry.ts` | Active motion preset registry |
| `src/axis/angles.ts` | Canonical Axis direction families |
| `src/artboard/FormatPresetRegistry.ts` | Supported output formats |
| `src/artboard/CompositionAdapter.ts` | Viewport-independent artboard framing |
| `scripts/render-motion-sequence.mjs` | Fixed-timestep PNG sequence exporter |
| `scripts/update-ai-handoff.mjs` | Generates this handoff, runtime state and latest previews |

## Latest Task

- User request: Refresh the AI handoff from the active production runtime.
- What changed: Regenerated runtime inspection, latest previews, validation state, and the current-state handoff.
- Why: Keep ChatGPT and Codex synchronized without manually copying project context.
- Main implementation decisions: Use the production inspect/export API and deterministic hero time; do not capture editor UI.

## Files Changed

- `new-axis-procedural/.gitignore` — Git status M
- `new-axis-procedural/PROGRESS.md` — Git status M
- `new-axis-procedural/README.md` — Git status M
- `new-axis-procedural/package.json` — Git status M
- `new-axis-procedural/src/crystal/CrystalApp.css` — Git status M
- `new-axis-procedural/src/crystal/CrystalAssembly.ts` — Git status M
- `new-axis-procedural/src/crystal/InspectorPanel.ts` — Git status M
- `new-axis-procedural/src/crystal/LightingPanel.ts` — Git status M
- `new-axis-procedural/src/crystal/LightingSystem.ts` — Git status M
- `new-axis-procedural/src/crystal/StudioEnvironment.ts` — Git status M
- `new-axis-procedural/src/main.ts` — Git status M
- `new-axis-procedural/vite.config.ts` — Git status M
- `new-axis-procedural/AGENTS.md` — Git status ??
- `new-axis-procedural/artifacts/design-polish/motion-explode.png` — Git status ??
- `new-axis-procedural/artifacts/design-polish/motion-pulse.png` — Git status ??
- `new-axis-procedural/artifacts/design-polish/motion-sweep.png` — Git status ??
- `new-axis-procedural/artifacts/design-polish/prism-clean.png` — Git status ??
- `new-axis-procedural/artifacts/design-polish/prism-immersive.png` — Git status ??
- `new-axis-procedural/artifacts/design-polish/prism-rgb-edge.png` — Git status ??
- `new-axis-procedural/artifacts/design-polish/spectral-active.png` — Git status ??
- `new-axis-procedural/artifacts/design-polish/spectral-balanced.png` — Git status ??
- `new-axis-procedural/artifacts/design-polish/spectral-subtle.png` — Git status ??
- `new-axis-procedural/artifacts/design-polish/ui-format.png` — Git status ??
- `new-axis-procedural/artifacts/design-polish/ui-look.png` — Git status ??
- `new-axis-procedural/artifacts/design-polish/ui-motion.png` — Git status ??
- `new-axis-procedural/artifacts/design-polish/ui-variations.png` — Git status ??
- `new-axis-procedural/artifacts/latest/preview-4x5.png` — Git status ??
- `new-axis-procedural/artifacts/latest/preview-9x16.png` — Git status ??
- `new-axis-procedural/artifacts/latest/preview-main.png` — Git status ??
- `new-axis-procedural/artifacts/latest/runtime-state.json` — Git status ??
- `new-axis-procedural/artifacts/motion-v1/after/artboard-4x5.png` — Git status ??
- `new-axis-procedural/artifacts/motion-v1/after/artboard-9x16.png` — Git status ??
- `new-axis-procedural/artifacts/motion-v1/after/current-frame-high-quality.png` — Git status ??
- `new-axis-procedural/artifacts/motion-v1/after/explode-rejoin.png` — Git status ??
- `new-axis-procedural/artifacts/motion-v1/after/inspector-hidden.png` — Git status ??
- `new-axis-procedural/artifacts/motion-v1/after/motion-off-prism.png` — Git status ??
- `new-axis-procedural/artifacts/motion-v1/after/motion-studio-final.png` — Git status ??
- `new-axis-procedural/artifacts/motion-v1/after/panel-export.png` — Git status ??
- `new-axis-procedural/artifacts/motion-v1/after/panel-format.png` — Git status ??
- `new-axis-procedural/artifacts/motion-v1/after/panel-look.png` — Git status ??
- `new-axis-procedural/artifacts/motion-v1/after/panel-motion.png` — Git status ??
- `new-axis-procedural/artifacts/motion-v1/after/panel-setup.png` — Git status ??
- `new-axis-procedural/artifacts/motion-v1/after/render-region-restored.png` — Git status ??
- `new-axis-procedural/artifacts/motion-v1/after/render-tools-restored.png` — Git status ??
- `new-axis-procedural/artifacts/motion-v1/after/sequence-smoke/frame-000000.png` — Git status ??
- `new-axis-procedural/artifacts/motion-v1/after/sequence-smoke/frame-000001.png` — Git status ??
- `new-axis-procedural/artifacts/motion-v1/after/sequence-smoke/frame-000002.png` — Git status ??
- `new-axis-procedural/artifacts/motion-v1/after/shared-vertex-pulse.png` — Git status ??
- `new-axis-procedural/artifacts/motion-v1/after/spectral-axis-sweep.png` — Git status ??
- `new-axis-procedural/artifacts/motion-v1/before/current-replaced-site.png` — Git status ??
- `new-axis-procedural/artifacts/motion-v1/before/prism-static.png` — Git status ??
- `new-axis-procedural/artifacts/soft-spectral/comparison.json` — Git status ??
- `new-axis-procedural/artifacts/soft-spectral/soft-4x5.png` — Git status ??
- `new-axis-procedural/artifacts/soft-spectral/soft-9x16.png` — Git status ??
- `new-axis-procedural/artifacts/soft-spectral/soft-active.png` — Git status ??
- `new-axis-procedural/artifacts/soft-spectral/soft-balanced.png` — Git status ??
- `new-axis-procedural/artifacts/soft-spectral/soft-center-glow.png` — Git status ??
- `new-axis-procedural/artifacts/soft-spectral/soft-dark-rest.png` — Git status ??
- `new-axis-procedural/artifacts/soft-spectral/soft-edge-response.png` — Git status ??
- `new-axis-procedural/artifacts/soft-spectral/soft-motion-25.png` — Git status ??
- `new-axis-procedural/artifacts/soft-spectral/soft-motion-50.png` — Git status ??
- `new-axis-procedural/artifacts/soft-spectral/soft-motion-75.png` — Git status ??
- `new-axis-procedural/artifacts/soft-spectral/soft-subtle.png` — Git status ??
- `new-axis-procedural/artifacts/soft-spectral/ui-soft-spectral.png` — Git status ??
- `new-axis-procedural/artifacts/ui-redesign/export-custom-render.png` — Git status ??
- `new-axis-procedural/artifacts/ui-redesign/export-panel.png` — Git status ??
- `new-axis-procedural/artifacts/ui-redesign/format-panel.png` — Git status ??
- `new-axis-procedural/artifacts/ui-redesign/inspector-collapsed.png` — Git status ??
- `new-axis-procedural/artifacts/ui-redesign/lighting-advanced.png` — Git status ??
- `new-axis-procedural/artifacts/ui-redesign/look-advanced.png` — Git status ??
- `new-axis-procedural/artifacts/ui-redesign/look-panel.png` — Git status ??
- `new-axis-procedural/artifacts/ui-redesign/motion-panel.png` — Git status ??
- `new-axis-procedural/artifacts/ui-redesign/variation-menu.png` — Git status ??
- `new-axis-procedural/artifacts/ui-redesign/workspace.png` — Git status ??
- `new-axis-procedural/docs/AI_HANDOFF.md` — Git status ??
- `new-axis-procedural/docs/motion-v1-current-state.md` — Git status ??
- `new-axis-procedural/scripts/capture-design-polish.mjs` — Git status ??
- `new-axis-procedural/scripts/capture-soft-spectral.mjs` — Git status ??
- `new-axis-procedural/scripts/capture-spectral-flow.mjs` — Git status ??
- `new-axis-procedural/scripts/capture-ui-redesign.mjs` — Git status ??
- `new-axis-procedural/scripts/render-motion-sequence.mjs` — Git status ??
- `new-axis-procedural/scripts/update-ai-handoff.mjs` — Git status ??
- `new-axis-procedural/scripts/verify-design-polish.mjs` — Git status ??
- `new-axis-procedural/scripts/verify-motion-v1.mjs` — Git status ??
- `new-axis-procedural/scripts/verify-pathtracer.mjs` — Git status ??
- `new-axis-procedural/scripts/verify-retained-rendering.mjs` — Git status ??
- `new-axis-procedural/scripts/verify-soft-spectral.mjs` — Git status ??
- `new-axis-procedural/scripts/verify-spectral-flow.mjs` — Git status ??
- `new-axis-procedural/src/artboard/ArtboardState.ts` — Git status ??
- `new-axis-procedural/src/artboard/CompositionAdapter.ts` — Git status ??
- `new-axis-procedural/src/artboard/FormatPresetRegistry.ts` — Git status ??
- `new-axis-procedural/src/crystal/MotionStudioApp.ts` — Git status ??
- `new-axis-procedural/src/crystal/PrismMotionAdapter.ts` — Git status ??
- `new-axis-procedural/src/crystal/materials/SoftSpectralMaterial.ts` — Git status ??
- `new-axis-procedural/src/crystal/materials/SpectralFlowMaterial.ts` — Git status ??
- `new-axis-procedural/src/crystal/presets/PrismStylePresets.ts` — Git status ??
- `new-axis-procedural/src/crystal/ui/MotionPanel.ts` — Git status ??
- `new-axis-procedural/src/crystal/ui/StudioPanel.ts` — Git status ??
- `new-axis-procedural/src/crystal/ui/TransportBar.ts` — Git status ??
- `new-axis-procedural/src/crystal/variations/StudioVariation.ts` — Git status ??
- `new-axis-procedural/src/motion/MotionClock.ts` — Git status ??
- `new-axis-procedural/src/motion/MotionEngine.ts` — Git status ??
- `new-axis-procedural/src/motion/MotionPresetRegistry.ts` — Git status ??
- `new-axis-procedural/src/motion/constraints/AxisConstraintService.ts` — Git status ??
- `new-axis-procedural/src/motion/easing.ts` — Git status ??
- `new-axis-procedural/src/motion/modules/ExplodeRejoinMotion.ts` — Git status ??
- `new-axis-procedural/src/motion/modules/SharedVertexPulseMotion.ts` — Git status ??
- `new-axis-procedural/src/motion/modules/SpectralAxisSweepMotion.ts` — Git status ??
- `new-axis-procedural/src/motion/presets/explodeRejoin.ts` — Git status ??
- `new-axis-procedural/src/motion/presets/sharedVertexPulse.ts` — Git status ??
- `new-axis-procedural/src/motion/presets/spectralAxisSweep.ts` — Git status ??
- `new-axis-procedural/src/motion/types.ts` — Git status ??

## Visual Changes

No intentional visual changes

## Latest Previews

| Preview | Pixels | Look | Hero time |
| --- | ---: | --- | ---: |
| `artifacts/latest/preview-main.png` | 1080 × 1080 | prism | 3.6s |
| `artifacts/latest/preview-4x5.png` | 1080 × 1350 | prism | 3.6s |
| `artifacts/latest/preview-9x16.png` | 1080 × 1920 | prism | 3.6s |

## Validation

- npm run typecheck — PASS
- npm run verify — PASS
- npm run build — PASS
- Browser console — PASS

Validation values are generated from commands executed during this handoff. `NOT-RUN` is never treated as PASS.

## Known Issues

- Git remote is `https://github.com/vcodestudio/ae-mcp-student.git`, not the requested `yubinparkwork/Pleos-27-Axis`; the handoff script does not modify remotes.

## Next Recommended Work

- Review the three latest previews after meaningful visual work.
- Resolve the repository remote mismatch before the next requested push.
- Run handoff:full at the end of completed implementation work.

## ChatGPT Re-scan Notes

- Read `artifacts/latest/runtime-state.json` for machine-readable branch, runtime, Look, motion, artboard, preview and validation state.
- Inspect `artifacts/latest/preview-main.png`, then compare the 4:5 and 9:16 previews for framing consistency.
- Treat `src/crystal/MotionStudioApp.ts` as the active production renderer; raw and legacy routes are reference only.
- Compare `src/crystal/materials/SpectralFlowMaterial.ts` with physical Look handling in `src/crystal/CrystalAssembly.ts`.
- Check Git remote information before assuming this working tree is already connected to `yubinparkwork/Pleos-27-Axis`.
