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
- Captured look: hybrid-ab; the default B route remains `/`.
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
- Projected directions: 45.53738007212621°, 90°, 157.88193385704812°, 225.5373800721262°, 270°, 337.8819338570481°
- Geometry source: `src/optical-studio/AxisGeometry.ts`; the geometry module preserves the approved unrounded legacy silhouette and common vertex at zero gap.
- Render geometry uses bevel-aware inward radial compensation: at zero gap all three rounded-cube pairs touch without volume overlap. Positive pair clearance is sqrt(3) times gap regardless of bevel. Orientation, canonical depth and assembly centroid are preserved. Pairwise tangency is not a common rounded triple vertex; inspect runtime renderedCenters and surfacesTouch.
- Do not change the approved shared origin, 30° projection, default camera, or three-solid silhouette without an explicit brand-structure request.
- Materials, shaders, lighting, motion, and artboard treatment are expression layers and may evolve while the Axis contract remains fixed.

## Current Expressions / Looks

### Optical Studio

- Role: editable virtual optical reflection layers on the approved three-cube Axis structure. The pre-emission reflection expression has been restored from saved-20260915085224893; saved settings and the later native MP4 workflow remain intact.
- Implementation: independent Raw WebGL2 analytic optical-image renderer. Active expression: hybrid-ab; emission enabled: false; physical-shell radiance: true. Virtual image rays use a limited Snell-based deflection with RGB IOR differences and continuous grazing projection; reflected studio illumination, Fresnel and depth attenuation shape the contour light.
- Lighting: four smooth analytic studio emitters and fixed world-space negative-fill apertures. Manual HEX and the Pleos RGB palette are preserved. Optional red → green → blue circulation transfers base incident-light energy weights 80/10/10. This is not a surface-albedo fill or self-emitting object material.
- Radiance pipeline: linear FP16 render targets, linear subpixel averaging, bounded highlight bloom, tone mapping, sRGB conversion and spatial AA. Range-compressed RGBA8 is a lower-precision fallback, not equivalent HDR quality.
- Floating render targets active in this capture: Yes.
- Reflection control model: A refracted image rays and rounded local normals; one-sided optical domain extension, remote caps nonreflecting at full opening. View-invariant radiance reported: false. Optical projection, reflected direction, Fresnel, occlusion and layer overlap vary with the viewing angle; the RGB lead cycle remains time-based.
- Dimension layers: not captured. Captured counts: top 5.05, left 11.85, right 12. Per-cube spacing and common softness/falloff remain editable; no opaque nested solids are inserted.
- The layer model is art-directed, not a physical glass or full spectral path tracer. Physical ray budget active: true; physical IOR active: true. IOR controls are active again. Stored bounce limits remain retained but disabled because physical-shell ray tracing is not the active expression.
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
- Captured hybrid metadata: `{"look":"hybrid-ab","revision":6,"base":"A closed optical proxy internal-reflection paths + open B anchor and motion","internalFaceTransport":"secondary closed rounded-cube proxy; no exterior or unreflected transmission; art-directed open-domain mapping","opening":1,"openAtFull":true,"transitionRevision":1,"transition":"shared contour formation, optical shoulder growth and gray-carrier release","faceReflection":{"strength":0.7,"width":0.5,"overlap":0.55,"maxImages":8},"color":"RGB 순환","powerFractionsRGB":[0.6935999989509583,0.15320000052452087,0.15320000052452087],"outerAxisLocked":true,"shellRadiance":true,"exteriorReflectionScale":0.035,"directTransmissionScale":0.12,"internalBounceBudget":16,"physicalPathTracing":false,"distortion":0.55,"density":0.55,"depthStudy":{"amount":0,"cycles":1,"calibratedHallD":false,"note":"concept only; screen geometry and viewing position required"}}`.
- V6 removes V5's broad pocket approximation and adds A's closed rounded-cube secondary optical transport, with Fresnel/TIR and neighbouring cube transmission. Exterior reflection and bounce-zero direct transmission are excluded. Open-surface-to-proxy mapping is art directed, not a physically open glass simulation. See `hybridInternalReflection.glsl` and `scripts/verify-hybrid-internal.mjs`.
- Hybrid transition revision 1 synchronizes image formation, optical reflection and gray-carrier release. Zero stagger no longer bypasses the fade-in. Existing loop envelopes blend in late. V6 retains the gray intro but intentionally changes completed V4 pixels. Boundary/30fps-frame/archived-V4/MP4 checks: `scripts/verify-hybrid-transition.mjs`, `artifacts/hybrid-transition/`.
- Direction and acceptance criteria: [HYBRID_AB_DIRECTION.md](HYBRID_AB_DIRECTION.md). Dedicated checks: [verify-hybrid-ab.mjs](../scripts/verify-hybrid-ab.mjs); the optional `PLEOS_HYBRID_4K=1` path checks native 4K PNG and a short MP4. A handoff pass alone does not assert that these dedicated checks ran.

