import type { ModuleFactory } from '../../kernel/game-module';
import { Attack } from './attack';
import { CastSpell } from './cast-spell';
import { GameLoop } from './game-loop';
import { WarMode } from './war-mode';

/**
 * Pelear y lanzar hechizos, y la vuelta del mundo (criaturas, golpes,
 * regeneración). Da `combat`; avisa `attacked`, `castStarted` y lo que
 * pasa en la vuelta (muertes, botín, hechizos sobre muebles y puertas).
 */
export const combatModule: ModuleFactory = (kernel) => {
  const { world, services, events } = kernel;
  const warMode = new WarMode(world, kernel.mobiles, kernel.notifier);
  const attack = new Attack(
    world,
    kernel.clock,
    kernel.mobiles,
    kernel.social,
    kernel.notifier,
    warMode,
  );
  const castSpell = new CastSpell(
    world,
    kernel.clock,
    kernel.mobiles,
    kernel.items,
    kernel.social,
    kernel.notifier,
  );
  const loop = new GameLoop(
    world,
    kernel.mobiles,
    kernel.items,
    kernel.notifier,
    kernel.ids,
    kernel.random,
    kernel.social,
    events,
    {
      movement: services.lazy('movement'),
      corpses: services.optional('corpses'),
      mounts: services.optional('mounts'),
      portals: services.optional('portals'),
      stealth: services.optional('stealth'),
    },
    warMode,
  );
  services.provide('combat', {
    hurt: (target, amount, now) => loop.hurt(target, amount, now),
    slay: (victim, by, now) => loop.slay(victim, by, now),
    dismiss: (creature) => loop.dismiss(creature),
  });
  return {
    name: 'combat',
    handles: {
      attack: (playerId, m) => {
        attack.execute(playerId, m.targetId);
        const attacker = world.get(playerId);
        if (attacker?.combat.targetId === m.targetId)
          events.emit('attacked', { attacker, targetId: m.targetId });
      },
      stopAttack: (playerId) => attack.stop(playerId),
      setWarMode: (playerId, m) => attack.setWarMode(playerId, m.war),
      castSpell: (playerId, m) => {
        castSpell.execute(playerId, {
          spell: m.spell,
          ...(m.targetId ? { targetId: m.targetId } : {}),
          ...(m.position ? { position: m.position } : {}),
          ...(m.scrollId ? { scrollId: m.scrollId } : {}),
          ...(m.runeId ? { runeId: m.runeId } : {}),
          ...(m.form ? { form: m.form } : {}),
        });
        const caster = world.get(playerId);
        if (caster?.pendingCast) events.emit('castStarted', { caster });
      },
    },
    tick: (now) => loop.tick(now),
    // Sus invocaciones se van con él.
    leaving: (player) => {
      for (const summon of world.summonsOf(player.id)) loop.dismiss(summon);
    },
    // La montura suelta se guardó con él: se va del mundo hasta que vuelva.
    left: (playerId) => {
      if (!world.get(playerId)) return;
      const pet = world.petOf(playerId);
      if (pet) loop.dismiss(pet);
    },
  };
};
