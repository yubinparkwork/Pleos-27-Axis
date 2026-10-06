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
- Active application: OpticalStudio
- Captured look: reflective-dimensions; the default B route remains `/`.
- Runtime capture: available
- Renderer: WebGL2 analytic optical contours / linear HDR
- Projection: orthographic
- Main structure: three analytically intersected rounded cubes in the approved Axis relationship.
- Browser API: `window.__pleosOptical` — inspect, set, seek, pause, capture, exportVideo, cancelVideo and reset.
- Preserved previous application: `?renderer=studio`; prior Dimention R3F and the other studio modes are available there.
- Other reference routes: `?renderer=raw` and `?renderer=legacy`.
- Named draft: `../pleos-snapshots/pleos-dimension-draft-20260910-155444/` is immutable and separate from this active application.

## Axis Identity

- Axis family: 30deg
- Cube count: 3
- Shared origin valid: No; inspect the current gap setting
- Projected directions: 9.31640830154197°, 90°, 103.90944952658475°, 189.316408301542°, 270°, 283.90944952658475°
- Geometry source: `src/optical-studio/AxisGeometry.ts`; the geometry module preserves the approved unrounded legacy silhouette and common vertex at zero gap.
- Render geometry uses bevel-aware inward radial compensation: at zero gap all three rounded-cube pairs touch without volume overlap. Positive pair clearance is sqrt(3) times gap regardless of bevel. Orientation, canonical depth and assembly centroid are preserved. Pairwise tangency is not a common rounded triple vertex; inspect runtime renderedCenters and surfacesTouch.
- Do not change the approved shared origin, 30° projection, default camera, or three-solid silhouette without an explicit brand-structure request.
- Materials, shaders, lighting, motion, and artboard treatment are expression layers and may evolve while the Axis contract remains fixed.

## Current Expressions / Looks

### Optical Studio

- Role: editable virtual optical reflection layers on the approved three-cube Axis structure. The pre-emission reflection expression has been restored from saved-20260915085224893; saved settings and the later native MP4 workflow remain intact.
- Implementation: independent Raw WebGL2 analytic optical-image renderer. Active expression: reflective-dimensions; emission enabled: false; physical-shell radiance: false. Virtual image rays use a limited Snell-based deflection with RGB IOR differences and continuous grazing projection; reflected studio illumination, Fresnel and depth attenuation shape the contour light.
- Lighting: four smooth analytic studio emitters and fixed world-space negative-fill apertures. Manual HEX and the Pleos RGB palette are preserved. Optional red → green → blue circulation transfers base incident-light energy weights 80/10/10. This is not a surface-albedo fill or self-emitting object material.
- Radiance pipeline: linear FP16 render targets, linear subpixel averaging, bounded highlight bloom, tone mapping, sRGB conversion and spatial AA. Range-compressed RGBA8 is a lower-precision fallback, not equivalent HDR quality.
- Floating render targets active in this capture: Yes.
- Reflection control model: static reflection-lobe concentration only; legacy state key retained; no image ray or contour curvature. View-invariant radiance reported: false. Optical projection, reflected direction, Fresnel, occlusion and layer overlap vary with the viewing angle; the RGB lead cycle remains time-based.
- Dimension layers: continuous light-only virtual cubical reflection layers, fractional last-layer fade; physical-shell radiance excluded. Captured counts: top 1.4, left 11.85, right 12. Per-cube spacing and common softness/falloff remain editable; no opaque nested solids are inserted.
- The layer model is art-directed, not a physical glass or full spectral path tracer. Physical ray budget active: false; physical IOR active: true. IOR controls are active again. Stored bounce limits remain retained but disabled because physical-shell ray tracing is not the active expression.
- Main files: `src/optical-studio/OpticalRenderer.ts`, `src/optical-studio/optical.frag.glsl` and `src/optical-studio/OpticalResolve.ts`.
- Settings: the complete captured settings object is preserved in `artifacts/latest/runtime-state.json` under `runtime.state`.
- The active optical renderer does not use React Three Fiber or the previous studio's material pipeline.
- RGB IOR differences are a three-channel optical approximation, not full spectral transport. Physical-shell tracing is inactive in default B, but active in cube0914 and Hybrid V2. The removed dimensionEmission.glsl experiment exists only in local archive saved-20260915090434072, not current source. No volumetric caustics or temporal random-noise accumulation are used.