## Motion System

- Runtime: optical-light-loop; absolute-time evaluation.
- Axis model motion: {"enabled":false,"yaw":0,"roll":0,"weight":0,"start":0,"peak":1.6666666666666667,"end":20,"cycles":3,"period":6.666666666666667,"requestedYaw":24,"requestedRoll":12,"safeYaw":20,"safeRoll":12,"safetyLimited":true,"pivot":[0,0,0],"method":"eased signed 0 → positive → 0 → negative → 0 swing; view-octant safety envelope; fixed camera; rigid shared Axis"}. OpticalAxisMotion.ts rigidly rotates the complete local geometry and light field about the shared origin, tracing inverse-transformed rays with the world camera fixed. Axis motion takes precedence over camera motion; old named saves remain disabled by default.
- Camera-only motion: {"enabled":false,"start":0,"peak":8,"end":20,"weight":0,"azimuth":32.275,"elevation":40.055,"baseAzimuth":32.275,"baseElevation":40.055,"horizontal":-24,"vertical":6,"target":[0,0,0],"method":"fixed Axis geometry; eased out-and-back orthographic camera orbit; saved pan and zoom unchanged"}. OpticalCameraMotion.ts evaluates an eased out-and-back orbit from saved camera angles; the 25Axis hold remains fixed. Base angles, geometry, pan and zoom are not animated or overwritten. Old saves default to disabled. Preview, PNG and MP4 share the same evaluated pose.
- Active 25엑시스 transition: `{"enabled":false,"name":"25엑시스","sourceSegment":5.3,"lightingBuildSeconds":3,"layerAppearance":{"enabled":false,"staggerSeconds":0,"count":12,"firstStart":5.3,"fadeSeconds":0.8,"lastStart":5.3,"completeAt":6.1,"order":"boundary nearest shared Axis first, then progressively inset images away from Axis"},"axisAccent":{"enabled":false,"progress":0,"envelope":0,"intensity":1,"amount":0,"start":5.42,"peak":6.199999999999999,"end":8.18,"role":"single eased highlight on the existing animated Axis folds; no new geometry or change to layer timing"},"oneShot":false,"loop":true,"isolatedSettings":false,"center":"constant camera pan for every phase; sequence starts at panX zero; subsequent manual changes preserved","method":"co-moving affine faces; dimension contours engrave narrow light into gray carriers, open into gradients, then locally release the carrier around the marks; only late residual closure; no two-shot crossfade","source":"procedural six-plane fit; no video or reference texture"}`.
- Axis accent: one eased key-light envelope per enabled transition loop, applied only to the existing nearest-Axis layer-zero contour. It reuses that contour's refraction, Fresnel and appearance masks; no screen-space line, new geometry or shifted layer timing. The 축 강조 강도 control is 0–2 in 0.05 steps (0 disables, default 1). Actual strength/timing are in the captured transition.axisAccent object.
- Optional RGB lead cycle uses a saved phase anchor, quintic transitions and one fixed red/green/blue sequence per duration, independent of custom palette edits. Fractions are base incident-light energy weights, not screen coverage. Default is disabled to preserve existing looks.
- Current duration: 20 seconds.
- Deterministic: Yes, reported by the runtime.
- Captured hero time: 2 seconds; playback is paused before each export.
- Playback state after capture: paused.
- `seek(time)` supports deterministic frame inspection. The default loop is 15 seconds.
- MP4: fixed-time sequential frames through exportVideo; includes the active transition and layer stagger; no realtime recording. Automatic PNG sequence UI is not implemented.
- Dimension amounts are continuous animation-ready state, but automatic layer-count modulation has not been added.
- Layer spacing is independently controlled per cube by dimensionSpacingTop / dimensionSpacingLeft / dimensionSpacingRight (0.06–0.3). Missing fields inherit the old shared spacing without resetting saved values. Softness and depth falloff remain shared.
- Spacing widens the existing contour lobe away from the shared world-space Axis. Straight contour geometry, world-axis distance and bounded width avoid bent bands and flat face fill. Layer fades, per-region timing and the 25엑시스 reveal stagger remain independent controls.

