import { directionOffset, type Direction } from '@fenix/shared/geometry/direction';
import { tileDistance, type Position } from '@fenix/shared/geometry/position';
import type { ItemKind } from '@fenix/shared/items/item-catalog';
import type { EntityId, ShipAction, ShipSecurityChange } from '@fenix/shared/protocol/messages';
import { VIEW_RANGE } from '@fenix/shared/rules/visibility';
import {
  BOARDING_RANGE,
  CANNON_HULL_DAMAGE,
  CANNON_MOBILE_DAMAGE,
  CANNON_RANGE,
  CANNON_RELOAD_MS,
  DEFAULT_SHIP_SECURITY,
  DOCK_RANGE,
  MAX_SHIP_MANIFEST,
  REPAIR_BOARDS,
  REPAIR_CLOTH,
  REPAIR_SHARE,
  SHIPS,
  SHIP_DEEDS,
  SHIP_LEVEL_NAMES,
  SHIP_SIDE_NAMES,
  absoluteHeading,
  hullCondition,
  isShipName,
  levelAtLeast,
  parseShipOrder,
  rotateAround,
  shipFacingFrom,
  shipKindOfDeed,
  shipTiles,
  sideDirection,
  turnFacing,
  type ShipFacing,
  type ShipKind,
  type ShipLevel,
  type ShipOrder,
  type ShipSide,
} from '@fenix/shared/ships/ships';
import { isWater } from '@fenix/shared/world/terrain';
import { emptyChanges, type ItemChanges } from '../../domain/items/items';
import type { Mobile } from '../../domain/mobile';
import { Creature } from '../../domain/creatures/creature';
import { Npc } from '../../domain/npcs/npc';
import { Player } from '../../domain/player';
import { Ship } from '../../domain/ships/ship';
import type { World } from '../../domain/world';
import type { ItemNotifications } from '../item-notifications';
import type { MobileNotifications } from '../mobile-notifications';
import type { Clock, IdGenerator, Notifier, RandomSource } from '../ports';

/** Cada cuánto se revisa qué barcos ve cada jugador. */
const VISIBILITY_MS = 1000;

/**
 * Barcos, como en UO: se botan desde una maqueta y los navegan varios
 * personajes juntos. Cualquiera de la tripulación da órdenes al timonel en
 * voz alta («adelante», «virar a babor», «alto») o con la ventana del barco;
 * el barco se mueve con todo lo que tiene encima. Cada banda de un galeón
 * lleva un cañón; los cañonazos dañan el casco y, si se hunde, los de a bordo
 * terminan nadando hasta la costa. El capitán decide quién sube (pasajeros),
 * quién gobierna y dispara (tripulantes), quién abre la bodega (oficiales) y
 * quién más es capitán.
 */
export class Ships {
  /** Qué barcos sabe cada jugador que están cerca. */
  private readonly known = new Map<EntityId, Set<EntityId>>();
  /** Barcos que cambiaron (casco, nombre) y hay que volver a mandar. */
  private readonly dirty = new Set<EntityId>();
  private nextVisibilityAt = 0;
  /** Lo arma la aplicación: mueve a un jugador al instante (al subir, al navegar). */
  teleport: (player: Player, position: Position) => void = () => {};
  /** Lo arma la aplicación: daña a alguien (los cañonazos). */
  hurt: (target: Mobile, amount: number) => void = () => {};
  /** Lo arma la aplicación: abre un recipiente (la bodega). */
  openContainer: (playerId: EntityId, containerId: string) => void = () => {};

  constructor(
    private readonly world: World,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly random: RandomSource,
    private readonly items: ItemNotifications,
    private readonly mobiles: MobileNotifications,
    private readonly notifier: Notifier,
  ) {}

  // ── Botar y guardar ────────────────────────────────────────────────