### A/B Hybrid — opt-in expression

- Route: `?look=hybrid-ab`, also available as `A/B 통합안 · 현재 조정` in the version dropdown. This independent shader variant keeps B at the default `/` and preserves the 09.14 cube A expression at `?look=cube0914`.
- V2 contract: actual A finite-cube entry refraction, rounded internal reflection images and bounded multi-bounce `traceGlass`, plus B's single sharp Axis anchor and motion. Suppress exterior first reflection to .035 and direct unreflected transmission to .12, retaining deeper internal reflections. This is deterministic ray integration plus authored virtual images, not Monte Carlo path tracing. V1 is preserved in local snapshot `saved-20260921073913986`.
- Current V3: `hybridOpening` defaults to 1. Extend the A optical boundary domain AND each reflection-image domain away from the shared origin by the same amount; keep the three Axis-facing planes and local optical curvature fixed. At full opening remote caps cannot reflect internal rays. Smooth distant falloff is not a mask at the former cube boundary. Zero restores closed V2, preserved as `saved-20260921082636619`. B and original A are untouched. The domain is bounded, not an infinite physical medium.
- Controls: `hybridDistortion` changes inner optical-image curvature; `hybridDensity` relaxes attenuation; `hybridColorMix` adjusts RGB overlap. `bounces` controls actual internal ray depth (1–16); escaped open rays may terminate earlier. Layer-zero and canonical solid geometry remain unchanged, while the expression's optical carrier extends. Partial opening can retain distant closing silhouettes; view-dependent refraction remains.
- Colour: RGB circulation or four fixed compositions — balanced main, red dominant, green dominant and blue dominant. Fixed composition locks colour weights while the existing motion continues. These are incident-light weights, not promises of equal screen area.
- Optional depth study: `hybridDepthFlow` and `hybridDepthCycles` move virtual images inward over a deterministic loop. This is a concept test; Hall D screen shape, dimensions and viewing position have not been calibrated.
- Persistence: first use seeds from readable B settings, then saves independently under `pleos-optical-studio-v1:hybrid-ab`; A/B settings and immutable snapshots remain separate. Native long-edge 3840px PNG and deterministic MP4 reuse the existing guarded HDR export path and codec limitations.
- Current V4 adds broad optical shoulders on open images using the same RGB rig, a bounded face aperture and displaced optical normals, not opaque geometry or emission. Controls: `hybridFaceReflection` (0–2, default .7), `hybridFaceWidth` (0–1, .5), `hybridRefractionOverlap` (0–1, .55). Strength 0 restores V3 (`saved-20260922034933369`); opening 0 keeps V2. Additional shoulders are bounded to eight images. These are art-directed reflection images, not a full scattering simulation. Dedicated QA artifacts: `artifacts/hybrid-face/`.
- Captured hybrid metadata: not active in this capture; availability is not a verification result.
- V6 removes V5's broad pocket approximation and adds A's closed rounded-cube secondary optical transport, with Fresnel/TIR and neighbouring cube transmission. Exterior reflection and bounce-zero direct transmission are excluded. Open-surface-to-proxy mapping is art directed, not a physically open glass simulation. See `hybridInternalReflection.glsl` and `scripts/verify-hybrid-internal.mjs`.
- Hybrid transition revision 1 synchronizes image formation, optical reflection and gray-carrier release. Zero stagger no longer bypasses the fade-in. Existing loop envelopes blend in late. V6 retains the gray intro but intentionally changes completed V4 pixels. Boundary/30fps-frame/archived-V4/MP4 checks: `scripts/verify-hybrid-transition.mjs`, `artifacts/hybrid-transition/`.
- Direction and acceptance criteria: [HYBRID_AB_DIRECTION.md](HYBRID_AB_DIRECTION.md). Dedicated checks: [verify-hybrid-ab.mjs](../scripts/verify-hybrid-ab.mjs); the optional `PLEOS_HYBRID_4K=1` path checks native 4K PNG and a short MP4. A handoff pass alone does not assert that these dedicated checks ran.

