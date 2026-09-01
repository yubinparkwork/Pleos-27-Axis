# PLEOS 27 Axis — Mode Architecture

## Axis Core

`src/axis` is the only canonical source for the shared origin, approved angle families, directions, sectors and composition references. A Mode may reinterpret that structure, but it must preserve the approved 30° family and shared-origin relationship.

## Studio Shell Ownership

`StudioShell` owns the controls that must remain stable when renderers change:

- production Mode selection;
- Variation selection and routing;
- primary Export focus;
- Inspector collapse state;
- motion play/pause/seek transport;
- shared artboard dimensions;
- persisted per-Mode state namespaces.

The Shell does not import Three.js or assume a renderer. A Mode owns only its canvas, renderer, contextual Inspector, variations, export adapter and renderer-specific state.

## Production Modes

### Glass 3D

`Glass3DMode` wraps the established Three.js optical studio. It owns three closed solids, physical glass Looks, studio lighting, camera, deterministic motion, raster preview and supported path-traced stills. Existing browser commands are preserved as compatibility commands, while common operations go through the Shell API.

### Light Field

`LightFieldMode` is an independent raw WebGL2 renderer. It does not instantiate Three.js, the glass assembly or the path tracer. One fullscreen shader ray-marches the canonical three-cube structure and maps a loopable world-space iridescent membrane across the rounded surfaces. A warped void, white crest and spectral contour echoes replace the former linear gradient bands. Its production presets are Iridescent Pulse, Violet Membrane and Spectral White.

### Kinetic Glass

`KineticGlassMode` independently adapts the interaction principles of a glass rigid-body study to the PLEOS three-cube identity. Three locked-rotation Rapier bodies use zero gravity, bounded pointer repulsion and spring attraction toward the approved `90° / 210° / 330°` rest positions. The renderer uses Three.js `MeshPhysicalMaterial`, PMREM studio reflections and restrained bloom. Its Korean contextual Inspector owns physics, glass, geometry, artboard and PNG controls; path tracing is explicitly unsupported.

### Axis Trails

`AxisTrailsMode` renders cursor-following spring chains as Three.js wide lines. Trail direction converges to the canonical 30-degree family while all lines retain one shared signal origin. It owns realtime pointer motion, deterministic autonomous motion, bloom, raster export, and three Mode-scoped variations.

### Formation Loop

`AxisHabitatMode` keeps its legacy ID for saved-state compatibility but is presented as Formation Loop. It reuses the exact `CrystalAssembly` cube basis, three local touch corners and one shared origin. The three cubes remain recognizable architectural bounds, but their complete cell wire is suppressed. A deterministic generator places partial boundary segments, interior axis lines, diagonals, triangular links and selected long extensions inside and around each bound; brightness, spectral color, reveal delay and apparent width energy vary per segment. Custom WebGL shaders render that network as white-hot cores, additive spectral glow and outer halos, with a separate procedural flare point pass for selected nodes. GSAP evaluates a deterministic, state-driven draw/assemble/material/explode/return timeline. The 375 instanced physical cells appear only as low-opacity volume cues and separable fragments, so matter never overtakes the luminous skeleton. Timing, overlaps and easing rebuild only the paused timeline, while ordering, stagger, turbulence, overshoot, surface fade, camera pullback and connector behavior are evaluated per frame without rebuilding geometry. Three static `three-mesh-bvh` proxy solids provide first-hit pointer focus without rebuilding a BVH for every moving cell. A Svelte component owns a Motion/Visual/Output Inspector with progressive disclosure for motion, network generation, HDR filaments and optical finishing. HIGH uses selective multi-mip bloom; ULTRA adds separate sharp and wide bloom passes before restrained dispersion, vignette, grain and SMAA. Quality profiles cap subdivisions, particles, shadow maps and DPR; exact PNG export uses 4× MSAA, and adaptive DPR responds to sustained frame time.

### Axis Megastructure

`AxisMegastructureMode` is an independent perspective WebGL2 environment built around one continuous, readable PLEOS AXIS. Its third-generation composition preserves the dense canyon while forcing AXIS-first recognition: the default camera is lifted and offset to expose the backbone's top and side planes, nearby upper/lower detail is selectively thinned into an axial negative-space corridor, the far mass leaves a clean terminal silhouette, and restrained physical edge rails plus two directional area lights separate the dark backbone without turning it into a neon rod. A one-click AXIS-centered composition action restores this hierarchy after experimentation. Six monolithic connected regions extend beyond the camera and form left, right, upper, lower, extreme-foreground and far canyon boundaries. Each inward-facing surface is prepartitioned, then recursively split with deterministic non-uniform 0.15/0.85 through 0.4/0.6 ratios. Final cells become surface-bound cavities, panels and instanced greebles; no detail is positioned as a free-floating object. A modified physically based material evaluates five simultaneous triplanar circuit frequencies, nonrepeating interruptions, stepped traces, nested rectangles, rare nodes, roughness variation and a localized fake-magenta-bounce field. The AXIS is a massive core with physical shoulders, interruptions and recessed parallel channels rather than a neon rail. Absolute-time motion resolves the existing masses through monolith → structural division → nested panels → greeble resolution → circuit activation → stabilization; it changes surface depth and complexity without ejecting geometry. The renderer uses ACES, PMREM reflection, localized internal lights, FogExp2, GTAO, restrained high-threshold bloom, a compact finishing pass and SMAA. Geometry-affecting controls are explicitly staged behind Continuous Structure Regenerate, while material, lighting, post, camera and motion controls update live. Low–Ultra profiles scale instance budgets, DPR, atmosphere and AO sampling; Ultra is the default evaluation profile. Three built-ins and browser-local user presets are Mode-owned; exact-size opaque PNG and print export are supported.

