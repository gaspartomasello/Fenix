import { Direction, DEFAULT_APPEARANCE, Terrain, TileMap, MOVE_DURATION_MS } from '@fenix/shared';
import { describe, expect, it } from 'vitest';
import { MOVE_EARLY_TOLERANCE_MS, MOVE_IDLE_CREDIT_MS, Player } from './player';

const G = Terrain.Grass;
const W = Terrain.Water;
// Fila de 5 tiles con agua al final: G G G G W
const map = new TileMap({ width: 5, height: 1, terrain: [G, G, G, G, W] });

function createPlayer(): Player {
  return new Player({
    id: 'p1',
    name: 'Ana',
    appearance: DEFAULT_APPEARANCE,
    position: { x: 0, y: 0 },
    direction: Direction.South,
  });
}

describe('Player.tryMove', () => {
  it('avanza y gira hacia la dirección del paso', () => {
    const player = createPlayer();
    expect(player.tryMove(map, Direction.East, 'walk', 1000)).toEqual({ ok: true });
    expect(player.position).toEqual({ x: 1, y: 0 });
    expect(player.direction).toBe(Direction.East);
  });

  it('gira pero no avanza si el destino está bloqueado', () => {
    const player = createPlayer();
    expect(player.tryMove(map, Direction.North, 'walk', 1000)).toEqual({
      ok: false,
      reason: 'blocked',
    });
    expect(player.position).toEqual({ x: 0, y: 0 });
    expect(player.direction).toBe(Direction.North);
  });

  it('respeta la cadencia de caminata', () => {
    const player = createPlayer();
    let now = 1000;
    expect(player.tryMove(map, Direction.East, 'walk', now).ok).toBe(true);
    now += MOVE_DURATION_MS.walk;
    expect(player.tryMove(map, Direction.East, 'walk', now).ok).toBe(true);
    // Paso pedido sin esperar su turno.
    expect(player.tryMove(map, Direction.East, 'walk', now)).toEqual({
      ok: false,
      reason: 'too-fast',
    });
  });

  it('tolera pasos que llegan juntos por jitter de red', () => {
    const player = createPlayer();
    expect(player.tryMove(map, Direction.East, 'walk', 1350).ok).toBe(true);
    expect(player.tryMove(map, Direction.East, 'walk', 1400).ok).toBe(true);
  });

  it('no deja acumular ventaja enviando pasos continuamente', () => {
    const player = createPlayer();
    const bigMap = new TileMap({ width: 100, height: 1, terrain: new Array(100).fill(G) });
    let accepted = 0;
    // Durante 4 s, un paso cada 50 ms (8 veces más rápido que caminar).
    for (let now = 1000; now < 5000; now += 50) {
      if (player.tryMove(bigMap, Direction.East, 'walk', now).ok) accepted++;
    }
    const legit = 4000 / MOVE_DURATION_MS.walk;
    const maxBonus =
      Math.ceil((MOVE_EARLY_TOLERANCE_MS + MOVE_IDLE_CREDIT_MS) / MOVE_DURATION_MS.walk) + 1;
    expect(accepted).toBeLessThanOrEqual(legit + maxBonus);
  });
});
