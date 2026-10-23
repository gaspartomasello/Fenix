import {
  DEFAULT_APPEARANCE,
  ITEMS,
  STARTING_BANK_GOLD,
  creationSkills,
  encodeMap,
  startingClothes,
  startingKit,
  validateCharacterName,
  type Appearance,
  type CharacterCreation,
  type EntityId,
} from '@fenix/shared';
import { STARTING_KIT } from '../../domain/items/starting-kit';
import { emptyChanges } from '../../domain/items/items';
import { bagReagents } from '../../domain/items/reagent-bag';
import { equipTestCharacter, isTestCharacter } from '../../domain/testing/test-character';
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

/** La cuenta con la que se entra: su nombre y el hash de su contraseña. */
export interface JoinAccount {
  readonly name: string;
  readonly passwordHash: string | null;
}

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
    /** Nombres de los personajes de prueba (todo al máximo); vacío en un servidor normal. */
    private readonly testCharacters: readonly string[] = [],
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
    if (isTestCharacter(player.name, this.testCharacters)) {
      equipTestCharacter(player, this.world, () => this.ids.next());
      this.dress(player, false);
    }
    return { ok: true, playerId: player.id };
  }

  /** Entra con un personaje de la cuenta (uno sin guardar se crea con lo de siempre). */
  enter(name: string, account: JoinAccount): JoinWorldResult {
    const problem = this.roomFor(name);
    if (problem) return { ok: false, reason: problem };
    const saved = this.persistence.find(name);
    const random = (): number => this.random.next();
    const player = saved
      ? restoreCharacter(saved, this.world, () => this.ids.next(), random, this.clock.now())
      : this.createCharacter(name, undefined, random);
    return this.admit(player, account);
  }

  /**
   * Crea un personaje como en UO: atributos repartidos, cuatro habilidades
   * elegidas (60, 60, 50 y 50) y el equipo que corresponde, todo "de equipo
   * inicial" (no se pierde ni se da); además, oro en el banco.
   */
  create(creation: CharacterCreation, account: JoinAccount): JoinWorldResult {
    const problem = this.roomFor(creation.name);
    if (problem) return { ok: false, reason: problem };
    if (this.persistence.find(creation.name))
      return { ok: false, reason: 'Ya existe un personaje con ese nombre.' };
    const player = this.world.spawn(
      {
        id: this.ids.next(),
        name: creation.name,
        appearance: creation.appearance,
        skills: creationSkills(creation.skills),
        attributes: creation.attributes,
      },
      () => this.random.next(),
    );
    const owner = { type: 'backpack', ownerId: player.id, position: { x: 0, y: 0 } } as const;
    for (const { kind, amount } of startingKit(creation.skills)) {
      const item = this.world.items.add(this.ids.next(), kind, amount, owner);
      item.newbie = true;
    }
    // Los reactivos, en su bolsa (como en UO).
    bagReagents(player, this.world, () => this.ids.next(), emptyChanges(), true);
    this.arrangeBackpack(player.id);
    // Se pone lo que se viste y se empuña (armas, armadura, escudo, capa), como en UO.
    for (const item of this.world.items.backpackOf(player.id)) {
      const slot = ITEMS[item.kind].slot;
      if (!slot || ITEMS[item.kind].light) continue;
      const taken = this.world.items
        .equipmentOf(player.id)
        .some((i) => i.location.type === 'equipment' && i.location.slot === slot);
      if (!taken)
        this.world.items.move(player, item.id, { type: 'equipment', slot }, this.world.map);
    }
    this.dress(player, true);
    this.world.items.add(this.ids.next(), 'gold', STARTING_BANK_GOLD, {
      type: 'bank',
      ownerId: player.id,
      position: { x: 0, y: 0 },
    });
    return this.admit(player, account);
  }

  /** Por qué no puede entrar ese personaje ahora (null: puede). */
  private roomFor(name: string): string | null {
    if (this.world.isFull()) return 'El servidor está lleno.';
    if (this.world.isNameTaken(name)) return 'Ese personaje ya está en el mundo.';
    return null;
  }

  private admit(player: Player, account: JoinAccount): JoinWorldResult {
    this.persistence.register(player, account.passwordHash, account.name);
    if (isTestCharacter(player.name, this.testCharacters)) {
      equipTestCharacter(player, this.world, () => this.ids.next());
      this.dress(player, false);
    }
    return { ok: true, playerId: player.id };
  }

  /** Personaje nuevo: aparece en el pueblo con el equipo inicial. */
  private createCharacter(
    name: string,
    appearance: Appearance | undefined,
    random: () => number,
  ): Player {
    const player = this.world.spawn(
      { id: this.ids.next(), name, appearance: appearance ?? DEFAULT_APPEARANCE },
      random,
    );
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

  /**
   * Viste al personaje nuevo con su ropa (sin ella se le vería la ropa
   * interior), donde no tenga ya algo puesto (una pechera del equipo inicial).
   */
  private dress(player: Player, newbie: boolean): void {
    const worn = new Set(
      this.world.items
        .equipmentOf(player.id)
        .flatMap((i) => (i.location.type === 'equipment' ? [i.location.slot] : [])),
    );
    for (const { kind, slot, hue } of startingClothes(player.appearance)) {
      if (worn.has(slot)) continue;
      const item = this.world.items.add(this.ids.next(), kind, 1, {
        type: 'equipment',
        ownerId: player.id,
        slot,
      });
      if (hue !== undefined) item.hue = hue;
      if (newbie) item.newbie = true;
    }
  }

  /** Envía el estado inicial al nuevo jugador y lo muestra a quienes están cerca. */
  announce(playerId: EntityId): void {
    const player = this.world.get(playerId);
    if (!player) return;
    const nearby = this.world
      .mobilesNear(player.position, { except: playerId })
      .filter((m) => !this.world.isHidden(m));
    const nearbyPlayers = nearby.filter((m) => m instanceof Player);

    this.notifier.send(playerId, {
      type: 'welcome',
      selfId: playerId,
      map: encodeMap(this.world.map.toData()),
      mobiles: [player, ...nearby].map((m) => this.world.snapshotOf(m)),
      time: this.worldClock.timeAt(this.clock.now()),
      openDoors: this.world.map.openDoorPositions(),
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
    if (isTestCharacter(player.name, this.testCharacters))
      this.notifier.send(playerId, {
        type: 'system',
        text: 'Personaje de prueba: habilidades y atributos al máximo y reactivos de sobra.',
      });
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
