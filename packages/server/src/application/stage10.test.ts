import {
  DEFAULT_APPEARANCE,
  Terrain,
  TileMap,
  type EntityId,
  type ItemKind,
  type ServerMessage,
} from '@fenix/shared';
import { describe, expect, it } from 'vitest';
import { Creature } from '../domain/creatures/creature';
import { World } from '../domain/world';
import { WorldClock } from '../domain/world-clock';
import { FakeClock, FixedRandom, RecordingNotifier, SequentialIds } from '../test-support/fakes';
import { GameApplication } from './game-application';

/** Campo de 12×5 de pasto con una columna de agua al este. */
function createField() {
  const terrain = new Array<Terrain>(60).fill(Terrain.Grass);
  for (let y = 0; y < 5; y++) terrain[y * 12 + 11] = Terrain.Water;
  const map = new TileMap({ width: 12, height: 5, terrain, statics: [] });
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
  const last = <T extends ServerMessage['type']>(type: T, to: EntityId) =>
    notifier
      .ofType(type)
      .filter((d) => d.to === to)
      .at(-1)?.message as Extract<ServerMessage, { type: T }> | undefined;
  return { map, clock, notifier, world, app, run, join, player, give, texts, last };
}

describe('etapa 10: hechizos, efectos, vendas y oficios', () => {
  it('Envenenar quita vida de a poco y la poción de purificación lo saca', () => {
    const f = createField();
    const ana = f.join('Ana');
    f.player(ana).skills.set('magery', 400);
    const rat = new Creature('rata', 'rat', { x: 5, y: 2 });
    f.world.addCreature(rat);
    rat.combat.applyEffect('paralyzed', 0, 60_000, 0);

    f.app.handle(ana, { type: 'castSpell', spell: 'poison', targetId: 'rata' });
    f.run(1500);
    expect(rat.combat.effect('poison')?.amount).toBe(2);
    const before = rat.combat.current.hits;
    f.run(4000);
    expect(rat.combat.current.hits).toBeLessThan(before);

    // A sí misma: el veneno se cura con la poción y vuelve la botella.
    f.player(ana).combat.applyEffect('poison', 1, 20_000, f.clock.now());
    const potion = f.give(ana, 'cure-potion');
    f.app.handle(ana, { type: 'useItem', itemId: potion });
    expect(f.player(ana).combat.effect('poison')).toBeUndefined();
    expect(f.world.items.countInBackpack(ana, 'empty-bottle')).toBe(1);
    expect(f.texts()).toContain('Tomaste una poción de purificación. El veneno desapareció.');
  });

  it('las pociones de fuerza suben la vida máxima y se avisa el efecto', () => {
    const f = createField();
    const ana = f.join('Ana');
    const maxBefore = f.player(ana).combat.current.maxHits;
    f.app.handle(ana, { type: 'useItem', itemId: f.give(ana, 'strength-potion') });
    expect(f.player(ana).combat.attributes.strength).toBe(60);
    expect(f.player(ana).combat.current.maxHits).toBe(maxBefore + 5);
    const effects = f.last('effects', ana);
    expect(effects?.effects.map((e) => e.kind)).toEqual(['strength']);
    // A los dos minutos se termina.
    f.run(121_000);
    expect(f.player(ana).combat.attributes.strength).toBe(50);
    expect(f.last('effects', ana)?.effects).toEqual([]);
  });

  it('las vendas curan tras unos segundos y suben Primeros auxilios', () => {
    const f = createField();
    const ana = f.join('Ana');
    const bandage = f.give(ana, 'bandage', 5);
    f.player(ana).combat.takeDamage(40);
    const hits = f.player(ana).combat.current.hits;
    f.app.handle(ana, { type: 'useOn', itemId: bandage, targetId: ana });
    expect(f.texts()).toContain('Empezás a vendarte.');
    expect(f.world.items.countInBackpack(ana, 'bandage')).toBe(14);
    f.run(8000);
    expect(f.player(ana).combat.current.hits).toBeGreaterThan(hits + 3);
    expect(f.texts().some((t) => t.startsWith('Curaste'))).toBe(true);
    expect(f.texts().some((t) => t.includes('Primeros auxilios subió'))).toBe(true);
  });

  it('Teletransporte lleva a un lugar cercano y lo ven los demás', () => {
    const f = createField();
    const ana = f.join('Ana');
    f.player(ana).skills.set('magery', 300);
    f.app.handle(ana, { type: 'castSpell', spell: 'teleport', position: { x: 8, y: 1 } });
    f.run(1500);
    expect(f.player(ana).position).toEqual({ x: 8, y: 1 });
    expect(f.last('mobileTeleported', ana)).toEqual({
      type: 'mobileTeleported',
      id: ana,
      position: { x: 8, y: 1 },
    });
  });

  it('un golpe corta el hechizo si no hay Protección', () => {
    const f = createField();
    const ana = f.join('Ana');
    f.player(ana).skills.set('magery', 1000);
    const { x, y } = f.player(ana).position;
    const rat = new Creature('rata', 'rat', { x: x + 1, y });
    f.world.addCreature(rat);
    f.app.handle(ana, { type: 'castSpell', spell: 'energy-bolt', targetId: 'rata' });
    f.run(2000);
    expect(f.texts()).toContain('Te desconcentraste y el hechizo se perdió.');
  });

  it('con un oficio se fabrica usando su herramienta y materiales', () => {
    const f = createField();
    const ana = f.join('Ana');
    f.app.handle(ana, { type: 'craft', recipe: 'bandage' });
    expect(f.texts().at(-1)).toBe('Necesitás un costurero en la mochila.');
    f.give(ana, 'sewing-kit');
    f.give(ana, 'cloth', 3);
    f.app.handle(ana, { type: 'craft', recipe: 'bandage' });
    expect(f.texts()).toContain('Fabricaste 10 vendas.');
    expect(f.world.items.countInBackpack(ana, 'cloth')).toBe(2);

    // Inscripción: gasta pergamino, reactivos y maná.
    f.give(ana, 'scribe-pen');
    f.give(ana, 'blank-scroll', 2);
    f.clock.advance(2000);
    f.app.handle(ana, { type: 'craft', recipe: 'scroll-magic-arrow' });
    expect(f.world.items.countInBackpack(ana, 'scroll-magic-arrow')).toBe(1);
  });

  it('se lanza un hechizo desde un pergamino sin libro ni reactivos', () => {
    const f = createField();
    const ana = f.join('Ana');
    for (const kind of ['spellbook', 'sulfurous-ash'] as const)
      f.world.items.consumeFromBackpack(ana, kind, f.world.items.countInBackpack(ana, kind), {
        groundRemoved: [],
        groundAdded: [],
        inventories: new Set(),
        looks: new Set(),
      });
    const rat = new Creature('rata', 'rat', { x: 6, y: 2 });
    f.world.addCreature(rat);
    const scroll = f.give(ana, 'scroll-magic-arrow');
    f.app.handle(ana, {
      type: 'castSpell',
      spell: 'magic-arrow',
      targetId: 'rata',
      scrollId: scroll,
    });
    f.run(1000);
    expect(f.world.items.get(scroll)).toBeUndefined();
    expect(rat.combat.current.hits).toBeLessThan(rat.combat.current.maxHits);
  });

  it('se pesca con caña en el agua', () => {
    const f = createField();
    const ana = f.join('Ana');
    const pole = f.give(ana, 'fishing-pole');
    f.app.handle(ana, { type: 'gather', toolId: pole, position: { x: 2, y: 2 } });
    expect(f.texts().at(-1)).toBe('Ahí no hay agua para pescar.');
    f.app.handle(ana, { type: 'gather', toolId: pole, position: { x: 11, y: 2 } });
    expect(f.texts().at(-1)).toBe('El agua está muy lejos.');
    f.player(ana).teleport({ x: 8, y: 2 });
    f.app.handle(ana, { type: 'gather', toolId: pole, position: { x: 11, y: 2 } });
    expect(f.world.items.countInBackpack(ana, 'raw-fish')).toBe(1);
  });

  it('el arco dispara de lejos, gasta flechas y no deja usar escudo', () => {
    const f = createField();
    const ana = f.join('Ana');
    const shield = f.give(ana, 'wooden-shield');
    f.app.handle(ana, { type: 'useItem', itemId: shield });
    const bow = f.give(ana, 'bow');
    f.app.handle(ana, { type: 'useItem', itemId: bow });
    expect(f.world.items.lookOf(ana)).toEqual({ rightHand: 'bow' });

    const rat = new Creature('rata', 'rat', { x: 8, y: 2 });
    f.world.addCreature(rat);
    rat.combat.applyEffect('paralyzed', 0, 60_000, 0);
    f.app.handle(ana, { type: 'attack', targetId: 'rata' });
    f.run(500);
    expect(f.texts()).toContain('No te quedan flechas.');

    f.give(ana, 'arrow', 5);
    f.app.handle(ana, { type: 'attack', targetId: 'rata' });
    f.run(500);
    expect(f.world.items.countInBackpack(ana, 'arrow')).toBe(4);
    expect(f.last('swing', ana)?.ranged).toBe(true);
  });

  describe('octavo círculo', () => {
    /** Una maga lista para el octavo círculo: Magia alta e inteligencia para 50 de maná. */
    const archmage = (f: ReturnType<typeof createField>, name: string): EntityId => {
      const id = f.join(name);
      const player = f.player(id);
      player.skills.set('magery', 1000);
      while (player.combat.baseAttributes.intelligence < 60)
        player.combat.raiseAttribute('intelligence');
      player.combat.restoreMana(100);
      f.give(id, 'blood-moss', 10);
      f.give(id, 'mandrake-root', 10);
      f.give(id, 'spiders-silk', 10);
      f.give(id, 'sulfurous-ash', 10);
      return id;
    };

    it('Invocar demonio trae un demonio que ataca al objetivo de su dueño y se va al terminar', () => {
      const f = createField();
      const ana = archmage(f, 'Ana');
      const { x, y } = f.player(ana).position;
      f.app.handle(ana, { type: 'castSpell', spell: 'summon-daemon', position: { x: x + 2, y } });
      f.run(3000);
      const [daemon] = f.world.summonsOf(ana);
      expect(daemon?.body).toBe('daemon');
      expect(f.notifier.ofType('mobileAppeared').some((d) => d.to === ana)).toBe(true);

      const rat = new Creature('rata', 'rat', { x: x + 6, y });
      f.world.addCreature(rat);
      f.app.handle(ana, { type: 'attack', targetId: 'rata' });
      f.run(8000);
      expect(rat.combat.isDead || rat.gone).toBe(true);
      // No se puede atacar a la propia invocación.
      if (daemon) f.app.handle(ana, { type: 'attack', targetId: daemon.id });
      expect(f.texts()).toContain('Es una criatura que invocaste vos.');

      f.run(300_000);
      expect(f.world.summonsOf(ana)).toEqual([]);
    });

    it('no se pueden tener más de dos invocaciones', () => {
      const f = createField();
      const ana = archmage(f, 'Ana');
      const { x, y } = f.player(ana).position;
      for (const [dx, spell] of [
        [2, 'air-elemental'],
        [3, 'earth-elemental'],
        [4, 'fire-elemental'],
      ] as const) {
        f.player(ana).combat.restoreMana(100);
        f.app.handle(ana, { type: 'castSpell', spell, position: { x: x + dx, y } });
        f.run(3000);
      }
      expect(f.world.summonsOf(ana)).toHaveLength(2);
      expect(f.texts()).toContain('Ya tenés demasiadas criaturas invocadas.');
    });

    it('Terremoto daña a todos los que están cerca', () => {
      const f = createField();
      const ana = archmage(f, 'Ana');
      const { x, y } = f.player(ana).position;
      const rats = [1, 3].map((dx) => {
        const rat = new Creature(`rata${dx}`, 'rat', { x: x + dx, y });
        rat.combat.applyEffect('paralyzed', 0, 60_000, 0);
        f.world.addCreature(rat);
        return rat;
      });
      f.app.handle(ana, { type: 'castSpell', spell: 'earthquake' });
      f.run(2600);
      for (const rat of rats)
        expect(rat.combat.current.hits).toBeLessThan(rat.combat.current.maxHits);
    });

    it('Resurrección devuelve la vida a un fantasma', () => {
      const f = createField();
      const ana = archmage(f, 'Ana');
      const bruno = f.join('Bruno');
      f.player(bruno).combat.takeDamage(500);
      f.app.handle(ana, { type: 'castSpell', spell: 'resurrection', targetId: bruno });
      f.run(2600);
      expect(f.player(bruno).combat.isDead).toBe(false);
      expect(
        f.notifier
          .ofType('system')
          .some(
            (d) =>
              d.to === bruno &&
              d.message.type === 'system' &&
              d.message.text === '¡Ana te devolvió la vida!',
          ),
      ).toBe(true);
    });
  });

  it('los atributos suben entrenando, con tope, y se avisan', () => {
    const f = createField();
    const ana = f.join('Ana');
    const player = f.player(ana);
    for (let i = 0; i < 40; i++) player.skills.tryGain('magery', () => 0);
    expect(player.combat.baseAttributes.intelligence).toBeGreaterThan(30);
    f.run(100);
    expect(f.texts().some((t) => t.startsWith('Tu inteligencia subió a'))).toBe(true);
    expect(f.last('effects', ana)?.attributes.intelligence).toBe(
      player.combat.baseAttributes.intelligence,
    );
    // La suma de los tres no pasa de 225.
    const total = (): number => {
      const { strength, dexterity, intelligence } = player.combat.baseAttributes;
      return strength + dexterity + intelligence;
    };
    while (player.combat.baseAttributes.strength < 100) player.combat.raiseAttribute('strength');
    while (total() < 224) player.combat.raiseAttribute('dexterity');
    for (let i = 0; i < 200; i++) player.skills.tryGain('magery', () => 0);
    expect(total()).toBe(225);
  });
});
