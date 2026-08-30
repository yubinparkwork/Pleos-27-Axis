# PLEOS Axis Studio — Mode Architecture

## Axis Core

`src/axis` is the canonical source for the shared origin, approved angle families, ray directions, sectors, grid anchors and composition references. A Mode may interpret this structure visually, but it must not maintain a private copy of Axis angle data.

## Studio Shell

`StudioShell` owns the active Mode lifecycle. It saves the current Mode state, preserves shared artboard state, unmounts and disposes its resources, clears the host, creates the next Mode and restores both that Mode's cached state and the common artboard. The Shell does not assume Three.js, WebGL or any other renderer.

## Mode Registry

`ModeRegistry` contains production `StudioModeDefinition` objects. A definition declares its label, capabilities and factory. Only `glass-3d` is registered today; future Mode names are not presented until they have a real implementation.

## Mode Instance

A `StudioModeInstance` owns its renderer, scene, camera, materials, shaders, motion interpretation, Inspector and export adapter. It implements mount, unmount, resize, state serialization/restoration and disposal. This prevents a future Canvas, SVG, GLSL light-field or WebGPU particle Mode from constructing an unnecessary Three.js scene.

## Glass 3D Mode

`Glass3DMode` is the first production Mode. It wraps the current optical environment and owns `MotionStudioApp`, including the three solids, Clear/Prism/Smoked/Spectral Flow/Soft Spectral expressions, lighting, camera, motion, raster preview and path tracer. The wrapper preserves the established visual output while making its lifecycle explicit.

## Mode Panel

The active Mode supplies one contextual Inspector. Glass 3D exposes Style, Material, Lighting and Motion first, with Material, Lighting, Geometry, Camera and Motion details collapsed inline. Global Output remains at the bottom of the same Inspector.

## Mode Export Adapter

The Shell treats export intent generically. `Glass3DExportAdapter` maps Draft, High and Print requests to raster, path-traced and print render paths. A future Graphic 2D Mode can provide PNG/SVG output without inheriting path-tracing controls.

## Variation Ownership

Every `StudioVariation` includes a `modeId`. Variation requests are routed through `StudioShell.applyVariation`, which activates the owning Mode before delegating its payload to that Mode. Existing variations are migrated to `glass-3d`; future Modes implement their own variation application without leaking renderer-specific state into the Shell.

## Lifecycle

The supported transition is:

1. serialize current Mode state;
2. unmount and stop listeners/RAF;
3. dispose renderer, targets, geometry and materials;
4. clear the Mode host;
5. create and mount the target Mode;
6. restore its cached state.

`window.__pleos27Axis.remountMode()` exists for lifecycle QA. A successful remount has one active Mode, two Glass 3D canvases, one animation loop and restored state.

## Adding a New Mode

1. Decide that the reference cannot be expressed honestly by an existing Mode.
2. Implement a new `StudioModeDefinition`, instance, state, panel and export adapter.
3. Read Axis data from `src/axis`; do not duplicate angle constants.
4. Register the Mode in `src/main.ts`.
5. Add lifecycle, visual and export verification for its declared capabilities.
6. Add real variations only after the renderer exists.
