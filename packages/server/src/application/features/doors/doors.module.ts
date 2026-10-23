import { SPELL_RANGE } from '@fenix/shared/magic/spell-catalog';
import type { ModuleFactory } from '../../kernel/game-module';
import { Doors } from './doors';

/** Abrir y cerrar puertas, a mano o con Telequinesis. */
export const doorsModule: ModuleFactory = (kernel) => {
  const doors = new Doors(kernel.world, kernel.notifier);
  kernel.events.on('telekinesis', ({ casterId, position }) => {
    if (kernel.world.map.doorAt(position)) doors.use(casterId, position, SPELL_RANGE);
  });
  return {
    name: 'doors',
    handles: { useDoor: (playerId, m) => doors.use(playerId, m.position) },
  };
};
