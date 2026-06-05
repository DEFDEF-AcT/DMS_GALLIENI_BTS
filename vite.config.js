import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const BASE = '/DMS_GALLIENI_BTS/'   // ← nom EXACT du dépôt GitHub (sensible à la casse)

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    // PWA installable + mise à jour AUTOMATIQUE : au lancement, si une nouvelle
    // version est déployée, le service worker la récupère et recharge l'app tout
    // seul (fini le cache figé de l'icône « écran d'accueil »).
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Réception Atelier Véhicule',
        short_name: 'Réception',
        description: "État des lieux d'entrée des véhicules – Lycée Gallieni (BTS MV)",
        lang: 'fr',
        dir: 'ltr',
        theme_color: '#f0f7f1',
        background_color: '#f0f7f1',
        display: 'standalone',
        orientation: 'portrait',
        scope: BASE,
        start_url: BASE,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: BASE + 'index.html',
      },
    }),
  ],
})
