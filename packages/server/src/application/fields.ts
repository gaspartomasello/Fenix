import type { Position } from '@fenix/shared/geometry/position';
import { poisonDurationMs } from '@fenix/shared/magic/effects';
import { FIELDS, FIELD_LENGTH, type FieldKind } from '@fenix/shared/magic/spell-catalog';
import type { EntityId } from '@fenix/shared/protocol/messages';
import { emptyChanges } from '../domain/items/items';
import type { Mobile } from '../domain/mobile';
import { Npc } from '../domain/npcs/npc';
import type { World } from '../domain/world';
import type { ItemNotifications } from './item-notifications';
import type { IdGenerator } from './ports';

interface Field {
  readonly kind: FieldKind;
  readonly casterId: EntityId;
  readonly tiles: readonly { id: EntityId; at: Position }[];
  readonly endsAt: number;
}

/** Cada cuánto quema, envenena o paraliza un campo a quien está parado adentro. */
const PULSE_MS = 1000;
/** Daño del fuego en cada pulso. */
const FIRE_DAMAGE: readonly [number, number] = [3, 7];
const PARALYZE_MS = 3000;

/** Lo que le hace un campo a alguien (lo aplica el ciclo del juego, que sabe avisar y matar). */
export interface FieldHit {
  readonly kind: FieldKind;
  readonly target: Mobile;
  readonly casterId: EntityId;
  readonly damage: number;
}

/**
 * Muros y campos mágicos, como en UO: una hilera de cinco tiles atravesada
 * frente al lanzador. Los de piedra y energía cierran el paso; los de fuego,
 * veneno y parálisis dejan pasar pero castigan a quien los pisa. Son objetos
 * fijos en el suelo (así todos los ven) y se deshacen solos al rato.
 */
export class Fields {
  private fields: Field[] = [];
  private nextPulseAt = 0;

  constructor(
    private readonly world: World,
    private readonly ids: IdGenerator,
    private readonly items: ItemNotifications,
  ) {}

  raise(kind: FieldKind, at: Position, from: Position, now: number, casterId: EntityId): number {
    const { item, durationMs, barrier } = FIELDS[kind];
    // Atravesado a la dirección en que se lanzó.
    const dx = at.x - from.x;
    const dy = at.y - from.y;
    const step = Math.abs(dx) >= Math.abs(dy) ? { x: 0, y: 1 } : { x: 1, y: 0 };
    const half = Math.floor(FIELD_LENGTH / 2);
    const changes = emptyChanges();
    const tiles: { id: EntityId; at: Position }[] = [];
    for (let k = -half; k <= half; k++) {
      const p = { x: at.x + step.x * k, y: at.y + step.y * k };
      if (!this.world.map.isWalkable(p) || this.occupiedByField(p)) continue;
      // Un muro no cae encima de nadie.
      if (barrier && this.world.isOccupied(p)) continue;
      const id = this.ids.next();
      changes.groundAdded.push(this.world.items.add(id, item, 1, { type: 'ground', position: p }));
      if (barrier) this.world.map.setBarrier(p, true);
      tiles.push({ id, at: p });
    }
    if (tiles.length > 0) this.fields.push({ kind, casterId, tiles, endsAt: now + durationMs });
    this.items.publish(changes, casterId);
    return tiles.length;
  }

  /** Deshace los vencidos y, cada tanto, castiga a quien está parado en un campo. */
  tick(now: number, random: () => number): FieldHit[] {
    const due = this.fields.filter((f) => now >= f.endsAt);
    if (due.length > 0) {
      this.fields = this.fields.filter((f) => now < f.endsAt);
      const changes = emptyChanges();
      for (const field of due)
        for (const { id, at } of field.tiles) {
          if (FIELDS[field.kind].barrier) this.world.map.setBarrier(at, false);
          if (this.world.items.remove(id)) changes.groundRemoved.push({ id, position: at });
        }
      this.items.publish(changes, '');
    }
    if (now < this.nextPulseAt || this.fields.length === 0) return [];
    this.nextPulseAt = now + PULSE_MS;
    const hits: FieldHit[] = [];
    for (const field of this.fields) {
      if (FIELDS[field.kind].barrier) continue;
      for (const { at } of field.tiles)
        for (const mobile of this.world.mobilesNear(at)) {
          if (mobile.position.x !== at.x || mobile.position.y !== at.y) continue;
          if (mobile.combat.isDead || mobile instanceof Npc) continue;
          if (field.kind === 'fire') {
            const [min, max] = FIRE_DAMAGE;
            hits.push({
              kind: 'fire',
              target: mobile,
              casterId: field.casterId,
              damage: min + Math.floor(random() * (max - min + 1)),
            });
          } else if (field.kind === 'poison') {
            if (!mobile.combat.effect('poison'))
              mobile.combat.applyEffect('poison', 2, poisonDurationMs(2), now, field.casterId);
            hits.push({ kind: 'poison', target: mobile, casterId: field.casterId, damage: 0 });
          } else if (field.kind === 'paralyze' && !mobile.combat.isParalyzed) {
            mobile.combat.applyEffect('paralyzed', 0, PARALYZE_MS, now);
            hits.push({ kind: 'paralyze', target: mobile, casterId: field.casterId, damage: 0 });
          }
        }
    }
    return hits;
  }

  /** Disipar campo: deshace el tile de muro o campo que hay en `at`. */
  dispel(at: Position): boolean {
    for (const field of this.fields) {
      const tile = field.tiles.find((t) => t.at.x === at.x && t.at.y === at.y);
      if (!tile) continue;
      if (FIELDS[field.kind].barrier) this.world.map.setBarrier(at, false);
      const changes = emptyChanges();
      if (this.world.items.remove(tile.id))
        changes.groundRemoved.push({ id: tile.id, position: at });
      this.items.publish(changes, '');
      const rest = field.tiles.filter((t) => t !== tile);
      this.fields = this.fields
        .map((f) => (f === field ? { ...f, tiles: rest } : f))
        .filter((f) => f.tiles.length > 0);
      return true;
    }
    return false;
  }

  private occupiedByField(p: Position): boolean {
    return this.fields.some((f) => f.tiles.some((t) => t.at.x === p.x && t.at.y === p.y));
  }
}
