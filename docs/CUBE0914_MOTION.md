# September 14 cube rendering + camera motion

Independent expression at `?look=cube0914`. The default route and all existing
immutable snapshots remain unchanged. This expression is saved separately in
the version dropdown, using the catalog `look` field.

## Provenance

`cube0914.frag.glsl` was recovered verbatim from the first GLSL template in
`public/versions/saved-20260914094839691/assets/OpticalStudio-DGHbgWXC.js`.
This is the user's “9월 14일 · 오늘 수정 전 — 큐브 디멘션 원본”, itself a copy
of `saved-20260913150050902`. No original snapshot was edited.
`Cube0914.ts` retains its selected-colour-anchored reverse RGB weight sequence.
Canonical rounded-cube geometry, shader optics and the original twelve-layer
budget remain intact. Current camera and export infrastructure are shared.

## Operation

Open the 카메라 section. 카메라 모션 1 enables a smooth out-and-back orbit;
수평 회전 폭, 수직 회전 폭 and 이동 시간 control the path. Saved azimuth and
elevation remain the anchor. The current axis motion, floating and 25Axis
transition are disabled here to avoid altering the original expression.
PNG captures the current frame. MP4 exports a deterministic full loop using
the same shader, camera evaluation and optical resolve, up to 3840 long-edge.
Choose a portrait or landscape artboard as needed; 4K means long-edge, not
necessarily 3840×2160. Export can be slow because the original glass-ray
integrator is retained rather than replaced with a cheaper approximation.

Settings use their own `pleos-optical-studio-v1:cube0914-motion` namespace.
First launch reads the original archive's settings if available, otherwise its
shared Pleos B seed. This does not claim recovery of unsaved historical edits.
Local runnable snapshots and browser settings are not GitHub backups.

## Verification

With the local dev server running, `node scripts/verify-cube0914.mjs` compares
the original archive and fork at identical static settings, checks camera UI,
captures wide/narrow panels, and encodes both a short motion MP4 and a native
2160×3840 frame. Results are in `artifacts/cube0914/verification.json`.
