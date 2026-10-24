import { effectiveMoveMode } from '@fenix/shared/combat/combat-rules';
import { PLAYER_ATTRIBUTES, type Attributes, type Vitals } from '@fenix/shared/combat/vitals';
import { CREATURES, bodyMoveMs, isCreatureKind } from '@fenix/shared/creatures/creature-catalog';
import { directionBetween, type Direction } from '@fenix/shared/geometry/direction';
import type { Position } from '@fenix/shared/geometry/position';
import { ITEMS, type ItemKind } from '@fenix/shared/items/item-catalog';
import { encumbrance, maxWeight } from '@fenix/shared/items/weight';
import type { EffectKind, EffectSnapshot } from '@fenix/shared/magic/effects';
import {
  FIELDS,
  SPELLS,
  type SpellKey,
  type PolymorphForm,
} from '@fenix/shared/magic/spell-catalog';
import { isMountKind, type MountKind } from '@fenix/shared/mounts/mount-catalog';
import type {
  BackpackItemSnapshot,
  BookMessage,
  ShipAction,
  ShipSecurityChange,
  ShipSnapshot,
  AccountMessage,
  SocialMessage,
  EntityId,
  EquippedItemSnapshot,
  GroundItemSnapshot,
  ItemDestination,
  TrackPointMessage,
  TrackSighting,
  ServerMessage,
} from '@fenix/shared/protocol/messages';
import type { Quest, QuestProgress } from '@fenix/shared/quests/quests';
import { sanitizeChatText } from '@fenix/shared/rules/chat';
import { advanceTime, type WorldTime } from '@fenix/shared/rules/daylight';
import { moveDuration, type MoveMode } from '@fenix/shared/rules/movement';
import {
  type ShipLevel,
  type ShipOrder,
  type ShipSecurity,
  shipTiles,
} from '@fenix/shared/ships/ships';
import type { SkillValues } from '@fenix/shared/skills/skill-catalog';
import type { ActiveSkill } from '@fenix/shared/skills/stealth';
import type { TrackingCategory } from '@fenix/shared/skills/tracking';
import type { ChatChannel, SocialCommand } from '@fenix/shared/social/groups';
import type { TreasureMark } from '@fenix/shared/treasure/treasure';
import { decodeMap } from '@fenix/shared/world/map-codec';
import type { ContainerLook } from '@fenix/shared/world/statics';
import { TileMap, type RegionData } from '@fenix/shared/world/tile-map';
import { CHAT_HELP, parseChatInput } from './chat-commands';
import { ATTACK_ANIMATION_MS, Entity } from './entity';
import { nextAutoTarget } from './targeting';
import { EventEmitter } from './event-emitter';
import { MovementPredictor } from './movement-predictor';
import type { ServerGateway } from './ports';

/** Después de este tiempo sin golpes, un atacante vuelve a avisarse. */
const ATTACK_WARNING_MS = 20_000;

/** Mensajes del registro; `skill` y `stat` son las subidas (celeste y verde, como en UO). */
export type LogKind = 'chat' | 'system' | 'skill' | 'stat';

export interface LogEntry {
  readonly kind: LogKind;
  readonly author?: string;
  readonly text: string;
  /** Canal de un mensaje de chat (en voz alta, grupo o gremio). */
  readonly channel?: ChatChannel;
}

/** Grupo, gremio, invitaciones y reputación propios. */
export type SocialState = Omit<SocialMessage, 'type'>;

export interface ClientGameEvents extends Record<string, unknown> {
  /** Se recibió el mundo inicial: ya se puede dibujar. */
  ready: { selfId: EntityId; map: TileMap };
  joinRejected: { reason: string };
  /** Entró a la cuenta o cambió su lista de personajes. */
  account: AccountMessage;
  log: LogEntry;
  entityAdded: Entity;
  entityRemoved: EntityId;
  /** Cambiaron los objetos del suelo a la vista. */
  groundItemsChanged: { added: readonly GroundItemSnapshot[]; removed: readonly EntityId[] };
  /** Cambió la mochila o el equipo propio. */
  inventoryChanged: Inventory;
  /** Cambió la vida, el maná, la energía o si está muerto. */
  vitalsChanged: { vitals: Vitals; dead: boolean };
  /** Cambió a quién está atacando. */
  targetChanged: EntityId | null;
  skillsChanged: SkillValues;
  /** Un hechizo salió: para dibujar su efecto. */
  spellEffect: { casterId: EntityId; targetId: EntityId; spell: SpellKey };
  /** Un disparo con arco: para dibujar la flecha. */
  arrowShot: { attackerId: EntityId; targetId: EntityId };
  /** Cambiaron los efectos activos propios o los atributos. */
  effectsChanged: EffectsState;
  socialChanged: SocialState;
  /** Modo guerra: permite atacar a otras personas. */
  warModeChanged: boolean;
  /** Uno mismo se escondió o lo descubrieron. */
  hiddenChanged: boolean;
  /** El jugador pidió salir del juego (`/desconectar`). */
  logoutRequested: null;
  /**
   * Cambió el cuerpo que se está revisando (`corpse` null: se cerró);
   * `opened` es true cuando llega la respuesta al doble clic propio.
   */
  corpseChanged: { corpse: CorpseContents | null; opened: boolean };
  /** Cambió un recipiente abierto (`container` null: se cerró). */
  containerChanged: {
    containerId: string;
    container: ContainerContents | null;
    opened: boolean;
  };
  /** Un vecino ofrece una misión. */
  questOffered: { npcId: EntityId; quest: Quest };
  /** Cambiaron las misiones aceptadas. */
  questsChanged: readonly QuestProgress[];
  /** Las leyendas que conoce y la pista de cada una. */
  legendsChanged: Extract<ServerMessage, { type: 'legends' }>['legends'];
  /** Se abrió un libro (respuesta al doble clic). */
  bookOpened: BookContents;
  /** Cambiaron los barcos que se ven (o alguno se movió). */
  shipsChanged: readonly ShipSnapshot[];
  /** Se abrió la ventana de un barco. */
  shipPanelOpened: { shipId: EntityId; level: ShipLevel; security?: ShipSecurity };
  /** Un cañonazo. */
  cannonShot: { from: Position; to: Position; hit: boolean };
  /** Se abrió un mapa del tesoro. */
  treasureMapOpened: { name: string; mark: TreasureMark; hint: string };
  /** Una puerta se abrió o se cerró. */
  doorChanged: { position: Position; open: boolean };
  /** El servidor confirmó que es administrador: abrir la ventana de todos los objetos. */
  itemCatalogOpened: null;
  /** `/eliminar`: elegir el objeto propio que se va a borrar. */
  deletePickRequested: null;
  /** `/rastrear` (o la habilidad Rastrear): abrir la ventana para elegir qué buscar. */
  trackingRequested: null;
  /** Lo que encontró al Rastrear. */
  trackingFound: { category: TrackingCategory; found: readonly TrackSighting[] };
  /** Dónde está el rastro que sigue (o que lo perdió). */
  trackPoint: TrackPointMessage;
}

