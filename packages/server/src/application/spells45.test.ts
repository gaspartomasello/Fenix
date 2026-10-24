import { DEFAULT_APPEARANCE } from '@fenix/shared/character/appearance';
import type { ItemKind } from '@fenix/shared/items/item-catalog';
import type { EntityId, ServerMessage } from '@fenix/shared/protocol/messages';
import { staticContainerId } from '@fenix/shared/world/statics';
import { Terrain } from '@fenix/shared/world/terrain';
import { TileMap } from '@fenix/shared/world/tile-map';
import { describe, expect, it } from 'vitest';
import { World } from '../domain/world';
import { WorldClock } from '../domain/world-clock';
import { FakeClock, FixedRandom, RecordingNotifier, SequentialIds } from '../test-support/fakes';
// <módulos>
import { gameWith } from '../test-support/game';
import { combatModule } from './features/combat/combat.module';
import { containersModule } from './features/containers/containers.module';
// </módulos>

const newGame = gameWith([combatModule, containersModule]);

/** Campo de 12×5 de pasto con un cofre en (3, 0). */
function createField() {
  const map = new TileMap({
    width: 12,
    height: 5,
    terrain: new Array<Terrain>(60).fill(Terrain.Grass),
    statics: [{ kind: 'chest', x: 3, y: 0 }],
  });
  const clock = new FakeClock(0);
  const notifier = new RecordingNotifier();
  const world = new World(map, { x: 2, y: 2 });
  const app = newGame({
    world,
    worldClock: new WorldClock(0),
    clock,
    ids: new SequentialIds(),
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
  const player = (id: EntityId) => {
    const found = world.get(id);
    if (!found) throw new Error('sin jugador');
    return found;
  };
  let next = 0;
  const give = (owner: EntityId, kind: ItemKind, amount = 1): void => {
    world.items.add(`obj${++next}`, kind, amount, {
      type: 'backpack',
      ownerId: owner,
      position: { x: 0, y: 0 },
    });
  };
  /** Un mago con libro, Magia al máximo y reactivos de sobra. */
  const mage = (name: string): EntityId => {
    const id = join(name);
    player(id).skills.set('magery', 1000);
    give(id, 'spellbook');
    for (const kind of [
      'black-pearl',
      'blood-moss',
      'garlic',
      'ginseng',
      'mandrake-root',
      'nightshade',
      'spiders-silk',
      'sulfurous-ash',
    ] as const)
      give(id, kind, 50);
    return id;
  };
  const texts = (to: EntityId): string[] =>
    notifier
      .ofType('system')
      .filter((d) => d.to === to)
      .map((d) => (d.message as Extract<ServerMessage, { type: 'system' }>).text);
  return { map, world, app, run, join, player, mage, texts };
}

describe('etapa 45: muros, campos, hechizos de área y trampas', () => {
  it('el Muro de piedra cierra el paso un rato y después se desmorona', () => {
    const f = createField();
    const ana = f.mage('Ana');
    f.app.handle(ana, { type: 'castSpell', spell: 'wall-of-stone', position: { x: 5, y: 2 } });
    f.run(2000);
    // Atravesado: de norte a sur, cinco tiles en la columna 5.
    for (let y = 0; y < 5; y++) expect(f.map.isWalkable({ x: 5, y })).toBe(false);
    expect(f.world.items.all().filter((i) => i.kind === 'field-stone')).toHaveLength(5);
    f.run(10_000);
    expect(f.map.isWalkable({ x: 5, y: 2 })).toBe(true);
    expect(f.world.items.all().some((i) => i.kind === 'field-stone')).toBe(false);
  });

  it('el Campo de fuego quema a quien se queda adentro', () => {
    const f = createField();
    const ana = f.mage('Ana');
    const bruno = f.join('Bruno');
    f.player(bruno).teleport({ x: 5, y: 2 });
    const before = f.player(bruno).combat.current.hits;
    f.app.handle(ana, { type: 'castSpell', spell: 'fire-field', position: { x: 5, y: 2 } });
    f.run(3500);
    expect(f.player(bruno).combat.current.hits).toBeLessThan(before);
    expect(f.texts(bruno).some((t) => t.startsWith('¡Te quemás!'))).toBe(true);
  });

  it('una Trampa mágica estalla al abrir el cofre y Desarmar trampa la saca', () => {
    const f = createField();
    const ana = f.mage('Ana');
    const bruno = f.join('Bruno');
    f.player(bruno).teleport({ x: 3, y: 1 });
    const chest = staticContainerId({ x: 3, y: 0 });
    f.app.handle(ana, { type: 'castSpell', spell: 'magic-trap', position: { x: 3, y: 0 } });
    f.run(1500);
    expect(f.texts(ana)).toContain('Pusiste una trampa en cofre.');
    const before = f.player(bruno).combat.current.hits;
    f.app.handle(bruno, { type: 'openContainer', containerId: chest });
    expect(f.player(bruno).combat.current.hits).toBeLessThan(before);
    // Ya estalló: la segunda vez no pasa nada.
    const after = f.player(bruno).combat.current.hits;
    f.app.handle(bruno, { type: 'openContainer', containerId: chest });
    expect(f.player(bruno).combat.current.hits).toBe(after);

    f.app.handle(ana, { type: 'castSpell', spell: 'magic-trap', position: { x: 3, y: 0 } });
    f.run(1500);
    f.app.handle(ana, { type: 'castSpell', spell: 'magic-untrap', position: { x: 3, y: 0 } });
    f.run(1500);
    expect(f.texts(ana)).toContain('Desarmaste la trampa de cofre.');
    const healed = f.player(bruno).combat.current.hits;
    f.app.handle(bruno, { type: 'openContainer', containerId: chest });
    expect(f.player(bruno).combat.current.hits).toBe(healed);
  });

  it('Protección en grupo protege a quienes están cerca', () => {
    const f = createField();
    const ana = f.mage('Ana');
    const bruno = f.join('Bruno');
    f.player(bruno).teleport({ x: 3, y: 2 });
    f.app.handle(ana, { type: 'castSpell', spell: 'arch-protection' });
    f.run(2000);
    expect(f.player(ana).combat.effect('protection')).toBeDefined();
    expect(f.player(bruno).combat.effect('protection')).toBeDefined();
  });
});
