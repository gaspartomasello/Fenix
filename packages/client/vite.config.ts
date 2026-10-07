import { defineConfig } from 'vite';

const SERVER_URL = process.env.FENIX_SERVER_URL ?? 'http://localhost:3000';

export default defineConfig(({ mode }) => {
  const solo = mode === 'solo';
  return {
    // En modo solo la página es autocontenida: rutas relativas y un solo bundle.
    base: solo ? './' : '/',
    server: {
      port: 5173,
      // En modo solo no hay servidor al que reenviar.
      proxy: solo ? {} : { '/ws': { target: SERVER_URL, ws: true }, '/health': SERVER_URL },
    },
    build: {
      target: 'es2022',
      sourcemap: !solo,
      outDir: solo ? 'dist-solo' : 'dist',
      emptyOutDir: true,
      assetsInlineLimit: solo ? Number.MAX_SAFE_INTEGER : 4096,
      cssCodeSplit: !solo,
      chunkSizeWarningLimit: solo ? 2048 : 500,
      rollupOptions: solo ? { output: { inlineDynamicImports: true } } : {},
    },
  };
});
