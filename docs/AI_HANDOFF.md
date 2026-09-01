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
- Active application: Glass3DMode / MotionStudioApp
- Renderer: Three.js WebGLRenderer + three-gpu-pathtracer
- Preview: Three.js raster + EffectComposer + UnrealBloomPass
- Projection: orthographic (OrthographicCamera)
- Main structure: 3 closed optical solids meeting at one shared vertex
- Studio mode: Glass 3D (renderer lifecycle owned by the active Mode)
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

### Light Field

- Role: Cables-inspired iridescent membrane mapped across the canonical three-cube Axis structure
- Implementation: independent WebGL2 rounded-cube ray intersection with a world-space warped void, white crest, spectral layers and deterministic periodic motion
- Main files: `src/modes/light-field/LightFieldMode.ts`, `LightFieldRenderer.ts`, `shaders/field.frag.glsl`
- Render strategy: realtime raster WebGL2; no Three.js and no path tracing
- Presets: Iridescent Pulse, Violet Membrane, Spectral White
- Motion support: Yes, absolute-time configurable 8–16 second loop

### Glass Prism

- Role: three-solid optical refraction of editable background typography
- Implementation: independent Raw WebGL2 ray-box renderer using front/back thickness, RGB Snell refraction and Fresnel response
- Main files: `src/modes/glass-prism/GlassPrismMode.ts`, `GlassPrismRenderer.ts`, `shaders/prism.frag.glsl`
- Render strategy: realtime raster WebGL2 with deterministic exact-size PNG output
- Presets: Clear Glass, RGB Prism, Frosted Prism, Dark Crystal
- Motion support: Yes, rotation, shared-corner pulse and explode/rejoin

### Kinetic Glass

- Role: interactive optical-glass expression of the canonical PLEOS three-cube structure
- Implementation: Three.js MeshPhysicalMaterial with zero-gravity Rapier rigid bodies, bounded pointer repulsion and spring return
- Main files: `src/modes/kinetic-glass/KineticGlassMode.ts`, `KineticGlassRenderer.ts`, `KineticGlassPanel.ts`
- Render strategy: realtime Three.js raster, PMREM studio environment and restrained bloom
- Presets: Clear Attraction, PLEOS Prism, Dark Mass
- Motion support: Yes, live pointer interaction with stable return to the approved 30° rest positions

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
- Path-traced still: Glass 3D Clear, Prism, and Smoked only; absent from Light Field workflow.
- High-resolution raster: Spectral Flow and Soft Spectral.
- Motion sequence: deterministic PNG sequence.
- Transparency: supported.
- PPI: PNG pHYs metadata plus physical-size print scaling.
- Current limitation: GPU maximum texture size still limits single-pass output dimensions.

## Inspector / UI

- Top bar — Mode, Variation and the primary Export action.
- Active Inspector — Style, Material, Lighting and Motion essentials in one continuous panel.
- Contextual details — material, lighting, geometry, camera, motion, output, render region and print metadata.
- Output — format, size, background, transparency and Mode-adapted export.
- Technical values stay collapsed until explicitly requested.

## Important Files

| File | Responsibility |
| --- | --- |
| `src/main.ts` | Production route selection and browser inspection/export API |
| `src/studio/StudioShell.ts` | Common Mode lifecycle and active Mode state ownership |
| `src/studio/ModeRegistry.ts` | Registered production Mode definitions |
| `src/studio/ModeTypes.ts` | Mode instance, capability and export-adapter contracts |
| `src/modes/glass-3d/Glass3DMode.ts` | First production Mode; owns the current Three.js optical environment |
| `src/modes/glass-3d/Glass3DExportAdapter.ts` | Maps common output intent to Glass 3D render strategies |
| `src/modes/light-field/LightFieldMode.ts` | Independent Light Field lifecycle, state, motion and variations |
| `src/modes/light-field/LightFieldRenderer.ts` | Raw WebGL2 fullscreen renderer and exact-size raster output |
| `src/modes/light-field/PngMetadata.ts` | Print PPI metadata injection for Light Field PNG output |
| `src/modes/light-field/shaders/field.frag.glsl` | Continuous inward field, spectral response, seams and origin compression |
| `src/modes/glass-prism/GlassPrismMode.ts` | Glass Prism lifecycle, state, variations, camera interaction and export |
| `src/modes/glass-prism/GlassPrismRenderer.ts` | Raw WebGL2 thickness-aware RGB refraction renderer |
| `src/modes/glass-prism/shaders/prism.frag.glsl` | Ray-box intersections, Snell refraction, Fresnel and dispersion |
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

