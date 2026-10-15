import {
  effectiveMoveMode,
  type Direction,
  type EntityId,
  type MobileMovedMessage,
  type MobileTeleportedMessage,
  type MoveMode,
  type Position,
} from '@fenix/shared';
import type { Player } from '../../domain/player';
import type { World } from '../../domain/world';
import type { ItemNotifications } from '../item-notifications';
import type { MobileNotifications } from '../mobile-notifications';
import type { Clock, Notifier } from '../ports';

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
  ) {}

  execute({ playerId, direction, mode, seq }: MovePlayerInput): void {
    const player = this.world.get(playerId);
    if (!player) return;

    const before = this.idsNear(player);
    const groundBefore = new Set(this.notifications.groundSnapshotsNear(playerId).map((i) => i.id));
    // Sin energía no se puede correr: el paso cuenta como caminata (el cliente aplica la misma regla).
    const effectiveMode = effectiveMoveMode(mode, player.combat.current.stamina);
    const outcome = player.tryMove(this.world.map, direction, effectiveMode, this.clock.now());
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
    if (effectiveMode === 'run' && player.registerRunStep()) this.mobiles.sendVitals(player);
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
    const destination = this.world.map.teleportAt(player.position);
    if (destination) this.teleport(player, destination);
  }

  /** Mueve al jugador al instante (teletransporte) y avisa a todos, incluido él. */
  teleport(player: Player, position: Position): void {
    const before = this.idsNear(player);
    const groundBefore = new Set(
      this.notifications.groundSnapshotsNear(player.id).map((i) => i.id),
    );
    player.teleport(position);
    const message = { type: 'mobileTeleported', id: player.id, position } as const;
    this.notifier.send(player.id, message);
    this.updateVisibility(player, before, message);
    this.notifications.sendGroundDiff(
      player.id,
      groundBefore,
      this.notifications.groundSnapshotsNear(player.id),
    );
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

    this.notifier.sendMany(stayed.filter(isPlayer), moved);
    this.notifier.sendMany(entered.filter(isPlayer), {
      type: 'mobileAppeared',
      mobile: this.world.snapshotOf(player),
    });
    this.notifier.sendMany(left.filter(isPlayer), { type: 'mobileDisappeared', id: player.id });

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

  private idsNear(player: Player): Set<EntityId> {
    return new Set(this.world.mobilesNear(player.position, { except: player.id }).map((m) => m.id));
  }
}
