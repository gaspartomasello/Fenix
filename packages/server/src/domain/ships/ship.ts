import {
  SHIPS,
  directionOffset,
  shipLevel,
  shipTiles,
  type EntityId,
  type Position,
  type RelativeHeading,
  type ShipFacing,
  type ShipKind,
  type ShipLevel,
  type ShipSecurity,
  type ShipSide,
  type ShipSnapshot,
  type ShipVisitor,
} from '@fenix/shared';

/** Lo que guarda la maqueta de un barco amarrado (y vuelve al botarlo). */
export interface ShipRecord {
  readonly id: EntityId;
  readonly kind: ShipKind;
  readonly name: string;
  readonly hits: number;
  readonly security: ShipSecurity;
}

/** Cómo navega en este momento. */
export interface Course {
  readonly heading: RelativeHeading;
  readonly speed: 'fast' | 'slow' | 'one';
  nextAt: number;
}

/** Un barco en el agua. */
export class Ship {
  course: Course | null = null;
  /** Cuándo vuelve a estar cargada cada banda. */
  readonly loadedAt: Record<ShipSide, number> = { port: 0, starboard: 0 };
  /** La bodega: un recipiente fijo sobre la cubierta. */
  holdId: EntityId | null = null;

  constructor(
    readonly id: EntityId,
    readonly kind: ShipKind,
    public center: Position,
    public facing: ShipFacing,
    public name: string,
    readonly owner: string,
    public hits: number,
    public security: ShipSecurity,
  ) {}

  get definition() {
    return SHIPS[this.kind];
  }

  tiles(): Position[] {
    return shipTiles(this.kind, this.center, this.facing);
  }

  occupies(position: Position): boolean {
    return this.tiles().some((t) => t.x === position.x && t.y === position.y);
  }

  /** Dónde va la bodega: en la popa, sobre la línea del centro. */
  sternTile(): Position {
    const along = directionOffset(this.facing);
    const half = (this.definition.length - 1) / 2;
    return { x: this.center.x - along.x * half, y: this.center.y - along.y * half };
  }

  levelOf(who: ShipVisitor): ShipLevel {
    return shipLevel(this.security, this.owner, who);
  }

  record(): ShipRecord {
    return {
      id: this.id,
      kind: this.kind,
      name: this.name,
      hits: this.hits,
      security: this.security,
    };
  }

  snapshot(): ShipSnapshot {
    return {
      id: this.id,
      kind: this.kind,
      x: this.center.x,
      y: this.center.y,
      facing: this.facing,
      name: this.name,
      owner: this.owner,
      hits: this.hits,
      maxHits: this.definition.maxHits,
    };
  }
}
