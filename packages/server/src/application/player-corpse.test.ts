import { DEFAULT_APPEARANCE } from '@fenix/shared/character/appearance';
import type { EntityId } from '@fenix/shared/protocol/messages';
import { Terrain } from '@fenix/shared/world/terrain';
import { TileMap } from '@fenix/shared/world/tile-map';
import { describe, expect, it } from 'vitest';
import { Creature } from '../domain/creatures/creature';
import { emptyChanges } from '../domain/items/items';
import { World } from '../domain/world';
import { WorldClock } from '../domain/world-clock';
import { FakeClock, FixedRandom, RecordingNotifier, SequentialIds } from '../test-support/fakes';
// <módulos>
import { gameWith } from '../test-support/game';
import { movementModule } from './features/movement/movement.module';
import { combatModule } from './features/combat/combat.module';
import { itemsModule } from './features/items/items.module';
import { economyModule } from './features/economy/economy.module';
import { corpsesModule } from './features/corpses/corpses.module';
// </módulos>
import { PLAYER_BONES_MS, PLAYER_CORPSE_MS } from './features/corpses/corpses';

const newGame = gameWith([movementModule, combatModule, itemsModule, economyModule, corpsesModule]);

function createArena() {
  const map = new TileMap({
    width: 12,
    height: 3,
    terrain: new Array<Terrain>(36).fill(Terrain.Grass),
  });
  const clock = new FakeClock(0);
  const notifier = new RecordingNotifier();
  const world = new World(map, { x: 2, y: 1 });
  const ids = new SequentialIds();
  const app = newGame({
    world,
    worldClock: new WorldClock(0),
    clock,
    ids,
    random: new FixedRandom(0.2),
    notifier,
  });
  const run = (ms: number): void => {
    for (let elapsed = 0; elapsed < ms; elapsed += 100) {
      clock.advance(100);
      app.tick(clock.now());
    }
  };
  const join = (name: string): EntityId => {
    const result = app.join({ type: 'join', name, appearance: DEFAULT_APPEARANCE });
    if (!result.ok) throw new Error(result.reason);
    app.announceJoin(result.playerId);
    return result.playerId;
  };
  /** Beto lleva oro y muere a manos de una rata; devuelve el id de su cuerpo. */
  const killBeto = (beto: EntityId): EntityId => {
    const player = world.get(beto);
    if (!player) throw new Error('sin jugador');
    world.items.addToBackpack(beto, 'gold', 50, () => ids.next(), emptyChanges());
    const rat = new Creature('rata', 'rat', { x: 3, y: 1 });
    world.addCreature(rat);
    player.combat.takeDamage(player.combat.current.hits - 1);
    for (let t = 0; t < 5000 && !player.combat.isDead; t += 100) run(100);
    if (!player.combat.isDead) throw new Error('Beto no murió');
    world.removeCreature('rata');
    const corpse = world.items.groundNear(player.position).find((i) => i.kind === 'player-corpse');
    if (!corpse) throw new Error('no quedó el cuerpo');
    return corpse.id;
  };
  return { clock, notifier, world, app, run, join, killBeto };
}

describe('el cuerpo de un jugador', () => {
  it('queda en el suelo con lo que llevaba, menos el equipo inicial', () => {
    const arena = createArena();
    const beto = arena.join('Beto');
    const corpseId = arena.killBeto(beto);
    const inside = arena.world.items.corpseOf(corpseId);
    expect(inside.map((i) => i.kind)).toContain('gold');
    expect(inside.every((i) => !i.newbie)).toBe(true);
    expect(arena.world.items.countInBackpack(beto, 'gold')).toBe(0);
    expect(arena.world.items.get(corpseId)?.corpse?.name).toBe('Beto');
  });

  it('se revisa de a un objeto, sin "Tomar todo", y saquear a un inocente es crimen', () => {
    const arena = createArena();
    const beto = arena.join('Beto');
    const ana = arena.join('Ana');
    const corpseId = arena.killBeto(beto);

    arena.app.handle(ana, { type: 'useItem', itemId: corpseId });
    const opened = arena.notifier.ofType('corpse').at(-1)?.message;
    if (opened?.type !== 'corpse') throw new Error('no se abrió el cuerpo');
    expect(opened.name).toBe('cuerpo de Beto');
    expect(opened.noTakeAll).toBe(true);

    arena.app.handle(ana, { type: 'lootAll', corpseId });
    expect(arena.world.items.corpseOf(corpseId).length).toBeGreaterThan(0);
    const anaPlayer = arena.world.get(ana);
    expect(anaPlayer?.reputation.notoriety).toBe('innocent');

    const gold = arena.world.items.corpseOf(corpseId).find((i) => i.kind === 'gold');
    if (!gold) throw new Error('sin oro');
    arena.app.handle(ana, { type: 'moveItem', itemId: gold.id, to: { type: 'backpack' } });
    expect(arena.world.items.countInBackpack(ana, 'gold')).toBeGreaterThanOrEqual(50);
    expect(anaPlayer?.reputation.notoriety).toBe('criminal');
  });

  it('se vuelve huesos a los 7 minutos y desaparece a los 14', () => {
    const arena = createArena();
    const beto = arena.join('Beto');
    const corpseId = arena.killBeto(beto);
    const at = arena.world.items.get(corpseId)?.location;
    if (at?.type !== 'ground') throw new Error('el cuerpo no está en el suelo');

    arena.run(PLAYER_CORPSE_MS + 200);
    expect(arena.world.items.get(corpseId)).toBeUndefined();
    const bones = arena.world.items.groundNear(at.position).find((i) => i.kind === 'player-bones');
    if (!bones) throw new Error('no quedaron huesos');
    expect(arena.world.items.corpseOf(bones.id).map((i) => i.kind)).toContain('gold');

    arena.run(PLAYER_BONES_MS + 200);
    expect(arena.world.items.get(bones.id)).toBeUndefined();
    expect(arena.world.items.corpseOf(bones.id)).toHaveLength(0);
  });
});
