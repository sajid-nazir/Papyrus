# Papyrus

In-browser academic paper search engine: semantic search over 1M+ arXiv papers, entirely client-side (no backend for search itself). Binary-quantized embeddings + cross-encoder reranking, WebGPU with WASM fallback, offline via IndexedDB + service worker.

## Stack
React 19 · TypeScript · Vite · Transformers.js · Sigma.js (graph viz) · Zustand (state) · Immer · Cloudflare Pages (hosting + two proxy Functions)

## Structure
- `src/workers/` (`worker*.ts`) — embedding model workers (MiniLM, Nomic variants) run off the main thread
- `src/lib/` — core search/embedding/ranking logic
- `src/stores/` — Zustand state
- `src/components/`, `src/hooks/` — UI
- `functions/arxiv-proxy/`, `functions/hf-proxy/` — Cloudflare Pages Functions that proxy arXiv API and HuggingFace to dodge CORS in production
- `scripts/split_index.py` — offline preprocessing of the paper index

## Commands
- `npm run dev` — vite dev server
- `npm run build` — `tsc -b && vite build`
- `npm run lint` — eslint
- `npm run preview`

## Conventions
- No backend/server-side search — everything client-side by design; the two Cloudflare Functions exist only as CORS proxies, not app logic.
- Deployment is Cloudflare Pages native (no wrangler config needed — see recent git history removing wrangler files).

## Workflow
- Day-to-day feature work happens on a `dev` branch, merged to `main` when ready — not direct commits to `main`.
- See `PROGRESS.md` for current in-flight state (updated each session — read it first when resuming work).
