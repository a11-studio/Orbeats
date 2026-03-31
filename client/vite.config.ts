import { defineConfig } from 'vite';
import path from 'path';
import fs from 'fs';

export default defineConfig({
  /** Relative asset URLs in dist (./assets/...) for static hosts, subfolders, CrazyGames. */
  base: './',
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
  plugins: [
    {
      name: 'rewrite-static-pages',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const routes: Record<string, string> = {
            '/privacy': 'privacy.html',
            '/terms': 'terms.html',
            '/contact': 'contact.html',
            '/about': 'about.html',
            '/how-to-play': 'how-to-play.html',
          };
          const file = req.url ? routes[req.url.split('?')[0]] : null;
          if (file) {
            const filePath = path.join(__dirname, 'public', file);
            if (fs.existsSync(filePath)) {
              res.setHeader('Content-Type', 'text/html');
              res.end(fs.readFileSync(filePath, 'utf-8'));
              return;
            }
          }
          next();
        });
      },
    },
  ],
});