/** Lo que hay en el cuerpo que se está revisando. */
/** ¿Es un muro mágico que cierra el paso? */
function isBarrierItem(kind: string): boolean {
  return Object.values(FIELDS).some((f) => f.barrier && f.item === kind);
}

/** Un libro abierto: lo que tiene escrito y si se puede escribir. */
export type BookContents = Omit<BookMessage, 'type'>;

/** Lo que hay en un recipiente abierto (una bolsa o un mueble). */
export interface ContainerContents {
  readonly containerId: string;
  readonly name: string;
  readonly look: ContainerLook;
  readonly items: readonly BackpackItemSnapshot[];
}

export interface CorpseContents {
  readonly corpseId: EntityId;
  readonly name: string;
  readonly items: readonly BackpackItemSnapshot[];
}

/** Efectos activos propios; `receivedAt` sirve para descontar el tiempo que pasa. */
export interface EffectsState {
  readonly effects: readonly EffectSnapshot[];
  readonly attributes: Attributes;
  readonly receivedAt: number;
}

/** Dónde va un hechizo y, si se lee de un pergamino, cuál. */
export interface CastTarget {
  readonly targetId?: EntityId;
  readonly position?: Position;
  readonly scrollId?: EntityId;
  /** Hechizos de viaje: la runa de la mochila. */
  readonly runeId?: EntityId;
  /** Transformación: en qué animal o criatura. */
  readonly form?: PolymorphForm;
}

export interface Inventory {
  readonly backpack: readonly BackpackItemSnapshot[];
  readonly equipment: readonly EquippedItemSnapshot[];
  readonly bank: readonly BackpackItemSnapshot[];
  /** Peso de lo que lleva encima, en piedras. */
  readonly weight: number;
  /** Sin límite de carga (personajes de prueba). */
  readonly unburdened: boolean;
  /** Cuánto lleva de cada cosa, sumando lo de adentro de las bolsas. */
  readonly carried: Readonly<Partial<Record<ItemKind, number>>>;
}

/** Cuánto lleva y cuánto puede llevar (`max` null: sin límite). */
export interface Load {
  readonly weight: number;
  readonly max: number | null;
}

/**
 * Estado del juego en el cliente y reglas de cómo cambia con cada mensaje
 * del servidor o acción del jugador. No sabe nada de dibujo ni de red.
 */
export class ClientGame extends EventEmitter<ClientGameEvents> {
  private readonly entities = new Map<EntityId, Entity>();
  private _map: TileMap | null = null;
  /** Último golpe recibido de cada atacante (para avisar una vez por pelea). */
  private readonly attackWarnings = new Map<EntityId, number>();
  private selfIdValue: EntityId | null = null;
  private predictor: MovementPredictor | null = null;
  private time: { value: WorldTime; receivedAt: number } | null = null;
  private readonly ground = new Map<EntityId, GroundItemSnapshot>();
  private _inventory: Inventory = {
    backpack: [],
    equipment: [],
    bank: [],
    weight: 0,
    unburdened: false,
    carried: {},
  };
  private _vitals: { vitals: Vitals; dead: boolean } | null = null;
  private _targetId: EntityId | null = null;
  private _skills: SkillValues | null = null;
  private _social: SocialState | null = null;
  private _warMode = false;
  private _hidden = false;
  private _effects: EffectsState | null = null;
  /** Cuándo se avisó por última vez que el peso no deja moverse (para no repetirlo a cada paso). */
  private lastBurdenNotice = -Infinity;
  private _corpse: CorpseContents | null = null;
  private readonly _containers = new Map<string, ContainerContents>();
  /** Los barcos que se ven. */
  private readonly _ships = new Map<EntityId, ShipSnapshot>();
  private readonly containersRequested = new Set<string>();
  private corpseRequested: EntityId | null = null;

