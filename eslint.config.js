import { readdirSync } from 'node:fs';
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Nadie importa `@fenix/shared` entero: cada uno trae solo los módulos que
 * usa (`@fenix/shared/items/dyes`). Así cada prueba depende solo de lo que
 * toca y `npm run check:fast` corre pocas.
 */
const WHOLE_SHARED = {
  name: '@fenix/shared',
  message: 'Importá el módulo que usás, por ejemplo @fenix/shared/items/item-catalog.',
};

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
    files: ['packages/art/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [WHOLE_SHARED],
          patterns: [
            {
              group: ['@fenix/server*', '@fenix/client*', '@fenix/content*', 'pixi.js', 'node:*'],
              message: 'El arte es puro: solo depende de shared.',
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
          paths: [WHOLE_SHARED],
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
          paths: [WHOLE_SHARED],
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
    files: ['packages/client/src/**/*.ts'],
    ignores: ['packages/client/src/network/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [WHOLE_SHARED],
          patterns: [
            {
              group: ['@fenix/server*'],
              message: 'Solo network/ puede usar el servidor embebido.',
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
          paths: [WHOLE_SHARED],
          patterns: [
            {
              group: [
                'pixi.js',
                '**/rendering/**',
                '**/ui/**',
                '**/network/**',
                '**/input/**',
                '**/platform/**',
                '@fenix/art',
              ],
              message: 'El core del cliente no conoce render, UI ni red.',
            },
          ],
        },
      ],
    },
  },
];

/**
 * Módulos aislados (docs/ARQUITECTURA.md): en la aplicación del servidor
 * cada funcionalidad vive en `features/<nombre>/` y se enchufa al núcleo
 * (`kernel/`) con su `<nombre>.module.ts`. Ninguna importa a otra: lo que
 * necesitan de otra lo piden al núcleo (servicios, eventos, reglas). El
 * núcleo no conoce a las funcionalidades, y `GameApplication` solo a la
 * sesión; la lista completa de módulos está únicamente en `game.ts`.
 */
const APPLICATION = 'packages/server/src/application';
const OUTSIDE_APPLICATION = {
  group: ['**/infrastructure/**', 'ws', 'node:*'],
  message: 'La aplicación solo conoce puertos, no infraestructura.',
};
const FEATURES = readdirSync(new URL(`./${APPLICATION}/features`, import.meta.url), {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

const moduleRules = [
  ...FEATURES.map((feature) => ({
    files: [`${APPLICATION}/features/${feature}/**/*.ts`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [WHOLE_SHARED],
          patterns: [
            OUTSIDE_APPLICATION,
            {
              regex: `^\\.\\./(?!${feature}/|\\.\\./)|/features/(?!${feature}/)`,
              message: `"${feature}" no importa otras funcionalidades: pedile al núcleo un servicio o escuchá un evento.`,
            },
            {
              regex: '^\\.\\./\\.\\./(game|game-application)$',
              message: 'Una funcionalidad no conoce el armado del juego.',
            },
          ],
        },
      ],
    },
  })),
  {
    files: [`${APPLICATION}/kernel/**/*.ts`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [WHOLE_SHARED],
          patterns: [
            OUTSIDE_APPLICATION,
            {
              regex: '^\\.\\./(features/|game$|game-application$)',
              message: 'El núcleo no conoce a los módulos: ellos lo conocen a él.',
            },
          ],
        },
      ],
    },
  },
  {
    files: [`${APPLICATION}/game-application.ts`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [WHOLE_SHARED],
          patterns: [
            OUTSIDE_APPLICATION,
            {
              regex: '^\\./features/(?!session/)|^\\./game$',
              message: 'GameApplication solo conoce la sesión; los módulos se los pasa game.ts.',
            },
          ],
        },
      ],
    },
  },
];

export default tseslint.config(
  { ignores: ['**/dist/**', '**/dist-solo/**', '**/node_modules/**', '**/coverage/**'] },
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
  {
    files: ['packages/*/src/**/*.ts', 'packages/*/scripts/**/*.ts'],
    ignores: ['packages/shared/**'],
    rules: { 'no-restricted-imports': ['error', { paths: [WHOLE_SHARED] }] },
  },
  ...layerRules,
  ...moduleRules,
  prettier,
);
