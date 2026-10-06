# Progress log

Read this first when resuming. Keep only the current/most-recent state — prune stale entries, don't accumulate a full history (git log is the history).

## 2026-10-07 — full codebase audit on `dev`

Set up `CLAUDE.md` (durable project facts) and this file (in-flight state) so
work resumes across sessions/reboots, created the `dev` branch off `main`,
then ran a full security + quality audit while the user was AFK (scope:
"audit everything, apply fixes including larger refactors"). Summary —
details are in the commit messages on `dev` (`git log main..dev`):

- **Hygiene**: added missing `.gitignore`; removed stale `package-lock.json`
  (leaked an internal corporate npm registry URL, unused since `pnpm-lock.yaml`
  is the real lockfile).
- **Lint**: fixed all 3 findings (sync setState-in-effect, unused expression,
  missing effect dep). `pnpm run lint` is clean.
- **Dependencies**: `pnpm audit` went 74 findings (2 critical/47 high) → 1
  moderate with no upstream patch, 4 levels deep in a Node-only code path
  (`onnxruntime-node`'s optional proxy-agent) this browser-only app never
  reaches at runtime — accepted as-is. Pinned `packageManager: pnpm@12.9.1`.
- **Cloudflare Functions** (`functions/arxiv-proxy`, `functions/hf-proxy`):
  removed the open `Access-Control-Allow-Origin: *` (both are only ever
  called same-origin by this app; the wildcard only let third-party sites
  free-ride on this Cloudflare account), fixed arxiv-proxy caching error
  responses for an hour, added edge caching to hf-proxy (was caching
  nothing, so every visitor re-pulled full models), rejected non-GET/HEAD
  with 405.
- **Correctness**: `useMLWorker.ts` now aborts its in-flight details fetch
  on unmount (was leaking a fetch that could write stale data into the
  global store after the component was gone); fixed an index-as-React-key
  bug in the reorderable search-history list; IndexedDB cache now evicts a
  previous model's data when switching models via `?model=` (was growing
  unbounded — each model is hundreds of MB and nothing ever reclaimed it);
  bumped chunk-fetch retries 2→3 with a clearer failure message; deduped
  the WebGPU/wasm fallback code in `Reranker.getInstance`.
- Verified after every change: `pnpm run lint`, `pnpm run build`, and the
  dev server boots and serves `/` with a 200.

**Not done / left for the user to decide:** no in-app "retry index load" or
"clear cache" UI was added (would be a UX feature, not a bug fix) — the
underlying IndexedDB functions exist if wanted. The open-proxy abuse-cost
risk is now mitigated by caching but Cloudflare-level rate limiting (if
desired) needs dashboard access I don't have.

**Next:** review the commits on `dev` (`git log main..dev --stat`) and merge
to `main` when ready — nothing was pushed or merged automatically.
