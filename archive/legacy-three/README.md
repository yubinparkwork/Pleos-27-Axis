# Legacy Three.js checkpoint

This directory preserves the production implementation that was active immediately before the Raw WebGL2 cutover.

- `src/main.ts` and `src/style.css` are the former live entry and stylesheet.
- The former source tree retains its original paths below `src/`, including copies of the shared Axis and brand modules.
- `package.json` and `package-lock.json` record the dependency versions at the checkpoint.
- `index.html` records the page shell at the checkpoint.

The archive is intentionally outside the TypeScript production source graph. The read-only comparison route at `?renderer=legacy` displays the stored checkpoint capture; it does not execute this renderer.
