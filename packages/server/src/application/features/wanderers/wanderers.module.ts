import type { ModuleFactory } from '../../kernel/game-module';
import { Wanderers } from './wanderers';

/**
 * Los caminantes: gente de nombre azul con historia propia, en las
 * encrucijadas del continente (fuera de las zonas seguras).
 */
export const wanderersModule: ModuleFactory = (kernel) => {
  const wanderers = new Wanderers(kernel.world, kernel.ids, kernel.random);
  wanderers.settle();
  kernel.dialogue.add((player, npc, words) => wanderers.talk(player, npc, words));
  return { name: 'wanderers' };
};
