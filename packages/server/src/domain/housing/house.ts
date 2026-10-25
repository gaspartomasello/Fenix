import type { Position } from '@fenix/shared/geometry/position';
import {
  HOUSE_PLANS,
  houseLevel,
  type HouseKind,
  type HouseLevel,
  type HouseSecurity,
} from '@fenix/shared/housing/houses';
import { emptyDesign, type HouseDesign } from '@fenix/shared/housing/design';
import { insideHouse, type HouseSite } from '@fenix/shared/housing/structure';
import type { EntityId, HouseSnapshot } from '@fenix/shared/protocol/messages';

/** Una casa levantada en el mundo, con su dueño y sus permisos. */
export class House {
  /** Los cofres de la casa: objetos fijos en el piso de adentro. */
  chestIds: EntityId[] = [];
  /** El diseño de una casa a medida (null: una casa hecha). */
  design: HouseDesign | null;

  constructor(
    readonly id: EntityId,
    readonly kind: HouseKind,
    /** La esquina de arriba a la izquierda. */
    readonly origin: Position,
    /** Dónde están sus pisos altos y su techo (en el lugar apartado del mapa). */
    readonly slots: readonly Position[],
    public name: string,
    readonly owner: string,
    public security: HouseSecurity,
    design?: HouseDesign | null,
  ) {
    this.design = HOUSE_PLANS[kind].lot ? (design ?? emptyDesign(kind)) : null;
  }

  get plan() {
    return HOUSE_PLANS[this.kind];
  }

  /** Lo que el servidor y el cliente necesitan para armarla en el mapa. */
  site(): HouseSite {
    return {
      id: this.id,
      kind: this.kind,
      x: this.origin.x,
      y: this.origin.y,
      slots: this.slots,
      name: this.name,
      ...(this.design ? { design: this.design } : {}),
    };
  }

  levelOf(name: string): HouseLevel {
    return houseLevel(this.owner, this.security, name);
  }

  /** ¿La posición está adentro (en la planta baja o en un piso alto)? */
  contains(position: Position): boolean {
    return insideHouse(this.site(), position);
  }

  snapshot(openDoors: readonly Position[]): HouseSnapshot {
    return {
      id: this.id,
      kind: this.kind,
      x: this.origin.x,
      y: this.origin.y,
      slots: this.slots,
      name: this.name,
      owner: this.owner,
      public: this.security.public,
      ...(openDoors.length > 0 ? { openDoors } : {}),
      ...(this.design ? { design: this.design } : {}),
    };
  }
}
