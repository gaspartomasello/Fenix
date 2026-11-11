import {
  drawCharacterFrame,
  drawCreatureCorpse,
  drawPlayerCorpse,
  drawCreatureFrame,
  drawItem,
  itemVariant,
  drawStatic,
  drawTerrainTile,
  STATIC_VARIANTS,
  TERRAIN_VARIANTS,
  type CharacterFrame,
  type PixelImage,
  type TerrainNeighbors,
} from '@fenix/art';
import type { Appearance } from '@fenix/shared/character/appearance';
import type { CreatureKind } from '@fenix/shared/creatures/creature-catalog';
import type { NpcRole } from '@fenix/shared/economy/vendors';
import type { Direction } from '@fenix/shared/geometry/direction';
import { EQUIPMENT_SLOTS } from '@fenix/shared/items/equipment';
import type { ItemKind } from '@fenix/shared/items/item-catalog';
import type { MountKind } from '@fenix/shared/mounts/mount-catalog';
import type { CorpseLook, EquipmentHues, EquipmentLook } from '@fenix/shared/protocol/messages';
import type { StaticKind } from '@fenix/shared/world/statics';
import type { Terrain } from '@fenix/shared/world/terrain';
import { Texture } from 'pixi.js';
import { toCanvas } from '../platform/canvas';
import rawFishSprite from '../assets/raw-fish-72.png?inline';

/**
 * Convierte el arte generado en texturas de Pixi y las reutiliza.
 * Es el único punto donde `@fenix/art` y Pixi se encuentran.
 */
/** Un cuadro por dibujar: su clave en la caché y cómo dibujarlo. */
interface Entry {
  readonly key: string;
  readonly draw: () => PixelImage;
}

export class TextureCache {
  private readonly textures = new Map<string, Texture>();
  /** Cuándo se pidió por última vez cada textura (para soltar las que nadie usa). */
  private readonly lastUsed = new Map<string, number>();
  /** Cuadros pedidos de antemano, que se dibujan de a poco entre un cuadro y otro. */
  private readonly upcoming = new Map<string, Entry>();

  /** Se llama con cada textura nueva (para subirla a la placa de video en el momento). */
  onCreate: ((texture: Texture) => void) | null = null;

  /** Carga una sola vez el mismo PNG que usa la mochila para los pescados del suelo. */
  async prepareRawFish(): Promise<void> {
    const image = new Image();
    image.src = rawFishSprite;
    try {
      await image.decode();
    } catch {
      // Si el navegador no puede decodificarlo, queda el dibujo procedural.
      return;
    }
    const texture = Texture.from(image);
    texture.source.scaleMode = 'linear';
    this.textures.set('i:raw-fish:0', texture);
    this.onCreate?.(texture);
  }

  terrain(terrain: Terrain, variant: number, neighbors: TerrainNeighbors): Texture {
    return this.fromEntry(this.terrainEntry(terrain, variant, neighbors));
  }

  static(kind: StaticKind, variant: number): Texture {
    return this.fromEntry(this.staticEntry(kind, variant));
  }

  /** Pide de antemano la textura de un tile; devuelve si ya está dibujada. */
  prepareTerrain(terrain: Terrain, variant: number, neighbors: TerrainNeighbors): boolean {
    return this.prepare(this.terrainEntry(terrain, variant, neighbors));
  }

  /** Pide de antemano la textura de un objeto fijo; devuelve si ya está dibujada. */
  prepareStatic(kind: StaticKind, variant: number): boolean {
    return this.prepare(this.staticEntry(kind, variant));
  }

  private terrainEntry(terrain: Terrain, variant: number, neighbors: TerrainNeighbors): Entry {
    const v = variant % TERRAIN_VARIANTS;
    const { north, east, south, west } = neighbors;
    return {
      key: `t:${terrain}:${v}:${north}:${east}:${south}:${west}`,
      draw: () => drawTerrainTile(terrain, v, neighbors),
    };
  }

  private staticEntry(kind: StaticKind, variant: number): Entry {
    const v = variant % STATIC_VARIANTS;
    return { key: `s:${kind}:${v}`, draw: () => drawStatic(kind, v) };
  }

  character(
    appearance: Appearance,
    direction: Direction,
    frame: CharacterFrame,
    equipment: EquipmentLook,
    role: NpcRole | null = null,
    mount: MountKind | null = null,
    hues: EquipmentHues = {},
  ): Texture {
    return this.fromEntry(
      this.characterEntry(appearance, direction, frame, equipment, role, mount, hues),
    );
  }

  /**
   * El cuadro de una persona si ya está dibujado; si no, lo pide (se dibuja
   * entre cuadro y cuadro) y devuelve null. Así una persona que gira o
   * cambia de paso no frena el cuadro: sigue un instante con el que tenía.
   */
  characterIfReady(
    appearance: Appearance,
    direction: Direction,
    frame: CharacterFrame,
    equipment: EquipmentLook,
    role: NpcRole | null = null,
    mount: MountKind | null = null,
    hues: EquipmentHues = {},
  ): Texture | null {
    return this.ready(
      this.characterEntry(appearance, direction, frame, equipment, role, mount, hues),
    );
  }

  /** Lo mismo para una criatura. */
  creatureIfReady(kind: CreatureKind, direction: Direction, frame: CharacterFrame): Texture | null {
    return this.ready(this.creatureEntry(kind, direction, frame));
  }

  private ready(entry: Entry): Texture | null {
    const texture = this.textures.get(entry.key);
    if (texture) {
      this.lastUsed.set(entry.key, performance.now());
      return texture;
    }
    this.prepare(entry);
    return null;
  }

