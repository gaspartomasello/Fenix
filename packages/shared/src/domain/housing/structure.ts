import type { Position } from '../geometry/position';
import { Terrain } from '../world/terrain';
import type {
  MapStructure,
  RegionData,
  TerrainPatch,
  Teleporter,
  TileMap,
} from '../world/tile-map';
import { customLayout, designFloorAt, type HouseDesign } from './design';
import { HOUSE_PLANS, type HouseKind } from './houses';
import { FLOOR_MARGIN, houseLayout, levelName, type HouseLayout } from './layout';

/**
 * Una casa levantada, tal como la conocen el servidor y el cliente: con esto
 * los dos arman lo mismo en el mapa (paredes, pisos, techos, escaleras).
 */
export interface HouseSite {
  readonly id: string;
  readonly kind: HouseKind;
  /** La esquina de arriba a la izquierda de la casa. */
  readonly x: number;
  readonly y: number;
  /** Dónde va cada piso alto (y el techo) en el lugar apartado del mapa. */
  readonly slots: readonly Position[];
  readonly name: string;
  /** El diseño de una casa a medida (en un lote). */
  readonly design?: HouseDesign;
}

/** El plano de la casa levantada: el de su clase o, en un lote, el de su diseño. */
export function siteLayout(site: Pick<HouseSite, 'kind' | 'design'>): HouseLayout {
  return site.design && HOUSE_PLANS[site.kind].lot
    ? customLayout(site.kind, site.design)
    : houseLayout(site.kind);
}

/**
 * Cuántos lugares apartados necesita: uno por piso alto y uno para el techo.
 * Un lote los reserva todos desde el principio (así se puede seguir subiendo).
 */
export function slotsNeeded(kind: HouseKind): number {
  const plan = HOUSE_PLANS[kind];
  return plan.lot ? plan.floors + 1 : houseLayout(kind).levels.length;
}

/** Lado de cada lugar apartado para los pisos altos (entra el piso más grande y su roca). */
export const HOUSE_SLOT = 24;

/** La esquina de la casa si se la centra en un tile (así se elige dónde levantarla). */
export function houseOrigin(kind: HouseKind, center: Position): Position {
  const layout = houseLayout(kind);
  return {
    x: center.x - Math.floor(layout.width / 2),
    y: center.y - Math.floor(layout.height / 2),
  };
}

/**
 * Lo que reserva una casa en el suelo: lo que ocupa, una vuelta alrededor
 * para pasar y dos filas delante de la puerta. Ahí no se construye otra.
 */
export function houseReserve(
  kind: HouseKind,
  origin: Position,
): { x: number; y: number; width: number; height: number } {
  const layout = houseLayout(kind);
  return { x: origin.x - 1, y: origin.y - 1, width: layout.width + 2, height: layout.height + 3 };
}

const at = (site: Position, p: Position): Position => ({ x: site.x + p.x, y: site.y + p.y });

/** Todas las puertas de la casa, en el mapa. */
export function houseDoors(site: HouseSite): Position[] {
  const layout = siteLayout(site);
  return [...layout.allDoors.map((p) => at(site, p)), ...upper(site, layout, 'doors')];
}

/** Las puertas o los cofres de los pisos altos, en el mapa. */
function upper(site: HouseSite, layout: HouseLayout, what: 'doors' | 'chests'): Position[] {
  return layout.levels.flatMap((level, i) => {
    const slot = site.slots[i];
    return slot ? (level[what] ?? []).map((p) => at(slot, p)) : [];
  });
}

/** Dónde van los cofres de la casa, en el mapa. */
export function houseChests(site: HouseSite): Position[] {
  const layout = siteLayout(site);
  return [...layout.chests.map((p) => at(site, p)), ...upper(site, layout, 'chests')];
}

/** Delante de la puerta, afuera (adonde va quien es echado). */
export function houseFront(site: HouseSite): Position {
  return at(site, siteLayout(site).front);
}