  /** Doble clic sobre la maqueta: el barco se bota en el agua de enfrente. */
  launch(playerId: EntityId, deedId: EntityId): void {
    const player = this.world.get(playerId);
    const deed = this.world.items.get(deedId);
    const kind = deed ? shipKindOfDeed(deed.kind) : null;
    if (!player || !deed || !kind) return;
    if (deed.ownerId() !== playerId)
      return this.say(playerId, 'La maqueta tiene que estar en tu mochila.');
    if (player.combat.isDead) return this.say(playerId, 'Los fantasmas no pueden botar barcos.');
    if (this.shipUnder(player.position))
      return this.say(playerId, 'No podés botar un barco desde otro barco.');
    if (deed.ship && this.world.ships.has(deed.ship.id))
      return this.say(playerId, 'Ese barco ya está en el agua.');
    const facing = shipFacingFrom(player.direction);
    const center = this.placeFor(kind, player.position, facing);
    if (!center)
      return this.say(playerId, 'No hay agua libre y profunda delante tuyo para botar el barco.');
    const record = deed.ship;
    const ship = new Ship(
      record?.id ?? this.ids.next(),
      kind,
      center,
      facing,
      record?.name ?? `${SHIPS[kind].name} de ${player.name}`,
      player.name,
      record?.hits ?? SHIPS[kind].maxHits,
      record?.security ?? DEFAULT_SHIP_SECURITY,
    );
    const changes = emptyChanges();
    this.world.items.destroy(deed.id, changes);
    this.place(ship, changes);
    this.items.publish(changes, playerId);
    this.refreshVisibility();
    this.say(
      playerId,
      `Botaste ${SHIPS[kind].name === 'galeón' ? 'el' : 'la'} ${SHIPS[kind].name} «${ship.name}». Hacé doble clic sobre el barco para subir.`,
    );
  }

  /** Guardar el barco en su maqueta: solo el capitán, cerca de tierra y sin nadie más a bordo. */
  private dock(player: Player, ship: Ship): void {
    if (!this.near(player, ship)) return this.say(player.id, 'Estás demasiado lejos del barco.');
    if (!levelAtLeast(this.levelOf(player, ship), 'captain'))
      return this.say(player.id, 'Solo el capitán puede guardar el barco.');
    if (!this.nearLand(ship))
      return this.say(player.id, 'Para guardar el barco hay que acercarlo a la costa.');
    const aboard = this.mobilesAboard(ship).filter((m) => m !== player);
    if (aboard.length > 0) return this.say(player.id, 'Todavía hay gente a bordo.');
    if (this.deckItems(ship, false).length > 0)
      return this.say(player.id, 'Primero levantá lo que quedó en la cubierta.');
    if (ship.holdId && this.world.items.contentsOf(ship.holdId).length > 0)
      return this.say(player.id, 'Primero vaciá la bodega.');
    if (ship.occupies(player.position)) {
      const land = this.nearestLand(player.position);
      if (land) this.teleport(player, land);
    }
    const changes = emptyChanges();
    this.remove(ship, changes);
    const deed = this.world.items.add(this.ids.next(), SHIP_DEEDS[ship.kind], 1, {
      type: 'backpack',
      ownerId: player.id,
      position: this.world.items.freeSpot(player.id),
    });
    deed.ship = ship.record();
    changes.inventories.add(player.id);
    this.items.publish(changes, player.id);
    this.refreshVisibility();
    this.say(player.id, `Guardaste «${ship.name}» en su maqueta.`);
  }

  /** Al entrar: si su barco sigue en el agua, la maqueta guardada de más se descarta. */
  afterJoin(playerId: EntityId): void {
    const changes = emptyChanges();
    for (const item of this.world.items.all())
      if (item.ship && item.ownerId() === playerId && this.world.ships.has(item.ship.id))
        this.world.items.destroy(item.id, changes);
    this.items.publish(changes, playerId);
    this.refreshVisibility();
  }

  forget(playerId: EntityId): void {
    this.known.delete(playerId);
  }

  // ── Subir y bajar ──────────────────────────────────────────────────

  board(playerId: EntityId, shipId: EntityId): void {
    const player = this.world.get(playerId);
    const ship = this.world.ships.get(shipId);
    if (!player || !ship) return;
    if (player.combat.isDead)
      return this.say(playerId, 'Los fantasmas no pueden subir a un barco.');
    if (ship.occupies(player.position)) return this.panel(player, ship);
    if (!this.near(player, ship)) return this.say(playerId, 'Acercate más al barco.');
    if (!levelAtLeast(this.levelOf(player, ship), 'passenger'))
      return this.say(playerId, 'No tenés permiso para subir a este barco.');
    const spot = ship
      .tiles()
      .filter((t) => !this.world.isOccupied(t))
      .sort((a, b) => tileDistance(a, player.position) - tileDistance(b, player.position))[0];
    if (!spot) return this.say(playerId, 'No queda lugar en la cubierta.');
    this.teleport(player, spot);
    this.say(playerId, `Subiste a «${ship.name}».`);
  }

