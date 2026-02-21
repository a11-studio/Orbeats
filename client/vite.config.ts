import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@agar3d/shared': path.resolve(__dirname, '../shared/src'),
    },
  },
  server: {
    port: 5173,
    open: true,
  },
});
