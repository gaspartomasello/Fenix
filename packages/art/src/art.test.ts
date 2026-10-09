import {
  ALL_DIRECTIONS,
  CREATURE_KINDS,
  DEFAULT_APPEARANCE,
  Direction,
  HAIR_STYLES,
  ITEM_KINDS,
  STATIC_KINDS,
  Terrain,
} from '@fenix/shared';
import { describe, expect, it } from 'vitest';
import {
  ACTION_KINDS,
  CHARACTER_ART_HEIGHT,
  CHARACTER_ART_WIDTH,
  attackStyleFor,
  drawCharacterFrame,
} from './character-art';
import { drawCreatureFrame } from './creature-art';
import { ITEM_ART_SIZE, drawItem, itemVariant } from './item-art';
import { STATIC_ART_HEIGHT, STATIC_ART_WIDTH, drawStatic } from './static-art';
import { TERRAIN_ART_SIZE, drawTerrainTile } from './terrain-art';

const opaquePixels = (data: Uint8ClampedArray): number =>
  data.filter((_, i) => i % 4 === 3 && (data[i] ?? 0) > 0).length;

describe('arte procedural (sin DOM)', () => {
  it('dibuja los 8 sentidos del personaje', () => {
    for (const direction of ALL_DIRECTIONS) {
      const image = drawCharacterFrame(DEFAULT_APPEARANCE, direction, 'idle');
      expect([image.width, image.height]).toEqual([CHARACTER_ART_WIDTH, CHARACTER_ART_HEIGHT]);
      expect(opaquePixels(image.data)).toBeGreaterThan(100);
    }
  });

  it('dibuja todos los objetos fijos', () => {
    for (const kind of STATIC_KINDS) {
      const image = drawStatic(kind, 0);
      expect([image.width, image.height]).toEqual([STATIC_ART_WIDTH, STATIC_ART_HEIGHT]);
      expect(opaquePixels(image.data)).toBeGreaterThan(10);
    }
  });

  it('dibuja el ícono de cada objeto', () => {
    for (const kind of ITEM_KINDS) {
      const image = drawItem(kind);
      expect(image.width).toBe(ITEM_ART_SIZE);
      expect(opaquePixels(image.data)).toBeGreaterThan(20);
    }
  });

  it('muestra el equipo puesto sobre el personaje', () => {
    const plain = drawCharacterFrame(DEFAULT_APPEARANCE, 3, 'idle');
    const armed = drawCharacterFrame(DEFAULT_APPEARANCE, 3, 'idle', {
      head: 'iron-helmet',
      torso: 'chainmail',
      rightHand: 'short-sword',
      leftHand: 'wooden-shield',
      cloak: 'cloak',
    });
    expect(armed.data).not.toEqual(plain.data);
    for (const direction of ALL_DIRECTIONS) {
      expect(() =>
        drawCharacterFrame(DEFAULT_APPEARANCE, direction, 0, { rightHand: 'axe', cloak: 'cloak' }),
      ).not.toThrow();
    }
  });

  it('dibuja cada criatura en las 8 direcciones y con caminata', () => {
    for (const kind of CREATURE_KINDS) {
      for (const direction of ALL_DIRECTIONS) {
        for (const frame of ['idle', 0, 1, 2, 3] as const) {
          const image = drawCreatureFrame(kind, direction, frame);
          expect(image.height).toBe(CHARACTER_ART_HEIGHT);
          expect(opaquePixels(image.data)).toBeGreaterThan(15);
        }
      }
    }
  });

  it('es determinístico', () => {
    expect(drawStatic('oak', 1).data).toEqual(drawStatic('oak', 1).data);
    expect(drawTerrainTile(Terrain.Grass, 2).data).toEqual(drawTerrainTile(Terrain.Grass, 2).data);
  });

  it('mezcla el borde con un vecino de mayor prioridad', () => {
    const plain = drawTerrainTile(Terrain.Sand, 0);
    const blended = drawTerrainTile(Terrain.Sand, 0, { north: Terrain.Grass });
    expect(blended.width).toBe(TERRAIN_ART_SIZE);
    expect(blended.data).not.toEqual(plain.data);
    // El empedrado no se mezcla.
    expect(drawTerrainTile(Terrain.Stone, 0, { north: Terrain.Grass }).data).toEqual(
      drawTerrainTile(Terrain.Stone, 0).data,
    );
  });
});

