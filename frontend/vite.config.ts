import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'logo-assettrack-claro.svg', 'logo-assettrack-monitoramento.png', 'notificacao_alerta.mp3'],
      manifest: {
        name: 'AssetTrack TI',
        short_name: 'AssetTrack',
        description: 'Sistema de controle de ativos, suporte, compras, RH e monitoramento de TI.',
        theme_color: '#0c66e4',
        background_color: '#f3f8fc',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        categories: ['business', 'productivity', 'utilities'],
        icons: [
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        navigateFallback: '/index.html',
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,svg,png,ico,mp3}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/v1'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'assettrack-api',
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 80,
                maxAgeSeconds: 60 * 60,
              },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/uploads'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'assettrack-uploads',
              expiration: {
                maxEntries: 120,
                maxAgeSeconds: 60 * 60 * 24 * 7,
              },
            },
          },
        ],
      },
    }),
  ],
})
