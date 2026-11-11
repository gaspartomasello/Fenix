import { tileDistance, type Position } from '@fenix/shared/geometry/position';
import type { EntityId } from '@fenix/shared/protocol/messages';
import type { Player } from '../../../domain/player';
import type { World } from '../../../domain/world';
import type { GameServices } from '../../kernel/services';
import type { Notifier } from '../../ports';

/** A qué distancia del santuario hay que estar para elegirlo como hogar. */
const CHOOSE_RANGE = 3;

/**
 * El hogar: el santuario (la piedra azul de cada ciudad) al que vuelve un
 * fantasma escribiendo `home`, para resucitar ahí. Se cambia con doble clic
 * sobre otro santuario (y aceptando). Sin elegir, es el de la capital.
 */
export class Home {
  private readonly shrines: readonly Position[];

  constructor(
    private readonly world: World,
    private readonly notifier: Notifier,
    private readonly movement: GameServices['movement'],
  ) {
    this.shrines = world.map.statics
      .filter((s) => s.kind === 'shrine')
      .map((s) => ({ x: s.x, y: s.y }));
  }

  /** Elegir como hogar el santuario de esa posición (hay que estar al lado). */
  choose(playerId: EntityId, at: Position): void {
    const player = this.world.get(playerId);
    if (!player) return;
    const shrine = this.shrines.find((s) => s.x === at.x && s.y === at.y);
    if (!shrine) return;
    if (tileDistance(shrine, player.position) > CHOOSE_RANGE)
      return this.say(player, 'Acercate al santuario para elegirlo como hogar.');
    player.home = shrine;
    this.say(
      player,
      `Este santuario es tu hogar ahora (${this.placeOf(shrine)}). Al morir, escribí «home» para volver acá.`,
    );
  }

  /** `home`: un fantasma vuelve a su santuario (ahí resucita). */
  goHome(playerId: EntityId): void {
    const player = this.world.get(playerId);
    if (!player) return;
    if (!player.combat.isDead)
      return this.say(player, 'Solo los fantasmas vuelven a su santuario con «home».');
    const shrine = this.homeOf(player);
    if (!shrine) return this.say(player, 'No hay ningún santuario en este mundo.');
    const spot = this.besideOf(shrine);
    if (!spot) return this.say(player, 'Tu santuario está rodeado: probá en un momento.');
    this.movement.teleport(player, spot);
    this.say(player, `Volvés a tu santuario, en ${this.placeOf(shrine)}.`);
  }

  /** Murió: le dice cómo volver. */
  died(player: Player): void {
    const shrine = this.homeOf(player);
    if (!shrine) return;
    this.say(
      player,
      `Moriste. Escribí «home» para volver a tu santuario (${this.placeOf(shrine)}) y resucitar, o buscá un sanador.`,
    );
  }

  /** Su hogar (si todavía existe) o el santuario más cercano a donde se aparece en el mundo. */
  private homeOf(player: Player): Position | null {
    const chosen = player.home;
    if (chosen && this.shrines.some((s) => s.x === chosen.x && s.y === chosen.y)) return chosen;
    const spawn = this.world.start;
    return (
      [...this.shrines].sort((a, b) => tileDistance(a, spawn) - tileDistance(b, spawn))[0] ?? null
    );
  }

  private besideOf(shrine: Position): Position | null {
    for (let r = 1; r <= 3; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const p = { x: shrine.x + dx, y: shrine.y + dy };
          if (this.world.map.isWalkable(p) && !this.world.isOccupied(p)) return p;
        }
    return null;
  }

  private placeOf(at: Position): string {
    return this.world.map.regionAt(at)?.name ?? 'tierras salvajes';
  }

  private say(player: Player, text: string): void {
    this.notifier.send(player.id, { type: 'system', text });
  }
}
