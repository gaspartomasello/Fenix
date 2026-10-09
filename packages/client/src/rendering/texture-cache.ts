import {
  drawCharacterFrame,
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
import {
  EQUIPMENT_SLOTS,
  type Appearance,
  type CreatureKind,
  type Direction,
  type EquipmentLook,
  type ItemKind,
  type MountKind,
  type NpcRole,
  type StaticKind,
  type Terrain,
} from '@fenix/shared';
import { Texture } from 'pixi.js';
import { toCanvas } from '../platform/canvas';

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
  /** Cuadros pedidos de antemano, que se dibujan de a poco entre un cuadro y otro. */
  private readonly upcoming = new Map<string, Entry>();

  terrain(terrain: Terrain, variant: number, neighbors: TerrainNeighbors): Texture {
    const v = variant % TERRAIN_VARIANTS;
    const { north, east, south, west } = neighbors;
    return this.getOrCreate(`t:${terrain}:${v}:${north}:${east}:${south}:${west}`, () =>
      drawTerrainTile(terrain, v, neighbors),
    );
  }

  static(kind: StaticKind, variant: number): Texture {
    const v = variant % STATIC_VARIANTS;
    return this.getOrCreate(`s:${kind}:${v}`, () => drawStatic(kind, v));
  }

  /**
   * Personas, criaturas y monturas se dibujan al doble de detalle (ver
   * `ART_DETAIL`) y se achican al mostrarlas: filtro suave, no pixelado.
   */
  character(
    appearance: Appearance,
    direction: Direction,
    frame: CharacterFrame,
    equipment: EquipmentLook,
    role: NpcRole | null = null,
    mount: MountKind | null = null,
  ): Texture {
    return this.fromEntry(
      this.characterEntry(appearance, direction, frame, equipment, role, mount),
    );
  }

  creature(kind: CreatureKind, direction: Direction, frame: CharacterFrame): Texture {
    return this.fromEntry(this.creatureEntry(kind, direction, frame));
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
  ): void {
    for (const frame of frames)
      this.prepare(this.characterEntry(appearance, direction, frame, equipment, role, mount));
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

  private prepare(entry: Entry): void {
    if (!this.textures.has(entry.key) && !this.upcoming.has(entry.key))
      this.upcoming.set(entry.key, entry);
  }

  private fromEntry(entry: Entry): Texture {
    this.upcoming.delete(entry.key);
    return this.getOrCreate(entry.key, entry.draw, 'linear');
  }

  private characterEntry(
    appearance: Appearance,
    direction: Direction,
    frame: CharacterFrame,
    equipment: EquipmentLook,
    role: NpcRole | null,
    mount: MountKind | null,
  ): Entry {
    const worn = EQUIPMENT_SLOTS.map((slot) => equipment[slot] ?? '').join(',');
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
      draw: () => drawCharacterFrame(appearance, direction, frame, equipment, role, mount),
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
  }

  private getOrCreate(
    key: string,
    draw: () => PixelImage,
    scaleMode: 'nearest' | 'linear' = 'nearest',
  ): Texture {
    let texture = this.textures.get(key);
    if (!texture) {
      texture = Texture.from(toCanvas(draw()));
      texture.source.scaleMode = scaleMode;
      this.textures.set(key, texture);
    }
    return texture;
  }
}
