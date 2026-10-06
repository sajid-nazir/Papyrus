# Progress log

Read this first when resuming. Keep only the current/most-recent state — prune stale entries, don't accumulate a full history (git log is the history).

## 2026-10-07
- Set up `CLAUDE.md` (durable project facts) and this file (in-flight state) so work can resume across sessions/reboots.
- Created `dev` branch off `main` — future feature/improvement work happens there, merged to `main` when ready.
- Ran full audit (security + quality) on `dev`, commits so far:
  - `db11e8a` — added `.gitignore` (none existed — node_modules/dist were untracked only by luck); removed stale `package-lock.json` (unused, leaked an internal corporate npm mirror URL that also broke installs off that network). `pnpm-lock.yaml` is the real lockfile.
  - (next commit) — fixed 2 eslint errors + 1 warning in `src/App.tsx`, `src/components/Results.tsx`, `src/hooks/useMLWorker.ts`. Lint now clean.
  - (next commit) — bumped deps (react, zustand, immer, sigma, vite, eslint, typescript-eslint, etc.) via `pnpm update`, pinned `packageManager: pnpm@12.9.1`, overrode `sharp` to `^0.35.5`. `pnpm audit` went from 74 findings (2 critical/47 high) to 1 unfixable moderate (sprintf-js, dead package, 4 levels deep in a Node-only onnxruntime-node proxy-agent path never reached by the browser bundle — accepted as-is).
  - Build (`tsc -b && vite build`) and lint both verified clean after every change.
  - Grepped for `dangerouslySetInnerHTML`/`eval`/`innerHTML=` and hardcoded secrets/API keys across `src` and `functions` — none found.
  - Checked `functions/arxiv-proxy` and `functions/hf-proxy`: both build their fetch target from a hardcoded host + the incoming request's path, so they are not open redirects to arbitrary hosts. Flagged (not yet addressed): both set `Access-Control-Allow-Origin: *` with no rate limiting, so any third-party site could ride on Papyrus's Cloudflare account as a free proxy to arXiv/HuggingFace — an abuse/cost risk, not a data-exposure one.
- A deeper read-only review agent is running in the background against `src/lib`, `src/hooks`, `src/stores`, the worker files, and the two proxy functions — looking for correctness bugs (races in worker messaging, stale closures, unbounded caches) and anything subpar. Nothing from it applied yet.
- **Next:** apply/triage whatever that agent finds, then this branch is ready to merge to `main` when the user is back and agrees.
