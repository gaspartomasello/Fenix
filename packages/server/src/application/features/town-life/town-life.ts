import { directionBetween } from '@fenix/shared/geometry/direction';
import { tileDistance, type Position } from '@fenix/shared/geometry/position';
import { MOVE_DURATION_MS } from '@fenix/shared/rules/movement';
import { Creature } from '../../../domain/creatures/creature';
import type { Mobile } from '../../../domain/mobile';
import type { Npc } from '../../../domain/npcs/npc';
import { Player } from '../../../domain/player';
import type { World } from '../../../domain/world';
import type { MobileNotifications } from '../../kernel/mobile-notifications';
import type { Notifier } from '../../ports';
import type { GameServices } from '../../kernel/services';

/** A qué distancia un guardia ve a un criminal o a una fiera dentro de la ciudad. */
export const GUARD_SIGHT = 14;
/** Tiempo entre el "¡alto!" y el golpe del guardia. */
export const GUARD_WARNING_MS = 2500;
/** Lejos de todo jugador la gente del pueblo no camina (nadie la ve). */
const AWAKE_RANGE = 24;

/**
 * La vida de las ciudades: los vecinos caminan por las calles cerca de su
 * casa (con pausas, como quien pasea) y los guardias patrullan. Como en UO,
 * un guardia que ve a un criminal, a un asesino o a una fiera dentro de la
 * ciudad protegida le grita y enseguida aparece a su lado y lo ajusticia.
 * Las criaturas que crea un administrador del juego no las tocan.
 */
export class TownLife {
  /** A quién ya le gritó cada guardia, y cuándo cae el golpe. */
  private readonly warned = new Map<string, { targetId: string; strikeAt: number }>();

  constructor(
    private readonly world: World,
    private readonly mobiles: MobileNotifications,
    private readonly notifier: Notifier,
    private readonly random: () => number,
    /** Los guardias ajustician: la muerte la resuelve el combate. */
    private readonly combat: GameServices['combat'],
  ) {}

  tick(now: number): void {
    for (const npc of this.world.allNpcs()) {
      if (npc.wander === 0) continue;
      if (!this.world.anyPlayerNear(npc.position, AWAKE_RANGE)) continue;
      if (npc.role === 'guard' && this.guard(npc, now)) continue;
      if (now >= npc.nextMoveAt) this.stroll(npc, now);
    }
  }

  /** Devuelve true si el guardia está ocupado con alguien (no pasea). */
  private guard(guard: Npc, now: number): boolean {
    const pending = this.warned.get(guard.id);
    if (pending) {
      const target = this.world.getMobile(pending.targetId);
      if (!target || !this.wanted(target)) {
        this.warned.delete(guard.id);
        return false;
      }
      if (now < pending.strikeAt) return true;
      this.warned.delete(guard.id);
      this.strike(guard, target, now);
      return true;
    }
    const target = this.world
      .mobilesNear(guard.position, { except: guard.id })
      .find((m) => tileDistance(m.position, guard.position) <= GUARD_SIGHT && this.wanted(m));
    if (!target) return false;
    this.warned.set(guard.id, { targetId: target.id, strikeAt: now + GUARD_WARNING_MS });
    const shout =
      target instanceof Player
        ? `${guard.name}: ¡Alto ahí, ${target.notoriety === 'murderer' ? 'asesino' : 'criminal'}!`
        : `${guard.name}: ¡Una fiera en la ciudad! ¡A ella!`;
    for (const id of this.mobiles.watchers(guard))
      this.notifier.send(id, { type: 'system', text: shout });
    return true;
  }

  /** ¿Lo busca la guardia? Criminales, asesinos y fieras dentro de la ciudad protegida. */
  private wanted(mobile: Mobile): boolean {
    if (mobile.combat.isDead || !this.world.map.safeZoneAt(mobile.position)) return false;
    if (mobile instanceof Player)
      return mobile.notoriety === 'criminal' || mobile.notoriety === 'murderer';
    if (mobile instanceof Creature)
      return (
        !mobile.gone && !mobile.ownerId && !mobile.temporary && mobile.definition.aggroRange > 0
      );
    return false;
  }

