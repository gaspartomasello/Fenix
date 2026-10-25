import { tileDistance, type Position } from '@fenix/shared/geometry/position';
import {
  DEFAULT_HOUSE_SECURITY,
  HOUSE_DEEDS,
  HOUSE_LEVEL_NAMES,
  HOUSE_PLANS,
  MAX_HOUSE_LIST,
  PLACEMENT_RANGE,
  describeHouse,
  houseKindOfDeed,
  houseLevelAtLeast,
  isHouseName,
  type HouseList,
  type HouseSecurity,
} from '@fenix/shared/housing/houses';
import {
  houseChests,
  houseDoors,
  houseFootprint,
  houseFront,
  houseOrigin,
  houseSign,
  houseStructure,
  placementProblem,
  slotsNeeded,
} from '@fenix/shared/housing/structure';
import { ITEMS } from '@fenix/shared/items/item-catalog';
import type { EntityId, HouseAction, HouseSecurityChange } from '@fenix/shared/protocol/messages';
import { emptyChanges } from '../../../domain/items/items';
import type { Item } from '../../../domain/items/item';
import { Creature } from '../../../domain/creatures/creature';
import { House } from '../../../domain/housing/house';
import type { Mobile } from '../../../domain/mobile';
import { Npc } from '../../../domain/npcs/npc';
import {
  captureHouse,
  houseOf,
  restoreHouseItems,
  type SavedHouse,
} from '../../../domain/persistence/saved-house';
import { Player } from '../../../domain/player';
import type { World } from '../../../domain/world';
import type { ItemNotifications } from '../../kernel/item-notifications';
import type { MobileNotifications } from '../../kernel/mobile-notifications';
import type { GameServices } from '../../kernel/services';
import type { Clock, HouseStore, IdGenerator, Notifier } from '../../ports';

/** Cada cuánto se guardan las casas (con lo que tienen adentro). */
const SAVE_MS = 60_000;
/** A cuántos tiles del cartel (o estando adentro) se abre la ventana de la casa. */
const PANEL_RANGE = 3;

const lower = (name: string): string => name.trim().toLocaleLowerCase();

/**
 * Casas de los jugadores, como en UO: la escritura se usa en el campo y la
 * casa aparece entera, con sus cofres. El dueño decide quién entra (casa
 * pública o privada, amigos y echados), quién la administra con él
 * (copropietarios) y puede demolerla para volver a tener la escritura. Lo que
 * hay adentro queda asegurado: solo los amigos lo levantan o abren los
 * cofres. Las casas y lo que tienen se guardan aparte de los personajes.
 */
export class Housing {
  private readonly houses = new Map<EntityId, House>();
  /** Casas guardadas en otro mundo: vuelven a su dueño como escritura al entrar. */
  private stale: SavedHouse[] = [];
  private nextSaveAt = 0;

  constructor(
    private readonly world: World,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly items: ItemNotifications,
    private readonly mobiles: MobileNotifications,
    private readonly notifier: Notifier,
    private readonly store: HouseStore | undefined,
    /** Mover gente (echar, salir antes de demoler). */
    private readonly services: Pick<GameServices, 'movement'>,
  ) {
    this.load();
  }

  // ── Levantar y demoler ─────────────────────────────────────────────

