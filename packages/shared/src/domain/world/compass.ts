import type { Position } from '../geometry/position';
import type { RegionData } from './tile-map';

const COMPASS = [
  'el este',
  'el sureste',
  'el sur',
  'el suroeste',
  'el oeste',
  'el noroeste',
  'el norte',
  'el noreste',
] as const;

export function regionCenter(region: RegionData): Position {
  return { x: region.x + region.width / 2, y: region.y + region.height / 2 };
}

/**
 * "Roca Alta queda hacia el noreste, a un buen trecho." Con `of`, desde un
 * pueblo: "La Granja Quemada queda hacia el sur de Roca Alta, cerca."
 */
export function directions(
  from: Position,
  place: { name: string; center: Position },
  of?: string,
): string {
  const dx = place.center.x - from.x;
  const dy = place.center.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 12)
    return of
      ? `${place.name} queda pegado a ${of}.`
      : `${place.name}? Estás ahí nomás, mirá alrededor.`;
  const index = (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8;
  const far =
    distance < 60 ? 'cerca de acá' : distance < 200 ? 'a un buen trecho' : 'lejos, muy lejos';
  return of
    ? `${place.name} queda hacia ${COMPASS[index]} de ${of}, ${distance < 60 ? 'cerca' : distance < 200 ? 'a un buen trecho' : 'lejos'}.`
    : `${place.name} queda hacia ${COMPASS[index]}, ${far}.`;
}
