import { effectiveMoveMode } from '@fenix/shared/combat/combat-rules';
import { type Direction, step } from '@fenix/shared/geometry/direction';
import { type Position, tileDistance } from '@fenix/shared/geometry/position';
import { encumbrance, maxWeight } from '@fenix/shared/items/weight';
import type {
  EntityId,
  MobileMovedMessage,
  MobileTeleportedMessage,
} from '@fenix/shared/protocol/messages';
import type { MoveMode } from '@fenix/shared/rules/movement';
import { freeSpotNear } from '../../../domain/persistence/saved-character';
import type { Player } from '../../../domain/player';
import type { World } from '../../../domain/world';
import type { Guards } from '../../kernel/guards';
import type { GameServices } from '../../kernel/services';
import type { ItemNotifications } from '../../kernel/item-notifications';
import type { MobileNotifications } from '../../kernel/mobile-notifications';
import type { Clock, Notifier } from '../../ports';

/** Hasta qué distancia la montura suelta acompaña un teletransporte. */
const PET_TRAVEL_RANGE = 8;

export interface MovePlayerInput {
  readonly playerId: EntityId;
  readonly direction: Direction;
  readonly mode: MoveMode;
  readonly seq: number;
}

export class MovePlayer {
  constructor(
    private readonly world: World,
    private readonly clock: Clock,
    private readonly notifier: Notifier,
    private readonly notifications: ItemNotifications,
    private readonly mobiles: MobileNotifications,
    /** Reglas de otros módulos que niegan un paso (subir a un barco ajeno). */
    private readonly guards: Guards<[player: Player, from: Position, to: Position]>,
    /** Portales abiertos con el hechizo Portal. */
    private readonly portals?: Pick<GameServices['portals'], 'destinationFrom'>,
    /** Escondido: cada paso gasta Sigilo (o lo descubre). */
    private readonly stealth?: Pick<GameServices['stealth'], 'step'>,
  ) {}

  execute({ playerId, direction, mode, seq }: MovePlayerInput): void {
    const player = this.world.get(playerId);
    if (!player) return;

    const before = this.idsNear(player);
    const groundBefore = new Set(this.notifications.groundSnapshotsNear(playerId).map((i) => i.id));
    // Sin energía no se puede correr: el paso cuenta como caminata (el cliente aplica la misma regla).
    // Montado corre la montura: no gasta la energía del jinete.
    // Con más peso del que aguanta su Fuerza no corre, cada paso lo cansa y,
    // muy cargado (o sin energía), no se mueve: la misma regla que aplica el cliente.
    const load =
      player.mount || player.unburdened
        ? encumbrance(0, 1)
        : encumbrance(player.carried, maxWeight(player.combat.attributes.strength));
    const stamina = player.combat.current.stamina;
    const stuck = !load.canMove
      ? 'Llevás demasiado peso: no podés moverte.'
      : load.stepStamina > 0 && stamina <= 0
        ? 'Estás demasiado cansado para moverte con tanto peso.'
        : null;
    if (stuck) {
      this.notifier.send(playerId, { type: 'system', text: stuck });
      this.notifier.send(playerId, {
        type: 'moveRejected',
        seq,
        position: player.position,
        direction: player.direction,
      });
      return;
    }
    const effectiveMode = player.mount ? mode : effectiveMoveMode(mode, stamina, load.canRun);
    const refused = this.guards.refusal(player, player.position, step(player.position, direction));
    if (refused) this.notifier.send(playerId, { type: 'system', text: refused });
    const outcome = refused
      ? { ok: false as const }
      : player.tryMove(this.world.map, direction, effectiveMode, this.clock.now());
    if (!outcome.ok) {
      this.notifier.send(playerId, {
        type: 'moveRejected',
        seq,
        position: player.position,
        direction: player.direction,
      });
      return;
    }

    this.notifier.send(playerId, { type: 'moveAck', seq, position: player.position });
    this.stealth?.step(player, effectiveMode === 'run');
    if (effectiveMode === 'run' && !player.mount && player.registerRunStep())
      this.mobiles.sendVitals(player);
    if (load.stepStamina > 0) {
      player.combat.spendStamina(load.stepStamina);
      this.mobiles.sendVitals(player);
    }
    this.updateVisibility(player, before, {
      type: 'mobileMoved',
      id: player.id,
      position: player.position,
      direction: player.direction,
      mode: effectiveMode,
    });
    this.notifications.sendGroundDiff(
      playerId,
      groundBefore,
      this.notifications.groundSnapshotsNear(playerId),
    );
    // Entrada o salida de una mazmorra: al pisar el tile, aparece del otro lado.
    // Lo mismo al pisar un portal abierto con el hechizo.
    const destination =
      this.world.map.teleportAt(player.position) ?? this.portals?.destinationFrom(player.position);
    if (destination) this.teleport(player, destination);
  }