/** El cartel con el nombre de la casa. */
export function houseSign(site: HouseSite): Position {
  return at(site, siteLayout(site).sign);
}

/** El piso de adentro de la planta baja, en el mapa (para ver si alguien está adentro). */
export function houseFootprint(site: HouseSite): {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
} {
  const layout = siteLayout(site);
  return { x0: site.x, y0: site.y, x1: site.x + layout.width - 1, y1: site.y + layout.height - 1 };
}

/** ¿La posición está dentro de la casa (en la planta baja o en un piso alto)? */
export function insideHouse(site: HouseSite, position: Position): boolean {
  const f = houseFootprint(site);
  if (position.x >= f.x0 && position.y >= f.y0 && position.x <= f.x1 && position.y <= f.y1)
    return true;
  const levels = siteLayout(site).levels;
  return site.slots.some((slot, i) => {
    const level = levels[i];
    return (
      level !== undefined &&
      position.x >= slot.x &&
      position.y >= slot.y &&
      position.x < slot.x + level.width &&
      position.y < slot.y + level.height
    );
  });
}

/**
 * ¿Está bajo techo, del lado de adentro? En una casa a medida, donde hay piso
 * (la planta baja o un piso alto); el patio sin piso es de afuera.
 */
export function indoorsAt(site: HouseSite, position: Position): boolean {
  if (!site.design || !HOUSE_PLANS[site.kind].lot) return insideHouse(site, position);
  const layout = siteLayout(site);
  const local = { x: position.x - site.x, y: position.y - site.y };
  if (local.x >= 0 && local.y >= 0 && local.x < layout.width && local.y < layout.height)
    return designFloorAt(site.kind, site.design, 0, local);
  return layout.levels.some((level, i) => {
    const slot = site.slots[i];
    if (!slot || level.roof) return false;
    const x = position.x - slot.x - (FLOOR_MARGIN - 1);
    const y = position.y - slot.y - (FLOOR_MARGIN - 1);
    return designFloorAt(site.kind, site.design as HouseDesign, level.level, { x, y });
  });
}

/** Arma la casa para el mapa: paredes, pisos, zonas (con sus pisos altos anclados) y escaleras. */
export function houseStructure(site: HouseSite): MapStructure {
  const layout = siteLayout(site);
  const floors = layout.levels.filter((level) => !level.roof).length;
  const statics = layout.statics.map((s) => ({ ...s, ...at(site, s) }));
  const terrain: TerrainPatch[] = layout.terrain.map((t) => ({ ...t, ...at(site, t) }));
  const regions: RegionData[] = [
    {
      name: site.name,
      x: site.x,
      y: site.y,
      width: layout.width,
      height: layout.height,
      wild: true,
    },
  ];
  const teleporters: Teleporter[] = [];
  const placed = layout.levels.flatMap((level, i) => {
    const slot = site.slots[i];
    return slot ? [{ level, slot }] : [];
  });
  // Sin lugar para los pisos (no debería pasar) la casa queda sin techo ni escalera.
  const complete = placed.length === layout.levels.length;
  for (const { level, slot } of complete ? placed : []) {
    for (const s of level.statics) statics.push({ ...s, ...at(slot, s) });
    level.terrain.forEach((t, i) => {
      if (t === Terrain.Rock) return;
      terrain.push({
        x: slot.x + (i % level.width),
        y: slot.y + Math.floor(i / level.width),
        terrain: t,
      });
    });
    regions.push({
      name: levelName(site.name, level, floors),
      x: slot.x,
      y: slot.y,
      width: level.width,
      height: level.height,
      floor: level.level,
      wild: true,
      // Se ve encima de la planta baja: el piso de adentro calza con el de abajo.
      anchor: {
        x: site.x + layout.interior.x0 - FLOOR_MARGIN - slot.x,
        y: site.y + layout.interior.y0 - FLOOR_MARGIN - slot.y,
      },
    });
  }
  const { stairs, stairsBack } = layout;
  if (complete && stairs && stairsBack) {
    // Subir por la escalera y bajar por el hueco, piso por piso.
    placed.forEach(({ level, slot }, k) => {
      if (!level.down || !level.arrival) return;
      const previous = placed[k - 1];
      const next = placed[k + 1];
      const back = previous?.level.upBack;
      const below = previous && back ? at(previous.slot, back) : at(site, stairsBack);
      teleporters.push({ ...at(slot, level.down), to: below });
      if (!previous) teleporters.push({ ...at(site, stairs), to: at(slot, level.arrival) });
      if (next?.level.arrival && level.up)
        teleporters.push({ ...at(slot, level.up), to: at(next.slot, next.level.arrival) });
    });
  }
  // El cartel con el nombre, afuera, al lado del camino a la puerta.
  statics.push({ kind: 'sign', ...houseSign(site) });
  return {
    id: site.id,
    statics,
    terrain,
    regions,
    teleporters,
    area: houseReserve(site.kind, site),
    covers: { x: site.x, y: site.y, width: layout.width, height: layout.height },
  };
}

