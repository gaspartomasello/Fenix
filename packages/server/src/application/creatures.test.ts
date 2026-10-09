import {
  DEFAULT_APPEARANCE,
  Terrain,
  TileMap,
  type CreatureKind,
  type EntityId,
} from '@fenix/shared';
import { describe, expect, it } from 'vitest';
import { Creature } from '../domain/creatures/creature';
import { World } from '../domain/world';
import { WorldClock } from '../domain/world-clock';
import { FakeClock, FixedRandom, RecordingNotifier, SequentialIds } from '../test-support/fakes';
import { GameApplication } from './game-application';

/** Campo abierto de 16×9 de pasto. */
function createField() {
  const map = new TileMap({
    width: 16,
    height: 9,
    terrain: new Array<Terrain>(16 * 9).fill(Terrain.Grass),
    statics: [],
  });
  const clock = new FakeClock(0);
  const notifier = new RecordingNotifier();
  const world = new World(map, { x: 4, y: 4 });
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
  const spawn = (kind: CreatureKind, dx: number): Creature => {
    const player = [...world.allPlayers()][0];
    const at = player ? { x: player.position.x + dx, y: player.position.y } : { x: 8, y: 4 };
    const creature = new Creature(`c-${kind}`, kind, at);
    world.addCreature(creature);
    return creature;
  };
  return { clock, notifier, world, app, run, join, spawn };
}

describe('criaturas nuevas', () => {
  it('la araña gigante envenena al morder', () => {
    const f = createField();
    const ana = f.join('Ana');
    f.spawn('giant-spider', 1);
    f.run(6000);
    const effects = f.notifier.ofType('effects').filter((d) => d.to === ana);
    expect(
      effects.some(
        (d) => d.message.type === 'effects' && d.message.effects.some((e) => e.kind === 'poison'),
      ),
    ).toBe(true);
  });

  it('el mago esquelético pelea a distancia lanzando hechizos', () => {
    const f = createField();
    const ana = f.join('Ana');
    const mage = f.spawn('skeleton-mage', 5);
    f.run(8000);
    const player = f.world.get(ana);
    expect(
      f.notifier
        .ofType('castStart')
        .some((d) => d.message.type === 'castStart' && d.message.casterId === mage.id),
    ).toBe(true);
    expect(player?.combat.current.hits).toBeLessThan(player?.combat.current.maxHits ?? 0);
    // Se queda lejos: no se pega al jugador.
    if (player)
      expect(
        Math.max(
          Math.abs(mage.position.x - player.position.x),
          Math.abs(mage.position.y - player.position.y),
        ),
      ).toBeGreaterThan(1);
  });

  it('el troll se regenera aun peleando', () => {
    const f = createField();
    f.join('Ana');
    const troll = f.spawn('troll', 8);
    troll.combat.takeDamage(60);
    const hurt = troll.combat.current.hits;
    f.run(4000);
    expect(troll.combat.current.hits).toBeGreaterThan(hurt);
  });

  it('el orco huye cuando le queda poca vida', () => {
    const f = createField();
    const ana = f.join('Ana');
    const orc = f.spawn('orc', 2);
    orc.combat.takeDamage(55);
    const player = f.world.get(ana);
    const start = player ? Math.abs(orc.position.x - player.position.x) : 0;
    f.run(3000);
    const end = player ? Math.abs(orc.position.x - player.position.x) : 0;
    expect(end).toBeGreaterThan(start);
  });

  it('el dragón escupe fuego', () => {
    const f = createField();
    const ana = f.join('Ana');
    f.spawn('dragon', 4);
    f.run(4000);
    expect(
      f.notifier
        .ofType('spellEffect')
        .some(
          (d) =>
            d.to === ana && d.message.type === 'spellEffect' && d.message.spell === 'flamestrike',
        ),
    ).toBe(true);
  });
});
