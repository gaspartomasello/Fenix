import { Direction, type EntityId, type Position, type TileMap } from '@fenix/shared';
import { Player, type PlayerProps } from './player';

export const MAX_PLAYERS = 100;

/** Agregado raíz del mundo: el mapa y los jugadores conectados. */
export class World {
  private readonly players = new Map<EntityId, Player>();

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

  remove(id: EntityId): Player | undefined {
    const player = this.players.get(id);
    this.players.delete(id);
    return player;
  }

  get(id: EntityId): Player | undefined {
    return this.players.get(id);
  }

  allPlayers(): readonly Player[] {
    return [...this.players.values()];
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
