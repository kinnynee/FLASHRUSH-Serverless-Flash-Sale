import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { rollupOptions: { output: { manualChunks(id) { if (id.includes('/@aws-sdk/') || id.includes('/@smithy/')) return 'cognito-sdk'; } } } },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5175',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api/, ''),
      },
    },
  },
});
