import {
  DEFAULT_APPEARANCE,
  Direction,
  MOVE_DURATION_MS,
  Terrain,
  type ClientMessage,
  type PlayerSnapshot,
} from '@fenix/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { ClientGame, type LogEntry } from './client-game';
import { MAX_PENDING_STEPS } from './movement-predictor';

const G = Terrain.Grass;
const W = Terrain.Water;

function snapshot(id: string, x: number, y: number): PlayerSnapshot {
  return {
    id,
    name: id.toUpperCase(),
    position: { x, y },
    direction: Direction.South,
    appearance: DEFAULT_APPEARANCE,
    equipment: {},
  };
}

describe('ClientGame', () => {
  let now: number;
  let sent: ClientMessage[];
  let game: ClientGame;

  beforeEach(() => {
    now = 1000;
    sent = [];
    game = new ClientGame({ send: (m) => sent.push(m) }, () => now);
    // Mapa 4x1: G G G W
    game.apply({
      type: 'welcome',
      selfId: 'ana',
      map: {
        width: 4,
        height: 1,
        terrain: [G, G, G, W],
        statics: [],
        regions: [{ name: 'Muelle', x: 0, y: 0, width: 2, height: 1 }],
      },
      time: { dayProgress: 0.5, dayLengthMs: 10_000 },
      players: [snapshot('ana', 0, 0), snapshot('bruno', 2, 0)],
    });
  });

  it('extrapola la hora del mundo y sabe en qué zona está', () => {
    now += 2_500;
    expect(game.worldTime()?.dayProgress).toBeCloseTo(0.75);
    expect(game.currentRegion()?.name).toBe('Muelle');
  });

  it('carga el mundo inicial', () => {
    expect(game.self?.name).toBe('ANA');
    expect(game.visibleCount).toBe(2);
  });

  describe('predicción de movimiento', () => {
    it('mueve al jugador al instante y envía el pedido', () => {
      game.requestStep(Direction.East, 'walk');
      expect(game.self?.position).toEqual({ x: 1, y: 0 });
      expect(sent).toEqual([{ type: 'move', direction: Direction.East, mode: 'walk', seq: 1 }]);
    });

    it('respeta la cadencia antes de pedir otro paso', () => {
      game.requestStep(Direction.East, 'walk');
      now += MOVE_DURATION_MS.walk / 2;
      game.requestStep(Direction.East, 'walk');
      expect(sent).toHaveLength(1);
      now += MOVE_DURATION_MS.walk / 2;
      game.requestStep(Direction.East, 'walk');
      expect(sent).toHaveLength(2);
    });

    it('frena si hay demasiados pasos sin confirmar', () => {
      for (let i = 0; i < MAX_PENDING_STEPS + 2; i++) {
        game.requestStep(i % 2 === 0 ? Direction.East : Direction.West, 'run');
        now += MOVE_DURATION_MS.run;
      }
      expect(sent).toHaveLength(MAX_PENDING_STEPS);
    });

    it('vuelve a la posición del servidor si rechaza el paso', () => {
      game.requestStep(Direction.East, 'walk');
      game.apply({
        type: 'moveRejected',
        seq: 1,
        position: { x: 0, y: 0 },
        direction: Direction.East,
      });
      expect(game.self?.position).toEqual({ x: 0, y: 0 });
    });

    it('corrige la posición cuando el último ack no coincide', () => {
      game.requestStep(Direction.East, 'walk');
      game.apply({ type: 'moveAck', seq: 1, position: { x: 2, y: 0 } });
      expect(game.self?.position).toEqual({ x: 2, y: 0 });
    });

    it('contra el agua solo gira', () => {
      game.apply({
        type: 'moveRejected',
        seq: 0,
        position: { x: 2, y: 0 },
        direction: Direction.South,
      });
      game.requestStep(Direction.East, 'walk');
      expect(game.self?.position).toEqual({ x: 2, y: 0 });
      expect(game.self?.direction).toBe(Direction.East);
    });
  });

  describe('otros jugadores', () => {
    it('anima los movimientos de otros jugadores', () => {
      game.apply({
        type: 'playerMoved',
        id: 'bruno',
        position: { x: 1, y: 0 },
        direction: Direction.West,
        mode: 'walk',
      });
      const bruno = [...game.allEntities()].find((e) => e.id === 'bruno');
      expect(bruno?.position).toEqual({ x: 1, y: 0 });
      now += MOVE_DURATION_MS.walk / 2;
      expect(bruno?.renderPosition(now)).toEqual({ x: 1.5, y: 0 });
    });

    it('ignora ecos de su propio movimiento', () => {
      game.apply({
        type: 'playerMoved',
        id: 'ana',
        position: { x: 3, y: 0 },
        direction: Direction.East,
        mode: 'walk',
      });
      expect(game.self?.position).toEqual({ x: 0, y: 0 });
    });

    it('agrega y quita jugadores avisando con eventos', () => {
      const added: string[] = [];
      const removed: string[] = [];
      game.on('entityAdded', (e) => added.push(e.id));
      game.on('entityRemoved', (id) => removed.push(id));
      game.apply({ type: 'playerAppeared', player: snapshot('carla', 1, 0) });
      game.apply({ type: 'playerAppeared', player: snapshot('carla', 1, 0) });
      game.apply({ type: 'playerDisappeared', id: 'bruno' });
      game.apply({ type: 'playerDisappeared', id: 'ana' });
      expect(added).toEqual(['carla']);
      expect(removed).toEqual(['bruno']);
      expect(game.visibleCount).toBe(2);
    });
  });

  describe('objetos', () => {
    it('lleva la cuenta de los objetos del suelo a la vista', () => {
      game.apply({
        type: 'groundItems',
        added: [{ id: 'i1', kind: 'apple', amount: 2, position: { x: 1, y: 0 } }],
        removed: [],
      });
      expect([...game.groundItems()].map((i) => i.id)).toEqual(['i1']);
      game.apply({ type: 'groundItems', added: [], removed: ['i1'] });
      expect([...game.groundItems()]).toEqual([]);
    });

    it('guarda la mochila y avisa cuando cambia', () => {
      const changes: number[] = [];
      game.on('inventoryChanged', (inventory) => changes.push(inventory.backpack.length));
      game.apply({
        type: 'inventory',
        backpack: [{ id: 'g', kind: 'gold', amount: 50, position: { x: 0, y: 0 } }],
        equipment: [{ id: 'd', kind: 'dagger', amount: 1, slot: 'rightHand' }],
      });
      expect(changes).toEqual([1]);
      expect(game.findItem('d')).toMatchObject({ slot: 'rightHand' });
    });

    it('actualiza lo que se ve puesto otro jugador', () => {
      game.apply({ type: 'playerEquipment', id: 'bruno', equipment: { head: 'iron-helmet' } });
      const bruno = [...game.allEntities()].find((e) => e.id === 'bruno');
      expect(bruno?.equipment).toEqual({ head: 'iron-helmet' });
    });

    it('envía los pedidos de mover y usar', () => {
      game.moveItem('i1', { type: 'equipment', slot: 'head' });
      game.useItem('i1');
      expect(sent).toEqual([
        { type: 'moveItem', itemId: 'i1', to: { type: 'equipment', slot: 'head' } },
        { type: 'useItem', itemId: 'i1' },
      ]);
    });
  });

  describe('chat', () => {
    it('muestra el texto sobre la cabeza y en el registro', () => {
      const log: LogEntry[] = [];
      game.on('log', (entry) => log.push(entry));
      game.apply({ type: 'chat', id: 'bruno', name: 'BRUNO', text: 'Hail!' });
      expect(log).toEqual([{ kind: 'chat', author: 'BRUNO', text: 'Hail!' }]);
      const bruno = [...game.allEntities()].find((e) => e.id === 'bruno');
      expect(bruno?.overheadTexts.map((t) => t.text)).toEqual(['Hail!']);

      now += 10_000;
      game.update();
      expect(bruno?.overheadTexts).toHaveLength(0);
    });

    it('no envía mensajes vacíos', () => {
      game.say('   ');
      game.say(' hola ');
      expect(sent).toEqual([{ type: 'chat', text: 'hola' }]);
    });
  });
});