### Axis face separation study

- Optional route: `?look=hybrid-axis-split`; selectable as “A/B 통합안 · 축 면 분리 시안”. Original `?look=hybrid-ab` remains unchanged and independently saved.
- `axisFaceGap` now separates nine finite-thickness rounded dielectric panels (three per original domain). The former hit-discard aperture implementation has been removed. Actual front/back/side/rim intersections and normals drive physical reflection/refraction; virtual dimension images are transported with each face and roll off toward its polished lip. 0 restores the original connected domain. The interior image family is still an art-directed optical proxy, not a fully physical multi-scattering simulation. Crossing exactly zero changes topology; panel separation is not designed as a continuous zero-crossing animation. More intersections cost additional GPU time.
- `scripts/test-detached-panel-geometry.mjs` runs the production GLSL in a float target and verifies front/back/side hits, rounded normals, an unobstructed gap ray and transported image coordinates.
- Primary camera hits now use `splitFrontHit`: only outward fronts and front rims carry visible images. Back/thickness walls remain internal transport boundaries but no longer appear directly as coloured surfaces through the joints. B anchor and hybrid image branches share the same primary hit. GPU tests verify camera back/side misses and a front hit; artist wide-gap comparison is in `artifacts/axis-face-split/rear-before.png` and `rear-after.png`.
- The split-study Axis anchor now uses a fixed planar normal and source sampling projected onto its nearest straight edge, returning to original shading across 0.01–0.04 times uHalf. A narrow world-space edge strip (0.005–0.035 times uHalf) gradually admits the original curved inner images; internal distortion is unchanged beyond that strip. This is a radiance-layer separation, not moving the Axis or painting an outline. See `straight-before.png` / `straight-after.png` in the same QA folder.
- Separate persistence: `pleos-optical-studio-v1:hybrid-axis-split`. Dedicated QA: `npm run verify:axis-face-split`; screenshots/report in `artifacts/axis-face-split/`.
- Layer Light Flow: `layerLightContrast` (default 0 preserves previous images), `layerLightLength`, and integer `layerLightCycles` drive object-space brightness toward the shared Axis origin, without moving contours/normals. All regions/images share the same flow clock (no per-layer/region phase offsets); existing appearance fades remain independent. Controls use existing persistence/history/variation and fixed-time output. QA: `npm run verify:layer-light`, including an actual GLSL inward-crest test.

### COEX D Hall dimension gate — separate extension

- Optional route: `?look=coex-gate`; version dropdown “코엑스 D홀 · 디멘션 게이트”. Original Axis routes/settings are preserved.
- Files: `src/gate/GateStudio.ts`, `GateRenderer.ts`, `gate.frag.glsl`, `GateState.ts`, `GateExport.ts`.
- 5248×2112 public unfolded mapping, top 576px, side legs 448px, physical central passage masked black. Confirm venue mapping before delivery.
- Art-directed open U-plane optical images reuse HybridAB shoulder/crest, attenuation and dispersion language plus production tone mapping; not the cube physical integrator or volumetric path tracing.
- First-use black-to-layered introduction then continuous inward Z projection and RGB temporal transport. Browser-local isolated gate settings.
- Gate cornerRadius 0–320px (default 120) and bloomDirection −1..1 (default +1) are editable/saved/undoable/exported. +1 releases light below/inward from a sharper top/outside core, −1 reverses, 0 is symmetric. Stable near-core normals avoid pixel-scale angular flips. Dedicated rounding/directional profile QA: artifacts/coex-gate/rounding-release-validation.json.
- Gate lighting shares active OpticalStudio environmentProfile emitters with gate-specific Snell/Fresnel virtual-image rays (not the entire cube transport engine). Its adapter alone omits cube-diagonal negative-fill flags. One open rounded U distance field and a continuous contour-local optical frame replace the diagonal top/side ownership seam. Independent frontWidth (8–320 design px on both top and sides) and widthTaper (0–3) controls migrate old gate saves with defaults 120 / 1.2 and preserve undo/export. Corner QA: artifacts/coex-gate/corner-validation.json.
- PNG/native MP4 export with shared OPFS encoder helpers. Seamless loop output quantizes only export-snapshot Z speed to integer cycles per RGB period.
- Dedicated test/report: `scripts/verify-coex-gate.mjs`, `artifacts/coex-gate/validation.json`. These previews are separate from default latest Axis captures; default handoff runtime does not inspect the gate route.

