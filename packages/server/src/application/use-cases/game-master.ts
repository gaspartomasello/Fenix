import {
  CREATURES,
  CREATURE_KINDS,
  ITEMS,
  ITEM_KINDS,
  MOUNTS,
  MOUNT_KINDS,
  isMountKind,
  tileDistance,
  type CreatureKind,
  type EntityId,
  type GmCommand,
  type ItemKind,
  type MountKind,
  type Position,
} from '@fenix/shared';
import { Creature } from '../../domain/creatures/creature';
import { emptyChanges } from '../../domain/items/items';
import type { Mobile } from '../../domain/mobile';
import { Player } from '../../domain/player';
import type { World } from '../../domain/world';
import type { ItemNotifications } from '../item-notifications';
import type { MobileNotifications } from '../mobile-notifications';
import type { Clock, IdGenerator, Notifier } from '../ports';

/** Lo que el administrador hace con las piezas de otros casos de uso. */
export interface GameMasterActions {
  teleport(player: Player, to: Position): void;
  slay(victim: Mobile, by: Mobile, now: number): void;
  dismiss(creature: Creature): void;
  grantMount(player: Player, kind: MountKind): boolean;
}

/** Vida con la que vuelve a la vida alguien resucitado por un administrador (llena). */
const FULL = 1;

/**
 * El administrador del juego (como los GM de UO): hace aparecer criaturas
 * (salvajes, o que lo siguen y pelean para él), crea objetos y monturas,
 * mata, cura y resucita, trae gente o va hasta ella, limpia lo que creó y
 * avisa a todos. Solo pueden los personajes que el servidor nombra
 * administradores (y los de prueba).
 */
export class GameMaster {
  constructor(
    private readonly world: World,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly notifier: Notifier,
    private readonly mobiles: MobileNotifications,
    private readonly items: ItemNotifications,
    private readonly actions: GameMasterActions,
    private readonly isAdmin: (name: string) => boolean,
  ) {}

  execute(playerId: EntityId, command: GmCommand): void {
    const gm = this.world.get(playerId);
    if (!gm) return;
    if (!this.isAdmin(gm.name))
      return this.say(playerId, 'Solo un administrador del juego puede hacer eso.');
    switch (command.kind) {
      case 'summon':
        return this.summon(gm, command.creature, command.amount, command.tame);
      case 'creatures':
        return this.say(
          playerId,
          `Criaturas: ${summonable()
            .map((k) => CREATURES[k].name)
            .join(', ')}.`,
        );
      case 'item':
        return this.createItem(gm, command.item, command.amount);
      case 'mount':
        return this.mount(gm, command.mount);
      case 'slay':
        return this.slay(gm, command.targetId);
      case 'heal':
        return this.heal(gm, this.target(gm, command));
      case 'resurrect':
        return this.resurrect(gm, this.target(gm, command));
      case 'bring':
        return this.bring(gm, command.name);
      case 'goTo':
        return this.goTo(gm, command.name);
      case 'clear':
        return this.clear(gm, command.radius);
      case 'announce':
        this.notifier.broadcast({
          type: 'system',
          text: `[Administrador del juego] ${command.text.trim()}`,
        });
        return;
    }
  }

  private summon(gm: Player, name: string, amount: number, tame: boolean): void {
    const kind = findCreature(name);
    if (!kind)
      return this.say(
        gm.id,
        `No conozco ninguna criatura "${name}". Escribí /criaturas para ver la lista.`,
      );
    const spots = this.freeSpots(gm.position, amount);
    if (spots.length === 0) return this.say(gm.id, 'No hay lugar libre alrededor.');
    for (const spot of spots) {
      const creature = new Creature(
        this.ids.next(),
        kind,
        spot,
        tame ? { ownerId: gm.id, expiresAt: null } : null,
      );
      creature.temporary = true;
      creature.direction = gm.direction;
      this.world.addCreature(creature);
      this.mobiles.appear(creature);
    }
    const { name: creatureName } = CREATURES[kind];
    this.say(
      gm.id,
      tame
        ? `Invocaste ${spots.length} × ${creatureName}: te siguen y pelean para vos.`
        : `Apareció ${spots.length} × ${creatureName}. Al morir no vuelve.`,
    );
  }

  private createItem(gm: Player, name: string, amount: number): void {
    const kind = findItem(name);
    if (!kind) return this.say(gm.id, `No conozco ningún objeto "${name}".`);
    const changes = emptyChanges();
    // Los que no se apilan, de a uno (y no más de 20 de una vez).
    const times = ITEMS[kind].stackable ? 1 : Math.min(amount, 20);
    const each = ITEMS[kind].stackable ? amount : 1;
    let made = 0;
    for (let i = 0; i < times; i++)
      if (this.world.items.addToBackpack(gm.id, kind, each, () => this.ids.next(), changes))
        made += each;
    this.items.publish(changes, gm.id);
    if (made === 0) return this.say(gm.id, 'Tu mochila está llena.');
    this.say(gm.id, `Creaste ${made} × ${ITEMS[kind].name}.`);
  }

  private mount(gm: Player, name: string): void {
    const kind = findMount(name);
    if (!kind)
      return this.say(
        gm.id,
        `No conozco esa montura. Hay: ${MOUNT_KINDS.map((k) => MOUNTS[k].name).join(', ')}.`,
      );
    if (!this.actions.grantMount(gm, kind))
      return this.say(gm.id, 'Ya tenés una montura: usá /liberar antes de pedir otra.');
    this.say(gm.id, `Te apareció ${MOUNTS[kind].article} ${MOUNTS[kind].name}.`);
  }