  /** ¿Puede pasar caminando de `from` a `to`? Para subir a una cubierta hace falta permiso. */
  refusal(player: Player, from: Position, to: Position): string | null {
    const ship = this.shipUnder(to);
    if (!ship || ship.occupies(from)) return null;
    return levelAtLeast(this.levelOf(player, ship), 'passenger')
      ? null
      : 'No tenés permiso para subir a este barco.';
  }

  // ── Navegar ────────────────────────────────────────────────────────

  /** Alguien habló: si está a bordo y es una orden para el timonel, se cumple. */
  hear(playerId: EntityId, text: string): void {
    const player = this.world.get(playerId);
    const ship = player ? this.shipUnder(player.position) : undefined;
    const order = parseShipOrder(text);
    if (player && ship && order) this.command(player, ship, order);
  }

  order(playerId: EntityId, shipId: EntityId, order: ShipOrder): void {
    const player = this.world.get(playerId);
    const ship = this.world.ships.get(shipId);
    if (player && ship) this.command(player, ship, order);
  }

  private command(player: Player, ship: Ship, order: ShipOrder): void {
    if (!ship.occupies(player.position)) return this.say(player.id, 'Tenés que estar a bordo.');
    if (player.combat.isDead) return;
    if (!levelAtLeast(this.levelOf(player, ship), 'crew'))
      return this.say(player.id, 'El timonel solo obedece a la tripulación.');
    if (order.kind === 'stop') {
      ship.course = null;
      return this.tillerman(ship, 'Sí, capitán. Barco detenido.');
    }
    if (order.kind === 'turn') {
      if (!this.turn(ship, order.side)) this.tillerman(ship, 'No hay lugar para virar, capitán.');
      return;
    }
    ship.course = { heading: order.heading, speed: order.speed, nextAt: this.clock.now() };
    this.tillerman(ship, 'Sí, capitán.');
  }

  tick(now: number): void {
    for (const ship of this.world.ships.values()) {
      const course = ship.course;
      if (!course || now < course.nextAt) continue;
      if (!this.step(ship, absoluteHeading(ship.facing, course.heading))) {
        ship.course = null;
        this.tillerman(ship, '¡Alto! No se puede seguir por ahí, capitán.');
        continue;
      }
      if (course.speed === 'one') ship.course = null;
      else
        course.nextAt =
          now + (course.speed === 'fast' ? ship.definition.fastMs : ship.definition.slowMs);
    }
    if (now >= this.nextVisibilityAt) this.refreshVisibility();
  }

  /** Un tile en esa dirección, con todo lo que hay a bordo. */
  private step(ship: Ship, direction: Direction): boolean {
    const offset = directionOffset(direction);
    const center = { x: ship.center.x + offset.x, y: ship.center.y + offset.y };
    if (!this.fits(ship.kind, center, ship.facing, ship)) return false;
    this.relocate(ship, center, ship.facing, (p) => ({ x: p.x + offset.x, y: p.y + offset.y }));
    return true;
  }

  private turn(ship: Ship, side: 'left' | 'right' | 'around'): boolean {
    const facing = turnFacing(ship.facing, side);
    if (!this.fits(ship.kind, ship.center, facing, ship)) return false;
    const c = ship.center;
    const rotate = (p: Position): Position =>
      side === 'around' ? { x: 2 * c.x - p.x, y: 2 * c.y - p.y } : rotateAround(p, c, side);
    this.relocate(ship, ship.center, facing, rotate);
    return true;
  }

  /** Mueve el barco y lleva encima a la gente y a lo que hay en la cubierta. */
  private relocate(
    ship: Ship,
    center: Position,
    facing: ShipFacing,
    carry: (p: Position) => Position,
  ): void {
    const aboard = this.mobilesAboard(ship);
    const cargo = this.deckItems(ship);
    for (const t of ship.tiles()) this.world.map.setDeck(t, false);
    ship.center = center;
    ship.facing = facing;
    for (const t of ship.tiles()) this.world.map.setDeck(t, true);
    const changes = emptyChanges();
    for (const item of cargo) {
      if (item.location.type !== 'ground') continue;
      const from = item.location.position;
      changes.groundRemoved.push({ id: item.id, position: from });
      item.location = { type: 'ground', position: carry(from) };
      changes.groundAdded.push(item);
    }
    for (const id of this.knowers(ship))
      this.notifier.send(id, {
        type: 'shipMoved',
        id: ship.id,
        x: ship.center.x,
        y: ship.center.y,
        facing: ship.facing,
      });
    this.items.publish(changes, '');
    for (const mobile of aboard) {
      const to = carry(mobile.position);
      if (mobile instanceof Player) this.teleport(mobile, to);
      else this.shift(mobile, to);
    }
  }

