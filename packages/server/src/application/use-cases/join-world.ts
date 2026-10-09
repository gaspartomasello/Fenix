import { validateCharacterName, type Appearance, type EntityId } from '@fenix/shared';
import type { WorldClock } from '../../domain/world-clock';
import type { World } from '../../domain/world';
import type { Clock, IdGenerator, Notifier, RandomSource } from '../ports';

export interface JoinWorldInput {
  readonly name: string;
  readonly appearance: Appearance;
}

export type JoinWorldResult = { ok: true; playerId: EntityId } | { ok: false; reason: string };

export class JoinWorld {
  constructor(
    private readonly world: World,
    private readonly worldClock: WorldClock,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly random: RandomSource,
    private readonly notifier: Notifier,
  ) {}

  /**
   * Crea el personaje en el mundo. Si tiene éxito, el llamador debe asociar
   * la conexión al `playerId` antes de llamar a `announce`.
   */
  execute(input: JoinWorldInput): JoinWorldResult {
    const validation = validateCharacterName(input.name);
    if (!validation.ok) return { ok: false, reason: validation.reason };
    if (this.world.isFull()) return { ok: false, reason: 'El servidor está lleno.' };
    if (this.world.isNameTaken(validation.name)) {
      return { ok: false, reason: 'Ese nombre ya está en uso.' };
    }

    const player = this.world.spawn(
      { id: this.ids.next(), name: validation.name, appearance: input.appearance },
      () => this.random.next(),
    );
    return { ok: true, playerId: player.id };
  }

  /** Envía el estado inicial al nuevo jugador y lo muestra a quienes están cerca. */
  announce(playerId: EntityId): void {
    const player = this.world.get(playerId);
    if (!player) return;
    const nearby = this.world.playersNear(player.position, { except: playerId });

    this.notifier.send(playerId, {
      type: 'welcome',
      selfId: playerId,
      map: this.world.map.toData(),
      players: [player, ...nearby].map((p) => p.toSnapshot()),
      time: this.worldClock.timeAt(this.clock.now()),
    });
    this.notifier.sendMany(
      nearby.map((p) => p.id),
      { type: 'playerAppeared', player: player.toSnapshot() },
    );
    this.notifier.broadcast(
      { type: 'system', text: `${player.name} entró al mundo.` },
      { except: playerId },
    );
  }
}
