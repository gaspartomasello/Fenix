import { validateCharacterName, type Appearance, type EntityId } from '@fenix/shared';
import { STARTING_KIT } from '../../domain/items/starting-kit';
import { restoreCharacter } from '../../domain/persistence/saved-character';
import { Player } from '../../domain/player';
import type { WorldClock } from '../../domain/world-clock';
import type { World } from '../../domain/world';
import type { CharacterPersistence } from '../character-persistence';
import type { ItemNotifications } from '../item-notifications';
import type { Clock, IdGenerator, Notifier, RandomSource } from '../ports';

export interface JoinWorldInput {
  readonly name: string;
  readonly appearance: Appearance;
  readonly password?: string | undefined;
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
    private readonly notifications: ItemNotifications,
    private readonly persistence: CharacterPersistence,
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
      return { ok: false, reason: 'Ese personaje ya está en el mundo.' };
    }
    const auth = this.persistence.authenticate(validation.name, input.password);
    if (!auth.ok) return auth;

    const random = (): number => this.random.next();
    const player = auth.saved
      ? restoreCharacter(auth.saved, this.world, () => this.ids.next(), random, this.clock.now())
      : this.createCharacter(validation.name, input.appearance, random);
    this.persistence.register(player, auth.passwordHash);
    return { ok: true, playerId: player.id };
  }

  /** Personaje nuevo: aparece en el pueblo con el equipo inicial. */
  private createCharacter(name: string, appearance: Appearance, random: () => number): Player {
    const player = this.world.spawn({ id: this.ids.next(), name, appearance }, random);
    for (const { kind, amount } of STARTING_KIT) {
      this.world.items.add(this.ids.next(), kind, amount, {
        type: 'backpack',
        ownerId: player.id,
        position: { x: 0, y: 0 },
      });
    }
    this.arrangeBackpack(player.id);
    return player;
  }

  /** Envía el estado inicial al nuevo jugador y lo muestra a quienes están cerca. */
  announce(playerId: EntityId): void {
    const player = this.world.get(playerId);
    if (!player) return;
    const nearby = this.world.mobilesNear(player.position, { except: playerId });
    const nearbyPlayers = nearby.filter((m) => m instanceof Player);

    this.notifier.send(playerId, {
      type: 'welcome',
      selfId: playerId,
      map: this.world.map.toData(),
      mobiles: [player, ...nearby].map((m) => this.world.snapshotOf(m)),
      time: this.worldClock.timeAt(this.clock.now()),
    });
    this.notifications.sendInventory(playerId);
    this.notifications.sendGroundDiff(
      playerId,
      new Set(),
      this.notifications.groundSnapshotsNear(playerId),
    );
    this.notifier.sendMany(
      nearbyPlayers.map((p) => p.id),
      { type: 'mobileAppeared', mobile: this.world.snapshotOf(player) },
    );
    this.notifier.broadcast(
      { type: 'system', text: `${player.name} entró al mundo.` },
      { except: playerId },
    );
  }

  /** Acomoda el kit inicial en la grilla de la mochila. */
  private arrangeBackpack(ownerId: EntityId): void {
    this.world.items.backpackOf(ownerId).forEach((item, index) => {
      item.location = {
        type: 'backpack',
        ownerId,
        position: { x: (index % 5) * 44, y: Math.floor(index / 5) * 44 },
      };
    });
  }
}