## Motion System

- Runtime: optical-light-loop; absolute-time evaluation.
- Axis model motion: {"enabled":false,"yaw":0,"roll":0,"weight":0,"start":0,"peak":1.875,"end":15,"cycles":2,"period":7.5,"requestedYaw":24,"requestedRoll":12,"safeYaw":6.328296661376953,"safeRoll":3.796977996826172,"safetyLimited":true,"pivot":[0,0,0],"method":"eased signed 0 → positive → 0 → negative → 0 swing; view-octant safety envelope; fixed camera; rigid shared Axis"}. OpticalAxisMotion.ts rigidly rotates the complete local geometry and light field about the shared origin, tracing inverse-transformed rays with the world camera fixed. Axis motion takes precedence over camera motion; old named saves remain disabled by default.
- Camera-only motion: {"enabled":false,"start":0,"peak":8,"end":15,"weight":0,"azimuth":78.60406250000001,"elevation":54.47843750000001,"baseAzimuth":78.60406250000001,"baseElevation":54.47843750000001,"horizontal":-24,"vertical":6,"target":[0,0,0],"method":"fixed Axis geometry; eased out-and-back orthographic camera orbit; saved pan and zoom unchanged"}. OpticalCameraMotion.ts evaluates an eased out-and-back orbit from saved camera angles; the 25Axis hold remains fixed. Base angles, geometry, pan and zoom are not animated or overwritten. Old saves default to disabled. Preview, PNG and MP4 share the same evaluated pose.
- Active 25엑시스 transition: `{"enabled":false,"name":"25엑시스","sourceSegment":5.3,"lightingBuildSeconds":3,"layerAppearance":{"enabled":false,"staggerSeconds":0,"count":12,"firstStart":5.3,"fadeSeconds":0.8,"lastStart":5.3,"completeAt":6.1,"order":"boundary nearest shared Axis first, then progressively inset images away from Axis"},"axisAccent":{"enabled":false,"progress":0.7333333333333334,"envelope":0,"intensity":1,"amount":0,"start":5.42,"peak":6.199999999999999,"end":8.18,"role":"single eased highlight on the existing animated Axis folds; no new geometry or change to layer timing"},"oneShot":false,"loop":true,"isolatedSettings":false,"center":"constant camera pan for every phase; sequence starts at panX zero; subsequent manual changes preserved","method":"co-moving affine faces; dimension contours engrave narrow light into gray carriers, open into gradients, then locally release the carrier around the marks; only late residual closure; no two-shot crossfade","source":"procedural six-plane fit; no video or reference texture"}`.
- Axis accent: one eased key-light envelope per enabled transition loop, applied only to the existing nearest-Axis layer-zero contour. It reuses that contour's refraction, Fresnel and appearance masks; no screen-space line, new geometry or shifted layer timing. The 축 강조 강도 control is 0–2 in 0.05 steps (0 disables, default 1). Actual strength/timing are in the captured transition.axisAccent object.
- Optional RGB lead cycle uses a saved phase anchor, quintic transitions and one fixed red/green/blue sequence per duration, independent of custom palette edits. Fractions are base incident-light energy weights, not screen coverage. Default is disabled to preserve existing looks.
- Current duration: 15 seconds.
- Deterministic: Yes, reported by the runtime.
- Captured hero time: 7.5 seconds; playback is paused before each export.
- Playback state after capture: paused.
- `seek(time)` supports deterministic frame inspection. The default loop is 15 seconds.
- MP4: fixed-time sequential frames through exportVideo; includes the active transition and layer stagger; no realtime recording. Automatic PNG sequence UI is not implemented.
- Dimension amounts are continuous animation-ready state, but automatic layer-count modulation has not been added.
- Layer spacing is independently controlled per cube by dimensionSpacingTop / dimensionSpacingLeft / dimensionSpacingRight (0.06–0.3). Missing fields inherit the old shared spacing without resetting saved values. Softness and depth falloff remain shared.
- Spacing widens the existing contour lobe away from the shared world-space Axis. Straight contour geometry, world-axis distance and bounded width avoid bent bands and flat face fill. Layer fades, per-region timing and the 25엑시스 reveal stagger remain independent controls.