  /** Usar la escritura: levantar la casa centrada en `center`. */
  place(playerId: EntityId, deedId: EntityId, center: Position): void {
    const player = this.world.get(playerId);
    const deed = this.world.items.get(deedId);
    const kind = deed ? houseKindOfDeed(deed.kind) : null;
    if (!player || !deed || !kind) return;
    if (deed.location.type !== 'backpack' || deed.location.ownerId !== playerId)
      return this.say(playerId, 'La escritura tiene que estar en tu mochila.');
    if (player.combat.isDead) return this.say(playerId, 'Los fantasmas no pueden construir.');
    const own = this.houseOf(player.name);
    if (own)
      return this.say(playerId, `Ya tenés una casa: «${own.name}». Se puede tener una sola.`);
    if (tileDistance(player.position, center) > PLACEMENT_RANGE)
      return this.say(playerId, 'Ese lugar está muy lejos: acercate a donde querés construir.');
    const origin = houseOrigin(kind, center);
    const problem = placementProblem(this.world.map, kind, origin);
    if (problem) return this.say(playerId, problem);
    const site = { id: '', kind, x: origin.x, y: origin.y, slots: [], name: '' };
    const area = houseFootprint(site);
    if (this.someoneIn(area))
      return this.say(playerId, 'Hay alguien parado donde va la casa: tiene que quedar libre.');
    if (this.groundItemsIn(area).length > 0)
      return this.say(playerId, 'Hay cosas tiradas donde va la casa: levantalas primero.');
    const slots = this.freeSlots(slotsNeeded(kind));
    if (!slots && HOUSE_PLANS[kind].floors > 0)
      return this.say(playerId, 'No queda lugar en el mundo para más casas de varios pisos.');

    const house = new House(
      this.ids.next(),
      kind,
      origin,
      slots ?? [],
      `Casa de ${player.name}`,
      player.name,
      DEFAULT_HOUSE_SECURITY,
    );
    this.world.map.addStructure(houseStructure(house.site()));
    this.houses.set(house.id, house);
    const changes = emptyChanges();
    this.world.items.destroy(deed.id, changes);
    for (const at of houseChests(house.site())) {
      const chest = this.world.items.add(this.ids.next(), 'house-chest', 1, {
        type: 'ground',
        position: at,
      });
      house.chestIds.push(chest.id);
      changes.groundAdded.push(chest);
    }
    this.notifier.broadcast({ type: 'houseChanged', house: house.snapshot([]) });
    this.items.publish(changes, playerId);
    this.save();
    this.say(
      playerId,
      `¡Levantaste ${describeHouse(kind)}! Es tuya: hacé doble clic en el cartel de la entrada para administrarla.`,
    );
  }

  /** Demoler: solo el dueño, con la casa vacía. Vuelve la escritura a la mochila (o al banco). */
  private demolish(player: Player, house: House): void {
    if (house.levelOf(player.name) !== 'owner')
      return this.say(player.id, 'Solo el dueño puede demoler la casa.');
    const others = this.mobilesInside(house).filter(
      (m) => m !== player && !this.isPetOf(m, player),
    );
    if (others.some((m) => m instanceof Player))
      return this.say(player.id, 'Todavía hay gente adentro.');
    const stored = house.chestIds.some((id) => this.world.items.contentsOf(id).length > 0);
    if (stored || this.looseItems(house).length > 0)
      return this.say(player.id, 'Primero vaciá los cofres y levantá lo que hay en el piso.');
    const front = houseFront(house.site());
    for (const mobile of this.mobilesInside(house)) this.moveOut(mobile, front);
    const changes = emptyChanges();
    for (const id of house.chestIds) this.world.items.destroy(id, changes);
    this.world.map.removeStructure(house.id);
    this.houses.delete(house.id);
    const deedKind = HOUSE_DEEDS[house.kind];
    const backpack = this.world.items.addToBackpack(
      player.id,
      deedKind,
      1,
      () => this.ids.next(),
      changes,
    );
    if (!backpack) {
      this.world.items.add(this.ids.next(), deedKind, 1, {
        type: 'bank',
        ownerId: player.id,
        position: { x: 0, y: 0 },
      });
      changes.inventories.add(player.id);
    }
    this.notifier.broadcast({ type: 'houseRemoved', id: house.id });
    this.items.publish(changes, player.id);
    this.save();
    this.say(
      player.id,
      backpack
        ? `Demoliste «${house.name}». La escritura volvió a tu mochila.`
        : `Demoliste «${house.name}». Tu mochila está llena: la escritura quedó en el banco.`,
    );
  }

  // ── La ventana de la casa ──────────────────────────────────────────

  action(playerId: EntityId, houseId: EntityId, action: HouseAction): void {
    const player = this.world.get(playerId);
    const house = this.houses.get(houseId);
    if (!player || !house || player.combat.isDead) return;
    if (!this.near(player, house)) return this.say(playerId, 'Estás demasiado lejos de la casa.');
    switch (action) {
      case 'panel':
        return this.panel(player, house);
      case 'eject':
        return this.eject(player, house);
      case 'demolish':
        return this.demolish(player, house);
    }
  }

  private panel(player: Player, house: House): void {
    const level = house.levelOf(player.name);
    const manager = houseLevelAtLeast(level, 'co-owner');
    const max = house.chestIds.length * (ITEMS['house-chest'].capacity ?? 0);
    const used = house.chestIds.reduce((n, id) => n + this.world.items.contentsOf(id).length, 0);
    this.notifier.send(player.id, {
      type: 'housePanel',
      houseId: house.id,
      level,
      ...(manager ? { security: house.security, storage: { used, max } } : {}),
    });
  }