  constructor(
    private readonly gateway: ServerGateway,
    private readonly clock: () => number,
  ) {
    super();
  }

  get map(): TileMap | null {
    return this._map;
  }

  get self(): Entity | undefined {
    return this.selfIdValue ? this.entities.get(this.selfIdValue) : undefined;
  }

  allEntities(): IterableIterator<Entity> {
    return this.entities.values();
  }

  get vitals(): { vitals: Vitals; dead: boolean } | null {
    return this._vitals;
  }

  get skills(): SkillValues | null {
    return this._skills;
  }

  get social(): SocialState | null {
    return this._social;
  }

  get effects(): EffectsState | null {
    return this._effects;
  }

  /** ¿Tiene ahora este efecto (y no se le terminó todavía)? */
  hasEffect(kind: EffectKind): boolean {
    const state = this._effects;
    if (!state) return false;
    const elapsed = this.clock() - state.receivedAt;
    return state.effects.some((e) => e.kind === kind && e.remainingMs > elapsed);
  }

  get warMode(): boolean {
    return this._warMode;
  }

  /** Escondido: los demás no lo ven. */
  get hidden(): boolean {
    return this._hidden;
  }

  /** Usar una habilidad a propósito (Esconderse, Mirar). */
  useSkill(skill: ActiveSkill, targetId?: EntityId): void {
    // Rastrear primero pide qué buscar (la ventana de Rastrear).
    if (skill === 'tracking') return void this.emit('trackingRequested', null);
    if (this.self)
      this.gateway.send({ type: 'useSkill', skill, ...(targetId ? { targetId } : {}) });
  }

  /** Buscar rastros de una clase (habilidad Rastrear). */
  track(category: TrackingCategory): void {
    if (this.self) this.gateway.send({ type: 'track', category });
  }

  /** Seguir uno de los rastros encontrados. */
  followTrack(targetId: EntityId): void {
    if (this.self) this.gateway.send({ type: 'followTrack', targetId });
  }

  /** Forzar con la ganzúa la cerradura del cofre de esa posición. */
  pickLock(toolId: EntityId, position: { x: number; y: number }): void {
    if (this.self) this.gateway.send({ type: 'pickLock', toolId, position });
  }

  get selfId(): EntityId | null {
    return this.selfIdValue;
  }

  get targetId(): EntityId | null {
    return this._targetId;
  }

  get inventory(): Inventory {
    return this._inventory;
  }

  /** Lo que lleva y lo máximo que aguanta su Fuerza (con lo que suman los efectos). */
  get load(): Load {
    const inventory = this._inventory;
    const strength = this._effects?.attributes.strength ?? PLAYER_ATTRIBUTES.strength;
    return {
      weight: inventory.weight,
      max: inventory.unburdened ? null : maxWeight(strength),
    };
  }

  groundItems(): IterableIterator<GroundItemSnapshot> {
    return this.ground.values();
  }

  /** Busca un objeto propio (mochila, banco o equipo), del suelo o del cuerpo abierto. */
  findItem(
    itemId: EntityId,
  ): GroundItemSnapshot | BackpackItemSnapshot | EquippedItemSnapshot | undefined {
    return (
      this.ground.get(itemId) ??
      this._inventory.backpack.find((i) => i.id === itemId) ??
      this._inventory.bank.find((i) => i.id === itemId) ??
      this._corpse?.items.find((i) => i.id === itemId) ??
      [...this._containers.values()].flatMap((c) => c.items).find((i) => i.id === itemId) ??
      this._inventory.equipment.find((i) => i.id === itemId)
    );
  }

  /** Jugadores (personas, no criaturas) a la vista, incluido el propio. */
  get visibleCount(): number {
    return [...this.entities.values()].filter((e) => e.body === 'human' && e.npc === null).length;
  }

  /** Hora actual del mundo, extrapolada desde la que envió el servidor. */
  worldTime(): WorldTime | null {
    if (!this.time) return null;
    return advanceTime(this.time.value, this.clock() - this.time.receivedAt);
  }

  /**
   * Dónde se ve uno: en un piso alto, encima de su edificio (para el mapa,
   * el minimapa y las coordenadas); si no, donde está.
   */
  selfSeenAt(): Position | null {
    const self = this.self;
    if (!self) return null;
    if (!this._map) return self.position;
    const { x, y } = this._map.displayOf(self.position);
    return { x, y };
  }

  /** Zona con nombre donde está el jugador, si hay alguna. */
  currentRegion(): RegionData | undefined {
    const self = this.self;
    return self ? this._map?.regionAt(self.position) : undefined;
  }

  // ── Acciones del jugador ────────────────────────────────────────────