  /** Mueve al jugador al instante (teletransporte) y avisa a todos, incluido él. */
  teleport(player: Player, position: Position): void {
    const before = this.idsNear(player);
    const groundBefore = new Set(
      this.notifications.groundSnapshotsNear(player.id).map((i) => i.id),
    );
    const from = player.position;
    player.teleport(position);
    const message = { type: 'mobileTeleported', id: player.id, position } as const;
    this.notifier.send(player.id, message);
    this.updateVisibility(player, before, message);
    this.notifications.sendGroundDiff(
      player.id,
      groundBefore,
      this.notifications.groundSnapshotsNear(player.id),
    );
    this.bringPet(player, from);
  }

  /** La montura suelta que venía cerca viaja con su dueño (por ejemplo, al entrar a una cueva). */
  private bringPet(player: Player, from: Position): void {
    const pet = this.world.petOf(player.id);
    if (!pet || tileDistance(pet.position, from) > PET_TRAVEL_RANGE) return;
    this.mobiles.disappear(pet);
    pet.position = freeSpotNear(this.world, player.position);
    this.mobiles.appear(pet);
  }

  /**
   * Quienes seguían viendo al jugador reciben el paso; quienes entran o salen
   * del rango de visión lo ven aparecer o desaparecer, y viceversa.
   */
  private updateVisibility(
    player: Player,
    before: Set<EntityId>,
    moved: MobileMovedMessage | MobileTeleportedMessage,
  ): void {
    const after = this.idsNear(player);
    const stayed = [...after].filter((id) => before.has(id));
    const entered = [...after].filter((id) => !before.has(id));
    const left = [...before].filter((id) => !after.has(id));
    // Solo los jugadores reciben mensajes; el que se movió ve aparecer o desaparecer a todos.
    const isPlayer = (id: EntityId): boolean => this.world.get(id) !== undefined;

    // Escondido, los demás no se enteran de que se movió.
    if (!player.hidden) {
      this.notifier.sendMany(stayed.filter(isPlayer), moved);
      this.notifier.sendMany(entered.filter(isPlayer), {
        type: 'mobileAppeared',
        mobile: this.world.snapshotOf(player),
      });
      this.notifier.sendMany(left.filter(isPlayer), { type: 'mobileDisappeared', id: player.id });
    }

    for (const id of entered) {
      const other = this.world.getMobile(id);
      if (other)
        this.notifier.send(player.id, {
          type: 'mobileAppeared',
          mobile: this.world.snapshotOf(other),
        });
    }
    for (const id of left) this.notifier.send(player.id, { type: 'mobileDisappeared', id });
  }

  /** Los que están a la vista (los escondidos no se ven). */
  private idsNear(player: Player): Set<EntityId> {
    return new Set(
      this.world
        .mobilesNear(player.position, { except: player.id })
        .filter((m) => !this.world.isHidden(m))
        .map((m) => m.id),
    );
  }
}