describe('personajes con volumen', () => {
  const pixels = (image: { data: Uint8ClampedArray }): string => image.data.join(',');

  it('peinado, barba y ropa de oficio cambian el dibujo', () => {
    const base = drawCharacterFrame(DEFAULT_APPEARANCE, Direction.SouthEast, 'idle');
    for (const variant of [
      drawCharacterFrame({ ...DEFAULT_APPEARANCE, hairStyle: 'long' }, Direction.SouthEast, 'idle'),
      drawCharacterFrame(
        { ...DEFAULT_APPEARANCE, facialHair: 'beard' },
        Direction.SouthEast,
        'idle',
      ),
      drawCharacterFrame(DEFAULT_APPEARANCE, Direction.SouthEast, 'idle', {}, 'mage'),
    ]) {
      expect(pixels(variant)).not.toBe(pixels(base));
    }
  });

  it('las direcciones opuestas no son simples espejos (el arma sigue en la mano derecha)', () => {
    const armed = { rightHand: 'short-sword', leftHand: 'wooden-shield' } as const;
    const east = drawCharacterFrame(DEFAULT_APPEARANCE, Direction.East, 'idle', armed);
    const south = drawCharacterFrame(DEFAULT_APPEARANCE, Direction.South, 'idle', armed);
    expect(pixels(south)).not.toBe(pixels(east.mirrored()));
  });
});

describe('animaciones y cuerpos', () => {
  const pixels = (image: { data: Uint8ClampedArray }): string => image.data.join(',');

  it('todas las acciones se dibujan en las 8 direcciones', () => {
    for (const kind of ACTION_KINDS) {
      for (const direction of ALL_DIRECTIONS) {
        const image = drawCharacterFrame(DEFAULT_APPEARANCE, direction, `${kind}-1`, {
          rightHand: 'short-sword',
        });
        expect(image.data.some((v, i) => i % 4 === 3 && v > 0)).toBe(true);
      }
    }
  });

  it('correr no es caminar rápido, y cada arma tiene su gesto', () => {
    const at = (frame: Parameters<typeof drawCharacterFrame>[2]) =>
      pixels(drawCharacterFrame(DEFAULT_APPEARANCE, Direction.NorthEast, frame));
    expect(at('run-0')).not.toBe(at(0));
    expect(at('slash-1')).not.toBe(at('thrust-1'));
    expect(at('cast-1')).not.toBe(at('idle'));
  });

  it('el cuerpo de mujer y cada peinado se ven distintos', () => {
    const female = { ...DEFAULT_APPEARANCE, gender: 'female' } as const;
    const seen = new Set(
      HAIR_STYLES.map((hairStyle) =>
        pixels(drawCharacterFrame({ ...female, hairStyle }, Direction.North, 'idle')),
      ),
    );
    expect(seen.size).toBe(HAIR_STYLES.length);
    expect(pixels(drawCharacterFrame(female, Direction.SouthEast, 'idle'))).not.toBe(
      pixels(drawCharacterFrame(DEFAULT_APPEARANCE, Direction.SouthEast, 'idle')),
    );
  });

  it('cada arma y armadura nueva se ve puesta, y el arco tiene su disparo', () => {
    const look = (equipment: Parameters<typeof drawCharacterFrame>[3]) =>
      pixels(drawCharacterFrame(DEFAULT_APPEARANCE, Direction.SouthEast, 'idle', equipment));
    const weapons = [
      'kryss',
      'spear',
      'broadsword',
      'katana',
      'mace',
      'war-hammer',
      'bow',
    ] as const;
    expect(new Set(weapons.map((rightHand) => look({ rightHand }))).size).toBe(weapons.length);
    const torsos = ['studded-leather', 'plate-chest', 'robe', 'leather-armor'] as const;
    expect(new Set(torsos.map((torso) => look({ torso }))).size).toBe(torsos.length);
    expect(look({ head: 'plate-helm' })).not.toBe(look({ head: 'iron-helmet' }));
    expect(look({ legs: 'plate-legs' })).not.toBe(look({ legs: 'leather-leggings' }));
    expect(attackStyleFor('bow')).toBe('shoot');
    expect(attackStyleFor('kryss')).toBe('thrust');
  });

  it('el oro se dibuja según la cantidad: de una moneda a una montaña', () => {
    const seen = new Set([1, 3, 20, 500, 60_000].map((n) => pixels(drawItem('gold', 'ground', n))));
    expect(seen.size).toBe(5);
    expect(itemVariant('gold', 60_000)).toBeGreaterThan(itemVariant('gold', 1));
    expect(itemVariant('apple', 60_000)).toBe(0);
  });
});
