import type { Appearance } from '../domain/character/appearance';
import type { Direction } from '../domain/geometry/direction';
import type { Position } from '../domain/geometry/position';
import type { EquipmentSlot } from '../domain/items/equipment';
import type { ItemKind } from '../domain/items/item-catalog';
import type { Attributes, Vitals } from '../domain/combat/vitals';
import type { EffectSnapshot } from '../domain/magic/effects';
import type { Body } from '../domain/creatures/creature-catalog';
import type { NpcRole } from '../domain/economy/vendors';
import type { MountKind } from '../domain/mounts/mount-catalog';
import type { ContainerLook } from '../domain/world/statics';
import type { ChatChannel, SocialCommand } from '../domain/social/groups';
import type { Notoriety } from '../domain/social/reputation';
import type { SpellKey } from '../domain/magic/spell-catalog';
import type { SkillKey, SkillValues } from '../domain/skills/skill-catalog';
import type { CharacterCreation } from '../domain/character/creation';
import type { ActiveSkill } from '../domain/skills/stealth';
import type { WorldTime } from '../domain/rules/daylight';
import type { MoveMode } from '../domain/rules/movement';
import type { CompactMapData } from '../domain/world/map-codec';
import type { Quest, QuestProgress } from '../domain/quests/quests';
import type { TreasureMark } from '../domain/treasure/treasure';
import type {
  ShipFacing,
  ShipKind,
  ShipLevel,
  ShipOrder,
  ShipSecurity,
} from '../domain/ships/ships';

export type EntityId = string;

/** Lo que se ve puesto un personaje: qué objeto hay en cada lugar del cuerpo. */
export type EquipmentLook = Partial<Readonly<Record<EquipmentSlot, ItemKind>>>;
/** Color teñido de lo que tiene puesto, por lugar (lo que no está, con su color de siempre). */
export type EquipmentHues = Partial<Readonly<Record<EquipmentSlot, number>>>;

/** Lo que un cliente necesita saber de otro jugador para mostrarlo. */
export interface MobileSnapshot {
  readonly id: EntityId;
  readonly name: string;
  /** Colores teñidos de la ropa puesta. */
  readonly hues?: EquipmentHues;
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
  /** Montado: en qué va. */
  readonly mount?: MountKind | null;
  /** Criatura con dueño (invocación o montura suelta): de quién es. */
  readonly ownerId?: EntityId | null;
  /** Jugador en modo guerra: se dibuja en guardia. */
  readonly war?: boolean;
}

export interface ItemSnapshot {
  readonly id: EntityId;
  readonly kind: ItemKind;
  readonly amount: number;
  /** Runa marcada: el lugar que guarda. */
  readonly mark?: RuneMark;
  /** Libro con título: para mostrarlo al pasar el mouse. */
  readonly bookTitle?: string;
  /** Teñido: su color. */
  readonly hue?: number;
  /** Equipo inicial: no se puede tirar, dar ni vender. */
  readonly newbie?: true;
}

