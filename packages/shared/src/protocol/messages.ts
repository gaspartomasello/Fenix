import type { Appearance } from '../domain/character/appearance';
import type { Direction } from '../domain/geometry/direction';
import type { Position } from '../domain/geometry/position';
import type { EquipmentSlot } from '../domain/items/equipment';
import type { ItemKind } from '../domain/items/item-catalog';
import type { Attributes, Vitals } from '../domain/combat/vitals';
import type { EffectSnapshot } from '../domain/magic/effects';
import type { Body } from '../domain/creatures/creature-catalog';
import type { NpcRole } from '../domain/economy/vendors';
import type { ChatChannel, SocialCommand } from '../domain/social/groups';
import type { Notoriety } from '../domain/social/reputation';
import type { SpellKey } from '../domain/magic/spell-catalog';
import type { SkillValues } from '../domain/skills/skill-catalog';
import type { WorldTime } from '../domain/rules/daylight';
import type { MoveMode } from '../domain/rules/movement';
import type { TileMapData } from '../domain/world/tile-map';

export type EntityId = string;

/** Lo que se ve puesto un personaje: qué objeto hay en cada lugar del cuerpo. */
export type EquipmentLook = Partial<Readonly<Record<EquipmentSlot, ItemKind>>>;

/** Lo que un cliente necesita saber de otro jugador para mostrarlo. */
export interface MobileSnapshot {
  readonly id: EntityId;
  readonly name: string;
  readonly position: Position;
  readonly direction: Direction;
  readonly appearance: Appearance;
  readonly equipment: EquipmentLook;
  /** Humano o el tipo de criatura. */
  readonly body: Body;
  /** Vida restante como fracción (0–1), para la barra sobre la cabeza. */
  readonly health: number;
  /** Muerto: un fantasma, en el caso de los jugadores. */
  readonly dead: boolean;
  /** Si es un personaje del pueblo (comerciante, banquera), su oficio. */
  readonly npc: NpcRole | null;
  /** Reputación (color del nombre) y siglas del gremio, si tiene. */
  readonly notoriety: Notoriety;
  readonly guildTag: string | null;
}

export interface ItemSnapshot {
  readonly id: EntityId;
  readonly kind: ItemKind;
  readonly amount: number;
}

export interface GroundItemSnapshot extends ItemSnapshot {
  readonly position: Position;
}

/** Objeto en la mochila; `position` es su lugar en pixeles dentro de la ventana. */
export interface BackpackItemSnapshot extends ItemSnapshot {
  readonly position: Position;
}

export interface EquippedItemSnapshot extends ItemSnapshot {
  readonly slot: EquipmentSlot;
}

/** A dónde se mueve un objeto al soltarlo. */
export type ItemDestination =
  | { readonly type: 'ground'; readonly position: Position }
  | { readonly type: 'backpack'; readonly position?: Position }
  | { readonly type: 'bank'; readonly position?: Position }
  | { readonly type: 'equipment'; readonly slot: EquipmentSlot };

// ── Cliente → Servidor ────────────────────────────────────────────────

export interface JoinRequest {
  readonly type: 'join';
  readonly name: string;
  /** Apariencia para un personaje nuevo; uno guardado conserva la suya. */
  readonly appearance: Appearance;
  /** Contraseña del personaje (el modo solo no la pide). */
  readonly password?: string;
}

export interface MoveRequest {
  readonly type: 'move';
  readonly direction: Direction;
  readonly mode: MoveMode;
  /** Número de secuencia para reconciliar la predicción del cliente. */
  readonly seq: number;
}

export interface ChatRequest {
  readonly type: 'chat';
  readonly text: string;
  /** Por defecto, decir en voz alta. */
  readonly channel?: ChatChannel;
}

/** Comandos de grupo y gremio (invitar, aceptar, crear, salir…). */
export interface SocialRequest {
  readonly type: 'social';
  readonly command: SocialCommand;
  /** Nombre del jugador a invitar o del gremio a crear. */
  readonly name?: string;
  /** Siglas del gremio a crear. */
  readonly tag?: string;
}

export interface MoveItemRequest {
  readonly type: 'moveItem';
  readonly itemId: EntityId;
  readonly to: ItemDestination;
}

/** Doble clic: comer, beber, equipar o sacarse un objeto. */
export interface UseItemRequest {
  readonly type: 'useItem';
  readonly itemId: EntityId;
}

/** Elegir a quién atacar: se sigue golpeando mientras esté al alcance. */
export interface AttackRequest {
  readonly type: 'attack';
  readonly targetId: EntityId;
}

