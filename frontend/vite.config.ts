import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  if (command === 'build') {
    const env = loadEnv(mode, process.cwd(), '');
    const url = env.VITE_SUPABASE_URL?.trim() ?? '';
    const key = (env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY)?.trim() ?? '';
    const placeholder = /(?:your-project|placeholder|your-publishable-key|placeholder-key)/i;
    if (!url.startsWith('http') || placeholder.test(url) || !key || placeholder.test(key)) {
      throw new Error(
        'Missing valid Supabase configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY for this deployment environment.',
      );
    }
  }

  return {
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
  };
});