  private slay(gm: Player, targetId: EntityId): void {
    const target = this.world.getMobile(targetId);
    if (!target || target.combat.isDead)
      return this.say(gm.id, 'Elegí primero a quién (tu blanco).');
    if (target === gm) return this.say(gm.id, 'No te podés matar a vos mismo así.');
    this.actions.slay(target, gm, this.clock.now());
    this.say(gm.id, `Mataste a ${nameOf(target)}.`);
  }

  private heal(gm: Player, target: Mobile | null): void {
    if (!target) return;
    if (target.combat.isDead)
      return this.say(gm.id, `${nameOf(target)} está muerto: usá /resucitar.`);
    target.combat.heal(target.combat.current.maxHits);
    target.combat.restoreMana(target.combat.current.maxMana);
    target.combat.restoreStamina(target.combat.current.maxStamina);
    this.mobiles.broadcastHealth(target);
    if (target instanceof Player) {
      this.mobiles.sendVitals(target);
      if (target !== gm) this.say(target.id, 'Un administrador del juego te curó.');
    }
    this.say(gm.id, `Curaste a ${target === gm ? 'vos mismo' : nameOf(target)}.`);
  }

  private resurrect(gm: Player, chosen: Mobile | null): void {
    if (!chosen) return;
    // Con una criatura de blanco (o ninguno), se resucita uno mismo.
    const target = chosen instanceof Player ? chosen : gm;
    if (!target.combat.isDead) return this.say(gm.id, `${target.name} está vivo.`);
    target.combat.resurrect(FULL, this.clock.now());
    this.mobiles.sendVitals(target);
    this.mobiles.broadcastHealth(target);
    this.say(target.id, '¡Un administrador del juego te devolvió la vida!');
    if (target !== gm) this.say(gm.id, `Resucitaste a ${target.name}.`);
  }

  private bring(gm: Player, name: string): void {
    const other = this.world.findByName(name);
    if (!other) return this.say(gm.id, `No hay nadie conectado que se llame "${name}".`);
    if (other === gm) return;
    const spot = this.freeSpots(gm.position, 1)[0] ?? gm.position;
    this.actions.teleport(other, spot);
    this.say(other.id, 'Un administrador del juego te trajo a su lado.');
    this.say(gm.id, `Trajiste a ${other.name}.`);
  }

  private goTo(gm: Player, name: string): void {
    const other = this.world.findByName(name);
    if (!other) return this.say(gm.id, `No hay nadie conectado que se llame "${name}".`);
    if (other === gm) return;
    this.actions.teleport(gm, this.freeSpots(other.position, 1)[0] ?? other.position);
  }

  /** Saca del mundo las criaturas creadas por administradores cerca (vivas o muertas). */
  private clear(gm: Player, radius: number): void {
    const gone = this.world
      .allCreatures()
      .filter((c) => c.temporary && !c.gone && tileDistance(c.position, gm.position) <= radius);
    for (const creature of gone) this.actions.dismiss(creature);
    this.say(
      gm.id,
      gone.length > 0 ? `Sacaste ${gone.length} criaturas.` : 'No había criaturas creadas cerca.',
    );
  }

  /** A quién apunta el comando: por nombre, el blanco elegido o uno mismo. */
  private target(gm: Player, command: { name?: string; targetId?: EntityId }): Mobile | null {
    if (command.name) {
      const found = this.world.findByName(command.name);
      if (!found) this.say(gm.id, `No hay nadie conectado que se llame "${command.name}".`);
      return found ?? null;
    }
    if (command.targetId) return this.world.getMobile(command.targetId) ?? gm;
    return gm;
  }

  /** Tiles libres alrededor, de más cerca a más lejos. */
  private freeSpots(center: Position, amount: number): Position[] {
    const spots: Position[] = [];
    for (let r = 1; r <= 5 && spots.length < amount; r++)
      for (let dy = -r; dy <= r && spots.length < amount; dy++)
        for (let dx = -r; dx <= r && spots.length < amount; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const spot = { x: center.x + dx, y: center.y + dy };
          if (this.world.map.isWalkable(spot) && !this.world.isOccupied(spot)) spots.push(spot);
        }
    return spots;
  }

  private say(playerId: EntityId, text: string): void {
    this.notifier.send(playerId, { type: 'system', text });
  }
}

/** Sin mayúsculas ni tildes, para buscar por lo que se escribe en el chat. */
function plain(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase().trim();
}

/**
 * Busca por nombre: primero igual, después que empiece así, después que lo
 * contenga (y también por la clave interna).
 */
function find<K extends string>(
  kinds: readonly K[],
  nameOf: (kind: K) => readonly string[],
  wanted: string,
): K | undefined {
  const q = plain(wanted);
  const names = kinds.map((k) => ({ k, names: [k, ...nameOf(k)].map(plain) }));
  return (
    names.find((n) => n.names.includes(q))?.k ??
    names.find((n) => n.names.some((name) => name.startsWith(q)))?.k ??
    names.find((n) => n.names.some((name) => name.includes(q)))?.k
  );
}

/** Las que se pueden hacer aparecer: todas menos las monturas (esas, con /montura). */
function summonable(): CreatureKind[] {
  return CREATURE_KINDS.filter((k) => !isMountKind(k));
}

function findCreature(name: string): CreatureKind | undefined {
  return find(summonable(), (k) => [CREATURES[k].name], name);
}

function findItem(name: string): ItemKind | undefined {
  return find(ITEM_KINDS, (k) => [ITEMS[k].name, ITEMS[k].plural], name);
}

function findMount(name: string): MountKind | undefined {
  return find(MOUNT_KINDS, (k) => [MOUNTS[k].name], name);
}

function nameOf(mobile: Mobile): string {
  return mobile instanceof Player ? mobile.name : `${mobile.name}`;
}