export interface StopAttackRequest {
  readonly type: 'stopAttack';
}

/**
 * Lanzar un hechizo: `targetId` para los que van a alguien, `position` para
 * los que van a un lugar. Con `scrollId`, se lee de un pergamino.
 */
export interface CastSpellRequest {
  readonly type: 'castSpell';
  readonly spell: SpellKey;
  readonly targetId?: EntityId;
  readonly position?: Position;
  readonly scrollId?: EntityId;
}

/** Usar un objeto sobre alguien (por ejemplo, vendarlo). */
export interface UseOnRequest {
  readonly type: 'useOn';
  readonly itemId: EntityId;
  readonly targetId: EntityId;
}

/** Recolectar del árbol o roca en esa posición, con la herramienta indicada. */
export interface GatherRequest {
  readonly type: 'gather';
  readonly toolId: EntityId;
  readonly position: Position;
}

export interface BuyRequest {
  readonly type: 'buy';
  readonly vendorId: EntityId;
  readonly kind: ItemKind;
  readonly amount: number;
}

/** Vender un objeto de la mochila entero (toda la pila). */
export interface SellRequest {
  readonly type: 'sell';
  readonly vendorId: EntityId;
  readonly itemId: EntityId;
}

/** Cambiar la hora del mundo (solo personajes de prueba, para probar la noche). */
export interface SetHourRequest {
  readonly type: 'setHour';
  /** Hora del juego, de 0 a 24. */
  readonly hour: number;
}

/** Viajar al instante a la boca de la cueva o a la guarida del jefe (solo personajes de prueba). */
export interface TestTravelRequest {
  readonly type: 'testTravel';
  readonly to: 'cave' | 'lair';
}

export interface CraftRequest {
  readonly type: 'craft';
  readonly recipe: string;
}

export type ClientMessage =
  | JoinRequest
  | MoveRequest
  | ChatRequest
  | MoveItemRequest
  | UseItemRequest
  | AttackRequest
  | StopAttackRequest
  | CastSpellRequest
  | UseOnRequest
  | GatherRequest
  | BuyRequest
  | SellRequest
  | CraftRequest
  | SetHourRequest
  | TestTravelRequest
  | SocialRequest;

// ── Servidor → Cliente ────────────────────────────────────────────────

export interface WelcomeMessage {
  readonly type: 'welcome';
  readonly selfId: EntityId;
  readonly map: TileMapData;
  /** Jugadores y criaturas dentro del rango de visión (incluido el propio). */
  readonly mobiles: readonly MobileSnapshot[];
  readonly time: WorldTime;
}

export interface JoinRejectedMessage {
  readonly type: 'joinRejected';
  readonly reason: string;
}

/** Un jugador entró en el rango de visión (o al mundo, cerca). */
export interface MobileAppearedMessage {
  readonly type: 'mobileAppeared';
  readonly mobile: MobileSnapshot;
}

/** Un jugador salió del rango de visión (o del mundo). */
export interface MobileDisappearedMessage {
  readonly type: 'mobileDisappeared';
  readonly id: EntityId;
}

export interface MobileMovedMessage {
  readonly type: 'mobileMoved';
  readonly id: EntityId;
  readonly position: Position;
  readonly direction: Direction;
  readonly mode: MoveMode;
}

/** Paso aceptado. `position` es la posición autoritativa tras el paso. */
export interface MoveAckMessage {
  readonly type: 'moveAck';
  readonly seq: number;
  readonly position: Position;
}

/** El servidor rechazó un paso: el cliente debe volver a esta posición. */
export interface MoveRejectedMessage {
  readonly type: 'moveRejected';
  readonly seq: number;
  readonly position: Position;
  readonly direction: Direction;
}

export interface ChatMessage {
  readonly type: 'chat';
  readonly id: EntityId;
  readonly name: string;
  readonly text: string;
  readonly channel: ChatChannel;
}

/** Cambios en los objetos del suelo dentro del rango de visión. */
export interface GroundItemsMessage {
  readonly type: 'groundItems';
  readonly added: readonly GroundItemSnapshot[];
  readonly removed: readonly EntityId[];
}

/** Contenido completo de la mochila y el equipo propios. */
export interface InventoryMessage {
  readonly type: 'inventory';
  readonly backpack: readonly BackpackItemSnapshot[];
  readonly equipment: readonly EquippedItemSnapshot[];
  /** Caja del banco (se puede usar cerca de la banquera). */
  readonly bank: readonly BackpackItemSnapshot[];
}

