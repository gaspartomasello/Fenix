import { DEFAULT_APPEARANCE } from '@fenix/shared/character/appearance';
import type { ItemKind } from '@fenix/shared/items/item-catalog';
import type { EntityId } from '@fenix/shared/protocol/messages';
import { lockDifficulty } from '@fenix/shared/skills/thievery';
import { Terrain } from '@fenix/shared/world/terrain';
import { TileMap } from '@fenix/shared/world/tile-map';
import { describe, expect, it } from 'vitest';
import { Npc } from '../domain/npcs/npc';
import { World } from '../domain/world';
import { WorldClock } from '../domain/world-clock';
import { FakeClock, FixedRandom, RecordingNotifier, SequentialIds } from '../test-support/fakes';
// <módulos>
import { gameWith } from '../test-support/game';
import { containersModule } from './features/containers/containers.module';
import { thieveryModule } from './features/thievery/thievery.module';
// </módulos>

const newGame = gameWith([containersModule, thieveryModule]);

/** Un cofre con llave (en unas ruinas) y una persona al lado de donde se aparece. */
function createRuins(roll: number) {
  // Un lugar del cofre cuya cerradura existe.
  const chestX = [3, 4, 5, 6, 7, 8].find((x) => lockDifficulty(x, 3, true) > 0) ?? 3;
  const map = new TileMap({
    width: 12,
    height: 6,
    terrain: new Array<Terrain>(72).fill(Terrain.Grass),
    statics: [{ kind: 'chest', x: chestX, y: 3 }],
    regions: [{ name: 'Ruinas', x: 0, y: 0, width: 12, height: 6, wild: true }],
  });
  const clock = new FakeClock(0);
  const notifier = new RecordingNotifier();
  const world = new World(map, { x: chestX, y: 2 });
  const ids = new SequentialIds();
  const app = newGame({
    world,
    worldClock: new WorldClock(0),
    clock,
    ids,
    random: new FixedRandom(roll),
    notifier,
  });
  const join = (name: string): EntityId => {
    const result = app.join({ type: 'join', name, appearance: DEFAULT_APPEARANCE });
    if (!result.ok) throw new Error(result.reason);
    app.announceJoin(result.playerId);
    // Uno al lado del otro, sobre el cofre.
    world.get(result.playerId)?.teleport({ x: chestX + world.allPlayers().length - 1, y: 2 });
    return result.playerId;
  };
  let next = 0;
  const give = (owner: EntityId, kind: ItemKind, amount = 1): EntityId => {
    const id = `obj${++next}`;
    world.items.add(id, kind, amount, {
      type: 'backpack',
      ownerId: owner,
      position: { x: 0, y: 0 },
    });
    return id;
  };
  const texts = (): string[] =>
    notifier.ofType('system').map((d) => (d.message.type === 'system' ? d.message.text : ''));
  return { world, app, join, give, texts, chest: { x: chestX, y: 3 } };
}

describe('etapa 55: el oficio del ladrón', () => {
  it('un cofre de las ruinas está cerrado con llave y se abre con una ganzúa', () => {
    const f = createRuins(0.2);
    const ana = f.join('Ana');
    const containerId = `static:${f.chest.x}:${f.chest.y}`;
    f.app.handle(ana, { type: 'openContainer', containerId });
    expect(f.texts().at(-1)).toMatch(/cerrado con llave/);
    f.world.get(ana)?.skills.set('lockpicking', 1000);
    const pick = f.give(ana, 'lockpick', 3);
    f.app.handle(ana, { type: 'pickLock', toolId: pick, position: f.chest });
    expect(f.texts().at(-1)).toMatch(/cedió/);
    f.app.handle(ana, { type: 'openContainer', containerId });
    // Lo guardado con llave trae oro.
    expect(f.world.items.contentsOf(containerId).some((i) => i.kind === 'gold')).toBe(true);
  });

  it('fisgonear a un vecino muestra lo que lleva; robarle pasa algo a tu mochila', () => {
    const f = createRuins(0.2);
    const ana = f.join('Ana');
    const thief = f.world.get(ana);
    thief?.skills.set('snooping', 1000);
    thief?.skills.set('stealing', 1000);
    f.world.addNpc(new Npc('panadera', 'baker', { x: f.chest.x + 1, y: 2 }, 'Pocha'));
    f.app.handle(ana, { type: 'useSkill', skill: 'snooping', targetId: 'panadera' });
    expect(f.texts().at(-1)).toMatch(/En la mochila de Pocha ves: .*monedas de oro/);
    const carried = (): number => f.world.items.backpackOf(ana).reduce((n, i) => n + i.amount, 0);
    const before = carried();
    f.app.handle(ana, { type: 'useSkill', skill: 'stealing', targetId: 'panadera' });
    expect(f.texts().at(-1)).toMatch(/Le robaste .* a Pocha/);
    expect(carried()).toBeGreaterThan(before);
    // Queda atenta un rato.
    f.app.handle(ana, { type: 'useSkill', skill: 'stealing', targetId: 'panadera' });
    expect(f.texts().at(-1)).toMatch(/atent/);
  });

  it('a otro jugador se le roba de la mochila (no el equipo inicial), y si te pescan sos criminal', () => {
    const lucky = createRuins(0.2);
    const ana = lucky.join('Ana');
    const beto = lucky.join('Beto');
    lucky.world.get(ana)?.skills.set('stealing', 1000);
    lucky.give(beto, 'ruby');
    const newbies = (): number => lucky.world.items.backpackOf(beto).filter((i) => i.newbie).length;
    const kept = newbies();
    lucky.app.handle(ana, { type: 'useSkill', skill: 'stealing', targetId: beto });
    expect(lucky.texts().filter((t) => /rob/.test(t))).toEqual([
      expect.stringMatching(/Le robaste/),
    ]);
    // El equipo inicial no se roba.
    expect(newbies()).toBe(kept);

    const caught = createRuins(0.99);
    const ana2 = caught.join('Ana');
    const beto2 = caught.join('Beto');
    caught.app.handle(ana2, { type: 'useSkill', skill: 'stealing', targetId: beto2 });
    expect(caught.texts().some((t) => /te descubrió robando/.test(t))).toBe(true);
    expect(caught.world.get(ana2)?.reputation.notoriety).toBe('criminal');
  });
});