/** Los terrenos donde se puede construir: tierra firme de campo, no caminos ni pisos de pueblo. */
const BUILDABLE: ReadonlySet<Terrain> = new Set<Terrain>([
  Terrain.Grass,
  Terrain.Dirt,
  Terrain.Sand,
  Terrain.Snow,
  Terrain.Tundra,
  Terrain.Jungle,
  Terrain.DryGrass,
  Terrain.Meadow,
  Terrain.Clay,
  Terrain.SnowyGrass,
  Terrain.SandyGrass,
  Terrain.Leaves,
  Terrain.SparseGrass,
  Terrain.Gravel,
  Terrain.Ash,
]);

/** Cuántos escalones de altura puede haber de diferencia debajo de una casa. */
export const MAX_HOUSE_SLOPE = 5;

/**
 * Por qué no se puede levantar esa casa ahí (null: se puede). Tiene que ser
 * tierra firme de campo, fuera de los pueblos y lugares con nombre, sin
 * árboles ni rocas debajo, sin pegarse a otra casa y sin mucha pendiente.
 */
export function placementProblem(map: TileMap, kind: HouseKind, origin: Position): string | null {
  const layout = houseLayout(kind);
  const reserve = houseReserve(kind, origin);
  let low = Infinity;
  let high = -Infinity;
  for (let y = reserve.y; y < reserve.y + reserve.height; y++)
    for (let x = reserve.x; x < reserve.x + reserve.width; x++) {
      const p = { x, y };
      if (!map.contains(p)) return 'Ahí no entra la casa.';
      const terrain = map.terrainAt(p);
      if (terrain === undefined || !BUILDABLE.has(terrain))
        return terrain === Terrain.Water || terrain === Terrain.ShallowWater
          ? 'No se puede construir sobre el agua.'
          : 'Ahí no se puede construir: hace falta tierra firme de campo (pasto, tierra o arena), lejos de los caminos.';
      if (map.regionAt(p)) return 'No se puede construir en un pueblo ni en un lugar con nombre.';
      if (map.structureAt(p)) return 'Queda pegada a otra casa.';
      if (map.teleportAt(p)) return 'Ahí no se puede construir.';
      const footprint =
        x >= origin.x &&
        y >= origin.y &&
        x < origin.x + layout.width &&
        y < origin.y + layout.height;
      // Debajo de la casa solo puede haber adornos del suelo (quedan tapados por el piso).
      if (footprint ? map.hasStaticAt(p, true) : map.hasBlockingStatic(p))
        return 'Hay árboles, rocas u otras cosas en el medio.';
      if (footprint) {
        const h = map.heightAt(p);
        low = Math.min(low, h);
        high = Math.max(high, h);
      }
    }
  if (high - low > MAX_HOUSE_SLOPE) return 'El terreno está muy desparejo para construir.';
  return null;
}
