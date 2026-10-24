import { VENDORS } from '@fenix/shared/economy/vendors';
import { tileDistance, type Position } from '@fenix/shared/geometry/position';
import { ITEMS, type ItemKind } from '@fenix/shared/items/item-catalog';
import type { EntityId } from '@fenix/shared/protocol/messages';
import {
  LOCKPICK_BREAK_CHANCE,
  STEAL_COOLDOWN_MS,
  STEAL_MAX_STACK,
  THIEF_RANGE,
  pickChance,
  snoopChance,
  stealChance,
} from '@fenix/shared/skills/thievery';
import { emptyChanges } from '../../../domain/items/items';
import { Npc } from '../../../domain/npcs/npc';
import { Player } from '../../../domain/player';
import type { World } from '../../../domain/world';
import type { ItemNotifications } from '../../kernel/item-notifications';
import type { MobileNotifications } from '../../kernel/mobile-notifications';
import type { Clock, IdGenerator, Notifier, RandomSource } from '../../ports';
import type { SocialNotifications } from '../../kernel/social-notifications';
import type { GameServices } from '../../kernel/services';

/** Cuánto vale "haber fisgoneado" a alguien para después robarle. */
const SNOOP_MEMORY_MS = 2 * 60 * 1000;

/**
 * El oficio del ladrón, como en UO:
 * - Forzar cerraduras: con una ganzúa, abrir un cofre cerrado con llave
 *   (los de las ruinas y casas abandonadas, y algunos de los pueblos). Al
 *   fallar, a veces se rompe la ganzúa.
 * - Fisgonear: mirar sin permiso la mochila de alguien que está al lado. Si
 *   te pescan, quedás como criminal.
 * - Robar: sacarle algo chico de la mochila (a un vecino, su bolsa de
 *   monedas o algo de su oficio). Si te descubren, criminal; los guardias
 *   del pueblo se encargan. Fisgonear antes o estar escondido ayuda.
 * Las probabilidades están en `@fenix/shared` (thievery).
 */
export class Thievery {
  /** Quién fisgoneó a quién, y cuándo. */
  private readonly snooped = new Map<string, number>();
  /** Hasta cuándo cada víctima queda alerta (no se le puede volver a robar). */
  private readonly alert = new Map<EntityId, number>();
  constructor(
    private readonly world: World,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly random: RandomSource,
    /** Las cerraduras de los cofres. */
    private readonly containers: GameServices['containers'],
    /** Descubrir al ladrón escondido. */
    private readonly stealth: GameServices['stealth'],
    private readonly items: ItemNotifications,
    private readonly mobiles: MobileNotifications,
    private readonly social: SocialNotifications,
    private readonly notifier: Notifier,
  ) {}

  /** Forzar la cerradura del cofre que está en `position`, con la ganzúa `toolId`. */
  pickLock(playerId: EntityId, toolId: EntityId, position: Position): void {
    const player = this.world.get(playerId);
    if (!player || player.combat.isDead) return;
    const tool = this.world.items.get(toolId);
    if (
      !tool ||
      tool.kind !== 'lockpick' ||
      tool.location.type !== 'backpack' ||
      tool.location.ownerId !== playerId
    )
      return this.say(player, 'Necesitás una ganzúa en la mochila.');
    if (tileDistance(player.position, position) > THIEF_RANGE)
      return this.say(player, 'Acercate al cofre para forzar la cerradura.');
    const containerId = `static:${position.x}:${position.y}`;
    const name = this.containers.describe(containerId);
    if (!name) return this.say(player, 'Ahí no hay ninguna cerradura.');
    const difficulty = this.containers.lockOf(containerId);
    if (difficulty === 0) return this.say(player, `${capitalize(name)} no está cerrado con llave.`);
    const skill = player.skills.get('lockpicking');
    this.practice(player, 'lockpicking');
    if (this.roll() < pickChance(skill, difficulty)) {
      this.containers.unlock(containerId);
      return this.say(player, `¡Clic! La cerradura de ${name} cedió.`);
    }
    if (this.roll() < LOCKPICK_BREAK_CHANCE) {
      const changes = emptyChanges();
      this.world.items.consumeFromBackpack(playerId, 'lockpick', 1, changes);
      this.items.publish(changes, player.id);
      return this.say(player, 'La ganzúa se rompió dentro de la cerradura.');
    }
    this.say(player, 'La cerradura no cede.');
  }

  /** Fisgonear la mochila de alguien que está al lado. */
  snoop(playerId: EntityId, targetId: EntityId): void {
    const player = this.world.get(playerId);
    const victim = this.victim(player, targetId);
    if (!player || !victim) return;
    this.practice(player, 'snooping');
    if (this.roll() >= snoopChance(player.skills.get('snooping'))) {
      this.caught(player, victim, `${victim.name} te pescó fisgoneando en su mochila.`);
      if (victim instanceof Player)
        this.notifier.send(victim.id, {
          type: 'system',
          text: `${player.name} está fisgoneando en tu mochila.`,
        });
      return;
    }
    this.snooped.set(this.key(player.id, victim.id), this.clock.now());
    const seen = this.pocketOf(victim).map((p) => this.describe(p.kind, p.amount));
    this.say(
      player,
      seen.length > 0
        ? `En la mochila de ${victim.name} ves: ${seen.join(', ')}.`
        : `La mochila de ${victim.name} está vacía.`,
    );
  }

