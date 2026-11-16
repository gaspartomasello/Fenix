import type { Position } from '@fenix/shared/geometry/position';
import type { TileMap } from '@fenix/shared/world/tile-map';

/**
 * Los nombres del mapa (del mundo y chico), por categoría, y los que ya se
 * descubrieron. Las ciudades se conocen desde el principio; los demás
 * nombres aparecen recién al pasar cerca (o entrar): así el mapa se va
 * llenando a medida que se recorre, y no está lleno de textos desde el
 * comienzo. Cada categoría se muestra o se oculta desde Opciones.
 */
export type MapLabelKind = 'town' | 'dungeon' | 'crossroad' | 'place';

export const MAP_LABEL_KINDS: readonly { key: MapLabelKind; label: string }[] = [
  { key: 'town', label: 'Ciudades' },
  { key: 'dungeon', label: 'Mazmorras' },
  { key: 'crossroad', label: 'Encrucijadas' },
  { key: 'place', label: 'Lugares (campamentos, ruinas, granjas…)' },
];

export type MapLabelFlags = Readonly<Record<MapLabelKind, boolean>>;

/** Para empezar: todo menos las encrucijadas (son muchas). */
export const DEFAULT_MAP_LABELS: MapLabelFlags = {
  town: true,
  dungeon: true,
  crossroad: false,
  place: true,
};

export interface MapLabel {
  readonly name: string;
  readonly kind: MapLabelKind;
  /** Ciudad sin guardias (se pinta de otro color). */
  readonly unsafe?: boolean;
  /** Dónde va el nombre (el centro de la zona, o la boca de la mazmorra). */
  readonly at: Position;
  /** La zona (para saber si se pasó cerca); las mazmorras, solo su boca. */
  readonly area: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

/** A cuántos tiles de un lugar se lo descubre. */
export const DISCOVER_RANGE = 14;

const CROSSROAD = /^(Cruce|Encrucijada) /;

/** Todos los nombres del mapa, con su categoría (de la superficie: no los de adentro de las mazmorras). */
export function mapLabels(map: TileMap): MapLabel[] {
  const labels: MapLabel[] = [];
  for (const r of map.regions) {
    if (r.dungeon || r.floor) continue;
    const kind: MapLabelKind =
      !r.wild || r.town ? 'town' : CROSSROAD.test(r.name) ? 'crossroad' : 'place';
    labels.push({
      name: r.name,
      kind,
      ...(r.wild && r.town ? { unsafe: true } : {}),
      at: { x: r.x + r.width / 2, y: r.y + r.height / 2 },
      area: { x: r.x, y: r.y, width: r.width, height: r.height },
    });
  }
  // Las bocas de las mazmorras: los portales de la superficie que llevan adentro de una.
  const seen = new Set<string>();
  for (const t of map.teleporters) {
    const from = map.regionAt({ x: t.x, y: t.y });
    const to = map.regionAt(t.to);
    if (from?.dungeon || !to?.dungeon || seen.has(to.name)) continue;
    seen.add(to.name);
    labels.push({
      name: to.name,
      kind: 'dungeon',
      at: { x: t.x, y: t.y },
      area: { x: t.x, y: t.y, width: 1, height: 1 },
    });
  }
  return labels;
}

/** ¿Está a menos de `range` tiles de la zona (o adentro)? */
export function near(p: Position, area: MapLabel['area'], range = DISCOVER_RANGE): boolean {
  const dx = Math.max(area.x - p.x, 0, p.x - (area.x + area.width - 1));
  const dy = Math.max(area.y - p.y, 0, p.y - (area.y + area.height - 1));
  return Math.max(dx, dy) <= range;
}

/**
 * Lo descubierto por un personaje: los nombres que ya vio. Devuelve los
 * nuevos al pasar por `at` (las ciudades no hace falta descubrirlas).
 */
export function discover(
  labels: readonly MapLabel[],
  known: ReadonlySet<string>,
  at: Position,
): string[] {
  return labels
    .filter((l) => l.kind !== 'town' && !known.has(l.name) && near(at, l.area))
    .map((l) => l.name);
}

/** Lo que se dibuja: las categorías elegidas, y de esas, lo descubierto (las ciudades, siempre). */
export function visibleLabels(
  labels: readonly MapLabel[],
  known: ReadonlySet<string>,
  shown: MapLabelFlags,
): MapLabel[] {
  return labels.filter((l) => shown[l.kind] && (l.kind === 'town' || known.has(l.name)));
}