  /** Un paso hacia `direction`; si choca en diagonal, resbala hacia `lean` (como en UO). */
  requestStep(direction: Direction, mode: MoveMode, lean?: Direction): void {
    const self = this.self;
    if (!self || !this.predictor) return;
    // Paralizado no se puede mover (el servidor rechazaría el paso).
    if (this.hasEffect('paralyzed')) return;
    // Sin energía, o con más peso del que aguanta la Fuerza, no se puede correr
    // (salvo montado); muy cargado no se mueve: las mismas reglas que aplica el servidor.
    const stamina = this._vitals?.vitals.stamina ?? 1;
    const { weight, max } = this.load;
    const burden = self.mount || max === null ? encumbrance(0, 1) : encumbrance(weight, max);
    if (!burden.canMove || (burden.stepStamina > 0 && stamina <= 0)) {
      const now = this.clock();
      if (now - this.lastBurdenNotice > 3000) {
        this.lastBurdenNotice = now;
        this.notify(
          burden.canMove
            ? 'Estás demasiado cansado para moverte con tanto peso.'
            : 'Llevás demasiado peso: no podés moverte.',
        );
      }
      return;
    }
    const request = this.predictor.tryStep(
      self,
      direction,
      self.mount ? mode : effectiveMoveMode(mode, stamina, burden.canRun),
      this.clock(),
      lean,
    );
    if (request) this.gateway.send(request);
  }

  /** Una línea del chat: texto para decir o un comando (/g, /invitar, /ayuda…). */
  say(rawText: string): void {
    if (!this.self) return;
    const input = parseChatInput(rawText);
    switch (input.kind) {
      case 'chat': {
        const text = sanitizeChatText(input.text);
        if (!text) return;
        this.gateway.send(
          input.channel === 'say'
            ? { type: 'chat', text }
            : { type: 'chat', text, channel: input.channel },
        );
        return;
      }
      case 'social':
        this.socialCommand(input.command, input.name, input.tag);
        return;
      case 'answer':
        this.answerInvite(input.accept);
        return;
      case 'logout':
        this.emit('logoutRequested', null);
        return;
      case 'dismount':
        if (this.self?.mount) this.dismount();
        else this.notify('No estás montado.');
        return;
      case 'ship': {
        const ship =
          input.action === 'panel' ? (this.shipAboard ?? this.nearestShip()) : this.nearestShip();
        if (!ship) this.notify('No hay ningún barco cerca.');
        else if (input.action === 'panel') this.shipAction(ship.id, 'panel');
        else this.boardShip(ship.id);
        return;
      }
      case 'useSkill':
        this.useSkill(input.skill);
        return;
      case 'releasePet':
        // El servidor sabe si hay montura (suelta o montada) y responde.
        this.gateway.send({ type: 'releasePet' });
        return;
      case 'hour':
        this.gateway.send({ type: 'setHour', hour: input.hour });
        return;
      case 'travel':
        this.gateway.send({ type: 'testTravel', to: input.to });
        return;
      case 'invulnerable':
        this.gateway.send({ type: 'toggleInvulnerable' });
        return;
      case 'goto': {
        if (input.place) {
          this.gateway.send({ type: 'testTravel', to: 'place', place: input.place });
          return;
        }
        const places = (this._map?.regions ?? []).filter((r) => !r.dungeon).map((r) => r.name);
        this.notify(`Lugares: ${places.join(', ')}.`);
        return;
      }
      case 'gm':
        this.gateway.send({ type: 'gm', command: input.command });
        return;
      case 'gmDelete':
        this.emit('deletePickRequested', null);
        return;
      case 'tracking':
        this.emit('trackingRequested', null);
        return;
      case 'gmTarget': {
        const targetId = this.targetId;
        if (input.action === 'slay') {
          if (!targetId) this.notify('Elegí primero a quién (tu blanco).');
          else this.gateway.send({ type: 'gm', command: { kind: 'slay', targetId } });
          return;
        }
        this.gateway.send({
          type: 'gm',
          command: { kind: input.action, ...(targetId ? { targetId } : {}) },
        });
        return;
      }
      case 'help':
        CHAT_HELP.forEach((line) => this.notify(line));
        return;
      case 'error':
        this.notify(input.text);
    }
  }

  socialCommand(command: SocialCommand, name?: string, tag?: string): void {
    if (!this.self) return;
    this.gateway.send({
      type: 'social',
      command,
      ...(name === undefined ? {} : { name }),
      ...(tag === undefined ? {} : { tag }),
    });
  }

  /** Acepta o rechaza la invitación pendiente (primero la de grupo). */
  answerInvite(accept: boolean): void {
    const invites = this._social?.invites;
    if (invites?.party) this.socialCommand(accept ? 'party-accept' : 'party-decline');
    else if (invites?.guild) this.socialCommand(accept ? 'guild-accept' : 'guild-decline');
    else this.notify('No tenés invitaciones pendientes.');
  }

  /** Entrar o salir del modo guerra. Al salir se deja de atacar, como en UO. */
  toggleWarMode(): void {
    if (!this.self) return;
    const war = !this._warMode;
    this.gateway.send({ type: 'setWarMode', war });
    this.applyWarMode(war);
    this.notify(war ? 'Modo guerra: podés atacar a otras personas fuera del pueblo.' : 'Modo paz.');
  }

  private applyWarMode(war: boolean): void {
    if (!war) this.stopAttack();
    this.self?.setWar(war);
    if (this._warMode === war) return;
    this._warMode = war;
    this.emit('warModeChanged', war);
  }

  /** Arrastrar y soltar un objeto. El servidor decide si se puede. */
  moveItem(itemId: EntityId, to: ItemDestination): void {
    if (this.self) this.gateway.send({ type: 'moveItem', itemId, to });
  }

  /** Atacar a una criatura: el servidor golpea mientras esté al alcance. */
  attack(targetId: EntityId): void {
    if (!this.self || targetId === this.selfIdValue) return;
    if (this.entities.get(targetId)?.isPlayer && !this._warMode) {
      this.notify('Activá el modo guerra (Tab) para atacar a otras personas.');
      return;
    }
    this.gateway.send({ type: 'attack', targetId });
  }