  /** Echar a las visitas que están adentro (los amigos se quedan). */
  private eject(player: Player, house: House): void {
    if (!houseLevelAtLeast(house.levelOf(player.name), 'co-owner'))
      return this.say(player.id, 'Solo el dueño y los copropietarios pueden echar a alguien.');
    const front = houseFront(house.site());
    let count = 0;
    for (const mobile of this.mobilesInside(house)) {
      if (mobile instanceof Player && houseLevelAtLeast(house.levelOf(mobile.name), 'friend'))
        continue;
      if (mobile instanceof Creature && mobile.ownerId) {
        const owner = this.world.get(mobile.ownerId);
        if (owner && houseLevelAtLeast(house.levelOf(owner.name), 'friend')) continue;
      }
      this.moveOut(mobile, front);
      if (mobile instanceof Player)
        this.say(mobile.id, `${player.name} te echó de «${house.name}».`);
      count++;
    }
    this.say(
      player.id,
      count > 0 ? 'Echaste a las visitas de la casa.' : 'No hay visitas adentro.',
    );
  }

  security(playerId: EntityId, houseId: EntityId, change: HouseSecurityChange): void {
    const player = this.world.get(playerId);
    const house = this.houses.get(houseId);
    if (!player || !house) return;
    if (!this.near(player, house)) return this.say(playerId, 'Estás demasiado lejos de la casa.');
    const level = house.levelOf(player.name);
    if (!houseLevelAtLeast(level, 'co-owner'))
      return this.say(playerId, 'Solo el dueño y los copropietarios administran la casa.');
    switch (change.kind) {
      case 'rename':
        if (!isHouseName(change.name))
          return this.say(playerId, 'El nombre tiene que tener entre 2 y 30 letras.');
        house.name = change.name.trim();
        this.rebuild(house);
        this.say(playerId, `La casa ahora se llama «${house.name}».`);
        break;
      case 'public':
        house.security = { ...house.security, public: change.on };
        this.notifier.broadcast({ type: 'houseChanged', house: this.snapshotOf(house) });
        this.say(
          playerId,
          change.on
            ? 'La casa es pública: cualquiera abre las puertas (menos los echados).'
            : 'La casa es privada: solo los amigos abren las puertas.',
        );
        break;
      case 'add':
        if (!this.addTo(player, house, change.list, change.name)) return;
        break;
      case 'remove': {
        if (change.list === 'co-owners' && level !== 'owner')
          return this.say(playerId, 'Solo el dueño nombra o saca copropietarios.');
        const gone = lower(change.name);
        house.security = withList(house.security, change.list, (list) =>
          list.filter((n) => lower(n) !== gone),
        );
        break;
      }
    }
    this.save();
    this.panel(player, house);
  }

  private addTo(player: Player, house: House, list: HouseList, name: string): boolean {
    if (list === 'co-owners' && house.levelOf(player.name) !== 'owner') {
      this.say(player.id, 'Solo el dueño nombra o saca copropietarios.');
      return false;
    }
    const who = lower(name);
    if (who === lower(house.owner)) {
      this.say(player.id, 'El dueño siempre es el dueño.');
      return false;
    }
    const current = house.security[listKey(list)];
    if (!current.some((n) => lower(n) === who) && current.length >= MAX_HOUSE_LIST) {
      this.say(player.id, 'Esa lista ya está llena.');
      return false;
    }
    // Un nombre va en una sola lista: se lo saca de las otras.
    let security = house.security;
    for (const other of ['co-owners', 'friends', 'banned'] as const)
      security = withList(security, other, (names) => names.filter((n) => lower(n) !== who));
    house.security = withList(security, list, (names) => [...names, name.trim()]);
    const target = this.world.findByName(name);
    if (target) {
      const role =
        list === 'banned'
          ? 'no te deja entrar a'
          : `te nombró ${HOUSE_LEVEL_NAMES[list === 'co-owners' ? 'co-owner' : 'friend']} de`;
      this.say(target.id, `${player.name} ${role} «${house.name}».`);
      // A un echado que está adentro se lo saca.
      if (list === 'banned' && house.contains(target.position))
        this.moveOut(target, houseFront(house.site()));
    }
    return true;
  }

  // ── Reglas que ven los demás módulos ───────────────────────────────

