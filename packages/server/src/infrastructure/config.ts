import { existsSync } from 'node:fs';

export interface ServerConfig {
  readonly port: number;
  readonly host: string;
  /** Carpeta del cliente compilado; null en desarrollo (lo sirve Vite). */
  readonly clientDist: string | null;
  readonly mapSeed: number;
  readonly mapSize: number;
  /** Hora del juego con la que arranca el mundo (0–24). */
  readonly startHour: number;
  /** Carpeta donde se guardan los personajes. */
  readonly dataDir: string;
  /** Personajes de prueba (todo al máximo), separados por coma en TEST_CHARACTERS. */
  readonly testCharacters: readonly string[];
}

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value)) throw new Error(`${name} debe ser un número entero`);
  return value;
}

/**
 * @param defaultClientDist carpeta del cliente compilado a usar si existe y no
 * se definió CLIENT_DIST.
 */
export function loadConfig(defaultClientDist: string): ServerConfig {
  return {
    port: intFromEnv('PORT', 3000),
    host: process.env.HOST ?? '0.0.0.0',
    clientDist:
      process.env.CLIENT_DIST ?? (existsSync(defaultClientDist) ? defaultClientDist : null),
    mapSeed: intFromEnv('MAP_SEED', 1997),
    mapSize: intFromEnv('MAP_SIZE', 128),
    startHour: intFromEnv('START_HOUR', 8),
    dataDir: process.env.DATA_DIR ?? 'data',
    testCharacters: (process.env.TEST_CHARACTERS ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean),
  };
}
