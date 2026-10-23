import { adminModule } from './features/admin/admin.module';
import { booksModule } from './features/books/books.module';
import { chatModule } from './features/chat/chat.module';
import { combatModule } from './features/combat/combat.module';
import { containersModule } from './features/containers/containers.module';
import { corpsesModule } from './features/corpses/corpses.module';
import { doorsModule } from './features/doors/doors.module';
import { dyeingModule } from './features/dyeing/dyeing.module';
import { economyModule } from './features/economy/economy.module';
import { itemsModule } from './features/items/items.module';
import { loreModule } from './features/lore/lore.module';
import { mountsModule } from './features/mounts/mounts.module';
import { movementModule } from './features/movement/movement.module';
import { portalsModule } from './features/portals/portals.module';
import { questsModule } from './features/quests/quests.module';
import { shipsModule } from './features/ships/ships.module';
import { socialModule } from './features/social/social.module';
import { stealthModule } from './features/stealth/stealth.module';
import { thieveryModule } from './features/thievery/thievery.module';
import { townLifeModule } from './features/town-life/town-life.module';
import { trackingModule } from './features/tracking/tracking.module';
import { treasureModule } from './features/treasure/treasure.module';
import { GameApplication, type GameApplicationDeps } from './game-application';
import type { ModuleFactory } from './kernel/game-module';

/**
 * Todos los módulos del juego. Es el único lugar que los conoce a todos:
 * sumar una funcionalidad es agregar su módulo acá, sin tocar a los demás.
 * El orden es el de cada vuelta del mundo y el de los avisos (los que
 * escuchan lo mismo se enteran en este orden).
 */
export const ALL_MODULES: readonly ModuleFactory[] = [
  movementModule,
  chatModule,
  itemsModule,
  economyModule,
  combatModule,
  mountsModule,
  corpsesModule,
  doorsModule,
  socialModule,
  townLifeModule,
  containersModule,
  booksModule,
  dyeingModule,
  questsModule,
  loreModule,
  treasureModule,
  shipsModule,
  trackingModule,
  thieveryModule,
  portalsModule,
  stealthModule,
  adminModule,
];

/** El juego completo, con todos sus módulos. */
export function createGame(deps: GameApplicationDeps): GameApplication {
  return new GameApplication(deps, ALL_MODULES);
}
