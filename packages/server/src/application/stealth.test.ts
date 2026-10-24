import { DEFAULT_APPEARANCE } from '@fenix/shared/character/appearance';
import { Direction } from '@fenix/shared/geometry/direction';
import type { EntityId } from '@fenix/shared/protocol/messages';
import { Terrain } from '@fenix/shared/world/terrain';
import { TileMap } from '@fenix/shared/world/tile-map';
import { describe, expect, it } from 'vitest';
import { Creature } from '../domain/creatures/creature';
import { World } from '../domain/world';
import { WorldClock } from '../domain/world-clock';
import { FakeClock, FixedRandom, RecordingNotifier, SequentialIds } from '../test-support/fakes';
// <módulos>
import { gameWith } from '../test-support/game';
import { movementModule } from './features/movement/movement.module';
import { chatModule } from './features/chat/chat.module';
import { combatModule } from './features/combat/combat.module';
import { stealthModule } from './features/stealth/stealth.module';
// </módulos>

const newGame = gameWith([movementModule, chatModule, combatModule, stealthModule]);

/** Campo abierto de 16×8, con la tirada fija en 0,2 (sale casi todo). */
function createField() {
  const map = new TileMap({
    width: 16,
    height: 8,
    terrain: new Array<Terrain>(128).fill(Terrain.Grass),
  });
  const clock = new FakeClock(0);
  const notifier = new RecordingNotifier();
  const world = new World(map, { x: 4, y: 4 });
  const app = newGame({
    world,
    worldClock: new WorldClock(0),
    clock,
    ids: new SequentialIds(),
    random: new FixedRandom(0.2),
    notifier,
  });
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
  const to = (id: EntityId) => notifier.deliveries.filter((d) => d.to === id).map((d) => d.message);
  const texts = (id: EntityId): string[] =>
    to(id).flatMap((m) => (m.type === 'system' ? [m.text] : []));
  let seq = 0;
  const step = (id: EntityId, direction: Direction, mode: 'walk' | 'run' = 'walk'): void => {
    clock.advance(1000);
    app.handle(id, { type: 'move', direction, mode, seq: ++seq });
  };
  return { world, app, clock, notifier, join, player, to, texts, step };
}

describe('sigilo', () => {
  it('escondido, los demás lo dejan de ver; sin Sigilo, al moverse lo ven', () => {
    const f = createField();
    const ana = f.join('Ana');
    const bruno = f.join('Bruno');
    f.notifier.clear();
    f.app.handle(ana, { type: 'useSkill', skill: 'hiding' });
    expect(f.player(ana).hidden).not.toBeNull();
    expect(f.to(bruno)).toContainEqual({ type: 'mobileDisappeared', id: ana });
    expect(f.to(ana)).toContainEqual({ type: 'hiddenChanged', hidden: true });

    // Sin Sigilo, el primer paso lo descubre y vuelve a aparecer para Bruno.
    f.player(ana).skills.set('stealth', 0);
    f.player(ana).hidden = { steps: 0, until: null };
    f.step(ana, Direction.East);
    expect(f.player(ana).hidden).toBeNull();
    expect(f.texts(ana)).toContain('Te vieron al moverte.');
    expect(f.to(bruno).some((m) => m.type === 'mobileAppeared' && m.mobile.id === ana)).toBe(true);
  });

  it('con Sigilo se camina escondido sin que nadie se entere; correr lo descubre', () => {
    const f = createField();
    const ana = f.join('Ana');
    const bruno = f.join('Bruno');
    f.player(ana).skills.set('stealth', 300);
    f.app.handle(ana, { type: 'useSkill', skill: 'hiding' });
    f.notifier.clear();
    f.step(ana, Direction.East);
    f.step(ana, Direction.East);
    expect(f.player(ana).hidden?.steps).toBe(1);
    expect(f.to(bruno).filter((m) => m.type === 'mobileMoved')).toHaveLength(0);
    f.step(ana, Direction.East, 'run');
    expect(f.player(ana).hidden).toBeNull();
  });

  it('las criaturas no ven al escondido; no se puede esconder con una pegada al lado', () => {
    const f = createField();
    const ana = f.join('Ana');
    const { x, y } = f.player(ana).position;
    f.app.handle(ana, { type: 'useSkill', skill: 'hiding' });
    const wolf = new Creature('lobo', 'wolf', { x: x + 3, y });
    f.world.addCreature(wolf);
    f.app.tick(100);
    expect(wolf.combat.targetId).toBeNull();

    // Descubierta, el lobo la ataca; con el lobo al lado ya no se puede esconder.
    f.app.handle(ana, { type: 'chat', text: 'hola' });
    expect(f.player(ana).hidden).toBeNull();
    expect(f.texts(ana)).toContain('Hablaste y te oyeron.');
    f.app.tick(200);
    expect(wolf.combat.targetId).toBe(ana);
    wolf.position = { x: x + 1, y };
    f.app.handle(ana, { type: 'useSkill', skill: 'hiding' });
    expect(f.player(ana).hidden).toBeNull();
    expect(f.texts(ana).at(-1)).toBe('No podés esconderte con alguien atacándote de cerca.');
  });

  it('Mirar encuentra a los escondidos cerca', () => {
    const f = createField();
    const ana = f.join('Ana');
    const bruno = f.join('Bruno');
    f.app.handle(ana, { type: 'useSkill', skill: 'hiding' });
    f.app.handle(bruno, { type: 'useSkill', skill: 'detect-hidden' });
    expect(f.player(ana).hidden).toBeNull();
    expect(f.texts(bruno).at(-1)).toBe('Encontraste a Ana.');
    expect(f.texts(ana)).toContain('Bruno te encontró.');
  });

  it('Invisibilidad esconde un rato y Revelar descubre alrededor de un lugar', () => {
    const f = createField();
    const ana = f.join('Ana');
    const bruno = f.join('Bruno');
    for (const id of [ana, bruno]) {
      const p = f.player(id);
      p.skills.set('magery', 1000);
      while (p.combat.baseAttributes.intelligence < 60) p.combat.raiseAttribute('intelligence');
      p.combat.restoreMana(100);
      for (const kind of ['spellbook', 'blood-moss', 'nightshade', 'sulfurous-ash'] as const)
        f.world.items.add(`${id}-${kind}`, kind, 10, {
          type: 'backpack',
          ownerId: id,
          position: { x: 0, y: 0 },
        });
    }
    f.app.handle(ana, { type: 'castSpell', spell: 'invisibility', targetId: ana });
    for (let t = 0; t < 2200; t += 100) {
      f.clock.advance(100);
      f.app.tick(f.clock.now());
    }
    expect(f.player(ana).hidden?.until).not.toBeNull();
    const at = f.player(ana).position;
    f.app.handle(bruno, { type: 'castSpell', spell: 'reveal', position: at });
    for (let t = 0; t < 2200; t += 100) {
      f.clock.advance(100);
      f.app.tick(f.clock.now());
    }
    expect(f.player(ana).hidden).toBeNull();
    expect(f.texts(bruno)).toContain('Revelar descubrió a 1.');
  });
});
