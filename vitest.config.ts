import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts'],
    environment: 'node',
    // Con toda la batería en paralelo, en máquinas lentas algunas pruebas superan los 5 s por defecto.
    testTimeout: 30_000,
  },
});