/** Cambió lo que se ve puesto un jugador. */
export interface PlayerEquipmentMessage {
  readonly type: 'playerEquipment';
  readonly id: EntityId;
  readonly equipment: EquipmentLook;
}

/** Vida, maná y energía propios. */
export interface VitalsMessage {
  readonly type: 'vitals';
  readonly vitals: Vitals;
  readonly dead: boolean;
}

/** Cambió la vida (o murió/resucitó) alguien a la vista. */
export interface MobileHealthMessage {
  readonly type: 'mobileHealth';
  readonly id: EntityId;
  readonly health: number;
  readonly dead: boolean;
}

/** A quién está atacando el jugador (null = a nadie). */
export interface CombatTargetMessage {
  readonly type: 'combatTarget';
  readonly targetId: EntityId | null;
}

/** Un golpe: acertado (con su daño) o fallado. */
export interface SwingMessage {
  readonly type: 'swing';
  readonly attackerId: EntityId;
  readonly targetId: EntityId;
  readonly hit: boolean;
  /** El escudo del objetivo detuvo el golpe. */
  readonly blocked: boolean;
  readonly damage: number;
  /** Disparo a distancia (con arco): se ve la flecha. */
  readonly ranged?: boolean;
}

/** Habilidades propias (en décimas). */
export interface SkillsMessage {
  readonly type: 'skills';
  readonly values: SkillValues;
}

/** Alguien empezó a lanzar un hechizo: se ven sus palabras. */
export interface CastStartMessage {
  readonly type: 'castStart';
  readonly casterId: EntityId;
  readonly spell: SpellKey;
}

/** Un hechizo salió: efecto visual del lanzador al objetivo. */
export interface SpellEffectMessage {
  readonly type: 'spellEffect';
  readonly casterId: EntityId;
  readonly targetId: EntityId;
  readonly spell: SpellKey;
  /** Cuánto curó o dañó (0 si no aplica). */
  readonly amount: number;
  /** La Resistencia mágica del objetivo aguantó parte del hechizo. */
  readonly resisted?: boolean;
}

/** Efectos activos propios (hechizos, pociones, veneno) y atributos con sus cambios. */
export interface EffectsMessage {
  readonly type: 'effects';
  readonly effects: readonly EffectSnapshot[];
  readonly attributes: Attributes;
}

/** Alguien apareció en otro lugar al instante (teletransporte). */
export interface MobileTeleportedMessage {
  readonly type: 'mobileTeleported';
  readonly id: EntityId;
  readonly position: Position;
}

/** La hora del mundo cambió de golpe (un personaje de prueba la movió). */
export interface WorldTimeMessage {
  readonly type: 'worldTime';
  readonly time: WorldTime;
}

/** Cambió la reputación o el gremio de alguien a la vista. */
export interface MobileStatusMessage {
  readonly type: 'mobileStatus';
  readonly id: EntityId;
  readonly notoriety: Notoriety;
  readonly guildTag: string | null;
}

export interface PartyMemberSnapshot {
  readonly id: EntityId;
  readonly name: string;
  readonly health: number;
}

/** Estado social propio: grupo, gremio, invitaciones y reputación. */
export interface SocialMessage {
  readonly type: 'social';
  readonly party: {
    readonly leaderId: EntityId;
    readonly members: readonly PartyMemberSnapshot[];
  } | null;
  readonly guild: {
    readonly name: string;
    readonly tag: string;
    readonly members: readonly string[];
  } | null;
  /** Invitaciones pendientes: nombre de quien invita. */
  readonly invites: { readonly party: string | null; readonly guild: string | null };
  readonly fame: number;
  readonly karma: number;
  readonly murders: number;
  readonly notoriety: Notoriety;
}

export interface SystemMessage {
  readonly type: 'system';
  readonly text: string;
}

export type ServerMessage =
  | WelcomeMessage
  | JoinRejectedMessage
  | MobileAppearedMessage
  | MobileDisappearedMessage
  | MobileMovedMessage
  | MoveAckMessage
  | MoveRejectedMessage
  | ChatMessage
  | GroundItemsMessage
  | InventoryMessage
  | PlayerEquipmentMessage
  | VitalsMessage
  | MobileHealthMessage
  | CombatTargetMessage
  | SwingMessage
  | SkillsMessage
  | CastStartMessage
  | SpellEffectMessage
  | EffectsMessage
  | MobileTeleportedMessage
  | WorldTimeMessage
  | MobileStatusMessage
  | SocialMessage
  | SystemMessage;

export type ServerMessageType = ServerMessage['type'];
