import { DEFAULT_APPEARANCE } from '@fenix/shared/character/appearance';
import { Direction } from '@fenix/shared/geometry/direction';
import type { ItemKind } from '@fenix/shared/items/item-catalog';
import { SUMMONED_BEASTS } from '@fenix/shared/magic/spell-catalog';
import { decodeClientMessage } from '@fenix/shared/protocol/codec';
import type { EntityId, ServerMessage } from '@fenix/shared/protocol/messages';
import { moveDuration } from '@fenix/shared/rules/movement';
import { staticContainerId } from '@fenix/shared/world/statics';
import { Terrain } from '@fenix/shared/world/terrain';
import { TileMap } from '@fenix/shared/world/tile-map';
import { describe, expect, it } from 'vitest';
import { World } from '../domain/world';
import { WorldClock } from '../domain/world-clock';
import { FakeClock, FixedRandom, RecordingNotifier, SequentialIds } from '../test-support/fakes';
import { GameApplication } from './game-application';

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
  const app = new GameApplication({
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
    // Inteligencia alta: los hechizos del séptimo círculo gastan 40 de maná.
    player(id).combat.setBaseAttributes({ strength: 60, dexterity: 40, intelligence: 100 });
    player(id).combat.restoreMana(1000);
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
  return { map, world, app, run, join, player, mage, texts, notifier, give };
}

describe('etapa 65: los hechizos de UO que faltaban', () => {
  it('Armadura reactiva se queda con parte del golpe y se la devuelve a quien pega', () => {
    const f = createField();
    const ana = f.mage('Ana');
    const bruno = f.join('Bruno');
    f.player(ana).teleport({ x: 2, y: 2 });
    f.player(bruno).teleport({ x: 3, y: 2 });
    f.app.handle(ana, { type: 'castSpell', spell: 'reactive-armor' });
    f.run(1000);
    expect(f.player(ana).combat.effect('reactive-armor')?.amount).toBe(30);
    const before = f.player(bruno).combat.current.hits;
    f.app.handle(bruno, { type: 'attack', targetId: ana });
    f.run(6000);
    expect(f.player(bruno).combat.current.hits).toBeLessThan(before);
    expect(f.texts(bruno).some((t) => t.startsWith('La armadura reactiva te devolvió'))).toBe(true);
    expect(f.player(ana).combat.effect('reactive-armor')?.amount ?? 0).toBeLessThan(30);
  });

  it('Reflejo mágico devuelve el próximo hechizo dañino a quien lo lanzó', () => {
    const f = createField();
    const ana = f.mage('Ana');
    const bruno = f.mage('Bruno');
    f.player(bruno).teleport({ x: 5, y: 2 });
    f.app.handle(ana, { type: 'castSpell', spell: 'magic-reflection' });
    f.run(2000);
    expect(f.player(ana).combat.effect('magic-reflection')).toBeDefined();
    const ana0 = f.player(ana).combat.current.hits;
    const bruno0 = f.player(bruno).combat.current.hits;
    f.app.handle(bruno, { type: 'castSpell', spell: 'harm', targetId: ana });
    f.run(1500);
    expect(f.player(ana).combat.current.hits).toBeGreaterThanOrEqual(ana0);
    expect(f.player(bruno).combat.current.hits).toBeLessThan(bruno0);
    expect(f.texts(bruno)).toContain('¡Ana te devolvió el hechizo!');
    // Sirve para un solo hechizo.
    expect(f.player(ana).combat.effect('magic-reflection')).toBeUndefined();
  });

  it('Cerradura mágica cierra un cofre y Abrir cerradura lo vuelve a abrir', () => {
    const f = createField();
    const ana = f.mage('Ana');
    const bruno = f.join('Bruno');
    f.player(bruno).teleport({ x: 3, y: 1 });
    const chest = staticContainerId({ x: 3, y: 0 });
    f.app.handle(ana, { type: 'castSpell', spell: 'magic-lock', position: { x: 3, y: 0 } });
    f.run(1500);
    f.app.handle(bruno, { type: 'openContainer', containerId: chest });
    expect(f.texts(bruno).some((t) => t.includes('cerrado con llave'))).toBe(true);
    f.app.handle(ana, { type: 'castSpell', spell: 'unlock', position: { x: 3, y: 0 } });
    f.run(1500);
    expect(f.texts(ana).some((t) => t.startsWith('¡Clic!'))).toBe(true);
    f.notifier.clear();
    f.app.handle(bruno, { type: 'openContainer', containerId: chest });
    expect(f.notifier.ofType('container').some((d) => d.to === bruno)).toBe(true);
  });

  it('Telequinesis hace saltar la trampa de un cofre desde lejos, sin daño', () => {
    const f = createField();
    const ana = f.mage('Ana');
    const chest = staticContainerId({ x: 3, y: 0 });
    f.app.handle(ana, { type: 'castSpell', spell: 'magic-trap', position: { x: 3, y: 0 } });
    f.run(1500);
    const hits = f.player(ana).combat.current.hits;
    f.app.handle(ana, { type: 'castSpell', spell: 'telekinesis', position: { x: 3, y: 0 } });
    f.run(1500);
    expect(f.texts(ana).some((t) => t.includes('estalla lejos de vos'))).toBe(true);
    expect(f.player(ana).combat.current.hits).toBe(hits);
    void chest;
  });

  it('Disipar campo deshace un tramo del muro', () => {
    const f = createField();
    const ana = f.mage('Ana');
    f.app.handle(ana, { type: 'castSpell', spell: 'wall-of-stone', position: { x: 5, y: 2 } });
    f.run(2000);
    expect(f.map.isWalkable({ x: 5, y: 2 })).toBe(false);
    f.app.handle(ana, { type: 'castSpell', spell: 'dispel-field', position: { x: 5, y: 2 } });
    f.run(2000);
    expect(f.map.isWalkable({ x: 5, y: 2 })).toBe(true);
    expect(f.map.isWalkable({ x: 5, y: 1 })).toBe(false);
  });

  it('Espíritu de espadas aparece y Disipar lo hace desaparecer', () => {
    const f = createField();
    const ana = f.mage('Ana');
    const bruno = f.mage('Bruno');
    f.player(bruno).teleport({ x: 8, y: 2 });
    f.app.handle(ana, { type: 'castSpell', spell: 'blade-spirits', position: { x: 4, y: 2 } });
    f.run(2000);
    const spirit = f.world.summonsOf(ana)[0];
    expect(spirit?.body).toBe('blade-spirits');
    f.app.handle(bruno, { type: 'castSpell', spell: 'dispel', targetId: spirit?.id ?? '' });
    f.run(2500);
    expect(f.world.summonsOf(ana)).toHaveLength(0);
    expect(f.texts(ana)).toContain('Disiparon a tu espíritu de espadas.');
  });

  it('Disipar en grupo se lleva las invocaciones ajenas de alrededor', () => {
    const f = createField();
    const ana = f.mage('Ana');
    const bruno = f.mage('Bruno');
    f.player(bruno).teleport({ x: 9, y: 2 });
    f.app.handle(ana, { type: 'castSpell', spell: 'blade-spirits', position: { x: 4, y: 2 } });
    f.run(2000);
    f.app.handle(ana, { type: 'castSpell', spell: 'blade-spirits', position: { x: 4, y: 3 } });
    f.run(2000);
    expect(f.world.summonsOf(ana)).toHaveLength(2);
    f.app.handle(bruno, { type: 'castSpell', spell: 'mass-dispel', position: { x: 5, y: 2 } });
    f.run(2500);
    expect(f.world.summonsOf(ana)).toHaveLength(0);
  });

  it('Invocar criatura trae un animal salvaje que pelea para el mago', () => {
    const f = createField();
    const ana = f.mage('Ana');
    f.app.handle(ana, { type: 'castSpell', spell: 'summon-creature', position: { x: 4, y: 2 } });
    f.run(2000);
    const beast = f.world.summonsOf(ana)[0];
    expect(beast && SUMMONED_BEASTS.includes(beast.body as never)).toBe(true);
  });

  it('Incógnito cambia el nombre y la cara un rato; después vuelve a ser quien era', () => {
    const f = createField();
    const ana = f.mage('Ana');
    f.app.handle(ana, { type: 'castSpell', spell: 'incognito' });
    f.run(2000);
    const disguised = f.world.snapshotOf(f.player(ana));
    expect(disguised.name).not.toBe('Ana');
    expect(f.notifier.ofType('mobileLook').some((d) => d.to === ana)).toBe(true);
    f.run(300_000);
    expect(f.world.snapshotOf(f.player(ana)).name).toBe('Ana');
    expect(f.texts(ana)).toContain('Volvés a ser vos.');
  });

  it('Transformación convierte en el animal elegido y sin equipo a la vista', () => {
    const f = createField();
    const ana = f.mage('Ana');
    f.app.handle(ana, { type: 'castSpell', spell: 'polymorph' });
    expect(f.texts(ana)).toContain('Elegí en qué querés transformarte.');
    f.app.handle(ana, { type: 'castSpell', spell: 'polymorph', form: 'wolf' });
    f.run(2500);
    const wolf = f.world.snapshotOf(f.player(ana));
    expect(wolf.body).toBe('wolf');
    expect(wolf.equipment).toEqual({});
    expect(f.texts(ana)).toContain('Te transformaste en un lobo gris.');
  });

  it('hecho caballo, corre a la velocidad de un caballo', () => {
    const f = createField();
    const ana = f.mage('Ana');
    f.app.handle(ana, { type: 'castSpell', spell: 'polymorph', form: 'horse-chestnut' });
    f.run(2500);
    expect(f.world.snapshotOf(f.player(ana)).body).toBe('horse-chestnut');
    // Seis pasos corriendo al ritmo de un caballo: a pie, alguno llegaría antes de tiempo.
    const gallop = (id: EntityId): boolean[] => {
      const who = f.player(id);
      who.teleport({ x: 0, y: id === ana ? 1 : 3 });
      return [0, 1, 2, 3, 4, 5].map(
        (k) =>
          who.tryMove(f.map, Direction.East, 'run', 100_000 + k * moveDuration('run', true)).ok,
      );
    };
    expect(gallop(ana).every(Boolean)).toBe(true);
    const bruno = f.join('Bruno');
    expect(gallop(bruno).every(Boolean)).toBe(false);
  });

  it('el pedido de Transformación solo acepta formas que existen', () => {
    const ok = decodeClientMessage(
      JSON.stringify({ type: 'castSpell', spell: 'polymorph', form: 'grizzly' }),
    );
    expect(ok.ok && ok.message.type === 'castSpell' && ok.message.form).toBe('grizzly');
    const bad = decodeClientMessage(
      JSON.stringify({ type: 'castSpell', spell: 'polymorph', form: 'dragon' }),
    );
    expect(bad.ok).toBe(false);
  });
});
