import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const R2_DATA_URL = process.env.VITE_R2_DATA_URL || ''

export default defineConfig({
  plugins: [
    react(),
    VitePWA({      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2}'],
        globIgnores: ['**/worker*.js'],
        runtimeCaching: [
          {
            urlPattern: /metadata_columnar\.json$|chunk_manifest\.json$/,
            handler: 'CacheFirst',
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
})