  /** Lanzar un hechizo: a alguien (`targetId`), a un lugar (`position`) o desde un pergamino. */
  castSpell(spell: SpellKey, target: CastTarget = {}): void {
    if (!this.self) return;
    this.gateway.send({
      type: 'castSpell',
      spell,
      ...(target.targetId ? { targetId: target.targetId } : {}),
      ...(target.position ? { position: target.position } : {}),
      ...(target.scrollId ? { scrollId: target.scrollId } : {}),
      ...(target.runeId ? { runeId: target.runeId } : {}),
      ...(target.form ? { form: target.form } : {}),
    });
  }

  /** Usar un objeto sobre alguien (vendarlo). */
  useOn(itemId: EntityId, targetId: EntityId): void {
    if (this.self) this.gateway.send({ type: 'useOn', itemId, targetId });
  }

  gather(toolId: EntityId, position: { x: number; y: number }): void {
    if (this.self) this.gateway.send({ type: 'gather', toolId, position });
  }

  /** Los barcos que se ven. */
  get ships(): readonly ShipSnapshot[] {
    return [...this._ships.values()];
  }

  /** El barco que tiene un tile de cubierta en esa posición. */
  shipAt(position: Position): ShipSnapshot | undefined {
    return this.ships.find((ship) =>
      shipTiles(ship.kind, ship, ship.facing).some((t) => t.x === position.x && t.y === position.y),
    );
  }

  /** El barco en que se está a bordo. */
  get shipAboard(): ShipSnapshot | undefined {
    return this.self ? this.shipAt(this.self.position) : undefined;
  }

  /** El barco más cerca de uno (por el tile de cubierta más cercano). */
  nearestShip(): ShipSnapshot | undefined {
    const self = this.self;
    if (!self) return undefined;
    let best: { ship: ShipSnapshot; distance: number } | undefined;
    for (const ship of this.ships)
      for (const t of shipTiles(ship.kind, ship, ship.facing)) {
        const distance = Math.max(Math.abs(t.x - self.position.x), Math.abs(t.y - self.position.y));
        if (!best || distance < best.distance) best = { ship, distance };
      }
    return best?.ship;
  }

  boardShip(shipId: EntityId): void {
    if (this.self) this.gateway.send({ type: 'boardShip', shipId });
  }

  shipOrder(shipId: EntityId, order: ShipOrder): void {
    if (this.self) this.gateway.send({ type: 'shipOrder', shipId, order });
  }

  shipAction(shipId: EntityId, action: ShipAction): void {
    if (this.self) this.gateway.send({ type: 'shipAction', shipId, action });
  }

  shipSecurity(shipId: EntityId, change: ShipSecurityChange): void {
    if (this.self) this.gateway.send({ type: 'shipSecurity', shipId, change });
  }

  /** Pone o saca la cubierta de un barco en el mapa local (para caminar sobre él). */
  private setDecks(ship: ShipSnapshot, on: boolean): void {
    for (const t of shipTiles(ship.kind, ship, ship.facing)) this._map?.setDeck(t, on);
  }

  /** Cavar con la pala (buscando un tesoro). */
  dig(toolId: EntityId, position: { x: number; y: number }): void {
    if (this.self) this.gateway.send({ type: 'dig', toolId, position });
  }

  buy(vendorId: EntityId, kind: ItemKind, amount: number): void {
    if (this.self) this.gateway.send({ type: 'buy', vendorId, kind, amount });
  }

  sell(vendorId: EntityId, itemId: EntityId): void {
    if (this.self) this.gateway.send({ type: 'sell', vendorId, itemId });
  }

  craft(recipe: string): void {
    if (this.self) this.gateway.send({ type: 'craft', recipe });
  }

  /** Cuerpo que se está revisando, si hay uno abierto. */
  get corpse(): CorpseContents | null {
    return this._corpse;
  }

  /** Doble clic sobre un cuerpo: pedir ver qué tiene. */
  /** Abrir o cerrar una puerta (doble clic); el servidor decide y avisa a todos. */
  useDoor(position: Position): void {
    if (!this.self) return;
    this.gateway.send({ type: 'useDoor', position });
  }

  /** Abrir un mueble que guarda cosas (`static:x:y`); las bolsas se abren con doble clic. */
  openContainer(containerId: string): void {
    if (!this.self) return;
    this.containersRequested.add(containerId);
    this.gateway.send({ type: 'openContainer', containerId });
  }

  /** Crear objetos en la mochila (administrador, desde la ventana de todos los objetos). */
  createItem(kind: ItemKind, amount: number): void {
    this.gateway.send({ type: 'gm', command: { kind: 'item', item: kind, amount } });
  }

  /** Borrar un objeto propio (administrador, `/eliminar`). */
  deleteItem(itemId: EntityId): void {
    this.gateway.send({ type: 'gm', command: { kind: 'delete', itemId } });
  }

  /** Teñir una prenda propia. */
  dye(itemId: EntityId, hue: number): void {
    this.gateway.send({ type: 'dye', itemId, hue });
  }

  /** Elegir el color del agua de la tina de tintura. */
  tintTub(tubId: EntityId, hue: number): void {
    if (this.self) this.gateway.send({ type: 'tintTub', tubId, hue });
  }

