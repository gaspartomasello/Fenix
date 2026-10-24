import { DEFAULT_APPEARANCE } from '@fenix/shared/character/appearance';
import type { CreatureKind } from '@fenix/shared/creatures/creature-catalog';
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
import { combatModule } from './features/combat/combat.module';
// </módulos>

const newGame = gameWith([combatModule]);

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
  const spawn = (kind: CreatureKind, dx: number, id = `c-${kind}-${dx}`): Creature => {
    const player = [...world.allPlayers()][0];
    const at = player ? { x: player.position.x + dx, y: player.position.y } : { x: 8, y: 4 };
    const creature = new Creature(id, kind, at);
    world.addCreature(creature);
    return creature;
  };
  return { clock, notifier, world, app, run, join, spawn };
}

describe('modo guerra y defensa propia', () => {
  it('si lo atacan estando en paz, pasa solo a modo guerra y devuelve los golpes', () => {
    const f = createField();
    const ana = f.join('Ana');
    const rat = f.spawn('rat', 1);
    const player = f.world.get(ana);
    expect(player?.warMode).toBe(false);
    f.run(4000);
    expect(player?.warMode).toBe(true);
    expect(
      f.notifier
        .ofType('warModeChanged')
        .some((d) => d.to === ana && d.message.type === 'warModeChanged' && d.message.auto),
    ).toBe(true);
    // Le pegó a la rata sin que nadie la eligiera.
    expect(
      f.notifier
        .ofType('swing')
        .some((d) => d.message.type === 'swing' && d.message.attackerId === ana),
    ).toBe(true);
    expect(rat.combat.health).toBeLessThan(1);
  });

  it('al matar a una sigue con la otra que lo está atacando', () => {
    const f = createField();
    const ana = f.join('Ana');
    f.spawn('rat', 1);
    f.spawn('rat', -1);
    f.run(40000);
    const kills = f.notifier
      .ofType('system')
      .filter((d) => d.to === ana && d.message.type === 'system' && /Mataste/.test(d.message.text));
    expect(kills).toHaveLength(2);
  });

  it('en paz deja de atacar; otra persona que lo ataca también recibe respuesta', () => {
    const f = createField();
    const ana = f.join('Ana');
    const beto = f.join('Beto');
    const anaPlayer = f.world.get(ana);
    const betoPlayer = f.world.get(beto);
    if (!anaPlayer || !betoPlayer) throw new Error('faltan jugadores');
    betoPlayer.teleport({ x: anaPlayer.position.x + 1, y: anaPlayer.position.y });
    f.app.handle(beto, { type: 'attack', targetId: ana });
    expect(betoPlayer.warMode).toBe(true);
    f.run(5000);
    expect(anaPlayer.warMode).toBe(true);
    expect(anaPlayer.combat.targetId).toBe(beto);
    f.app.handle(ana, { type: 'setWarMode', war: false });
    expect(anaPlayer.warMode).toBe(false);
    expect(anaPlayer.combat.targetId).toBeNull();
  });
});