  /** ¿Puede abrir o cerrar esta puerta? Desde adentro, siempre (para poder salir). */
  doorRefusal(player: Player, position: Position): string | null {
    const house = this.houseAt(position);
    if (!house || this.inside(house, player.position, position)) return null;
    const level = house.levelOf(player.name);
    if (houseLevelAtLeast(level, 'friend')) return null;
    if (house.security.public && level !== 'banned') return null;
    return level === 'banned'
      ? 'No te dejan entrar a esta casa.'
      : 'La puerta está cerrada con llave: es una casa privada.';
  }

  /** ¿Puede pasar caminando? A los echados no se los deja entrar. */
  moveRefusal(player: Player, from: Position, to: Position): string | null {
    const house = this.houseAt(to);
    if (!house || house.contains(from)) return null;
    return house.levelOf(player.name) === 'banned' ? 'No te dejan entrar a esta casa.' : null;
  }

  /** ¿Puede levantar esto? Lo que hay adentro de una casa es solo para los amigos. */
  takeRefusal(player: Player, item: Item): string | null {
    if (item.location.type !== 'ground') return null;
    const house = this.houseAt(item.location.position);
    if (!house || houseLevelAtLeast(house.levelOf(player.name), 'friend')) return null;
    return `Eso está asegurado en «${house.name}».`;
  }

  /** ¿Puede abrir este recipiente? Los cofres (y las bolsas) de una casa, solo los amigos. */
  containerRefusal(playerId: EntityId, containerId: string): string | null {
    const root = this.world.items.rootOf(containerId);
    if (root?.type !== 'ground') return null;
    const house = this.houseAt(root.position);
    const player = this.world.get(playerId);
    if (!house || !player || houseLevelAtLeast(house.levelOf(player.name), 'friend')) return null;
    return `Es de «${house.name}»: solo los amigos de la casa lo abren.`;
  }

  // ── Entrar, salir y guardar ────────────────────────────────────────

  /** Al entrar: todas las casas del mundo y, si tenía una en otro mundo, su escritura. */
  joined(player: Player): void {
    this.notifier.send(player.id, {
      type: 'houses',
      houses: [...this.houses.values()].map((h) => this.snapshotOf(h)),
    });
    const mine = this.stale.filter((h) => lower(h.owner) === lower(player.name));
    if (mine.length === 0) return;
    this.stale = this.stale.filter((h) => !mine.includes(h));
    const changes = emptyChanges();
    for (const house of mine) {
      this.world.items.add(this.ids.next(), HOUSE_DEEDS[house.kind], 1, {
        type: 'bank',
        ownerId: player.id,
        position: { x: 0, y: 0 },
      });
      changes.inventories.add(player.id);
    }
    this.items.publish(changes, player.id);
    this.save();
    this.say(
      player.id,
      'El mundo cambió desde la última vez: tu casa volvió a ser escritura y te espera en el banco.',
    );
  }

  tick(now: number): void {
    if (now >= this.nextSaveAt) this.save();
  }

  /** Guarda todas las casas con lo que tienen adentro. */
  save(): void {
    this.nextSaveAt = this.clock.now() + SAVE_MS;
    if (!this.store) return;
    this.store.save([
      ...[...this.houses.values()].map((h) => captureHouse(this.world, h)),
      ...this.stale,
    ]);
  }

  // ── Consultas ──────────────────────────────────────────────────────

  /** La casa que hay en esa posición (planta baja o piso alto). */
  houseAt(position: Position): House | undefined {
    const id = this.world.map.structureAt(position);
    const below = id ? this.houses.get(id) : undefined;
    if (below?.contains(position)) return below;
    for (const house of this.houses.values()) if (house.contains(position)) return house;
    return undefined;
  }

  private houseOf(owner: string): House | undefined {
    const who = lower(owner);
    for (const house of this.houses.values()) if (lower(house.owner) === who) return house;
    return undefined;
  }

  /**
   * ¿Está del lado de adentro de la puerta? Las puertas van en paredes a lo
   * largo de x (la de entrada, al sur): adentro es al norte de la puerta. En
   * el patio de la casa se está afuera de la puerta.
   */
  private inside(house: House, at: Position, door: Position): boolean {
    return house.contains(at) && at.y < door.y;
  }

  private near(player: Player, house: House): boolean {
    return (
      house.contains(player.position) ||
      tileDistance(player.position, houseSign(house.site())) <= PANEL_RANGE
    );
  }

  private snapshotOf(house: House): ReturnType<House['snapshot']> {
    return house.snapshot(houseDoors(house.site()).filter((d) => this.world.map.isDoorOpen(d)));
  }