  /** Hablar con un vecino (misiones). */
  talkNpc(npcId: EntityId): void {
    this.gateway.send({ type: 'talkNpc', npcId });
  }

  acceptQuest(npcId: EntityId): void {
    this.gateway.send({ type: 'acceptQuest', npcId });
  }

  abandonQuest(giver: string): void {
    this.gateway.send({ type: 'abandonQuest', giver });
  }

  /** Guarda una hoja escrita (y el título) de un libro. */
  writeBook(itemId: EntityId, title: string, page: number, text: string): void {
    this.gateway.send({ type: 'writeBook', itemId, title, page, text });
  }

  /** Doble clic sobre una bolsa: el servidor la abre (se espera su ventana). */
  expectContainer(containerId: string): void {
    this.containersRequested.add(containerId);
  }

  openCorpse(corpseId: EntityId): void {
    if (!this.self) return;
    this.corpseRequested = corpseId;
    this.gateway.send({ type: 'openCorpse', corpseId });
  }

  /** Doble clic sobre la montura propia: subirse. */
  mount(petId: EntityId): void {
    if (this.self) this.gateway.send({ type: 'mount', petId });
  }

  dismount(): void {
    if (this.self?.mount) this.gateway.send({ type: 'dismount' });
  }

  buyMount(vendorId: EntityId, mount: MountKind): void {
    if (this.self) this.gateway.send({ type: 'buyMount', vendorId, mount });
  }

  /** ¿Es la montura suelta del jugador? */
  isOwnPet(id: EntityId): boolean {
    const entity = this.entities.get(id);
    return entity !== undefined && entity.ownerId === this.selfIdValue && isMountKind(entity.body);
  }

  lootAll(corpseId: EntityId): void {
    if (this.self) this.gateway.send({ type: 'lootAll', corpseId });
  }

  /** ¿Está el jugador a esta distancia (en tiles) o menos de alguien? */
  isNear(id: EntityId, range: number): boolean {
    const self = this.self;
    const other = this.entities.get(id);
    if (!self || !other) return false;
    return (
      Math.max(
        Math.abs(self.position.x - other.position.x),
        Math.abs(self.position.y - other.position.y),
      ) <= range
    );
  }

  /** Avisa algo solo en el registro propio (sin pasar por el servidor). */
  notify(text: string): void {
    this.emit('log', { kind: 'system', text });
  }

  /** Busca un personaje o criatura a la vista. */
  entity(id: EntityId): Entity | undefined {
    return this.entities.get(id);
  }

  /**
   * Botón de atacar (celular): la criatura salvaje más cercana (o la que ya
   * estaba peleando); con `next`, la siguiente más cercana.
   */
  attackNearest(step: -1 | 0 | 1 = 0): void {
    const self = this.self;
    if (!self) return;
    if (self.dead) {
      this.notify('Los fantasmas no pueden pelear.');
      return;
    }
    const others = [...this.entities.values()].filter((e) => e.id !== self.id);
    const id = nextAutoTarget(others, self.position, this._targetId, step);
    if (id) this.attack(id);
    else this.notify('No hay criaturas cerca para atacar.');
  }

  stopAttack(): void {
    if (this.self && this._targetId) this.gateway.send({ type: 'stopAttack' });
  }

  /** Doble clic sobre un objeto. */
  useItem(itemId: EntityId): void {
    if (!this.self) return;
    // Una bolsa se abre: se espera su ventana.
    const item = this.findItem(itemId);
    if (item && ITEMS[item.kind].capacity) this.containersRequested.add(itemId);
    this.gateway.send({ type: 'useItem', itemId });
  }

  /** Mantenimiento por frame: vence textos sobre las cabezas. */
  update(): void {
    const now = this.clock();
    for (const entity of this.entities.values()) entity.pruneOverhead(now);
  }

  // ── Mensajes del servidor ───────────────────────────────────────────

