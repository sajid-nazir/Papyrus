/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  // process.env isn't populated from .env/.env.local files here — Vite only
  // does that for import.meta.env in client code — so this config needs its
  // own loadEnv() call to read VITE_R2_DATA_URL locally. Cloudflare Pages
  // still injects real env vars into process.env directly at build time.
  const env = loadEnv(mode, process.cwd(), '')
  const R2_DATA_URL = process.env.VITE_R2_DATA_URL || env.VITE_R2_DATA_URL || ''

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        workbox: {
          globPatterns: ['**/*.{js,css,html,woff2}'],
          globIgnores: ['**/worker*.js'],
          runtimeCaching: [
            {
              // NetworkFirst, not CacheFirst: these two files are how the
              // app detects a rebuilt index (chunk_manifest.json carries the
              // content-hash version; metadata is fetched under that same
              // version). CacheFirst would keep serving a stale copy from
              // the service worker's own HTTP cache even after the app's
              // IndexedDB layer decides it needs fresh data — this still
              // falls back to the cache when offline.
              urlPattern: /metadata_columnar\.json$|chunk_manifest\.json$/,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'papyrus-data',
                expiration: { maxEntries: 10, maxAgeSeconds: 30 * 24 * 60 * 60 },
                cacheableResponse: { statuses: [200] },
              },
            },
            {
              urlPattern: /\.wasm$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'wasm-runtime',
                expiration: { maxEntries: 10, maxAgeSeconds: 30 * 24 * 60 * 60 },
                cacheableResponse: { statuses: [200] },
              },
            },
            {
              urlPattern: /\.html$/,
              handler: 'NetworkFirst',
            },
          ],
        },
        manifest: {
          name: 'Papyrus',
          short_name: 'Papyrus',
          description: 'In-browser academic paper search engine',
          theme_color: '#ffffff',
          background_color: '#ffffff',
          display: 'standalone',
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          ],
        },
      }),
    ],
    define: {
      __R2_DATA_URL__: JSON.stringify(R2_DATA_URL),
    },
    server: {
      proxy: {
        '/arxiv-proxy': {
          target: 'https://export.arxiv.org',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/arxiv-proxy/, '/api'),
        },
        '/hf-proxy': {
          target: 'https://huggingface.co',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/hf-proxy/, ''),
        },
      },
    },
    worker: {
      format: 'es',
    },
    optimizeDeps: {
      exclude: ['@huggingface/transformers'],
    },
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      // Worker/ML/Cloudflare Function code isn't unit-testable this way —
      // the pure logic that matters (binary search math, filtering) has
      // already been pulled out into src/lib for testing. Excluding these
      // avoids vitest trying to import @huggingface/transformers or
      // Cloudflare Workers globals into jsdom.
      exclude: [
        '**/node_modules/**',
        'src/worker*.ts',
        'functions/**',
      ],
    },
  }
})
