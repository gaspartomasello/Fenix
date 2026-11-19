import { DEFAULT_APPEARANCE, HAIR_STYLES } from '@fenix/shared/character/appearance';
import { CREATURE_KINDS } from '@fenix/shared/creatures/creature-catalog';
import { weaponByKind } from '@fenix/shared/combat/weapons';
import { ALL_DIRECTIONS, Direction } from '@fenix/shared/geometry/direction';
import { ITEMS, ITEM_KINDS } from '@fenix/shared/items/item-catalog';
import { STATIC_KINDS } from '@fenix/shared/world/statics';
import { Terrain } from '@fenix/shared/world/terrain';
import { describe, expect, it } from 'vitest';
import {
  ACTION_KINDS,
  ART_DETAIL,
  CHARACTER_ART_HEIGHT,
  CHARACTER_ART_WIDTH,
  CHARACTER_FEET_Y,
  SICKLE_ART_HEIGHT,
  SICKLE_FEET_Y,
  SICKLE_TOP_MARGIN,
  attackStyleFor,
  drawCharacterFrame,
} from './character-art';
import { drawCreatureFrame } from './creature-art';
import { creatureLayout } from './monster-art';
import { ITEM_ART_SIZE, drawItem, itemVariant } from './item-art';
import { officialSwordSprite } from './official-swords-art';
import {
  INVISIBLE_STATICS,
  STATIC_ART_HEIGHT,
  STATIC_ART_WIDTH,
  drawStatic,
  staticFrame,
} from './static-art';
import { TERRAIN_ART_SIZE, drawTerrainTile } from './terrain-art';

const opaquePixels = (data: Uint8ClampedArray): number =>
  data.filter((_, i) => i % 4 === 3 && (data[i] ?? 0) > 0).length;

