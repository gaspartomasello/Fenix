import {
  DEFAULT_APPEARANCE,
  Direction,
  inViewRange,
  VIEW_RANGE,
  type EntityId,
  type MobileSnapshot,
  type Position,
  type TileMap,
} from '@fenix/shared';
import { Creature } from './creatures/creature';
import { Items } from './items/items';
import type { Mobile } from './mobile';
import { Npc } from './npcs/npc';
import { Player, type PlayerProps } from './player';
import { Guilds } from './social/guilds';
import { SpatialIndex } from './spatial-index';
import { Parties } from './social/parties';

export const MAX_PLAYERS = 100;

/** Agregado raíz del mundo: el mapa, los jugadores conectados y los objetos. */
export class World {
  private readonly players = new Map<EntityId, Player>();
  private readonly creatures = new Map<EntityId, Creature>();
  private readonly npcs = new Map<EntityId, Npc>();
  readonly items = new Items();
  readonly parties = new Parties();
  readonly guilds = new Guilds();
  /** Quién está dónde, por celdas: las consultas de cercanía no recorren todo el mundo. */
  private readonly nearPlayers = new SpatialIndex<Player>();
  private readonly nearCreatures = new SpatialIndex<Creature>();
  private readonly nearNpcs = new SpatialIndex<Npc>();

  constructor(
    readonly map: TileMap,
    private readonly spawnPoint: Position,
    /**
     * Identidad del mapa (tamaño y semilla). Un personaje guardado en otro
     * mundo no vuelve a su lugar (ese lugar ya no es el mismo): aparece en la capital.
     */
    readonly mapId = '',
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

  /**
   * Pone un jugador en el mundo: en el lugar guardado si sigue siendo
   * transitable, o cerca del punto de aparición.
   */
  spawn(
    props: Omit<PlayerProps, 'position' | 'direction'>,
    random: () => number,
    saved?: { position: Position; direction: Direction },
  ): Player {
    const useSaved = saved && this.map.isWalkable(saved.position);
    const player = new Player({
      ...props,
      position: useSaved ? saved.position : this.findSpawnPosition(random),
      direction: useSaved ? saved.direction : Direction.South,
    });
    this.players.set(player.id, player);
    player.moved = () => this.nearPlayers.update(player);
    this.nearPlayers.update(player);
    return player;
  }

  /** Saca al jugador del mundo junto con lo que lleva (antes hay que guardarlo). */
  remove(id: EntityId): Player | undefined {
    const player = this.players.get(id);
    this.players.delete(id);
    if (player) {
      player.moved = null;
      this.nearPlayers.remove(player);
    }
    this.items.removeOwnedBy(id);
    return player;
  }

  addCreature(creature: Creature): void {
    this.creatures.set(creature.id, creature);
    creature.moved = () => this.nearCreatures.update(creature);
    this.nearCreatures.update(creature);
  }

  /** Saca una criatura del mundo para siempre (una invocación que terminó). */
  removeCreature(id: EntityId): void {
    const creature = this.creatures.get(id);
    this.creatures.delete(id);
    if (creature) {
      creature.moved = null;
      this.nearCreatures.remove(creature);
    }
  }

  /** Invocaciones de un jugador (sin contar su montura suelta). */
  summonsOf(ownerId: EntityId): Creature[] {
    return [...this.creatures.values()].filter((c) => c.ownerId === ownerId && !c.gone && !c.isPet);
  }

  /** La montura suelta de un jugador, si la tiene en el mundo. */
  petOf(ownerId: EntityId): Creature | undefined {
    return [...this.creatures.values()].find(
      (c) => c.ownerId === ownerId && !c.gone && c.isPet && !c.combat.isDead,
    );
  }

  addNpc(npc: Npc): void {
    this.npcs.set(npc.id, npc);
    npc.moved = () => this.nearNpcs.update(npc);
    this.nearNpcs.update(npc);
  }

  getNpc(id: EntityId): Npc | undefined {
    return this.npcs.get(id);
  }

  allNpcs(): readonly Npc[] {
    return [...this.npcs.values()];
  }

  allCreatures(): readonly Creature[] {
    return [...this.creatures.values()];
  }

  /** Un jugador o una criatura presente en el mundo. */
  getMobile(id: EntityId): Mobile | undefined {
    const creature = this.creatures.get(id);
    if (creature) return creature.gone ? undefined : creature;
    return this.players.get(id) ?? this.npcs.get(id);
  }

  /** Jugadores y criaturas (presentes) que ven la posición dada. */
  mobilesNear(position: Position, options: { except?: EntityId } = {}): Mobile[] {
    const creatures = this.nearCreatures.near(position, VIEW_RANGE).filter((c) => !c.gone);
    return [
      ...this.nearPlayers.near(position, VIEW_RANGE),
      ...creatures,
      ...this.nearNpcs.near(position, VIEW_RANGE),
    ].filter((m) => m.id !== options.except && inViewRange(m.position, position));
  }

  /** ¿Hay algún jugador a `range` tiles o menos? (para despertar a las criaturas) */
  anyPlayerNear(position: Position, range: number): boolean {
    return this.nearPlayers
      .near(position, range)
      .some(
        (p) =>
          Math.max(Math.abs(p.position.x - position.x), Math.abs(p.position.y - position.y)) <=
          range,
      );
  }

  /** Un jugador escondido: los demás no lo ven (ni las criaturas). */
  isHidden(mobile: Mobile): boolean {
    return mobile instanceof Player && mobile.hidden !== null;
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
      return {
        ...mobile.toSnapshot(),
        equipment: this.items.lookOf(mobile.id),
        guildTag: this.guilds.of(mobile.name)?.tag ?? null,
      };
    }
    if (mobile instanceof Npc) {
      return {
        id: mobile.id,
        name: mobile.name,
        position: mobile.position,
        direction: mobile.direction,
        appearance: mobile.appearance,
        equipment: mobile.equipment,
        body: 'human',
        health: 1,
        dead: false,
        npc: mobile.role,
        notoriety: 'innocent',
        guildTag: null,
      };
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
      npc: null,
      // Una invocación se ve con el color de su dueño; las salvajes, rojas.
      notoriety:
        mobile instanceof Creature && mobile.ownerId
          ? (this.players.get(mobile.ownerId)?.notoriety ?? 'innocent')
          : 'murderer',
      guildTag: null,
      ownerId: mobile instanceof Creature ? mobile.ownerId : null,
    };
  }

  get(id: EntityId): Player | undefined {
    return this.players.get(id);
  }

  /** Un jugador conectado por su nombre (sin distinguir mayúsculas). */
  findByName(name: string): Player | undefined {
    const lower = name.trim().toLocaleLowerCase();
    return [...this.players.values()].find((p) => p.name.toLocaleLowerCase() === lower);
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