  /** Vuelve a armar la casa en el mapa (cambió el nombre), sin cerrar sus puertas. */
  private rebuild(house: House): void {
    const open = houseDoors(house.site()).filter((d) => this.world.map.isDoorOpen(d));
    this.world.map.addStructure(houseStructure(house.site()));
    for (const door of open) this.world.map.setDoorOpen(door, true);
    this.notifier.broadcast({ type: 'houseChanged', house: this.snapshotOf(house) });
  }

  private mobilesInside(house: House): Mobile[] {
    const site = house.site();
    const f = houseFootprint(site);
    const centers = [
      { x: Math.round((f.x0 + f.x1) / 2), y: Math.round((f.y0 + f.y1) / 2) },
      ...site.slots.map((s) => ({ x: s.x + 8, y: s.y + 8 })),
    ];
    const found = new Set<Mobile>();
    for (const center of centers)
      for (const m of this.world.mobilesNear(center))
        if (house.contains(m.position) && !m.combat.isDead) found.add(m);
    return [...found];
  }

  private isPetOf(mobile: Mobile, player: Player): boolean {
    return mobile instanceof Creature && mobile.ownerId === player.id;
  }

  /** Lo que hay suelto en la casa (sin contar los cofres). */
  private looseItems(house: House): Item[] {
    const chests = new Set(house.chestIds);
    return this.world.items
      .all()
      .filter(
        (i) =>
          i.location.type === 'ground' && !chests.has(i.id) && house.contains(i.location.position),
      );
  }

  private someoneIn(area: { x0: number; y0: number; x1: number; y1: number }): boolean {
    const center = {
      x: Math.round((area.x0 + area.x1) / 2),
      y: Math.round((area.y0 + area.y1) / 2),
    };
    return this.world
      .mobilesNear(center)
      .some(
        (m) =>
          !m.combat.isDead &&
          m.position.x >= area.x0 &&
          m.position.y >= area.y0 &&
          m.position.x <= area.x1 &&
          m.position.y <= area.y1,
      );
  }

  private groundItemsIn(area: { x0: number; y0: number; x1: number; y1: number }): Item[] {
    return this.world.items.all().filter((i) => {
      if (i.location.type !== 'ground') return false;
      const p = i.location.position;
      return p.x >= area.x0 && p.y >= area.y0 && p.x <= area.x1 && p.y <= area.y1;
    });
  }

  /** Lugares apartados libres para los pisos de una casa nueva (null si no alcanzan). */
  private freeSlots(count: number): Position[] | null {
    const used = new Set<string>();
    for (const house of this.houses.values())
      for (const s of house.slots) used.add(`${s.x},${s.y}`);
    const free = this.world.houseSlots.filter((s) => !used.has(`${s.x},${s.y}`));
    return free.length >= count ? free.slice(0, count) : null;
  }

  /** Saca a alguien afuera, delante de la puerta. */
  private moveOut(mobile: Mobile, front: Position): void {
    if (mobile instanceof Player) return this.services.movement.teleport(mobile, front);
    if (!(mobile instanceof Creature) && !(mobile instanceof Npc)) return;
    const before = this.mobiles.watchers(mobile);
    mobile.position = front;
    this.mobiles.moved(mobile, before);
  }

  /** Vuelve a poner las casas guardadas (las de otro mundo quedan para devolver). */
  private load(): void {
    for (const saved of this.store?.load() ?? []) {
      if (saved.world !== this.world.mapId) {
        this.stale.push(saved);
        continue;
      }
      const house = houseOf(saved);
      this.world.map.addStructure(houseStructure(house.site()));
      this.houses.set(house.id, house);
      for (const at of houseChests(house.site())) {
        const chest = this.world.items.add(this.ids.next(), 'house-chest', 1, {
          type: 'ground',
          position: at,
        });
        house.chestIds.push(chest.id);
      }
      restoreHouseItems(this.world, house, saved, () => this.ids.next());
    }
  }

  private say(playerId: EntityId, text: string): void {
    this.notifier.send(playerId, { type: 'system', text });
  }
}

function listKey(list: HouseList): 'coOwners' | 'friends' | 'banned' {
  return list === 'co-owners' ? 'coOwners' : list;
}

function withList(
  security: HouseSecurity,
  list: HouseList,
  change: (names: readonly string[]) => readonly string[],
): HouseSecurity {
  const key = listKey(list);
  return { ...security, [key]: change(security[key]) };
}