describe('arte procedural (sin DOM)', () => {
  it('dibuja los 8 sentidos del personaje', () => {
    for (const direction of ALL_DIRECTIONS) {
      const image = drawCharacterFrame(DEFAULT_APPEARANCE, direction, 'idle');
      expect([image.width, image.height]).toEqual([
        CHARACTER_ART_WIDTH * ART_DETAIL,
        CHARACTER_ART_HEIGHT * ART_DETAIL,
      ]);
      expect(opaquePixels(image.data)).toBeGreaterThan(100);
    }
  });

  it('dibuja todos los objetos fijos', () => {
    for (const kind of STATIC_KINDS) {
      const image = drawStatic(kind, 0);
      const frame = staticFrame(kind);
      expect([image.width, image.height]).toEqual([frame.width, frame.height]);
      // La montaña no se dibuja: la ladera la pone el terreno.
      if (INVISIBLE_STATICS.has(kind)) expect(opaquePixels(image.data)).toBe(0);
      else expect(opaquePixels(image.data)).toBeGreaterThan(10);
    }
  });

  it('el faro es grande: lienzo propio, más alto que el de siempre', () => {
    expect(staticFrame('lighthouse').height).toBeGreaterThan(STATIC_ART_HEIGHT);
    expect(staticFrame('oak')).toMatchObject({
      width: STATIC_ART_WIDTH,
      height: STATIC_ART_HEIGHT,
    });
  });

  it('dibuja el ícono de cada objeto', () => {
    for (const kind of ITEM_KINDS) {
      const image = drawItem(kind);
      expect(image.width).toBe(
        kind === 'pitchfork' || kind === 'sickle'
          ? 50
          : (officialSwordSprite(kind, 'ground')?.width ?? ITEM_ART_SIZE),
      );
      expect(opaquePixels(image.data)).toBeGreaterThan(20);
    }
  });

  it('mantiene los píxeles de las armas de espadas de la referencia', () => {
    const sources = [
      ['bardiche', 43, 38, 2674265277],
      ['broadsword', 24, 21, 809205224],
      ['cutlass', 17, 22, 206217893],
      ['halberd', 56, 46, 569565504],
      ['katana', 23, 26, 1186815936],
      ['longsword', 32, 31, 357849512],
      ['scimitar', 21, 26, 242315224],
      ['viking-sword', 27, 26, 3988415381],
      ['bladed-staff', 59, 57, 1922132008],
      ['bone-harvester', 29, 21, 1982288781],
      ['butcher-knife', 14, 14, 3197167904],
      ['cleaver', 17, 14, 3202097901],
      ['crescent-blade', 44, 50, 8851621],
      ['scythe', 41, 45, 1812991325],
      ['skinning-knife', 13, 11, 3670949373],
      ['executioners-axe', 32, 27, 3997022349],
      ['hatchet', 26, 21, 2183487984],
      ['axe', 29, 25, 2679315400],
      ['battle-axe', 26, 21, 2183487984],
      ['double-axe', 27, 23, 2150688336],
      ['large-battle-axe', 27, 27, 2797745000],
      ['two-handed-axe', 26, 24, 4201684096],
    ] as const;
    for (const [kind, width, height, expectedHash] of sources) {
      const ground = drawItem(kind);
      const icon = drawItem(kind, 'icon');
      expect([ground.width, ground.height, icon.width, icon.height]).toEqual([
        width,
        height,
        width * 2,
        height * 2,
      ]);
      let hash = 2166136261;
      for (const byte of ground.data) hash = Math.imul(hash ^ byte, 16777619) >>> 0;
      expect(hash).toBe(expectedHash);
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          const source = (y * width + x) * 4;
          const target = (y * 2 * (width * 2) + x * 2) * 4;
          expect(icon.data.slice(target, target + 4)).toEqual(
            ground.data.slice(source, source + 4),
          );
        }
    }
  });

  it('conserva los píxeles RGBA originales del pitchfork en suelo e inventario', () => {
    const ground = drawItem('pitchfork');
    const icon = drawItem('pitchfork', 'icon');
    expect([ground.width, ground.height, icon.width, icon.height]).toEqual([50, 50, 100, 100]);
    let hash = 2166136261;
    for (const byte of ground.data) hash = Math.imul(hash ^ byte, 16777619) >>> 0;
    expect(hash).toBe(2936446925);
    for (let y = 0; y < 50; y++) {
      for (let x = 0; x < 50; x++) {
        const source = (y * 50 + x) * 4;
        const target = (y * 2 * 100 + x * 2) * 4;
        expect(icon.data.slice(target, target + 4)).toEqual(ground.data.slice(source, source + 4));
      }
    }
  });

  it('muestra la hoz original y conserva su configuración a una mano', () => {
    const ground = drawItem('sickle');
    const icon = drawItem('sickle', 'icon');
    expect([ground.width, ground.height, icon.width, icon.height]).toEqual([50, 50, 100, 100]);
    let hash = 2166136261;
    for (const byte of ground.data) hash = Math.imul(hash ^ byte, 16777619) >>> 0;
    expect(hash).toBe(3168388371);
    for (let y = 0; y < 50; y++) {
      for (let x = 0; x < 50; x++) {
        const source = (y * 50 + x) * 4;
        const target = (y * 2 * 100 + x * 2) * 4;
        expect(icon.data.slice(target, target + 4)).toEqual(ground.data.slice(source, source + 4));
      }
    }
    expect(ITEMS.sickle).toMatchObject({ slot: 'rightHand', use: 'equip' });
    expect(ITEMS.sickle.twoHanded).toBeFalsy();
    expect(weaponByKind('sickle')).toMatchObject({
      skill: 'swordsmanship',
      minDamage: 12,
      maxDamage: 16,
      swingMs: 3000,
    });
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
        // Parada en todas las direcciones; caminando y corriendo, en dos de ellas.
        const moving = direction === ALL_DIRECTIONS[0] || direction === ALL_DIRECTIONS[3];
        const frames = moving ? (['idle', 0, 3, 'run-5'] as const) : (['idle'] as const);
        for (const frame of frames) {
          const image = drawCreatureFrame(kind, direction, frame);
          expect(image.height).toBe(creatureLayout(kind).height * ART_DETAIL);
          expect(opaquePixels(image.data)).toBeGreaterThan(15);
        }
      }
    }
  });

  it('no todos miden lo mismo: el elefante sobresale del lienzo de un caballo', () => {
    /** Alto del dibujo (filas con algún pixel visible). */
    const drawnHeight = (kind: 'elephant' | 'horse-chestnut' | 'rabbit' | 'grizzly'): number => {
      const image = drawCreatureFrame(kind, Direction.East, 'idle');
      let top = image.height;
      let bottom = 0;
      for (let y = 0; y < image.height; y++)
        for (let x = 0; x < image.width; x++)
          if ((image.data[(y * image.width + x) * 4 + 3] ?? 0) > 0) {
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
          }
      return bottom - top;
    };
    const horse = drawnHeight('horse-chestnut');
    expect(drawnHeight('elephant')).toBeGreaterThan(horse * 1.4);
    expect(drawnHeight('grizzly')).toBeLessThan(horse);
    expect(drawnHeight('rabbit')).toBeLessThan(drawnHeight('grizzly'));
    expect(creatureLayout('elephant').width).toBeGreaterThan(
      creatureLayout('horse-chestnut').width,
    );
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

  it('la horca y la hoz quedan completas durante los ataques en ocho direcciones', () => {
    for (const [kind, width] of [
      ['pitchfork', 104],
      ['sickle', 72],
    ] as const) {
      for (const direction of ALL_DIRECTIONS) {
        for (const frame of [
          'idle',
          'guard',
          'thrust-0',
          'thrust-1',
          'thrust-2',
          'thrust-3',
          'slash-0',
          'slash-1',
          'slash-2',
          'slash-3',
        ] as const) {
          const image = drawCharacterFrame(DEFAULT_APPEARANCE, direction, frame, {
            rightHand: kind,
          });
          expect(image.width).toBe(width);
          expect(image.height).toBe(kind === 'sickle' ? SICKLE_ART_HEIGHT : CHARACTER_ART_HEIGHT);
          if (kind === 'sickle' || frame.startsWith('thrust')) {
            for (let x = 0; x < image.width; x++) expect(image.alphaAt(x, 0)).toBe(0);
          }
          for (let y = 0; y < image.height; y++) {
            expect(image.alphaAt(0, y)).toBe(0);
            expect(image.alphaAt(image.width - 1, y)).toBe(0);
          }
        }
      }
    }
    expect(SICKLE_ART_HEIGHT - CHARACTER_ART_HEIGHT).toBe(SICKLE_TOP_MARGIN);
    expect(SICKLE_FEET_Y - CHARACTER_FEET_Y).toBe(SICKLE_TOP_MARGIN);
    expect(drawCharacterFrame(DEFAULT_APPEARANCE, Direction.SouthEast, 'idle').width).toBe(
      CHARACTER_ART_WIDTH,
    );
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