## Persistence Policy

The Shell stores versioned state under `pleos-27-axis-studio-state-v2`.

- Shared: active Mode, active Variation, artboard size and Inspector collapse.
- Per Mode: serialized renderer, expression, motion and contextual UI state.
- Mode-owned variations: stored by that Mode and selected through the common Variation control.

State is captured before switching or disposal. A Mode may migrate/sanitize its own state, but must not mutate another Mode's namespace.

## Variation Routing

Every variation summary declares its owning `modeId`. `StudioShell.applyVariationById` first resolves that owner, activates the Mode when necessary, then delegates the payload. Glass 3D recognizes existing built-in/user variation IDs; Light Field persists its own user variations separately. Renderer-specific payloads never leak into the Shell.

## Export Orchestration

The common Export action calls `focusExport()` on the active Mode. Actual output remains Mode-owned through an export adapter:

- Glass 3D maps raster, high-quality, print and supported path-traced still intents.
- Light Field maps exact PNG, transparent PNG, print raster and fixed-timestep sequence intents; path tracing is explicitly unsupported.
- Kinetic Glass maps current-state raster, transparent and print PNG intents; path tracing is explicitly unsupported.
- Axis Trails maps current deterministic signal frames to raster, transparent and print PNG intents.
- Formation Loop maps deterministic GSAP formation frames to opaque raster and print PNG intents; path tracing is explicitly unsupported.
- Axis Megastructure maps deterministic seeded hierarchy frames to opaque raster and print PNG intents; path tracing is explicitly unsupported.

Capability declarations control which renderer-specific options are shown. Unsupported output is rejected clearly rather than silently substituted.

## Lifecycle Contract

The supported transition is:

1. serialize current Mode and shared artboard state;
2. unmount and stop its listeners/RAF;
3. dispose renderer-owned resources;
4. clear the host;
5. create and mount the target Mode;
6. restore its namespace and the shared artboard;
7. refresh Shell controls and transport.

After any transition there must be one active Mode host, one active renderer canvas for Light Field, no growing RAF count, and restorable state. Glass async compilation is allowed to settle briefly before final GPU disposal so a rapid switch cannot invalidate a pending Three.js compile.

## Browser API

`window.__pleos27Axis` exposes renderer-neutral inspection and commands: list/switch Mode, list/apply Variation, shared artboard, play/pause/seek, generic export, deterministic frame export and active Mode inspection. Legacy Glass commands remain explicit compatibility shims and switch to Glass before execution.

## Verification

- `npm run verify:mode-lifecycle` checks repeated Glass → Light Field → Glass Prism → Glass transitions, shared artboard persistence, canvas/panel counts, RAF stability and console errors.
- `npm run verify:light-field` checks WebGL2 ownership, canonical Axis source, exact pixels, transparency, deterministic loop closure, preset distinction and unsupported path tracing.
- `npm run capture:light-field` writes preset, motion, format, UI and lifecycle evidence to `artifacts/light-field/`.
- `npm run render:light-field -- --preset iridescent-pulse --width 1080 --height 1350` exports a deterministic PNG sequence.
- `npm run verify:glass-prism` checks the three shared-corner solids, masked RGB refraction, deterministic motion, transparent output, presets and narrow layouts.
- `npm run verify:kinetic-glass` checks Rapier initialization, three-cube Axis identity, physical-glass renderer, transparent exact-size PNGs, preset distinction and responsive controls.
- `npm run verify:axis-habitat` checks Formation Loop's exact PLEOS basis, Svelte/Three.js/WebGL2/GSAP/BVH stack, luminous-network and optical pipeline, instancing, adaptive DPR, export and disposal contracts.
- `npm run verify:axis-habitat-runtime` checks the live stage sequence, three-cluster luminous architecture, detailed Visual controls, LOW–ULTRA output choices, draw-call/DPR budget, exact 1080×1080 PNG output, keyboard focus, narrow layout, Inspector collapse, preset distinction, lifecycle restoration and console errors. It writes drawing, material-hold and suspended evidence to `artifacts/axis-habitat/`.
- `npm run verify:axis-megastructure` checks independent registration, deterministic hierarchy, canonical 30° Axis use, procedural micro surface, ordered generation phases, GTAO/bloom/SMAA pipeline, progressive controls, local presets and PNG export contracts.
- `npm run capture:glass-prism` writes preset, motion, format and UI evidence to `artifacts/glass-prism/`.
- `npm run render:glass-prism -- --preset rgb-prism --width 1080 --height 1350` exports a deterministic Glass Prism PNG sequence.

## Adding a Mode

1. Confirm the expression needs an independent renderer.
2. Implement a definition, instance, state sanitizer, contextual panel and export adapter.
3. Derive identity from `src/axis`; do not copy angle constants.
4. Declare truthful capabilities and Mode-owned variations.
5. Register the definition in `src/main.ts`.
6. Add lifecycle, persistence, visual and output verification before exposing it in the Shell.