## Artboard / Export

- Available aspect presets from runtime: [{"id":"main","label":"1:1","ratio":1},{"id":"4x5","label":"4:5","ratio":0.8},{"id":"9x16","label":"9:16","ratio":0.5625},{"id":"16x9","label":"16:9","ratio":1.7777777777777777},{"id":"a-series","label":"A시리즈 · 세로","ratio":0.7071067811865475},{"id":"3x2","label":"3:2","ratio":1.5},{"id":"custom","label":"직접 입력","ratio":1}]. A-series is portrait 1:√2, not a physical print-size/PPI selector. PNG uses nearest-pixel dimensions; MP4 rounds odd dimensions up by one pixel for encoder compatibility. UI and output use the same helpers.

- Captured artboard: 3072 × 3840 (4x5).
- Raster export: exact-size PNG via `capture(width, height, samples)` with tiled high-resolution rendering.
- The interface exposes native long-edge 3840px PNG with 4×4 (16) spatial samples averaged in linear light before tone mapping. Canvas2D assembles final pixels only, without display-RGB supersample averaging. Latest handoff previews below use their recorded pixel dimensions and four samples.
- Both preview and export render off-artboard guard bands covering the scaled bloom footprint and spatial-AA reach, then crop. Outer image boundaries and internal tile seams use the same lighting support; output is not an enlarged preview screenshot.
- Main preview retains the active artboard aspect with a maximum long edge of 1080 pixels. Portrait previews default to 1080 × 1350 and 1080 × 1920.
- `--preview-long-edge` or `PLEOS_HANDOFF_PREVIEW_LONG_EDGE` can reduce preview dimensions; decoded PNG dimensions are recorded and checked.
- Captured renderer limits: `{"maxOutputDimension":8192,"maxOutputPixels":34000000,"maxInternalBounces":16,"maxTextureSize":16384}`.
- Video capability reported by runtime: `{"busy":false,"status":"대기 중","progress":0,"format":"MP4 / H.264 preferred, HEVC Main8 fallback at unchanged resolution / sRGB 8-bit, no audio","deterministic":true,"maxLongEdge":3840,"fps":[24,30,60],"spatialSamples":[4,16],"method":"sequential fixed-time guarded HDR tiles; bounded encoder queue; no screen recording or upscaling"}`.
- MP4 controls: long edge 3840/1920px, 24/30/60fps, 4/16 spatial samples, same camera/aspect and full timeline. A reusable guarded-tile frame capture feeds the browser encoder sequentially; OPFS disk output or a bounded 256MiB memory fallback. Abort/error releases output resources and restores preview state. Actual codec support is checked before rendering, never silently downscaled.
- PNG and MP4 are opaque 8-bit sRGB; MP4 is lossy and silent. No transparent/PPI-aware print or HDR-video UI. The older print workflows remain in the preserved studio instead.

## Inspector / UI

- Structure Lighting UI is simplified to two faces per region in the standard Axis view: Top X/Z, Left X/Y, Right Y/Z. Hidden inputs and stored gains remain intact. No renderer changes or camera-dependent panel switching.

- Hybrid “구조 라이팅” adjusts parent cube wall/floor orientation, not internal image normals: structureTop/Left/Right X/Y/Z gain 0–3, default 1; structureContrast 0–1, default 0. Entry geometry normal is evaluated before image transport. The same achromatic gain multiplies base dimension bands, traced reflection/refraction and broad reflected faces; 25 Axis carrier remains untouched. Continuous bevel weights, no camera-selected face switching. Existing image-face controls remain independent. Validation: npm run verify:structure-light; artifacts/structure-light/validation.json.

