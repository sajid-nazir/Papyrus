# Papyrus

**[papyrus.sajid-e36.workers.dev](https://papyrus.sajid-e36.workers.dev)**

In-browser academic paper search engine with semantic search, knowledge graph visualization, and multi-source support (arXiv, OpenAlex, Europe PMC).

## What's working

- Search 1M+ arXiv papers entirely in the browser — no backend
- Semantic search via binary quantized embeddings and cross-encoder reranking
- Filter results by category and year
- Find similar papers by embedding distance
- Paper abstracts, authors, and publication dates fetched on demand
- BibTeX citation export and shareable search URLs
- Offline support via IndexedDB caching and service worker
- WebGPU acceleration with automatic WASM fallback
- Dark mode

## What's coming

- Knowledge graph visualization (Sigma.js)
- Multi-source search (OpenAlex, Europe PMC)

## Stack

React 19 · TypeScript · Vite · Transformers.js · Sigma.js · Cloudflare Pages
