import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
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
 *
 * La regla resuelve la ruta real de cada import (sin importar la
 * profundidad de la carpeta ni la extensión), así no hay forma de colarse.
 */
const APPLICATION = resolve(
  dirname(fileURLToPath(import.meta.url)),
  'packages/server/src/application',
);

/** Dónde está un archivo de la aplicación: { area, feature }. */
function placeOf(file) {
  const rel = relative(APPLICATION, file)
    .split(sep)
    .join('/')
    .replace(/\.(ts|js)$/, '');
  if (rel.startsWith('..')) return null;
  const [top, feature] = rel.split('/');
  if (top === 'features') return { area: 'feature', feature };
  if (top === 'kernel') return { area: 'kernel' };
  if (rel === 'game' || rel === 'game-application') return { area: rel };
  return { area: rel.endsWith('.test') ? 'test' : 'root' };
}

/** Por qué no se puede importar `to` desde `from` (o null si se puede). */
function boundaryRefusal(from, to) {
  if (!from || !to || from.area === 'test') return null;
  if (from.area === 'feature') {
    if (to.area === 'feature' && to.feature !== from.feature)
      return `"${from.feature}" no importa la funcionalidad "${to.feature}": pedile al núcleo un servicio o escuchá un evento.`;
    if (to.area === 'game' || to.area === 'game-application')
      return 'Una funcionalidad no conoce el armado del juego.';
  }
  if (from.area === 'kernel' && ['feature', 'game', 'game-application'].includes(to.area))
    return 'El núcleo no conoce a los módulos: ellos lo conocen a él.';
  if (
    from.area === 'game-application' &&
    (to.area === 'game' || (to.area === 'feature' && to.feature !== 'session'))
  )
    return 'GameApplication solo conoce la sesión; los módulos se los pasa game.ts.';
  if (from.area === 'root' && (to.area === 'feature' || to.area === 'game'))
    return 'Solo game.ts conoce a los módulos.';
  return null;
}

const fenixPlugin = {
  rules: {
    'module-boundaries': {
      meta: { type: 'problem', schema: [] },
      create(context) {
        const check = (node) => {
          const spec = node.source?.value;
          if (typeof spec !== 'string' || !spec.startsWith('.')) return;
          const refusal = boundaryRefusal(
            placeOf(context.filename),
            placeOf(resolve(dirname(context.filename), spec)),
          );
          if (refusal) context.report({ node: node.source, message: refusal });
        };
        return {
          ImportDeclaration: check,
          ExportNamedDeclaration: check,
          ExportAllDeclaration: check,
          ImportExpression: check,
        };
      },
    },
  },
};

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
  {
    files: ['packages/server/src/**/*.ts'],
    plugins: { fenix: fenixPlugin },
    rules: { 'fenix/module-boundaries': 'error' },
  },
  prettier,
);