/** Lugar grabado en una runa con Marcar. */
export interface RuneMark {
  readonly x: number;
  readonly y: number;
  /** Zona donde se marcó ("Puerto Ceniza", "Tierras salvajes"). */
  readonly label: string;
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
  | { readonly type: 'equipment'; readonly slot: EquipmentSlot }
  /** Adentro de un recipiente: una bolsa (su id) o un mueble (`static:x:y`). */
  | { readonly type: 'container'; readonly containerId: string; readonly position?: Position };

// ── Cliente → Servidor ────────────────────────────────────────────────

export interface JoinRequest {
  readonly type: 'join';
  readonly name: string;
  /** Apariencia para un personaje nuevo; uno guardado conserva la suya. */
  readonly appearance: Appearance;
  /** Contraseña del personaje (el modo solo no la pide). */
  readonly password?: string;
}

/** Entrar a una cuenta (o crearla, con `create`). */
export interface LoginRequest {
  readonly type: 'login';
  readonly account: string;
  /** El modo solo no la pide. */
  readonly password?: string;
  readonly create: boolean;
}

/** Crear un personaje en la cuenta y entrar con él. */
export interface CreateCharacterRequest {
  readonly type: 'createCharacter';
  readonly creation: CharacterCreation;
}

/** Entrar al mundo con un personaje de la cuenta. */
export interface PlayRequest {
  readonly type: 'play';
  readonly name: string;
}

/** Borrar un personaje de la cuenta (para siempre). */
export interface DeleteCharacterRequest {
  readonly type: 'deleteCharacter';
  readonly name: string;
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
  /** Hechizos de viaje: la runa de la mochila. */
  readonly runeId?: EntityId;
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

/** Cavar con la pala en esa posición (buscando un tesoro enterrado). */
export interface DigRequest {
  readonly type: 'dig';
  readonly toolId: EntityId;
  readonly position: Position;
}

/** Una orden al timonel del barco en que se está a bordo. */
export interface ShipOrderRequest {
  readonly type: 'shipOrder';
  readonly shipId: EntityId;
  readonly order: ShipOrder;
}

/** Subir a un barco que está cerca. */
export interface BoardShipRequest {
  readonly type: 'boardShip';
  readonly shipId: EntityId;
}

export type ShipAction = 'panel' | 'fire-port' | 'fire-starboard' | 'repair' | 'dock' | 'hold';

/** Lo demás que se hace en un barco: cañones, reparar, guardarlo, abrir la bodega. */
export interface ShipActionRequest {
  readonly type: 'shipAction';
  readonly shipId: EntityId;
  readonly action: ShipAction;
}

/** Cambios que hace el capitán: permisos y nombre. */
export type ShipSecurityChange =
  | { readonly kind: 'set'; readonly name: string; readonly level: ShipLevel }
  | { readonly kind: 'remove'; readonly name: string }
  | {
      readonly kind: 'default';
      readonly who: 'everyone' | 'party' | 'guild';
      readonly level: ShipLevel;
    }
  | { readonly kind: 'rename'; readonly name: string };

export interface ShipSecurityRequest {
  readonly type: 'shipSecurity';
  readonly shipId: EntityId;
  readonly change: ShipSecurityChange;
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

/**
 * Viajar al instante (solo personajes de prueba): a la boca de la cueva, a la
 * guarida del jefe o a un lugar con nombre (un pueblo, unas ruinas…).
 */
export type TestTravelRequest =
  | { readonly type: 'testTravel'; readonly to: 'cave' | 'lair' }
  | { readonly type: 'testTravel'; readonly to: 'place'; readonly place: string };

/**
 * Activar o desactivar la invulnerabilidad (solo personajes de prueba): el
 * nombre se ve amarillo, como un administrador del juego, y nada le hace daño.
 */
export interface ToggleInvulnerableRequest {
  readonly type: 'toggleInvulnerable';
}

/**
 * Comandos del administrador del juego. Los nombres (de criaturas, objetos,
 * monturas y personas) van como se escriben en el chat: el servidor los
 * busca sin importar mayúsculas ni tildes, y revisa que quien los manda sea
 * administrador.
 */
export type GmCommand =
  /** Hacer aparecer criaturas al lado: salvajes, o que siguen y pelean para el administrador. */
  | {
      readonly kind: 'summon';
      readonly creature: string;
      readonly amount: number;
      readonly tame: boolean;
    }
  | { readonly kind: 'creatures' }
  | { readonly kind: 'item'; readonly item: string; readonly amount: number }
  | { readonly kind: 'mount'; readonly mount: string }
  | { readonly kind: 'slay'; readonly targetId: EntityId }
  | { readonly kind: 'heal'; readonly name?: string; readonly targetId?: EntityId }
  | { readonly kind: 'resurrect'; readonly name?: string; readonly targetId?: EntityId }
  | { readonly kind: 'bring'; readonly name: string }
  | { readonly kind: 'goTo'; readonly name: string }
  | { readonly kind: 'clear'; readonly radius: number }
  | { readonly kind: 'announce'; readonly text: string };

export interface GmRequest {
  readonly type: 'gm';
  readonly command: GmCommand;
}

/** Comprar una montura en la caballeriza. */
export interface BuyMountRequest {
  readonly type: 'buyMount';
  readonly vendorId: EntityId;
  readonly mount: MountKind;
}

/** Subirse a la montura propia (doble clic sobre ella). */
export interface MountRequest {
  readonly type: 'mount';
  readonly petId: EntityId;
}

/** Bajarse de la montura (doble clic sobre uno mismo, o `/desmontar`). */
export interface DismountRequest {
  readonly type: 'dismount';
}

/** Liberar la montura (`/liberar`): se va y deja de ser del jugador. */
export interface ReleasePetRequest {
  readonly type: 'releasePet';
}

/** Entrar o salir del modo guerra (Tab, o el botón Guerra). */
export interface SetWarModeRequest {
  readonly type: 'setWarMode';
  readonly war: boolean;
}

/** Usar una habilidad a propósito (Esconderse, Mirar). */
export interface UseSkillRequest {
  readonly type: 'useSkill';
  readonly skill: ActiveSkill;
}

/** Revisar el cuerpo de una criatura muerta (doble clic). */
export interface OpenCorpseRequest {
  readonly type: 'openCorpse';
  readonly corpseId: EntityId;
}

/** Abrir un mueble que guarda cosas (un cofre, un barril…), con doble clic. */
export interface OpenContainerRequest {
  readonly type: 'openContainer';
  readonly containerId: string;
}

/** Abrir un libro para leerlo (doble clic). */
export interface ReadBookRequest {
  readonly type: 'readBook';
  readonly itemId: EntityId;
}

/** Teñir una prenda propia con la tina de tintura (gasta una tintura). */
export interface DyeRequest {
  readonly type: 'dye';
  readonly itemId: EntityId;
  readonly hue: number;
}

/** Guardar una hoja (y el título) de un libro propio. De a una, para que el mensaje sea chico. */
export interface WriteBookRequest {
  readonly type: 'writeBook';
  readonly itemId: EntityId;
  readonly title: string;
  readonly page: number;
  readonly text: string;
}

/** Hablar con un vecino: puede ofrecer una misión, recibir una carta o pagar una terminada. */
export interface TalkNpcRequest {
  readonly type: 'talkNpc';
  readonly npcId: EntityId;
}

/** Aceptar la misión que ofrece un vecino. */
export interface AcceptQuestRequest {
  readonly type: 'acceptQuest';
  readonly npcId: EntityId;
}

/** Dejar una misión (se nombra por quien la dio). */
export interface AbandonQuestRequest {
  readonly type: 'abandonQuest';
  readonly giver: string;
}

/** Pasar todo lo que hay en un cuerpo a la mochila. */
export interface LootAllRequest {
  readonly type: 'lootAll';
  readonly corpseId: EntityId;
}

/** Abrir o cerrar una puerta (doble clic). */
export interface UseDoorRequest {
  readonly type: 'useDoor';
  readonly position: Position;
}

export interface CraftRequest {
  readonly type: 'craft';
  readonly recipe: string;
}

export type ClientMessage =
  | JoinRequest
  | LoginRequest
  | CreateCharacterRequest
  | PlayRequest
  | DeleteCharacterRequest
  | MoveRequest
  | ChatRequest
  | MoveItemRequest
  | UseItemRequest
  | AttackRequest
  | StopAttackRequest
  | CastSpellRequest
  | UseOnRequest
  | GatherRequest
  | DigRequest
  | ShipOrderRequest
  | BoardShipRequest
  | ShipActionRequest
  | ShipSecurityRequest
  | BuyRequest
  | SellRequest
  | CraftRequest
  | SetHourRequest
  | TestTravelRequest
  | ToggleInvulnerableRequest
  | GmRequest
  | OpenContainerRequest
  | ReadBookRequest
  | TalkNpcRequest
  | AcceptQuestRequest
  | AbandonQuestRequest
  | WriteBookRequest
  | DyeRequest
  | OpenCorpseRequest
  | LootAllRequest
  | BuyMountRequest
  | MountRequest
  | DismountRequest
  | ReleasePetRequest
  | UseSkillRequest
  | SetWarModeRequest
  | UseDoorRequest
  | SocialRequest;

// ── Servidor → Cliente ────────────────────────────────────────────────

export interface WelcomeMessage {
  readonly type: 'welcome';
  readonly selfId: EntityId;
  /** El mapa completo, compacto (ver `encodeMap`). */
  readonly map: CompactMapData;
  /** Jugadores y criaturas dentro del rango de visión (incluido el propio). */
  readonly mobiles: readonly MobileSnapshot[];
  readonly time: WorldTime;
  /** Las puertas que están abiertas (las demás, cerradas). */
  readonly openDoors?: readonly Position[];
}

/** Una puerta se abrió o se cerró. */
export interface DoorMessage {
  readonly type: 'door';
  readonly position: Position;
  readonly open: boolean;
}

/** Un personaje de la cuenta, como se ve en la lista para elegir. */
export interface CharacterSummary {
  readonly name: string;
  readonly appearance: Appearance;
  /** Sus tres mejores habilidades (en décimas). */
  readonly topSkills: readonly { readonly skill: SkillKey; readonly value: number }[];
}

/** Entró a la cuenta (o cambió la lista de personajes). */
export interface AccountMessage {
  readonly type: 'account';
  readonly name: string;
  readonly characters: readonly CharacterSummary[];
  /** Cuántos personajes entran. */
  readonly slots: number;
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
  readonly hues?: EquipmentHues;
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

/** Alguien se subió (o se bajó, con `mount` null) de una montura. */
export interface MountChangedMessage {
  readonly type: 'mountChanged';
  readonly id: EntityId;
  readonly mount: MountKind | null;
}

/**
 * Alguien entró o salió del modo guerra (para dibujarlo en guardia). Al
 * propio jugador también le llega; `auto` cuando fue porque lo atacaron.
 */
export interface WarModeChangedMessage {
  readonly type: 'warModeChanged';
  readonly id: EntityId;
  readonly war: boolean;
  readonly auto?: boolean;
}

/** El jugador se escondió o lo descubrieron (solo a él: los demás dejan de verlo o lo ven aparecer). */
export interface HiddenChangedMessage {
  readonly type: 'hiddenChanged';
  readonly hidden: boolean;
}

/** Lo que hay en un cuerpo que el jugador está revisando (se reenvía cuando cambia). */
export interface CorpseMessage {
  readonly type: 'corpse';
  readonly corpseId: EntityId;
  /** "lobo gris", "dragón rojo"… */
  readonly name: string;
  readonly items: readonly BackpackItemSnapshot[];
}

/** Lo que hay en un recipiente abierto (se reenvía cuando cambia). */
export interface ContainerMessage {
  readonly type: 'container';
  readonly containerId: string;
  /** "cofre", "bolsa"… */
  readonly name: string;
  readonly look: ContainerLook;
  readonly items: readonly BackpackItemSnapshot[];
}

/** Un libro abierto: lo que tiene escrito y si se puede escribir. */
export interface BookMessage {
  readonly type: 'book';
  readonly itemId: EntityId;
  readonly title: string;
  readonly author: string;
  readonly pages: readonly string[];
  readonly writable: boolean;
}

/** Un barco tal como lo ven los demás. */
export interface ShipSnapshot {
  readonly id: EntityId;
  readonly kind: ShipKind;
  readonly x: number;
  readonly y: number;
  readonly facing: ShipFacing;
  readonly name: string;
  readonly owner: string;
  readonly hits: number;
  readonly maxHits: number;
}

/** Los barcos que se ven (todos: los que faltan ya no se ven). */
export interface ShipsMessage {
  readonly type: 'ships';
  readonly ships: readonly ShipSnapshot[];
}

/** Un barco avanzó o viró. */
export interface ShipMovedMessage {
  readonly type: 'shipMoved';
  readonly id: EntityId;
  readonly x: number;
  readonly y: number;
  readonly facing: ShipFacing;
}

/** La ventana del barco: el permiso de quien la abre y, si es capitán, los permisos. */
export interface ShipPanelMessage {
  readonly type: 'shipPanel';
  readonly shipId: EntityId;
  readonly level: ShipLevel;
  readonly security?: ShipSecurity;
}

/** Un cañonazo: de dónde a dónde voló la bala y si dio en algo. */
export interface CannonShotMessage {
  readonly type: 'cannonShot';
  readonly from: Position;
  readonly to: Position;
  readonly hit: boolean;
}

/** Un mapa del tesoro abierto: dónde está marcado el cofre. */
export interface TreasureMapMessage {
  readonly type: 'treasureMap';
  readonly itemId: EntityId;
  readonly name: string;
  readonly mark: TreasureMark;
  /** "al noreste de Puerto Ceniza". */
  readonly hint: string;
}

/** Un vecino ofrece una misión: se acepta o no. */
export interface QuestOfferMessage {
  readonly type: 'questOffer';
  readonly npcId: EntityId;
  readonly quest: Quest;
}

/** Las misiones aceptadas, con lo que se lleva hecho (se reenvía cuando cambia). */
export interface QuestsMessage {
  readonly type: 'quests';
  readonly quests: readonly QuestProgress[];
}

/** El recipiente ya no se puede ver (el jugador se alejó o se lo llevaron). */
export interface ContainerClosedMessage {
  readonly type: 'containerClosed';
  readonly containerId: string;
}

/** El cuerpo ya no se puede revisar (se deshizo o el jugador se alejó). */
export interface CorpseClosedMessage {
  readonly type: 'corpseClosed';
  readonly corpseId: EntityId;
}

export interface SystemMessage {
  readonly type: 'system';
  readonly text: string;
  /** Avisos con su color, como en UO: subió una habilidad o un atributo. */
  readonly tone?: 'skill' | 'stat';
}

export type ServerMessage =
  | WelcomeMessage
  | ContainerMessage
  | ContainerClosedMessage
  | BookMessage
  | TreasureMapMessage
  | ShipsMessage
  | ShipMovedMessage
  | ShipPanelMessage
  | CannonShotMessage
  | QuestOfferMessage
  | QuestsMessage
  | JoinRejectedMessage
  | AccountMessage
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
  | CorpseMessage
  | CorpseClosedMessage
  | MountChangedMessage
  | HiddenChangedMessage
  | WarModeChangedMessage
  | DoorMessage
  | SystemMessage;

export type ServerMessageType = ServerMessage['type'];
