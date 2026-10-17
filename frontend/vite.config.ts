import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['resqnet.svg'],
      manifest: {
        name: 'ResQNet Emergency Response',
        short_name: 'ResQNet',
        description: 'Report emergencies and coordinate disaster response.',
        theme_color: '#176f63',
        background_color: '#f4f5f1',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/resqnet.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
