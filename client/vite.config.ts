import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@orbeats/shared': path.resolve(__dirname, '../shared/src'),
    },
  },
  server: {
    port: 5173,
    open: true,
    proxy: {
      '/ws': {
        target: 'ws://localhost:3002',
        ws: true,
      },
    },
  },
});