- Hybrid current adjustment includes “면별 디멘션 라이팅”: per-region X/Y/Z optical image gain (0–3, default 1), smoothly weighted by object-space image normals across bevels. Paired ± faces share each directional gain. faceDimensionContrast defaults 0; raises vertical and reduces horizontal reflection energy. Applied to dimension bands and their broad image shoulders, not outer surface paint or Axis geometry. Settings, undo, full variations, PNG and MP4 use the same state. Validation: npm run verify:face-dimensions; artifacts/face-dimension-light/validation.json.

- OpticalStudio owns a fresh Korean interface with monochrome application controls.
- Collapsible sections: 25엑시스 → 디멘션, 빛 모션, 영역별 타이밍, 형태, 디멘션 레이어, 광학, 조명, 카메라, 출력. Existing section IDs and handlers remain compatible. The bottom transport controls time, loop length, light travel amount and artboard aspect.
- 디멘션 레이어 has three independent 0–50 layer sliders and a collapsed spacing/softness/falloff group. 조명 has the preserved colour picker/HEX/Pleos palette, RGB-cycle toggle, live base energy fractions, light intensity, source width, exposure and bloom. 광학 controls active IOR, dispersion, diffusion, reflection concentration/gain and absorption; only the preserved physical-ray bounce limit is disabled.
- 레퍼런스 무드 적용 changes optical appearance while retaining the current camera, gap and artboard; the first pre-application local setting is preserved in `pleos-optical-before-luminous-v1` rather than replacing the named draft.
- Layer, lighting, motion and output controls edit the independent optical state in `pleos-optical-studio-v1`. Browser origins do not share localStorage automatically.
- The artboard and export controls belong to OpticalStudio; prior mode selectors and legacy settings remain in the preserved studio route.
- Main files: `OpticalStudio.ts`, `OpticalPanel.ts` and `OpticalStudio.css` inside `src/optical-studio/`.
- Hybrid-only additions: A/B 통합 재질, 정지 컬러 / 순환 and the collapsed 공간 깊이 테스트 (Hall D 도면 미반영). Its colour selector replaces the visible legacy RGB-cycle toggle; ordinary B and cube0914 panels retain their own controls.

## Important Files

| File | Responsibility |
| --- | --- |
| `src/main.ts` | Default OpticalStudio and preserved reference route selection |
| `src/optical-studio/OpticalStudio.ts` | Active application lifecycle and browser inspection/export API |
| `src/optical-studio/OpticalRenderer.ts` | Independent WebGL2 renderer and reusable guarded-tile PNG/video frame capture |
| `src/optical-studio/OpticalVideoExporter.ts` | Deterministic native-resolution MP4 encoding, bounded storage and cancellation |
| `scripts/verify-optical-video.mjs` | Real 4K MP4 decode comparison, timing, cancellation and UI verification |
| `src/optical-studio/optical.frag.glsl` | Axis intersections, virtual refracted contour layers and transition-only first-layer key-light accent |
| `src/optical-studio/IdentityAxisAccent.ts` | Single eased Axis-light envelope within the unchanged 25엑시스 transition timing |
| `src/optical-studio/OpticalResolve.ts` | Linear HDR targets, supersample averaging, highlight bloom and display resolve |
| `src/optical-studio/OpticalState.ts` | Independent optical settings and defaults |
| `src/optical-studio/OpticalLighting.ts` | Deterministic RGB base incident-light weights and linear palette |
| `src/optical-studio/HybridAB.ts` | Opt-in hybrid route, independent seed/defaults, RGB compositions and inspection metadata |
| `src/optical-studio/hybridOptics.glsl` | V2 fully refracted finite reflection-image family with B temporal gates |
| [docs/HYBRID_AB_DIRECTION.md](HYBRID_AB_DIRECTION.md) | A/B design contract, KV/crop/POP directions, print checks and uncalibrated Hall D scope |
| [scripts/verify-hybrid-ab.mjs](../scripts/verify-hybrid-ab.mjs) | Hybrid controls, colour captures, loop, independent persistence, unchanged A/B and optional 4K PNG/short MP4 checks |
| `src/optical-studio/LuminousReference.ts` | Appearance-only reference mood and pre-application backup key |
| `src/optical-studio/AxisGeometry.ts` | Canonical three-cube coordinates and separation |
| `src/optical-studio/OpticalPanel.ts` | Korean editing and export controls |
| `src/optical-studio/OpticalStudio.css` | Monochrome application layout and appearance |
| `scripts/verify-optical-geometry.mjs` | Geometry, common vertex and original silhouette checks |
| `scripts/verify-optical-dimensions.mjs` | Continuous layers, optical colour/core, persistence and guarded HDR tile verification |
| `scripts/verify-optical-light-cycle.mjs` | RGB power continuity, loop, manual roundtrip, UI persistence and captures |
| `scripts/update-ai-handoff.mjs` | Dispatches production or explicitly requested legacy handoff |
| `scripts/optical-handoff.mjs` | Production runtime capture, validation and current handoff |
| `src/studio/StudioShell.ts` | Previous multi-mode studio preserved at ?renderer=studio |

