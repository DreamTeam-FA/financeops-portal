import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'icons/*.svg', 'icons/*.png'],
        manifest: {
          name: 'FinanceOps Portal',
          short_name: 'FinanceOps',
          description: 'Company finance operations portal — AP, AR, Banks, Payroll, Calendar',
          theme_color: '#1a73e8',
          background_color: '#070b12',
          display: 'standalone',
          orientation: 'portrait-primary',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/icons/icon.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'any',
            },
            {
              src: '/icons/icon.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'maskable',
            },
          ],
          shortcuts: [
            {
              name: 'AP Bills',
              short_name: 'AP',
              url: '/?page=ap',
              description: 'Accounts Payable bills',
            },
            {
              name: 'Bank Balances',
              short_name: 'Banks',
              url: '/?page=banks',
              description: 'Bank account balances',
            },
          ],
          categories: ['finance', 'business', 'productivity'],
        },
        workbox: {
          // Cache app shell + static assets; never cache Google Sheets API calls
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // allow up to 4 MiB (bundle grew with PDF engine)
          globPatterns: ['**/*.{js,css,html,svg,woff2}'],
          navigateFallback: 'index.html',
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: { cacheName: 'google-fonts', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: { cacheName: 'google-fonts-files', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } },
            },
          ],
        },
        devOptions: {
          enabled: false, // Don't run SW in dev mode
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    optimizeDeps: {
      exclude: ['pdfjs-dist'],
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {
        ignored: ['**/financeops_data.json'],
      },
    },
  };
});