  creature(kind: CreatureKind, direction: Direction, frame: CharacterFrame): Texture {
    return this.fromEntry(this.creatureEntry(kind, direction, frame));
  }

  /** El cuerpo de una criatura tirado en el piso (`fallen` < 1: cayendo). */
  corpse(kind: CreatureKind, direction: Direction, fallen: number): Texture {
    return this.getOrCreate(`k:${kind}:${direction}:${fallen}`, () =>
      drawCreatureCorpse(kind, direction, fallen),
    );
  }

  /** El cuerpo de un jugador: tirado, con su cara y lo que todavía tiene puesto. */
  playerCorpse(look: CorpseLook): Texture {
    const key = `pc:${JSON.stringify(look)}`;
    return this.getOrCreate(key, () =>
      drawPlayerCorpse(look.appearance, look.direction, look.equipment, look.hues),
    );
  }

  /**
   * Pide de antemano cuadros de una persona (el ciclo de caminar hacia donde
   * mira, por ejemplo), para que al moverse ya estén dibujados.
   */
  prepareCharacter(
    appearance: Appearance,
    direction: Direction,
    frames: readonly CharacterFrame[],
    equipment: EquipmentLook,
    role: NpcRole | null,
    mount: MountKind | null,
    hues: EquipmentHues = {},
  ): void {
    for (const frame of frames)
      this.prepare(this.characterEntry(appearance, direction, frame, equipment, role, mount, hues));
  }

  /** Pide de antemano cuadros de una criatura. */
  prepareCreature(
    kind: CreatureKind,
    direction: Direction,
    frames: readonly CharacterFrame[],
  ): void {
    for (const frame of frames) this.prepare(this.creatureEntry(kind, direction, frame));
  }

  /** Dibuja cuadros pedidos de antemano hasta gastar `budgetMs` (una vez por cuadro de pantalla). */
  pump(budgetMs: number): void {
    const until = performance.now() + budgetMs;
    for (const [key, entry] of this.upcoming) {
      this.upcoming.delete(key);
      this.fromEntry(entry);
      if (performance.now() >= until) return;
    }
  }

  private prepare(entry: Entry): boolean {
    if (this.textures.has(entry.key)) return true;
    if (!this.upcoming.has(entry.key)) this.upcoming.set(entry.key, entry);
    return false;
  }

  private fromEntry(entry: Entry): Texture {
    this.upcoming.delete(entry.key);
    return this.getOrCreate(entry.key, entry.draw);
  }

  private characterEntry(
    appearance: Appearance,
    direction: Direction,
    frame: CharacterFrame,
    equipment: EquipmentLook,
    role: NpcRole | null,
    mount: MountKind | null,
    hues: EquipmentHues = {},
  ): Entry {
    const worn = EQUIPMENT_SLOTS.map(
      (slot) => `${equipment[slot] ?? ''}${hues[slot] !== undefined ? `#${hues[slot]}` : ''}`,
    ).join(',');
    const look = [
      appearance.gender ?? '',
      appearance.clothHue,
      appearance.skinTone,
      appearance.hairHue,
      appearance.hairStyle ?? '',
      appearance.facialHair ?? '',
      role ?? '',
    ].join(':');
    return {
      key: `c:${look}:${direction}:${frame}:${worn}:${mount ?? ''}`,
      draw: () =>
        drawCharacterFrame(appearance, direction, frame, equipment, role, mount, undefined, hues),
    };
  }

  private creatureEntry(kind: CreatureKind, direction: Direction, frame: CharacterFrame): Entry {
    return {
      key: `m:${kind}:${direction}:${frame}`,
      draw: () => drawCreatureFrame(kind, direction, frame),
    };
  }

  item(kind: ItemKind, amount = 1): Texture {
    return this.getOrCreate(`i:${kind}:${itemVariant(kind, amount)}`, () =>
      drawItem(kind, 'ground', amount),
    );
  }

  /** Textura arbitraria generada una sola vez (por ejemplo, el halo de luz). */
  custom(key: string, draw: () => PixelImage): Texture {
    return this.getOrCreate(`x:${key}`, draw, 'linear');
  }

  destroy(): void {
    this.textures.forEach((texture) => texture.destroy(true));
    this.textures.clear();
    this.lastUsed.clear();
  }

  /**
   * Suelta las texturas que no se pidieron en `idleMs` y que nada en pantalla
   * usa (`inUse`): su imagen en memoria y su copia en la placa de video. Se
   * vuelven a dibujar si hacen falta. Sin esto, recorrer el mundo junta miles
   * (cada tile del terreno según sus vecinos, cada cuadro de cada persona) y el
   * iPhone, que da poca memoria a las páginas, cierra el juego.
   */
  sweep(inUse: ReadonlySet<Texture>, now: number, idleMs: number): number {
    let freed = 0;
    for (const [key, texture] of this.textures) {
      if (inUse.has(texture) || now - (this.lastUsed.get(key) ?? 0) < idleMs) continue;
      // Lo que no se dibuja (el pescado de archivo, el halo de luz) se queda.
      if (key.startsWith('x:') || key === 'i:raw-fish:0') continue;
      this.textures.delete(key);
      this.lastUsed.delete(key);
      texture.destroy(true);
      freed++;
    }
    return freed;
  }

  private getOrCreate(
    key: string,
    draw: () => PixelImage,
    scaleMode: 'nearest' | 'linear' = 'nearest',
  ): Texture {
    this.lastUsed.set(key, performance.now());
    let texture = this.textures.get(key);
    if (!texture) {
      texture = Texture.from(toCanvas(draw()));
      texture.source.scaleMode = scaleMode;
      this.textures.set(key, texture);
      this.onCreate?.(texture);
    }
    return texture;
  }
}
