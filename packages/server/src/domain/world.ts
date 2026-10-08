import {
  DEFAULT_APPEARANCE,
  Direction,
  inViewRange,
  type EntityId,
  type MobileSnapshot,
  type Position,
  type TileMap,
} from '@fenix/shared';
import type { Creature } from './creatures/creature';
import { Items } from './items/items';
import type { Mobile } from './mobile';
import { Player, type PlayerProps } from './player';

export const MAX_PLAYERS = 100;

/** Agregado raíz del mundo: el mapa, los jugadores conectados y los objetos. */
export class World {
  private readonly players = new Map<EntityId, Player>();
  private readonly creatures = new Map<EntityId, Creature>();
  readonly items = new Items();

  constructor(
    readonly map: TileMap,
    private readonly spawnPoint: Position,
  ) {
    if (!map.isWalkable(spawnPoint)) {
      throw new Error('El punto de aparición debe ser transitable');
    }
  }

  get playerCount(): number {
    return this.players.size;
  }

  isFull(): boolean {
    return this.players.size >= MAX_PLAYERS;
  }

  isNameTaken(name: string): boolean {
    const lower = name.toLocaleLowerCase();
    return [...this.players.values()].some((p) => p.name.toLocaleLowerCase() === lower);
  }

  spawn(props: Omit<PlayerProps, 'position' | 'direction'>, random: () => number): Player {
    const player = new Player({
      ...props,
      position: this.findSpawnPosition(random),
      direction: Direction.South,
    });
    this.players.set(player.id, player);
    return player;
  }

  /** Saca al jugador del mundo junto con lo que lleva (todavía no hay persistencia). */
  remove(id: EntityId): Player | undefined {
    const player = this.players.get(id);
    this.players.delete(id);
    this.items.removeOwnedBy(id);
    return player;
  }

  addCreature(creature: Creature): void {
    this.creatures.set(creature.id, creature);
  }

  allCreatures(): readonly Creature[] {
    return [...this.creatures.values()];
  }

  /** Un jugador o una criatura presente en el mundo. */
  getMobile(id: EntityId): Mobile | undefined {
    const creature = this.creatures.get(id);
    if (creature) return creature.gone ? undefined : creature;
    return this.players.get(id);
  }

  /** Jugadores y criaturas (presentes) que ven la posición dada. */
  mobilesNear(position: Position, options: { except?: EntityId } = {}): Mobile[] {
    const creatures = [...this.creatures.values()].filter((c) => !c.gone);
    return [...this.players.values(), ...creatures].filter(
      (m) => m.id !== options.except && inViewRange(m.position, position),
    );
  }

  /** ¿Hay alguien vivo parado en ese tile? Las criaturas no se pisan entre sí ni a los jugadores. */
  isOccupied(position: Position, except?: EntityId): boolean {
    return this.mobilesNear(position, except === undefined ? {} : { except }).some(
      (m) => !m.combat.isDead && m.position.x === position.x && m.position.y === position.y,
    );
  }

  /** Lo que ven los demás de un jugador o criatura, incluido lo que tiene puesto. */
  snapshotOf(mobile: Mobile): MobileSnapshot {
    if (mobile instanceof Player) {
      return { ...mobile.toSnapshot(), equipment: this.items.lookOf(mobile.id) };
    }
    return {
      id: mobile.id,
      name: mobile.name,
      position: mobile.position,
      direction: mobile.direction,
      appearance: DEFAULT_APPEARANCE,
      equipment: {},
      body: mobile.body,
      health: mobile.combat.health,
      dead: mobile.combat.isDead,
    };
  }

  get(id: EntityId): Player | undefined {
    return this.players.get(id);
  }

  allPlayers(): readonly Player[] {
    return [...this.players.values()];
  }

  /** Jugadores que ven la posición dada (rango de visión de UO). */
  playersNear(position: Position, options: { except?: EntityId } = {}): Player[] {
    return [...this.players.values()].filter(
      (p) => p.id !== options.except && inViewRange(p.position, position),
    );
  }

  /** Un tile transitable cercano al punto de aparición, para no apilar a todos. */
  private findSpawnPosition(random: () => number): Position {
    const radius = 3;
    for (let attempt = 0; attempt < 20; attempt++) {
      const candidate = {
        x: this.spawnPoint.x + Math.floor(random() * (radius * 2 + 1)) - radius,
        y: this.spawnPoint.y + Math.floor(random() * (radius * 2 + 1)) - radius,
      };
      if (this.map.isWalkable(candidate)) return candidate;
    }
    return this.spawnPoint;
  }
}