## Artboard / Export

- Available aspect presets from runtime: [{"id":"main","label":"1:1","ratio":1},{"id":"4x5","label":"4:5","ratio":0.8},{"id":"9x16","label":"9:16","ratio":0.5625},{"id":"16x9","label":"16:9","ratio":1.7777777777777777},{"id":"a-series","label":"A시리즈 · 세로","ratio":0.7071067811865475},{"id":"3x2","label":"3:2","ratio":1.5}]. A-series is portrait 1:√2, not a physical print-size/PPI selector. PNG uses nearest-pixel dimensions; MP4 rounds odd dimensions up by one pixel for encoder compatibility. UI and output use the same helpers.

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

- User request: A원본의 내부 면 반사 경로를 열린 통합안에 연결
- What changed: V5 pocket 그라데이션 제거. 닫힌 광학 proxy의 내부 반사 경로 추가.
- Why: 면 폭 확대가 아닌 실제 면의 내부 반사 요구
- Main implementation decisions: 원본 A 교차 Fresnel TIR 이웃투과 재사용. 외부 반사 및 직접 투과 제외. 열린면 좌표매핑은 미술적 근사. 사용자 설정 유지.

## Files Changed

- `src/optical-studio/hybridInternalReflection.glsl` — 내부 반사 경로
- `src/optical-studio/OpticalRenderer.ts` — 전용 셰이더 연결
- `src/optical-studio/hybridOptics.glsl` — V5 pocket 제거
- `src/optical-studio/optical.frag.glsl` — 반사 결과 합성
- `src/optical-studio/HybridAB.ts` — V6
- `scripts/verify-hybrid-internal.mjs` — 반사 분리 검사
- `scripts/verify-hybrid-transition.mjs` — 전환 회귀
- `docs/HYBRID_AB_DIRECTION.md` — 설계 설명
- `scripts/optical-handoff.mjs` — 현재 상태 설명
- `versions.json` — V6 보관

## Visual Changes

- 내부 면 반사 경계와 공간 깊이 추가
- 외부 proxy 큐브는 표시하지 않음
- 열린 원거리 감쇠 유지

## Latest Previews

| Preview | Pixels | Look | Hero time |
| --- | ---: | --- | ---: |
| `artifacts/latest/preview-main.png` | 640 × 800 | hybrid-ab | 2s |
| `artifacts/latest/preview-4x5.png` | 640 × 800 | hybrid-ab | 2s |
| `artifacts/latest/preview-9x16.png` | 450 × 800 | hybrid-ab | 2s |

All previews were captured in this handoff run.

## Validation

- npm run typecheck — PASS
- npm run verify — PASS
- npm run build — PASS
- Browser console — PASS
- Runtime inspection and three PNG captures — PASS

Validation values are generated from commands executed during this handoff. `NOT-RUN` is never treated as PASS. A failed command remains failed even if runtime capture succeeds; `npm run verify` may stop at its first failing subcommand.



## Known Issues

- 닫힌 광학 proxy를 열린면에 매핑한 미술적 근사. V6 로컬 저장은 GitHub 백업이 아님. 4K 전체 영상은 이번 검사에 포함하지 않음.
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
