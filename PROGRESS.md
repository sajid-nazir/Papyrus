# Progress log

Read this first when resuming. Keep only the current/most-recent state — prune stale entries, don't accumulate a full history (git log is the history).

## 2026-10-07 — audit + roadmap item 1 (graph v1), on `dev`

Full history is in commit messages: `git log main..dev --stat`. Summary:

**Audit** (hygiene, lint, deps, proxy security, correctness bugs) — done,
see commits up through "Evict other models' IndexedDB cache...". Highlights:
`pnpm audit` 74→1 (unfixable/irrelevant) finding; added missing `.gitignore`;
fixed a real memory leak (unmount didn't abort an in-flight fetch) and an
unbounded-IndexedDB-growth bug (switching models never evicted the old one).

**Proxy hardening, round 2** — a consulted Opus review caught that round 1
only removed the CORS wildcard but left both Functions directly reachable
as unrestricted relays. Added request-shape allowlisting (arxiv-proxy:
only `/query` with `id_list`/`max_results`, ids validated/capped at 20;
hf-proxy: only the 4 repos this app actually loads) and real edge caching
via `caches.default` (the earlier `Cache-Control` header fix did nothing —
Pages Functions don't consult their own Response headers for edge
caching). Verified at runtime with `wrangler pages dev` + curl (needs
Node 22+; used nvm's v24 locally, project itself still runs on Node 20).
True per-IP rate limiting isn't code-fixable: Pages Functions on
`*.pages.dev` have no Rate Limiting binding, and a Cloudflare WAF rule
needs a custom domain on your own zone first — **that part needs you**,
in the Cloudflare dashboard, if you want it.

**Cache/retry UI** — added "Retry" and "Clear cached data" buttons to
`Progress.tsx` (new `clearAllCachedData()` in `src/lib/clear-cache.ts`,
clears both IndexedDB and Cache Storage, then reloads).

**Knowledge graph v1** (first README roadmap item) — done. A "Graph"
toggle in the results header builds an embedding-similarity map (not
citations — that'd need a new data source) of the current result set via
a new worker `build-graph` message, rendered with the
sigma/graphology/graphology-layout-forceatlas2 deps that were installed
but unused until now. Lazy-loaded so those libs stay out of the main
bundle. README's roadmap updated to reflect this (moved from "coming" to
"working", with an accurate description).

**Deferred — multi-source search (OpenAlex, Europe PMC), the second
roadmap item.** Opus's review recommends NOT building this yet; design to
use when picked up:
- No new Cloudflare proxy needed — both APIs send their own CORS headers
  for browser calls (confirmed via direct probes), unlike arXiv.
- Call them from the browser directly, not through a shared proxy —
  OpenAlex is credit-metered per-IP; routing through one shared Function
  would pool every visitor's usage into one budget and exhaust it fast.
  Check current OpenAlex auth/credit docs before building, they change.
- New privacy tradeoff vs. today: arXiv only ever sees paper IDs (never
  the query text, never routed through a third party in a way that's
  non-obvious); calling OpenAlex/Europe PMC directly sends raw query text
  to those providers. Needs to be an explicit opt-in toggle, off by
  default, not silently enabled.
- Ranking: arXiv results render first as now; external results fetched
  in parallel, deduped by title/DOI, and if the reranker is loaded,
  scored with the same cross-encoder so they're on a comparable scale
  and can be merge-sorted in — otherwise shown as a separate "Other
  sources" section rather than interleaved (raw Hamming and cross-encoder
  scores aren't comparable).
- `SearchResult` needs a `source` field; `idx`/`arxiv_id`-dependent
  features (Find Similar, Graph seed) don't apply to external results in
  v1.

**`functions/*.ts` type-checking gap — fixed later in this session**, see
below.

**Browser verification, done.** Claude in Chrome got connected mid-session,
which led to finding and fixing a real bug: `vite.config.ts` read
`process.env.VITE_R2_DATA_URL` directly, but Vite doesn't populate
`process.env` from `.env`/`.env.local` files inside the config file itself
— only `loadEnv()` does that. So a local `.env.local` was silently
ignored, and the only way to get real data in local dev was exporting the
var by hand in the shell. Fixed with an explicit `loadEnv()` call
(`process.env` still checked first, so Cloudflare Pages' own build-time
injection is untouched). Also, unrelated discovery along the way: the R2
subscription on your Cloudflare account had been removed at some point;
re-adding it didn't immediately show the bucket in the dashboard, but the
bucket's public data was never actually inaccessible — the live site kept
working throughout. Found the public R2 URL by grepping it out of the
deployed worker bundle (`__R2_DATA_URL__` gets inlined as a literal at
build time) rather than through the dashboard.

With real data loading locally, visually verified end-to-end in a real
browser: index/embedder/reranker all load, search works, abstracts fetch
and the Graph toggle builds/renders a real similarity graph (nodes,
edges, force layout, category colors, seed sizing), clicking a graph node
correctly triggers Find Similar, and the Progress "Clear cached
data"/"Retry" buttons render correctly. Zero console errors throughout.
**Correction to an earlier overclaim in this same entry:** that browser
session ran on `pnpm run dev` (plain Vite), where `/arxiv-proxy` and
`/hf-proxy` are rewritten straight to the upstream APIs by
`vite.config.ts`'s `server.proxy` — the actual Pages Functions code never
runs there, so that session did not exercise the hardened validation
logic at all, only the app's own request-forming logic. The Functions'
validation/caching behavior was only ever exercised via `wrangler pages
dev` + synthetic curl requests (see below) — correct to call that
verified, but the earlier claim that the *browser* session "fetched via
the hardened arxiv-proxy" was wrong. Neither was deployed and hit for
real; that's still a genuine gap, see below.

**Independent second-opinion review (Fable), done** — asked it to
scrutinize specifically the claims above rather than trust them. Found
one blocking bug and several real secondary issues, all fixed and
verified (lint/build clean, re-tested relevant pieces under `wrangler
pages dev`):
- **Blocking:** `buildGraph` shared its requestId counter with
  search/find-similar on both the main thread and in the worker.
  Clicking the Graph button (reachable mid-search, since Results.tsx
  keeps showing the previous result set while `stage === 'searching'`)
  would overwrite the worker's staleness-check id and cause the
  in-flight search/rerank's own results to be silently dropped, with
  `isReranking` or `stage` potentially stuck forever. Fixed with a
  separate counter end to end.
- The graph's neighbor search fully sorted ~1M candidates per seed to
  keep the top 4 — blocked the worker for seconds. Switched to a bounded
  top-k insertion.
- A graph failure went through the generic `'error'` path, taking the
  *whole app* into its global error stage over a secondary feature.
  Scoped to its own try/catch and `'graph-error'` message.
- `arxiv-proxy` rejected an entire 10-id batch over one malformed id;
  now drops only the invalid ones. Also widened the id regex to accept
  version suffixes it was incorrectly rejecting.
- `hf-proxy` didn't actually enforce "resolve/main only" despite the
  comment claiming it did, and had no real edge caching (same
  `caches.default` gap arxiv-proxy had already been fixed for) — only
  arxiv-proxy's caching could be confirmed working locally; hf-proxy's
  could not be confirmed despite matching the same pattern (several
  attempts, including stripping an upstream `Vary: Origin` header that
  looked like a plausible cause) — documented as unverified rather than
  claimed fixed; needs a post-deploy check.
- `clearCacheExceptPrefix` read every cached blob's full value just to
  check its key — switched to a key-only cursor.
- The earlier SearchBox search-history key fix (`${h}-${i}`) didn't
  actually fix the bug it claimed to (the index was still in the key) —
  corrected to `key={h}` alone, which `addToHistory`'s existing dedup
  makes sufficient.
- `clearAllCachedData()` had no error handling; a failure silently did
  nothing. Now surfaces a message.
- `find-similar` not applying active category/year filters (unlike
  search and build-graph) — flagged as pre-existing and left alone at
  the time; fixed later in this session, see below.

**Known-gaps cleanup round, done** (user went AFK, explicitly scoped this
round to "fix remaining known gaps" only — no push to remote, no merge to
main, both confirmed with them beforehand):
- `find-similar` now applies active filters, reusing the same
  `passesFilters()` helper and payload shape as search/build-graph.
  Verified in a real browser: set the cs.AI filter, searched, clicked
  Find Similar — every result correctly carried cs.AI. Zero console
  errors.
- `functions/*.ts` is now actually type-checked: added
  `@cloudflare/workers-types` and a new `tsconfig.functions.json`
  (modeled on the existing `tsconfig.node.json` pattern), referenced
  from the root `tsconfig.json` so `tsc -b` — already the first half of
  `npm run build` — picks it up with no workflow change. Verified by
  deliberately injecting a type error into `arxiv-proxy` and confirming
  the build caught it, then reverting.

**Still open — genuinely not verified against production:** nothing in
this branch has been deployed and exercised against the real
`*.pages.dev` environment. All Functions testing used local emulation
(`wrangler pages dev`, which Cloudflare's own docs note behaves
differently from production for the Cache API specifically). Treat the
proxy hardening as implemented and locally self-consistent, not as
confirmed-in-production. Explicitly NOT pushed this round per the user's
instruction — they want to review before anything touches the remote.

**Design/polish round, done** — user went AFK a second time and gave open
scope ("invent things"), flagging the graph's full-title labels as an
example of what "doesn't look as good as it should." Still no push/merge
this round (same standing instruction).
- Consulted Opus specifically on graph UX (it read the installed sigma
  3.x source for real API rather than working from memory). Implemented:
  truncated on-canvas labels (seeds only, ~28 chars), full title + category
  shown in the caption on hover instead, hover-based neighbor highlighting,
  edge opacity encoding similarity weight, a minimal category legend,
  camera guard rails, a Reset button, and a deterministic (non-random)
  initial layout.
- That consult also caught two actual bugs in the original graph v1:
  labels were hard-coded black and invisible against the dark theme, and
  sigma's wheel handler hijacked page scroll whenever the cursor was over
  the graph. Both fixed.
- Fixing the dark-mode label bug prompted a grep for the same class of
  issue elsewhere: found `.memory-warning` had no dark-mode styling at
  all, `.filters-reset`/`.progress-error` used a hard-coded red that's
  muddier on dark backgrounds, and `src/index.css` (an untouched Vite
  scaffold leftover) set a conflicting hard-coded `body` background/color
  that only wasn't visibly broken by accident of CSS cascade order.
  Added proper `--error`/`--warning-*` tokens and removed the dead
  conflicting CSS.
- All verified extensively in a real browser, including forcing the dark
  theme via an injected CSS override (no OS toggle available) to check
  both themes without needing to actually switch the OS/browser setting.
  Zero console errors throughout.
- One more self-found issue while reviewing the new graph CSS: the Reset
  button was absolutely positioned at a fixed `top: 48px` relative to
  `.graph-view`, which only looked right because the caption row happens
  to render at ~48px today — if the legend ever wraps to more lines (more
  categories present, or a narrower viewport), the button would overlap
  the caption text. Restructured so it's anchored to its own wrapper
  around just the canvas, independent of caption height.

**Environment note for future sessions:** `resize_window` (Claude in
Chrome) did not actually change `window.innerWidth`/`innerHeight` in this
session (tried twice, confirmed via JS eval) — window stayed at 1920x905
throughout. True responsive/mobile-viewport testing wasn't possible this
session; the reset-button fix above was reasoned through statically, not
visually confirmed at a narrow width. Worth a real check (actual device,
or a working resize) before fully trusting mobile layout.

**Next:** review `git log main..dev --stat` and merge to `main` when
ready — nothing pushed or merged automatically. After merging/deploying,
worth specifically re-checking hf-proxy's edge caching against the real
`*.pages.dev` Cache API. If picking up multi-source search next, start
from the design above. A `.env.local` with the R2 data URL now exists
locally (gitignored) for future sessions to use directly.
