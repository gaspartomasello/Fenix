import { GameApplication, type GameApplicationDeps } from '../application/game-application';
import type { ModuleFactory } from '../application/kernel/game-module';

/**
 * Para las pruebas: el juego armado solo con los módulos que la prueba
 * necesita. Así cada prueba depende de lo que toca, y cambiar un módulo
 * corre solo sus pruebas (y las de quienes lo usan).
 */
export function gameWith(
  modules: readonly ModuleFactory[],
): (deps: GameApplicationDeps) => GameApplication {
  return (deps) => new GameApplication(deps, modules);
}
