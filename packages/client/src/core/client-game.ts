import {
  CREATURES,
  SPELLS,
  TileMap,
  advanceTime,
  bodyMoveMs,
  directionBetween,
  effectiveMoveMode,
  isCreatureKind,
  isMountKind,
  moveDuration,
  sanitizeChatText,
  type Attributes,
  type BackpackItemSnapshot,
  type EffectKind,
  type EffectSnapshot,
  type Position,
  type ChatChannel,
  type SocialCommand,
  type SocialMessage,
  type Direction,
  type EntityId,
  type EquippedItemSnapshot,
  type GroundItemSnapshot,
  type ItemDestination,
  type ItemKind,
  type MountKind,
  type MoveMode,
  type RegionData,
  type ServerMessage,
  type SkillValues,
  type SpellKey,
  type Vitals,
  type WorldTime,
} from '@fenix/shared';
import { CHAT_HELP, parseChatInput } from './chat-commands';
import { ATTACK_ANIMATION_MS, Entity } from './entity';
import { EventEmitter } from './event-emitter';
import { MovementPredictor } from './movement-predictor';
import type { ServerGateway } from './ports';

/** Después de este tiempo sin golpes, un atacante vuelve a avisarse. */
const ATTACK_WARNING_MS = 20_000;

export type LogKind = 'chat' | 'system';

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
  /** El jugador pidió salir del juego (`/desconectar`). */
  logoutRequested: null;
  /**
   * Cambió el cuerpo que se está revisando (`corpse` null: se cerró);
   * `opened` es true cuando llega la respuesta al doble clic propio.
   */
  corpseChanged: { corpse: CorpseContents | null; opened: boolean };
}

/** Lo que hay en el cuerpo que se está revisando. */
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
}

export interface Inventory {
  readonly backpack: readonly BackpackItemSnapshot[];
  readonly equipment: readonly EquippedItemSnapshot[];
  readonly bank: readonly BackpackItemSnapshot[];
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
  private _inventory: Inventory = { backpack: [], equipment: [], bank: [] };
  private _vitals: { vitals: Vitals; dead: boolean } | null = null;
  private _targetId: EntityId | null = null;
  private _skills: SkillValues | null = null;
  private _social: SocialState | null = null;
  private _warMode = false;
  private _effects: EffectsState | null = null;
  private _corpse: CorpseContents | null = null;
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

  get selfId(): EntityId | null {
    return this.selfIdValue;
  }

  get targetId(): EntityId | null {
    return this._targetId;
  }

  get inventory(): Inventory {
    return this._inventory;
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

  /** Zona con nombre donde está el jugador, si hay alguna. */
  currentRegion(): RegionData | undefined {
    const self = this.self;
    return self ? this._map?.regionAt(self.position) : undefined;
  }

  // ── Acciones del jugador ────────────────────────────────────────────

  requestStep(direction: Direction, mode: MoveMode): void {
    const self = this.self;
    if (!self || !this.predictor) return;
    // Paralizado no se puede mover (el servidor rechazaría el paso).
    if (this.hasEffect('paralyzed')) return;
    // Sin energía no se puede correr (salvo montado): misma regla que aplica el servidor.
    const stamina = this._vitals?.vitals.stamina ?? 1;
    const request = this.predictor.tryStep(
      self,
      direction,
      self.mount ? mode : effectiveMoveMode(mode, stamina),
      this.clock(),
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
      case 'hour':
        this.gateway.send({ type: 'setHour', hour: input.hour });
        return;
      case 'travel':
        this.gateway.send({ type: 'testTravel', to: input.to });
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
    this._warMode = !this._warMode;
    if (!this._warMode) this.stopAttack();
    this.notify(
      this._warMode ? 'Modo guerra: podés atacar a otras personas fuera del pueblo.' : 'Modo paz.',
    );
    this.emit('warModeChanged', this._warMode);
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
    });
  }

  /** Usar un objeto sobre alguien (vendarlo). */
  useOn(itemId: EntityId, targetId: EntityId): void {
    if (this.self) this.gateway.send({ type: 'useOn', itemId, targetId });
  }

  gather(toolId: EntityId, position: { x: number; y: number }): void {
    if (this.self) this.gateway.send({ type: 'gather', toolId, position });
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

  stopAttack(): void {
    if (this.self && this._targetId) this.gateway.send({ type: 'stopAttack' });
  }

  /** Doble clic sobre un objeto. */
  useItem(itemId: EntityId): void {
    if (this.self) this.gateway.send({ type: 'useItem', itemId });
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
        this._map = new TileMap(message.map);
        this.selfIdValue = message.selfId;
        this.predictor = new MovementPredictor(this._map);
        this.time = { value: message.time, receivedAt: now };
        this._targetId = null;
        message.mobiles.forEach((m) => this.addEntity(new Entity(m)));
        this.emit('ready', { selfId: message.selfId, map: this._map });
        break;
      }
      case 'joinRejected':
        this.emit('joinRejected', { reason: message.reason });
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
        this.emit('log', { kind: 'system', text: message.text });
        break;
      case 'corpse': {
        const opened = this.corpseRequested === message.corpseId;
        this.corpseRequested = null;
        this._corpse = { corpseId: message.corpseId, name: message.name, items: message.items };
        this.emit('corpseChanged', { corpse: this._corpse, opened });
        break;
      }
      case 'corpseClosed':
        if (this._corpse?.corpseId !== message.corpseId) break;
        this._corpse = null;
        this.emit('corpseChanged', { corpse: null, opened: false });
        break;
      case 'groundItems':
        for (const id of message.removed) this.ground.delete(id);
        for (const item of message.added) this.ground.set(item.id, item);
        this.emit('groundItemsChanged', { added: message.added, removed: message.removed });
        break;
      case 'inventory':
        this._inventory = {
          backpack: message.backpack,
          equipment: message.equipment,
          bank: message.bank,
        };
        this.emit('inventoryChanged', this._inventory);
        break;
      case 'vitals':
        this._vitals = { vitals: message.vitals, dead: message.dead };
        this.self?.setHealth(message.vitals.hits / message.vitals.maxHits, message.dead);
        this.emit('vitalsChanged', this._vitals);
        break;
      case 'mobileHealth':
        this.entities.get(message.id)?.setHealth(message.health, message.dead);
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
        this.entities.get(message.id)?.setEquipment(message.equipment);
        break;
      case 'mountChanged':
        this.entities.get(message.id)?.setMount(message.mount);
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
