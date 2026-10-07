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

**Known gap, not addressed this session:** `tsconfig.app.json` only
`include`s `src/`, so `tsc -b` never type-checks `functions/*.ts` at all
(pre-existing, not introduced by anything above) — eslint does lint them,
but there's no type safety on the Pages Functions. Worth fixing if you
add more to them.

**Also:** no browser automation tool was available this session (Chrome
extension not connected, no built-in browser) — UI changes (Progress
buttons, GraphView) were verified via lint/build/dev-server-serves-ok but
not visually clicked through. Worth an actual look before merging.

**Next:** review `git log main..dev --stat` and merge to `main` when
ready — nothing pushed or merged automatically. If picking up multi-source
search next, start from the design above.