  // ── Ventana, cañones, reparación, bodega ───────────────────────────

  action(playerId: EntityId, shipId: EntityId, action: ShipAction): void {
    const player = this.world.get(playerId);
    const ship = this.world.ships.get(shipId);
    if (!player || !ship || player.combat.isDead) return;
    switch (action) {
      case 'panel':
        return this.panel(player, ship);
      case 'fire-port':
        return this.fire(player, ship, 'port');
      case 'fire-starboard':
        return this.fire(player, ship, 'starboard');
      case 'repair':
        return this.repair(player, ship);
      case 'dock':
        return this.dock(player, ship);
      case 'hold':
        if (!ship.occupies(player.position)) return this.say(playerId, 'Tenés que estar a bordo.');
        if (!levelAtLeast(this.levelOf(player, ship), 'officer'))
          return this.say(playerId, 'Solo los oficiales y el capitán abren la bodega.');
        if (ship.holdId) this.openContainer(playerId, ship.holdId);
        return;
    }
  }

  /** ¿Puede abrir este recipiente? (la bodega es solo para oficiales). */
  containerRefusal(playerId: EntityId, containerId: string): string | null {
    const ship = [...this.world.ships.values()].find((s) => s.holdId === containerId);
    const player = this.world.get(playerId);
    if (!ship || !player) return null;
    return levelAtLeast(this.levelOf(player, ship), 'officer')
      ? null
      : 'Solo los oficiales y el capitán abren la bodega.';
  }

  private panel(player: Player, ship: Ship): void {
    if (!this.near(player, ship)) return this.say(player.id, 'Estás demasiado lejos del barco.');
    const level = this.levelOf(player, ship);
    this.notifier.send(player.id, {
      type: 'shipPanel',
      shipId: ship.id,
      level,
      ...(level === 'captain' ? { security: ship.security } : {}),
    });
  }

  private fire(player: Player, ship: Ship, side: ShipSide): void {
    if (!ship.occupies(player.position)) return this.say(player.id, 'Tenés que estar a bordo.');
    if (!levelAtLeast(this.levelOf(player, ship), 'crew'))
      return this.say(player.id, 'Solo la tripulación dispara los cañones.');
    if (ship.definition.cannons === 0)
      return this.say(player.id, `La ${ship.definition.name} no lleva cañones.`);
    const now = this.clock.now();
    if (now < ship.loadedAt[side])
      return this.say(player.id, `El cañón de ${SHIP_SIDE_NAMES[side]} todavía se está cargando.`);
    const changes = emptyChanges();
    if (!this.takeSupply(player, ship, 'cannonball', 1, changes))
      return this.say(player.id, 'No hay balas de cañón ni en tu mochila ni en la bodega.');
    this.items.publish(changes, player.id);
    ship.loadedAt[side] = now + CANNON_RELOAD_MS;
    const direction = sideDirection(ship.facing, side);
    const offset = directionOffset(direction);
    const reach = (ship.definition.width + 1) / 2;
    const from = { x: ship.center.x + offset.x * reach, y: ship.center.y + offset.y * reach };
    let to = from;
    let hit = false;
    for (let k = 0; k <= CANNON_RANGE; k++) {
      const p = { x: from.x + offset.x * k, y: from.y + offset.y * k };
      to = p;
      const target = this.shipUnder(p);
      if (target && target !== ship) {
        hit = true;
        this.damage(target, this.roll(CANNON_HULL_DAMAGE), player);
        break;
      }
      const struck = this.world
        .mobilesNear(p)
        .filter((m) => m.position.x === p.x && m.position.y === p.y && !m.combat.isDead);
      if (struck.length > 0) {
        hit = true;
        for (const m of struck) this.hurt(m, this.roll(CANNON_MOBILE_DAMAGE));
        break;
      }
      const terrain = this.world.map.terrainAt(p);
      if (terrain === undefined || (!isWater(terrain) && !this.world.map.isWalkable(p))) break;
    }
    for (const id of this.watchersOf(from))
      this.notifier.send(id, { type: 'cannonShot', from, to, hit });
    this.say(player.id, `¡Fuego por ${SHIP_SIDE_NAMES[side]}!`);
  }