  /** Robarle algo chico a alguien que está al lado. */
  steal(playerId: EntityId, targetId: EntityId): void {
    const player = this.world.get(playerId);
    const victim = this.victim(player, targetId);
    if (!player || !victim) return;
    const now = this.clock.now();
    if ((this.alert.get(victim.id) ?? 0) > now)
      return this.say(player, `${victim.name} está atento: mejor esperar un rato.`);
    const snooped =
      now - (this.snooped.get(this.key(player.id, victim.id)) ?? -Infinity) <= SNOOP_MEMORY_MS;
    const chance = stealChance(player.skills.get('stealing'), snooped, player.hidden !== null);
    this.practice(player, 'stealing');
    this.alert.set(victim.id, now + STEAL_COOLDOWN_MS);
    if (this.roll() >= chance) {
      this.caught(player, victim, `¡${victim.name} te descubrió robando!`);
      if (victim instanceof Player)
        this.notifier.send(victim.id, { type: 'system', text: `¡${player.name} intentó robarte!` });
      return;
    }
    const loot = this.take(player, victim);
    if (!loot) return this.say(player, `No encontraste nada que llevarte de ${victim.name}.`);
    this.say(player, `Le robaste ${this.describe(loot.kind, loot.amount)} a ${victim.name}.`);
  }

  /** A quién se fisgonea o se roba: una persona viva al lado (no uno mismo ni los guardias). */
  private victim(player: Player | undefined, targetId: EntityId): Player | Npc | null {
    if (!player) return null;
    if (player.combat.isDead) {
      this.say(player, 'Los fantasmas no pueden hacer eso.');
      return null;
    }
    const target = this.world.get(targetId) ?? this.world.getNpc(targetId);
    if (!target || target.id === player.id) {
      this.say(player, 'Elegí a una persona.');
      return null;
    }
    if (target instanceof Npc && target.role === 'guard') {
      this.say(player, 'Robarle a un guardia es buscarse la horca.');
      return null;
    }
    if (target instanceof Player && target.combat.isDead) return null;
    if (tileDistance(player.position, target.position) > THIEF_RANGE) {
      this.say(player, `Tenés que estar al lado de ${target.name}.`);
      return null;
    }
    return target;
  }

  /** Lo que lleva encima: la mochila de un jugador, o lo de un vecino (sus monedas y algo de su oficio). */
  private pocketOf(victim: Player | Npc): { id?: EntityId; kind: ItemKind; amount: number }[] {
    if (victim instanceof Player)
      return this.world.items
        .backpackOf(victim.id)
        .filter((i) => !i.newbie && !ITEMS[i.kind].capacity)
        .map((i) => ({ id: i.id, kind: i.kind, amount: i.amount }));
    const h = hash(victim.id);
    const pocket: { kind: ItemKind; amount: number }[] = [{ kind: 'gold', amount: 5 + (h % 40) }];
    const wares = VENDORS[victim.role].sells.filter((o) => o.price > 0 && o.price <= 60);
    const ware = wares[h % Math.max(1, wares.length)];
    if (ware) pocket.push({ kind: ware.kind, amount: 1 });
    return pocket;
  }

  /** Pasa a la mochila del ladrón algo al azar de lo que lleva la víctima. */
  private take(player: Player, victim: Player | Npc): { kind: ItemKind; amount: number } | null {
    const pocket = this.pocketOf(victim);
    const pick = pocket[Math.floor(this.roll() * pocket.length)];
    if (!pick) return null;
    const amount = ITEMS[pick.kind].stackable
      ? Math.max(1, Math.min(pick.amount, Math.ceil(this.roll() * STEAL_MAX_STACK)))
      : 1;
    const changes = emptyChanges();
    const ok = pick.id
      ? this.world.items.transfer(pick.id, player.id, amount, () => this.ids.next(), changes)
      : this.world.items.addToBackpack(
          player.id,
          pick.kind,
          amount,
          () => this.ids.next(),
          changes,
        );
    if (!ok) {
      this.say(player, 'No te entra nada más en la mochila.');
      return null;
    }
    this.items.publish(changes, player.id);
    return { kind: pick.kind, amount };
  }

  /** Te descubrieron: criminal (si la víctima es inocente o un vecino) y fuera del escondite. */
  private caught(player: Player, victim: Player | Npc, text: string): void {
    this.say(player, text);
    this.stealth.reveal(player, 'Te descubrieron.');
    const innocent = victim instanceof Npc || victim.reputation.notoriety === 'innocent';
    if (innocent && player.reputation.markCriminal(this.clock.now())) {
      this.say(player, 'Ahora sos criminal: los guardias te buscan y atacarte no es delito.');
      this.social.statusChanged(player);
    }
  }

  private describe(kind: ItemKind, amount: number): string {
    const item = ITEMS[kind];
    return amount === 1 ? `${item.article} ${item.name}` : `${amount} ${item.plural}`;
  }

  private practice(player: Player, skill: 'lockpicking' | 'snooping' | 'stealing'): void {
    if (player.skills.tryGain(skill, this.roll)) this.mobiles.skillGains([{ player, skill }]);
  }

  private key(thief: EntityId, victim: EntityId): string {
    return `${thief}>${victim}`;
  }

  private readonly roll = (): number => this.random.next();

  private say(player: Player, text: string): void {
    this.notifier.send(player.id, { type: 'system', text });
  }
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function hash(text: string): number {
  let h = 17;
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}
