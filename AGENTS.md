# PLEOS 27 Axis — Repository Instructions

## Start every implementation task

Before editing, inspect the current working state without changing it:

```bash
git status
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
```

Preserve all existing user changes. Never run `git reset --hard`, `git clean -fd`, `git checkout -- .`, `git restore .`, or an automatic stash.

## Production contract

- The default route and active production application are documented in `docs/AI_HANDOFF.md`.
- Preserve the approved Axis shared origin, 30° projection, three-solid relationship, default camera and silhouette unless the user explicitly requests a brand-structure change.
- Treat materials, shaders, lighting, motion and artboard behavior as expression layers.
- Raw and legacy routes are reference-only unless the user explicitly scopes work to them.

## Completion workflow

After meaningful implementation work is genuinely complete, use this order:

1. Implement
2. Test
3. Browser QA
4. Run `npm run handoff:full -- --task "…" --changed "…" --why "…" --decisions "…" --files "path:role|path:role" --visual "…|…"`
5. Report

`npm run handoff:full` performs typecheck, verification, build, runtime inspection, browser-console QA and deterministic latest-preview capture. Use `npm run handoff` for a fast intermediate handoff refresh.

Exceptions:

- analysis-only or review-only requests;
- the user explicitly says not to update the handoff;
- work is still in progress and not ready to describe as current state.

Do not commit or push automatically. Commit and push only when the user explicitly requests them.

The handoff generator may update only:

- `docs/AI_HANDOFF.md`
- `artifacts/latest/*`

Do not edit generated handoff artifacts manually when the script can regenerate them.
