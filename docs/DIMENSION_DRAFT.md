# 플레오스 디멘션 초안

Frozen working snapshot saved 2026-09-10 15:54 KST, before further development.
Branch: `codex/pleos-dimension-draft`.

Includes source, assets, lockfile, user presets and `.pleos/studio-state.json` from the local draft archive. This includes then-uncommitted work; it is not just the previous main commit.

When the user says “초안 불러와줘”, restore this branch in a separate checkout and preserve ongoing development. Run `npm ci` and `npm run dev`. Use the archived studio state, not newer browser-local settings; verify state hydration before showing the restored site. Do not overwrite this branch with development work.

Dependencies, build output, deployment credentials/configuration, and temporary QA files are excluded. Browser-only unsaved settings were not independently captured. This snapshot operation does not certify a new build or visual QA run.