## Latest Task

- User request: 게이트 빛 폭 범위 확장
- What changed: 앞쪽 빛 폭 최대 1280 및 초과구간 광학 폭 확장
- Why: 320 한계와 내부 폭 포화 해소
- Main implementation decisions: 320 이하 기존 표현과 저장값 보존

## Files Changed

- `src/gate/GateState.ts` — 범위
- `src/gate/gate.frag.glsl` — 확장
- `scripts/verify-coex-gate.mjs` — 검증

## Visual Changes

- 확장된 빛 폭

## Latest Previews

| Preview | Pixels | Look | Hero time |
| --- | ---: | --- | ---: |
| `artifacts/latest/preview-main.png` | 864 × 1080 | reflective-dimensions | 7.5s |
| `artifacts/latest/preview-4x5.png` | 1080 × 1350 | reflective-dimensions | 7.5s |
| `artifacts/latest/preview-9x16.png` | 1080 × 1920 | reflective-dimensions | 7.5s |

All previews were captured in this handoff run.

## Validation

- npm run typecheck — PASS
- npm run verify — PASS
- npm run build — PASS
- Browser console — PASS
- Runtime inspection and three PNG captures — PASS

Validation values are generated from commands executed during this handoff. `NOT-RUN` is never treated as PASS. A failed command remains failed even if runtime capture succeeds; `npm run verify` may stop at its first failing subcommand.



## Known Issues

- MP4 depends on the browser supporting the requested dimensions/fps; lossy 8-bit output has no alpha/audio/HDR. Long exports must keep the tab open; automatic PNG sequence UI is not implemented.
- Dimension contours are bounded, art-directed virtual optical images; reflected direction, Fresnel, projection/overlap/occlusion vary with view. They are not a volumetric caustic or full spectral path tracer.

## Next Recommended Work

- Review the three latest previews after meaningful visual work.
- Resolve any failed validation commands before treating the full suite as passing.

## ChatGPT Re-scan Notes

- Read `artifacts/latest/runtime-state.json` for branch, complete optical settings, Axis, motion, artboard, preview dimensions and validation evidence.
- Inspect `artifacts/latest/preview-main.png`, then compare the 4:5 and 9:16 previews for framing consistency.
- Start with `src/optical-studio/OpticalStudio.ts`, `OpticalRenderer.ts` and `optical.frag.glsl` for the active application.
- Inspect `OpticalResolve.ts` before evaluating output quality; FP16 averaging and bloom occur before display encoding. Dimension sliders bound authored optical-image layer count, not physical cubes or physical reflection bounces.
- Compare `surfaceCurvature` with geometric bevel: the former changes the reflected-light filter's normal concentration, not refracted projection or geometric structure. Inspect `IdentityAxisAccent.ts` and the layer-zero accent in `optical.frag.glsl`; strength 0 disables the new transition emphasis without changing layer timing.
- Use `window.__pleosOptical` on the default route. The older `window.__pleos27Axis` API belongs to `?renderer=studio`.
- Refresh production handoff without `--mode`, or with `--mode optical`. Pass an explicit prior mode only when intentionally documenting the preserved studio.
- To capture the hybrid expression, set `PLEOS_HANDOFF_URL` to the running site's `?look=hybrid-ab` URL. Inspect `runtime.hybrid` and the captured look; this does not change the default route.
- Check Git remote information before assuming this working tree is already connected to `yubinparkwork/Pleos-27-Axis`.