  private damage(ship: Ship, amount: number, by: Player): void {
    ship.hits = Math.max(0, ship.hits - amount);
    this.dirty.add(ship.id);
    for (const m of this.mobilesAboard(ship))
      if (m instanceof Player)
        this.say(
          m.id,
          `¡Un cañonazo de ${by.name} da en el casco! (${hullCondition(ship.hits, ship.definition.maxHits)})`,
        );
    if (ship.hits <= 0) this.sink(ship);
    this.refreshVisibility();
  }

  /** El barco se hunde: los de a bordo nadan hasta la costa y todo lo demás se pierde. */
  private sink(ship: Ship): void {
    const aboard = this.mobilesAboard(ship);
    const changes = emptyChanges();
    this.remove(ship, changes);
    this.items.publish(changes, '');
    for (const m of aboard) {
      const land = this.nearestLand(m.position);
      if (!land) continue;
      if (m instanceof Player) {
        this.say(m.id, `¡«${ship.name}» se hunde! Nadás hasta la costa.`);
        this.teleport(m, land);
      } else this.shift(m, land);
    }
  }

  private repair(player: Player, ship: Ship): void {
    if (!ship.occupies(player.position)) return this.say(player.id, 'Tenés que estar a bordo.');
    if (!levelAtLeast(this.levelOf(player, ship), 'crew'))
      return this.say(player.id, 'Solo la tripulación repara el barco.');
    const max = ship.definition.maxHits;
    if (ship.hits >= max) return this.say(player.id, 'El casco está como nuevo.');
    const changes = emptyChanges();
    const enough =
      this.countSupply(player, ship, 'boards') >= REPAIR_BOARDS &&
      this.countSupply(player, ship, 'cloth') >= REPAIR_CLOTH;
    if (!enough)
      return this.say(
        player.id,
        `Para reparar hacen falta ${REPAIR_BOARDS} tablas y ${REPAIR_CLOTH} telas (en tu mochila o en la bodega).`,
      );
    this.takeSupply(player, ship, 'boards', REPAIR_BOARDS, changes);
    this.takeSupply(player, ship, 'cloth', REPAIR_CLOTH, changes);
    this.items.publish(changes, player.id);
    ship.hits = Math.min(max, ship.hits + Math.ceil(max * REPAIR_SHARE));
    this.dirty.add(ship.id);
    this.refreshVisibility();
    this.say(player.id, `Reparaste el casco: ${hullCondition(ship.hits, max)}.`);
  }

  // ── Permisos ───────────────────────────────────────────────────────

  security(playerId: EntityId, shipId: EntityId, change: ShipSecurityChange): void {
    const player = this.world.get(playerId);
    const ship = this.world.ships.get(shipId);
    if (!player || !ship) return;
    if (!this.near(player, ship)) return this.say(playerId, 'Estás demasiado lejos del barco.');
    if (this.levelOf(player, ship) !== 'captain')
      return this.say(playerId, 'Solo el capitán decide eso.');
    const security = ship.security;
    switch (change.kind) {
      case 'rename':
        if (!isShipName(change.name)) return;
        ship.name = change.name.trim();
        this.dirty.add(ship.id);
        this.say(playerId, `El barco ahora se llama «${ship.name}».`);
        break;
      case 'default':
        ship.security = { ...security, [change.who]: change.level };
        break;
      case 'remove': {
        const gone = change.name.toLowerCase();
        const manifest = Object.fromEntries(
          Object.entries(security.manifest).filter(([name]) => name !== gone),
        );
        ship.security = { ...security, manifest };
        break;
      }
      case 'set': {
        const name = change.name.toLowerCase();
        if (name === ship.owner.toLowerCase())
          return this.say(playerId, 'El dueño siempre es capitán.');
        if (
          !(name in security.manifest) &&
          Object.keys(security.manifest).length >= MAX_SHIP_MANIFEST
        )
          return this.say(playerId, 'La lista del barco está llena.');
        ship.security = { ...security, manifest: { ...security.manifest, [name]: change.level } };
        const who = this.world.findByName(change.name);
        if (who)
          this.say(
            who.id,
            change.level === 'denied'
              ? `${player.name} no te deja subir a «${ship.name}».`
              : `${player.name} te nombró ${SHIP_LEVEL_NAMES[change.level]} de «${ship.name}».`,
          );
        break;
      }
    }
    this.panel(player, ship);
    this.refreshVisibility();
  }

