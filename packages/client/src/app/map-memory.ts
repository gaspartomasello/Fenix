import type { TileMap } from '@fenix/shared/world/tile-map';
import type { ClientGame } from '../core/client-game';
import {
  DEFAULT_MAP_LABELS,
  discover,
  mapLabels,
  visibleLabels,
  type MapLabel,
  type MapLabelFlags,
} from '../core/map-labels';

/** Cada cuánto se mira si se descubrió algo nuevo. */
const CHECK_MS = 1000;

/**
 * Lo que cada personaje descubrió del mapa (guardado en el navegador, por
 * nombre) y qué categorías de nombres quiere ver. Los mapas preguntan acá
 * qué nombres dibujar.
 */
export class MapMemory {
  private shown: MapLabelFlags = DEFAULT_MAP_LABELS;
  private known = new Set<string>();
  private owner: string | null = null;
  private labels: { map: TileMap; list: MapLabel[] } | null = null;
  private readonly timer: number;

  constructor(
    private readonly game: ClientGame,
    private readonly read: (key: string) => string | null,
    private readonly write: (key: string, value: string) => void,
  ) {
    this.timer = window.setInterval(() => this.update(), CHECK_MS);
  }

  destroy(): void {
    window.clearInterval(this.timer);
  }

  setShown(shown: MapLabelFlags): void {
    this.shown = shown;
  }

  /** Los nombres a dibujar en este mapa. */
  visible(map: TileMap): MapLabel[] {
    return visibleLabels(this.all(map), this.known, this.shown);
  }

  private all(map: TileMap): MapLabel[] {
    if (this.labels?.map !== map) this.labels = { map, list: mapLabels(map) };
    return this.labels.list;
  }

  /** Mira si el personaje pasó cerca de algo que no conocía. */
  private update(): void {
    const map = this.game.map;
    const self = this.game.self;
    if (!map || !self) return;
    if (this.owner !== self.name) this.load(self.name);
    const found = discover(this.all(map), this.known, self.position);
    if (found.length === 0) return;
    for (const name of found) this.known.add(name);
    this.write(this.key(self.name), JSON.stringify([...this.known]));
  }

  private load(name: string): void {
    this.owner = name;
    this.known = new Set();
    try {
      const saved: unknown = JSON.parse(this.read(this.key(name)) ?? '[]');
      if (Array.isArray(saved)) for (const n of saved) if (typeof n === 'string') this.known.add(n);
    } catch {
      // Guardado roto: se empieza de nuevo.
    }
  }

  private key(name: string): string {
    return `fenix.mapa.descubierto.${name.toLowerCase()}`;
  }
}