  apply(message: ServerMessage): void {
    const now = this.clock();
    switch (message.type) {
      case 'welcome': {
        this.entities.clear();
        this.ground.clear();
        this._map = new TileMap(decodeMap(message.map));
        for (const door of message.openDoors ?? []) this._map.setDoorOpen(door, true);
        this.selfIdValue = message.selfId;
        this.predictor = new MovementPredictor(this._map);
        this.time = { value: message.time, receivedAt: now };
        this._targetId = null;
        message.mobiles.forEach((m) => this.addEntity(new Entity(m)));
        this.emit('ready', { selfId: message.selfId, map: this._map });
        break;
      }
      case 'gmCatalog':
        this.emit('itemCatalogOpened', null);
        break;
      case 'tracking':
        this.emit('trackingFound', { category: message.category, found: message.found });
        break;
      case 'trackPoint':
        this.emit('trackPoint', message);
        break;
      case 'door':
        if (this._map?.setDoorOpen(message.position, message.open))
          this.emit('doorChanged', { position: message.position, open: message.open });
        break;
      case 'joinRejected':
        this.emit('joinRejected', { reason: message.reason });
        break;
      case 'account':
        this.emit('account', message);
        break;
      case 'mobileAppeared':
        if (!this.entities.has(message.mobile.id)) this.addEntity(new Entity(message.mobile));
        break;
      case 'mobileDisappeared':
        if (message.id !== this.selfIdValue && this.entities.delete(message.id)) {
          this.emit('entityRemoved', message.id);
        }
        break;
      case 'mobileMoved': {
        const entity = this.entities.get(message.id);
        if (entity && message.id !== this.selfIdValue) {
          const duration = bodyMoveMs(
            entity.body,
            moveDuration(message.mode, entity.mount !== null),
          );
          entity.moveTo(message.position, message.direction, duration, now, message.mode);
        }
        break;
      }
      case 'moveAck':
        if (this.self) this.predictor?.acknowledge(this.self, message.seq, message.position);
        break;
      case 'moveRejected':
        this.predictor?.reject();
        this.self?.teleport(message.position, message.direction);
        break;
      case 'mobileTeleported': {
        const entity = this.entities.get(message.id);
        if (message.id === this.selfIdValue) this.predictor?.reject();
        entity?.teleport(message.position, entity.direction);
        break;
      }
      case 'worldTime':
        this.time = { value: message.time, receivedAt: now };
        break;
      case 'effects':
        this._effects = {
          effects: message.effects,
          attributes: message.attributes,
          receivedAt: now,
        };
        this.emit('effectsChanged', this._effects);
        break;
      case 'chat':
        if (message.channel === 'say') this.entities.get(message.id)?.say(message.text, now);
        this.emit('log', {
          kind: 'chat',
          author: message.name,
          text: message.text,
          channel: message.channel,
        });
        break;
      case 'system':
        this.emit('log', { kind: message.tone ?? 'system', text: message.text });
        break;
      case 'corpse': {
        const opened = this.corpseRequested === message.corpseId;
        this.corpseRequested = null;
        this._corpse = { corpseId: message.corpseId, name: message.name, items: message.items };
        this.emit('corpseChanged', { corpse: this._corpse, opened });
        break;
      }
      case 'container': {
        const opened = this.containersRequested.delete(message.containerId);
        const container = {
          containerId: message.containerId,
          name: message.name,
          look: message.look,
          items: message.items,
        };
        this._containers.set(message.containerId, container);
        this.emit('containerChanged', { containerId: message.containerId, container, opened });
        break;
      }
      case 'questOffer':
        this.emit('questOffered', { npcId: message.npcId, quest: message.quest });
        break;
      case 'quests':
        this.emit('questsChanged', message.quests);
        break;
      case 'legends':
        this.emit('legendsChanged', message.legends);
        break;
      case 'ships': {
        for (const ship of this._ships.values()) this.setDecks(ship, false);
        this._ships.clear();
        for (const ship of message.ships) {
          this._ships.set(ship.id, ship);
          this.setDecks(ship, true);
        }
        this.emit('shipsChanged', this.ships);
        break;
      }
      case 'shipMoved': {
        const ship = this._ships.get(message.id);
        if (!ship) break;
        this.setDecks(ship, false);
        const moved = { ...ship, x: message.x, y: message.y, facing: message.facing };
        this._ships.set(ship.id, moved);
        this.setDecks(moved, true);
        this.emit('shipsChanged', this.ships);
        break;
      }
      case 'shipPanel':
        this.emit('shipPanelOpened', {
          shipId: message.shipId,
          level: message.level,
          ...(message.security ? { security: message.security } : {}),
        });
        break;
      case 'cannonShot':
        this.emit('cannonShot', { from: message.from, to: message.to, hit: message.hit });
        break;
      case 'treasureMap':
        this.emit('treasureMapOpened', {
          name: message.name,
          mark: message.mark,
          hint: message.hint,
        });
        break;
      case 'book': {
        this.emit('bookOpened', {
          itemId: message.itemId,
          title: message.title,
          author: message.author,
          pages: message.pages,
          writable: message.writable,
        });
        break;
      }
      case 'containerClosed':
        this._containers.delete(message.containerId);
        this.emit('containerChanged', {
          containerId: message.containerId,
          container: null,
          opened: false,
        });
        break;
      case 'corpseClosed':
        if (this._corpse?.corpseId !== message.corpseId) break;
        this._corpse = null;
        this.emit('corpseChanged', { corpse: null, opened: false });
        break;
      case 'groundItems':
        // Los muros mágicos (piedra, energía) cierran el paso: también para moverse sin esperar al servidor.
        for (const id of message.removed) {
          const gone = this.ground.get(id);
          if (gone && isBarrierItem(gone.kind)) this._map?.setBarrier(gone.position, false);
          this.ground.delete(id);
        }
        for (const item of message.added) {
          this.ground.set(item.id, item);
          if (isBarrierItem(item.kind)) this._map?.setBarrier(item.position, true);
        }
        this.emit('groundItemsChanged', { added: message.added, removed: message.removed });
        break;
      case 'inventory':
        this._inventory = {
          backpack: message.backpack,
          equipment: message.equipment,
          bank: message.bank,
          weight: message.weight ?? 0,
          unburdened: message.unburdened === true,
          carried: message.carried ?? {},
        };
        this.emit('inventoryChanged', this._inventory);
        break;
      case 'vitals':
        this._vitals = { vitals: message.vitals, dead: message.dead };
        this.self?.setHealth(message.vitals.hits / message.vitals.maxHits, message.dead);
        this.emit('vitalsChanged', this._vitals);
        break;
      case 'mobileHealth':
        this.entities
          .get(message.id)
          ?.setHealth(message.health, message.dead, message.poisoned === true);
        this.updatePartyHealth(message.id, message.health);
        break;
      case 'mobileStatus':
        this.entities.get(message.id)?.setStatus(message.notoriety, message.guildTag);
        break;
      case 'social': {
        const state: SocialState = {
          party: message.party,
          guild: message.guild,
          invites: message.invites,
          fame: message.fame,
          karma: message.karma,
          murders: message.murders,
          notoriety: message.notoriety,
        };
        this._social = state;
        this.emit('socialChanged', state);
        break;
      }
      case 'combatTarget':
        this._targetId = message.targetId;
        this.emit('targetChanged', message.targetId);
        break;
      case 'swing':
        this.applySwing(message, now);
        break;
      case 'skills':
        this._skills = message.values;
        this.emit('skillsChanged', message.values);
        break;
      case 'castStart':
        this.entities.get(message.casterId)?.say(`${SPELLS[message.spell].words}`, now);
        this.entities.get(message.casterId)?.startAction('cast', now, SPELLS[message.spell].castMs);
        break;
      case 'spellEffect': {
        const target = this.entities.get(message.targetId);
        const kind = SPELLS[message.spell].effect.kind;
        if (
          target &&
          message.amount > 0 &&
          (kind === 'heal' || kind === 'damage' || kind === 'area-damage')
        ) {
          const healing = kind === 'heal';
          target.addCombatText(
            healing ? `+${message.amount}` : String(message.amount),
            healing
              ? 'heal'
              : message.targetId === this.selfIdValue
                ? 'damage-taken'
                : 'damage-dealt',
            now,
          );
        }
        this.emit('spellEffect', {
          casterId: message.casterId,
          targetId: message.targetId,
          spell: message.spell,
        });
        break;
      }
      case 'playerEquipment':
        this.entities.get(message.id)?.setEquipment(message.equipment, message.hues);
        break;
      case 'mobileLook': {
        // Otra cara, otro nombre u otra forma: se lo vuelve a dibujar donde está.
        const before = this.entities.get(message.mobile.id);
        if (!before) break;
        const entity = new Entity({
          ...message.mobile,
          position: before.position,
          direction: before.direction,
        });
        this.entities.set(entity.id, entity);
        this.emit('entityRemoved', entity.id);
        this.emit('entityAdded', entity);
        break;
      }
      case 'mountChanged':
        this.entities.get(message.id)?.setMount(message.mount);
        break;
      case 'warModeChanged':
        if (message.id === this.selfIdValue) {
          if (message.auto && !this._warMode)
            this.notify('¡Te atacan! Pasaste a modo guerra y te defendés.');
          if (message.war !== this._warMode) this.applyWarMode(message.war);
        } else this.entities.get(message.id)?.setWar(message.war);
        break;
      case 'hiddenChanged':
        this._hidden = message.hidden;
        this.emit('hiddenChanged', message.hidden);
        break;
    }
  }