  // ── Consultas ──────────────────────────────────────────────────────

  shipUnder(position: Position): Ship | undefined {
    if (!this.world.map.isDeck(position)) return undefined;
    for (const ship of this.world.ships.values()) if (ship.occupies(position)) return ship;
    return undefined;
  }

  levelOf(player: Player, ship: Ship): ShipLevel {
    const owner = this.world.findByName(ship.owner);
    return ship.levelOf({
      name: player.name,
      inOwnerParty: owner ? this.world.parties.sameParty(owner.id, player.id) : false,
      inOwnerGuild: this.world.guilds.sameGuild(ship.owner, player.name),
    });
  }

  private near(player: Player, ship: Ship): boolean {
    return ship.tiles().some((t) => tileDistance(t, player.position) <= BOARDING_RANGE);
  }

  /** ¿Entra el barco ahí? Todo agua, sin muelles ni rocas, sin otro barco y sin nadie de más. */
  private fits(kind: ShipKind, center: Position, facing: ShipFacing, self?: Ship): boolean {
    return shipTiles(kind, center, facing).every((t) => {
      const terrain = this.world.map.terrainAt(t);
      if (terrain === undefined || !isWater(terrain) || this.world.map.hasBlockingStatic(t))
        return false;
      if (this.world.map.isDeck(t) && !(self && self.occupies(t))) return false;
      if (self?.occupies(t)) return true;
      return !this.world.isOccupied(t);
    });
  }

  /**
   * Dónde botar el barco: lo más cerca posible del personaje (para que pueda
   * subir) y, entre los lugares igual de cerca, el que queda más al frente.
   */
  private placeFor(kind: ShipKind, from: Position, facing: ShipFacing): Position | null {
    const ahead = directionOffset(facing);
    const target = { x: from.x + ahead.x * 4, y: from.y + ahead.y * 4 };
    let best: Position | null = null;
    let bestScore = Infinity;
    for (let dy = -12; dy <= 12; dy++)
      for (let dx = -12; dx <= 12; dx++) {
        const center = { x: from.x + dx, y: from.y + dy };
        const tiles = shipTiles(kind, center, facing);
        const gap = Math.min(...tiles.map((t) => tileDistance(t, from)));
        if (gap < 1) continue;
        const score = gap * 100 + tileDistance(center, target);
        if (score >= bestScore || !this.fits(kind, center, facing)) continue;
        best = center;
        bestScore = score;
      }
    return best;
  }

  private place(ship: Ship, changes: ItemChanges): void {
    this.world.ships.set(ship.id, ship);
    for (const t of ship.tiles()) this.world.map.setDeck(t, true);
    const hold = this.world.items.add(this.ids.next(), 'ship-hold', 1, {
      type: 'ground',
      position: ship.sternTile(),
    });
    ship.holdId = hold.id;
    changes.groundAdded.push(hold);
  }

  private remove(ship: Ship, changes: ItemChanges): void {
    for (const item of this.deckItems(ship, false)) {
      for (const inner of this.world.items.descendantsOf(item.id))
        this.world.items.destroy(inner.id, changes);
      this.world.items.destroy(item.id, changes);
    }
    if (ship.holdId) {
      for (const inner of this.world.items.descendantsOf(ship.holdId))
        this.world.items.destroy(inner.id, changes);
      this.world.items.destroy(ship.holdId, changes);
      changes.containers.add(ship.holdId);
    }
    for (const t of ship.tiles()) this.world.map.setDeck(t, false);
    this.world.ships.delete(ship.id);
  }

  private mobilesAboard(ship: Ship): Mobile[] {
    return this.world.mobilesNear(ship.center).filter((m) => ship.occupies(m.position));
  }

  /** Lo que hay apoyado en la cubierta (con la bodega, salvo que se pida sin ella). */
  private deckItems(ship: Ship, withHold = true) {
    return this.world.items
      .groundNear(ship.center)
      .filter((i) => i.location.type === 'ground' && ship.occupies(i.location.position))
      .filter((i) => withHold || i.id !== ship.holdId);
  }

