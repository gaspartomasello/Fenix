import { defineConfig } from 'vite';

const SERVER_URL = process.env.FENIX_SERVER_URL ?? 'http://localhost:3000';

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/ws': { target: SERVER_URL, ws: true },
      '/health': SERVER_URL,
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