  /** La vida de los compañeros de grupo llega aunque estén lejos. */
  private updatePartyHealth(id: EntityId, health: number): void {
    const social = this._social;
    if (!social?.party?.members.some((m) => m.id === id)) return;
    this._social = {
      ...social,
      party: {
        ...social.party,
        members: social.party.members.map((m) => (m.id === id ? { ...m, health } : m)),
      },
    };
    this.emit('socialChanged', this._social);
  }

  private applySwing(message: Extract<ServerMessage, { type: 'swing' }>, now: number): void {
    const attacker = this.entities.get(message.attackerId);
    const target = this.entities.get(message.targetId);
    if (message.targetId === this.selfIdValue) this.warnAttacker(message.attackerId, attacker, now);
    if (attacker && target) {
      // Personas y esqueletos hacen el gesto de su arma, mirando al objetivo; las bestias embisten.
      if (attacker.isHumanoid) {
        const facing = directionBetween(attacker.position, target.position);
        if (facing !== null && attacker.stepProgress(now) === null) attacker.face(facing);
        attacker.startAction('attack', now, ATTACK_ANIMATION_MS);
      } else attacker.lungeToward(target.position, now);
    }
    if (!target) return;
    if (message.ranged)
      this.emit('arrowShot', { attackerId: message.attackerId, targetId: message.targetId });
    if (!message.hit) target.addCombatText('¡Falla!', 'miss', now);
    else if (message.blocked) target.addCombatText('¡Bloqueado!', 'miss', now);
    else
      target.addCombatText(
        String(message.damage),
        message.targetId === this.selfIdValue ? 'damage-taken' : 'damage-dealt',
        now,
      );
  }

  /**
   * Como en UO: la primera vez que algo te ataca (o vuelve a hacerlo después
   * de un rato), el chat avisa quién. Si no se lo ve, igual se avisa.
   */
  private warnAttacker(id: EntityId, attacker: Entity | undefined, now: number): void {
    const last = this.attackWarnings.get(id);
    this.attackWarnings.set(id, now);
    if (last !== undefined && now - last < ATTACK_WARNING_MS) return;
    if (!attacker) {
      this.notify('Algo te está atacando y no lo ves.');
      return;
    }
    const creature = isCreatureKind(attacker.body) ? CREATURES[attacker.body] : null;
    this.notify(
      creature ? `Te ataca ${creature.article} ${creature.name}.` : `Te ataca ${attacker.name}.`,
    );
  }

  private addEntity(entity: Entity): void {
    this.entities.set(entity.id, entity);
    this.emit('entityAdded', entity);
  }
}