  private nearLand(ship: Ship): boolean {
    return ship.tiles().some((t) => {
      for (let dy = -DOCK_RANGE; dy <= DOCK_RANGE; dy++)
        for (let dx = -DOCK_RANGE; dx <= DOCK_RANGE; dx++) {
          const p = { x: t.x + dx, y: t.y + dy };
          const terrain = this.world.map.terrainAt(p);
          if (terrain !== undefined && !isWater(terrain) && this.world.map.isWalkable(p))
            return true;
        }
      return false;
    });
  }

  /** El tile de tierra caminable más cercano (para bajar o salvarse a nado). */
  private nearestLand(from: Position): Position | null {
    for (let r = 1; r <= 40; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const p = { x: from.x + dx, y: from.y + dy };
          if (
            this.world.map.isWalkable(p) &&
            !this.world.map.isDeck(p) &&
            !this.world.isOccupied(p)
          )
            return p;
        }
    return null;
  }

  /** Cuánto hay de algo entre la mochila y la bodega. */
  private countSupply(player: Player, ship: Ship, kind: ItemKind): number {
    const inHold = ship.holdId
      ? this.world.items
          .contentsOf(ship.holdId)
          .filter((i) => i.kind === kind)
          .reduce((sum, i) => sum + i.amount, 0)
      : 0;
    return this.world.items.countInBackpack(player.id, kind) + inHold;
  }

  /** Gasta de la mochila primero y lo que falte, de la bodega. */
  private takeSupply(
    player: Player,
    ship: Ship,
    kind: ItemKind,
    amount: number,
    changes: ItemChanges,
  ): boolean {
    if (this.countSupply(player, ship, kind) < amount) return false;
    const carried = Math.min(amount, this.world.items.countInBackpack(player.id, kind));
    if (carried > 0) this.world.items.consumeFromBackpack(player.id, kind, carried, changes);
    let left = amount - carried;
    if (left > 0 && ship.holdId)
      for (const item of this.world.items.contentsOf(ship.holdId).filter((i) => i.kind === kind)) {
        const used = Math.min(left, item.amount);
        left -= used;
        if (used === item.amount) this.world.items.destroy(item.id, changes);
        else item.amount -= used;
        changes.containers.add(ship.holdId);
        if (left === 0) break;
      }
    return true;
  }

  /** Mueve a una criatura o a un vecino (los jugadores van con `teleport`). */
  private shift(mobile: Mobile, to: Position): void {
    if (!(mobile instanceof Creature) && !(mobile instanceof Npc)) return;
    const before = this.mobiles.watchers(mobile);
    mobile.position = to;
    this.mobiles.moved(mobile, before);
  }

  // ── Avisos ─────────────────────────────────────────────────────────

  /** El timonel contesta: lo oyen todos los de a bordo. */
  private tillerman(ship: Ship, text: string): void {
    for (const m of this.mobilesAboard(ship))
      if (m instanceof Player) this.say(m.id, `El timonel: «${text}»`);
  }

  private knowers(ship: Ship): EntityId[] {
    return [...this.known].filter(([, ids]) => ids.has(ship.id)).map(([id]) => id);
  }

  private watchersOf(position: Position): EntityId[] {
    return this.world.playersNear(position).map((p) => p.id);
  }

  /** Manda a cada jugador los barcos que ve, si cambió algo. */
  private refreshVisibility(): void {
    this.nextVisibilityAt = this.clock.now() + VISIBILITY_MS;
    const reach = VIEW_RANGE + 4;
    for (const player of this.world.allPlayers()) {
      const visible = [...this.world.ships.values()].filter(
        (s) => tileDistance(s.center, player.position) <= reach,
      );
      const before = this.known.get(player.id) ?? new Set<EntityId>();
      const same =
        visible.length === before.size &&
        visible.every((s) => before.has(s.id) && !this.dirty.has(s.id));
      if (same) continue;
      this.known.set(player.id, new Set(visible.map((s) => s.id)));
      this.notifier.send(player.id, { type: 'ships', ships: visible.map((s) => s.snapshot()) });
    }
    this.dirty.clear();
  }

  private roll([min, max]: readonly [number, number]): number {
    return min + Math.floor(this.random.next() * (max - min + 1));
  }

  private say(playerId: EntityId, text: string): void {
    this.notifier.send(playerId, { type: 'system', text });
  }
}
