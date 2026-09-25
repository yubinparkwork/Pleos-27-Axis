# Axis signed swing — 2026-09-16

The active app retains the reflective dimension shader from the saved pre-lighting
version. The interrupted light-only prototype is retained in `experiments/` and
is not part of production.

## Motion contract

- 25 Axis hold: exactly zero model rotation.
- Handover onward: sine-based `0 → positive → 0 → negative → 0` rotation.
- A quintic envelope gives zero endpoint velocity/acceleration at the hold and
  full-video loop boundary. Interior centre crossings do not stop.
- `axisMoveSeconds` is now the requested round-trip period (왕복 주기). Fit the
  nearest integer number of complete trips to the remaining video duration;
  the panel reports the actual period. No discontinuous partial cycle at wrap.
- Saved Y/Z amplitude signs set the initial direction. Camera, shared pivot,
  layer timing, geometry, colour cycle, export and saved numeric values persist.

## Safety envelope

The requested path is capped to ±20° Y / ±18° Z, then uniformly reduced until
both signs of the coupled rotation keep the inverse camera ray in its original
octant with a grazing margin. The complete amplitude is limited before sampling
time; no frame-by-frame clamping or abrupt stop at an endpoint. Current-view
example (61.9° / 50.5°, request Y=90°, Z=−42°): approximately ±15.1° / ±13.6°.

This protects against crossing the carrier's front/back planes; it is not a
claim that this reflective renderer is angle-invariant. Reflected colours and
overlap still change continuously. A starting camera on a grazing plane can
have almost no safe swing. The panel shows this instead of modifying the camera.

## Validation

`scripts/verify-optical-axis-motion.mjs` checks signed extrema, 3,031 deterministic
time samples for the large-angle fixture, face margins, fixed camera and geometry,
zero endpoints, inverse-yaw equivalence, rendered positive/negative frames, UI
keyboard controls, persistence and wide/narrow screenshots. Full handoff runs the
production typecheck, verify, build and isolated browser/preview checks.

## Camera float

`OpticalCameraFloat.ts` adds bounded image-plane translation on top of the
rotation without modifying viewing direction, geometry or depth. `cameraFloat`
enables it; `cameraFloatX/Y` set ±0–10% artboard offsets. `cameraFloatSeconds`
requests a period fitted to complete cycles after the 25 Axis hold. A smooth
figure-eight path and quintic entry/exit envelope return exactly to zero at the
full-video boundary. Off is the migration default for old named settings.

The same normalized frame offset enters the gray transition and dimension shader
before projection, preserving their alignment and full-frame/tiled exports.
This is framing motion, not an additional orbit or a change of focal length.
OpticalStudio.inspect().motion.float reports its effective period and offset.
Tests check bounds, zero hold/endpoints, equivalence to fixed horizontal pan,
keyboard inputs, wide/narrow panel layout and reload persistence.
# Combined Axis + camera orbit

When **엑시스 모션** and **카메라 모션** are both on, camera horizontal and
vertical rotation values run as a closed, eased loop after the 25Axis hold.
The horizontal and vertical channels use different harmonic rates so the view
drifts through a small spatial orbit instead of repeating a single arc.

The system samples the combined Axis rotation and camera path in Axis-local
space. If any sample approaches a face-plane boundary, both requested camera
amplitudes are reduced by the same factor. This preserves the path's shape and
prevents the visible stop produced by per-frame clamping. The panel reports the
actual safe range and period. Start and end frames always return to the saved
camera angles, so preview, fixed-time capture and MP4 loops agree.
