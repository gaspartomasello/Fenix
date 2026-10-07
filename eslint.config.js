import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Reglas de capas: el dominio no puede depender de capas externas.
 * Mantener esta lista sincronizada con docs/ARQUITECTURA.md.
 */
const layerRules = [
  {
    files: ['packages/shared/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@fenix/server*', '@fenix/client*', 'ws', 'pixi.js'],
              message: 'shared no depende de otros paquetes ni librerías externas.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/server/src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/application/**', '**/infrastructure/**', 'ws', 'node:*'],
              message: 'El dominio no depende de aplicación ni infraestructura.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/server/src/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/infrastructure/**', 'ws', 'node:*'],
              message: 'La aplicación solo conoce puertos, no infraestructura.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/client/src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'pixi.js',
                '**/rendering/**',
                '**/ui/**',
                '**/network/**',
                '**/input/**',
                '**/assets/**',
              ],
              message: 'El core del cliente no conoce render, UI ni red.',
            },
          ],
        },
      ],
    },
  },
];

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
      'no-console': ['warn', { allow: ['info', 'warn', 'error'] }],
    },
  },
  ...layerRules,
  prettier,
);