  /** El guardia aparece al lado de quien busca y lo ajusticia de un golpe. */
  private strike(guard: Npc, target: Mobile, now: number): void {
    const spot = this.besideOf(target.position) ?? guard.position;
    this.moveTo(guard, spot);
    const name = target instanceof Player ? target.name : `el ${target.name}`;
    for (const id of new Set([...this.mobiles.watchers(guard), ...this.mobiles.watchers(target)]))
      this.notifier.send(id, { type: 'system', text: `${guard.name} ajustició a ${name}.` });
    this.combat.slay(target, guard, now);
    // Vuelve a su puesto un rato después.
    guard.goal = guard.home;
    guard.nextMoveAt = now + 3000;
  }

  /** Un paso de paseo: hacia su meta, o una pausa y una meta nueva cerca de casa. */
  private stroll(npc: Npc, now: number): void {
    const far = tileDistance(npc.position, npc.home) > npc.wander + 4;
    // Si quedó muy lejos (después de ajusticiar a alguien), vuelve de un salto.
    if (far) {
      this.moveTo(npc, this.free(npc.home) ? npc.home : npc.position);
      npc.goal = null;
      npc.nextMoveAt = now + 2000;
      return;
    }
    if (!npc.goal || (npc.goal.x === npc.position.x && npc.goal.y === npc.position.y)) {
      npc.goal = this.pickGoal(npc);
      // Una pausa antes de seguir: se queda mirando, charla, descansa.
      npc.nextMoveAt = now + 1500 + this.random() * 5000;
      return;
    }
    const next = this.stepToward(npc.position, npc.goal, npc);
    if (!next) {
      npc.goal = null;
      npc.nextMoveAt = now + 1000;
      return;
    }
    this.moveTo(npc, next);
    npc.nextMoveAt = now + MOVE_DURATION_MS.walk * (npc.role === 'guard' ? 1.4 : 1.2);
  }

  private pickGoal(npc: Npc): Position | null {
    for (let i = 0; i < 8; i++) {
      const goal = {
        x: npc.home.x + Math.round((this.random() * 2 - 1) * npc.wander),
        y: npc.home.y + Math.round((this.random() * 2 - 1) * npc.wander),
      };
      if (this.free(goal)) return goal;
    }
    return null;
  }

  /** El paso que más acerca a la meta, sin salirse de su barrio. */
  private stepToward(from: Position, goal: Position, npc: Npc): Position | null {
    let best: Position | null = null;
    let bestDistance = tileDistance(from, goal);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const next = { x: from.x + dx, y: from.y + dy };
        if (tileDistance(next, npc.home) > npc.wander) continue;
        // En diagonal, solo si los dos costados están libres (no corta esquinas).
        if (
          dx &&
          dy &&
          (!this.free({ x: from.x + dx, y: from.y }) || !this.free({ x: from.x, y: from.y + dy }))
        )
          continue;
        if (!this.free(next)) continue;
        const d = tileDistance(next, goal) + (dx && dy ? 0.1 : 0);
        if (d < bestDistance) {
          best = next;
          bestDistance = d;
        }
      }
    return best;
  }

  private moveTo(npc: Npc, to: Position): void {
    if (to.x === npc.position.x && to.y === npc.position.y) return;
    const before = this.mobiles.watchers(npc);
    npc.direction = directionBetween(npc.position, to) ?? npc.direction;
    npc.position = to;
    this.mobiles.moved(npc, before);
  }

  private free(p: Position): boolean {
    return this.world.map.isWalkable(p) && !this.world.isOccupied(p);
  }

  private besideOf(p: Position): Position | null {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const spot = { x: p.x + dx, y: p.y + dy };
        if ((dx || dy) && this.free(spot)) return spot;
      }
    return null;
  }
}