- User request: Add cyclic Blue Red Green camera-facing light dominance to the spectral axis motion
- What changed: Regenerated runtime inspection, latest previews, validation state, and the current-state handoff.
- Why: Keep ChatGPT and Codex synchronized without manually copying project context.
- Main implementation decisions: Use the production inspect/export API and deterministic hero time; do not capture editor UI.

## Files Changed

- `README.md` — Git status M
- `artifacts/latest/preview-4x5.png` — Git status M
- `artifacts/latest/preview-9x16.png` — Git status M
- `artifacts/latest/preview-main.png` — Git status M
- `artifacts/latest/runtime-state.json` — Git status M
- `docs/AI_HANDOFF.md` — Git status M
- `docs/MODE_ARCHITECTURE.md` — Git status M
- `package-lock.json` — Git status M
- `package.json` — Git status M
- `scripts/render-motion-sequence.mjs` — Git status M
- `scripts/update-ai-handoff.mjs` — Git status M
- `scripts/verify-design-polish.mjs` — Git status M
- `scripts/verify-mode-lifecycle.mjs` — Git status M
- `scripts/verify-pathtracer.mjs` — Git status M
- `scripts/verify-retained-rendering.mjs` — Git status M
- `src/artboard/CompositionAdapter.ts` — Git status M
- `src/crystal/CrystalApp.css` — Git status M
- `src/crystal/CrystalAssembly.ts` — Git status M
- `src/crystal/LightingSystem.ts` — Git status M
- `src/crystal/MotionStudioApp.ts` — Git status M
- `src/crystal/ui/MotionPanel.ts` — Git status M
- `src/crystal/ui/StudioPanel.ts` — Git status M
- `src/crystal/variations/StudioVariation.ts` — Git status M
- `src/main.ts` — Git status M
- `src/modes/glass-3d/Glass3DMode.ts` — Git status M
- `src/motion/modules/SpectralAxisSweepMotion.ts` — Git status M
- `src/motion/presets/spectralAxisSweep.ts` — Git status M
- `src/motion/types.ts` — Git status M
- `src/studio/ModeTypes.ts` — Git status M
- `src/studio/StudioShell.ts` — Git status M
- `src/studio/StudioState.ts` — Git status M
- `vite.config.ts` — Git status M
- `archive/legacy-three/package-lock.json` — Git status ??
- `artifacts/axis-habitat/axis-habitat-blue-observatory.png` — Git status ??
- `artifacts/axis-habitat/luminous-drawing-preview-v2.png` — Git status ??
- `artifacts/axis-habitat/luminous-drawing-preview-v3.png` — Git status ??
- `artifacts/axis-habitat/luminous-drawing-preview-v4.png` — Git status ??
- `artifacts/axis-habitat/luminous-drawing-preview.png` — Git status ??
- `artifacts/axis-habitat/luminous-final-drawing.png` — Git status ??
- `artifacts/axis-habitat/luminous-final-material.png` — Git status ??
- `artifacts/axis-habitat/luminous-final-suspended.png` — Git status ??
- `artifacts/axis-habitat/luminous-isolate.png` — Git status ??
- `artifacts/axis-habitat/luminous-material-preview.png` — Git status ??
- `artifacts/axis-habitat/luminous-raw-preview.png` — Git status ??
- `artifacts/axis-habitat/luminous-suspended-preview.png` — Git status ??
- `artifacts/axis-habitat/luminous-tuned-preview.png` — Git status ??
- `artifacts/axis-habitat/luminous-visual-panel.png` — Git status ??
- `artifacts/axis-habitat/pleos-formation-material-hold.png` — Git status ??
- `artifacts/axis-habitat/pleos-formation-motion-panel.png` — Git status ??
- `artifacts/axis-habitat/pleos-formation-suspended.png` — Git status ??
- `artifacts/axis-habitat/pleos-formation-wire.png` — Git status ??
- `artifacts/axis-trails/axis-trails-pleos-blue.png` — Git status ??
- `artifacts/glass-prism/formats/portrait-4x5.png` — Git status ??
- `artifacts/glass-prism/formats/square.png` — Git status ??
- `artifacts/glass-prism/formats/vertical-9x16.png` — Git status ??
- `artifacts/glass-prism/motion/frame-000.png` — Git status ??
- `artifacts/glass-prism/motion/frame-025.png` — Git status ??
- `artifacts/glass-prism/motion/frame-050.png` — Git status ??
- `artifacts/glass-prism/motion/frame-075.png` — Git status ??
- `artifacts/glass-prism/motion/frame-100.png` — Git status ??
- `artifacts/glass-prism/presets/clear-glass.png` — Git status ??
- `artifacts/glass-prism/presets/dark-crystal.png` — Git status ??
- `artifacts/glass-prism/presets/frosted-prism.png` — Git status ??
- `artifacts/glass-prism/presets/rgb-prism.png` — Git status ??
- `artifacts/glass-prism/ui/glass-prism-default.png` — Git status ??
- `artifacts/light-field/formats/portrait-4x5.png` — Git status ??
- `artifacts/light-field/formats/square.png` — Git status ??
- `artifacts/light-field/formats/vertical-9x16.png` — Git status ??
- `artifacts/light-field/lifecycle/glass-before.png` — Git status ??
- `artifacts/light-field/lifecycle/glass-restored.png` — Git status ??
- `artifacts/light-field/lifecycle/light-field.png` — Git status ??
- `artifacts/light-field/motion/frame-000.png` — Git status ??
- `artifacts/light-field/motion/frame-025.png` — Git status ??
- `artifacts/light-field/motion/frame-050.png` — Git status ??
- `artifacts/light-field/motion/frame-075.png` — Git status ??
- `artifacts/light-field/motion/frame-100.png` — Git status ??
- `artifacts/light-field/presets/blue-core.png` — Git status ??
- `artifacts/light-field/presets/dark-spectral.png` — Git status ??
- `artifacts/light-field/presets/iridescent-pulse.png` — Git status ??
- `artifacts/light-field/presets/spectral-white.png` — Git status ??
- `artifacts/light-field/presets/violet-membrane.png` — Git status ??
- `artifacts/light-field/presets/warm-fold.png` — Git status ??
- `artifacts/light-field/ui/field-details.png` — Git status ??
- `artifacts/light-field/ui/inspector-collapsed.png` — Git status ??
- `artifacts/light-field/ui/light-field-default.png` — Git status ??
- `artifacts/light-field/ui/output.png` — Git status ??
- `artifacts/light-field/ui/variation-menu.png` — Git status ??
- `artifacts/renders/pleos-27-axis-brand-light-4k-square-midpoint.png` — Git status ??
- `artifacts/renders/pleos-27-axis-brand-light-4k-square.mp4` — Git status ??
- `artifacts/renders/pleos-axis-0-6s-512spp-594x841/frame-000000.png` — Git status ??
- `artifacts/renders/pleos-axis-0-6s-512spp-594x841/frame-000001.png` — Git status ??
- `artifacts/renders/pleos-axis-0-6s-512spp-594x841/frame-000002.png` — Git status ??
- `artifacts/renders/pleos-axis-0-6s-512spp-594x841/frame-000003.png` — Git status ??
- `artifacts/renders/pleos-axis-0-6s-512spp-594x841/frame-000004.png` — Git status ??
- `artifacts/renders/pleos-axis-0-6s-512spp-594x841/frame-000005.png` — Git status ??
- `artifacts/renders/pleos-axis-0-6s-512spp-594x841/frame-000006.png` — Git status ??
- `artifacts/renders/pleos-axis-0-6s-512spp-594x841/frame-000030.png` — Git status ??
- `artifacts/renders/pleos-axis-0-6s-512spp-594x841/frame-000060.png` — Git status ??
- `artifacts/renders/pleos-axis-0-6s-512spp-594x841/frame-000090.png` — Git status ??
- `artifacts/renders/pleos-axis-0-6s-512spp-594x841/frame-000120.png` — Git status ??
- `artifacts/renders/pleos-axis-0-6s-512spp-594x841/frame-000150.png` — Git status ??
- `docs/axis-habitat-research.md` — Git status ??
- `scripts/capture-glass-prism.mjs` — Git status ??
- `scripts/capture-light-field.mjs` — Git status ??
- `scripts/render-glass-prism-sequence.mjs` — Git status ??
- `scripts/render-light-field-sequence.mjs` — Git status ??
- `scripts/verify-axis-habitat-runtime.mjs` — Git status ??
- `scripts/verify-axis-habitat.mjs` — Git status ??
- `scripts/verify-axis-megastructure.mjs` — Git status ??
- `scripts/verify-axis-trails.mjs` — Git status ??
- `scripts/verify-glass-prism.mjs` — Git status ??
- `scripts/verify-kinetic-glass.mjs` — Git status ??
- `scripts/verify-light-field.mjs` — Git status ??
- `src/modes/axis-habitat/AxisFormationPanel.svelte` — Git status ??
- `src/modes/axis-habitat/AxisHabitat.css` — Git status ??
- `src/modes/axis-habitat/AxisHabitatExportAdapter.ts` — Git status ??
- `src/modes/axis-habitat/AxisHabitatMode.ts` — Git status ??
- `src/modes/axis-habitat/AxisHabitatPanel.ts` — Git status ??
- `src/modes/axis-habitat/AxisHabitatRenderer.ts` — Git status ??
- `src/modes/axis-habitat/AxisHabitatState.ts` — Git status ??
- `src/modes/axis-megastructure/AxisMegastructure.css` — Git status ??
- `src/modes/axis-megastructure/AxisMegastructureExportAdapter.ts` — Git status ??
- `src/modes/axis-megastructure/AxisMegastructureMode.ts` — Git status ??
- `src/modes/axis-megastructure/AxisMegastructurePanel.ts` — Git status ??
- `src/modes/axis-megastructure/AxisMegastructureRenderer.ts` — Git status ??
- `src/modes/axis-megastructure/AxisMegastructureState.ts` — Git status ??
- `src/modes/axis-trails/AxisTrailsExportAdapter.ts` — Git status ??
- `src/modes/axis-trails/AxisTrailsMode.ts` — Git status ??
- `src/modes/axis-trails/AxisTrailsPanel.ts` — Git status ??
- `src/modes/axis-trails/AxisTrailsRenderer.ts` — Git status ??
- `src/modes/axis-trails/AxisTrailsState.ts` — Git status ??
- `src/modes/glass-prism/GlassPrismExportAdapter.ts` — Git status ??
- `src/modes/glass-prism/GlassPrismMode.ts` — Git status ??
- `src/modes/glass-prism/GlassPrismPanel.ts` — Git status ??
- `src/modes/glass-prism/GlassPrismRenderer.ts` — Git status ??
- `src/modes/glass-prism/GlassPrismState.ts` — Git status ??
- `src/modes/glass-prism/shaders/prism.frag.glsl` — Git status ??
- `src/modes/kinetic-glass/KineticGlassExportAdapter.ts` — Git status ??
- `src/modes/kinetic-glass/KineticGlassMode.ts` — Git status ??
- `src/modes/kinetic-glass/KineticGlassPanel.ts` — Git status ??
- `src/modes/kinetic-glass/KineticGlassRenderer.ts` — Git status ??
- `src/modes/kinetic-glass/KineticGlassState.ts` — Git status ??
- `src/modes/light-field/LightFieldExportAdapter.ts` — Git status ??
- `src/modes/light-field/LightFieldMode.ts` — Git status ??
- `src/modes/light-field/LightFieldPanel.ts` — Git status ??
- `src/modes/light-field/LightFieldRenderer.ts` — Git status ??
- `src/modes/light-field/LightFieldState.ts` — Git status ??
- `src/modes/light-field/PngMetadata.ts` — Git status ??
- `src/modes/light-field/shaders/blur.frag.glsl` — Git status ??
- `src/modes/light-field/shaders/composite.frag.glsl` — Git status ??
- `src/modes/light-field/shaders/field.frag.glsl` — Git status ??
- `src/modes/light-field/shaders/fullscreen.vert.glsl` — Git status ??
- `svelte.config.js` — Git status ??
- `tmp/export-qa.html` — Git status ??
- `tmp/pdfs/g25-contact.png` — Git status ??
- `tmp/pdfs/g25/p21.png` — Git status ??
- `tmp/pdfs/g25/p22.png` — Git status ??
- `tmp/pdfs/g25/p23.png` — Git status ??
- `tmp/pdfs/g25/p24.png` — Git status ??
- `tmp/pdfs/g25/p26.png` — Git status ??
- `tmp/pdfs/g25/p28.png` — Git status ??
- `tmp/pdfs/g25/p3.png` — Git status ??
- `tmp/pdfs/g25/p31.png` — Git status ??
- `tmp/pdfs/g25/p32.png` — Git status ??
- `tmp/pdfs/g25/p33.png` — Git status ??
- `tmp/pdfs/g25/p37.png` — Git status ??
- `tmp/pdfs/g25/p8.png` — Git status ??
- `tmp/pdfs/k27-contact.png` — Git status ??
- `tmp/pdfs/k27/p10.png` — Git status ??
- `tmp/pdfs/k27/p11.png` — Git status ??
- `tmp/pdfs/k27/p12.png` — Git status ??
- `tmp/pdfs/k27/p13.png` — Git status ??
- `tmp/pdfs/k27/p3.png` — Git status ??
- `tmp/pdfs/k27/p7.png` — Git status ??
- `tmp/pdfs/k27/p8.png` — Git status ??
- `tmp/pdfs/k27/p9.png` — Git status ??
- `tmp/spectral-qa.html` — Git status ??
- `tmp/verify-video.log` — Git status ??

## Visual Changes

- The moving RGB rig now hands roughly 76 percent light share to Blue, Red, and Green in sequence; dominant emitters move forward and broaden while support colors remain on edges and bevels

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

None known

## Next Recommended Work

- Review the three latest previews after meaningful visual work.
- Run handoff:full at the end of completed implementation work.

## ChatGPT Re-scan Notes

- Read `artifacts/latest/runtime-state.json` for machine-readable branch, runtime, Look, motion, artboard, preview and validation state.
- Inspect `artifacts/latest/preview-main.png`, then compare the 4:5 and 9:16 previews for framing consistency.
- Start with `src/studio/StudioShell.ts`, then compare `src/modes/glass-3d/Glass3DMode.ts` and `src/modes/light-field/LightFieldMode.ts` as independent production Modes.
- Compare `src/crystal/materials/SpectralFlowMaterial.ts` with physical Look handling in `src/crystal/CrystalAssembly.ts`.
- Check Git remote information before assuming this working tree is already connected to `yubinparkwork/Pleos-27-Axis`.
