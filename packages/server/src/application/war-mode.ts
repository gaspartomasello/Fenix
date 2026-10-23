import { tileDistance } from '@fenix/shared/geometry/position';
import { Creature } from '../domain/creatures/creature';
import type { Mobile } from '../domain/mobile';
import { Player } from '../domain/player';
import { pvpRefusal } from '../domain/social/pvp';
import type { World } from '../domain/world';
import type { MobileNotifications } from './mobile-notifications';
import type { Notifier } from './ports';

/** Hasta dónde se busca a quien te sigue pegando después de matar a tu objetivo. */
export const DEFEND_RANGE = 12;

/**
 * Modo guerra y defensa propia, como en UO, para todos los jugadores. En
 * guerra el personaje se dibuja en guardia; en paz no ataca. Si lo atacan
 * (criatura o persona) y no está peleando con nadie, pasa solo a modo guerra
 * y devuelve los golpes; al matar a su objetivo sigue con el más cercano de
 * los que lo siguen atacando. Devolverle el golpe a quien te atacó
 * es defensa propia: no es delito (el delito lo cometió quien atacó primero).
 * Contra personas valen las mismas reglas que para atacar: ni en el pueblo, ni
 * a alguien de tu grupo o gremio.
 */
export class WarMode {
  constructor(
    private readonly world: World,
    private readonly mobiles: MobileNotifications,
    private readonly notifier: Notifier,
  ) {}

  /** Entrar o salir del modo guerra. Al pasar a paz se deja de atacar. */
  set(player: Player, war: boolean, auto = false): void {
    if (!war && player.combat.targetId !== null) {
      player.combat.targetId = null;
      this.mobiles.sendTarget(player);
    }
    if (player.warMode === war) return;
    player.warMode = war;
    this.notifier.sendMany(this.mobiles.watchers(player), {
      type: 'warModeChanged',
      id: player.id,
      war,
      ...(auto ? { auto: true } : {}),
    });
  }

  /** Te atacó `attacker`: si no estás peleando, le devolvés los golpes. */
  defend(player: Player, attacker: Mobile): void {
    if (player.combat.isDead || this.fighting(player)) return;
    if (attacker === player || attacker.combat.isDead || this.world.isHidden(attacker)) return;
    if (attacker instanceof Creature && attacker.ownerId === player.id) return;
    if (attacker instanceof Player && pvpRefusal(player, attacker, this.world)) return;
    if (!(attacker instanceof Creature) && !(attacker instanceof Player)) return;
    this.set(player, true, true);
    player.combat.targetId = attacker.id;
    this.mobiles.sendTarget(player);
  }

  /** Se quedó sin objetivo: sigue con el más cercano de los que lo están atacando. */
  nextAttacker(player: Player): void {
    if (player.combat.isDead || this.fighting(player)) return;
    const attacker = this.world
      .mobilesNear(player.position)
      .filter(
        (m) =>
          (m instanceof Creature || m instanceof Player) &&
          m !== player &&
          !m.combat.isDead &&
          m.combat.targetId === player.id &&
          tileDistance(m.position, player.position) <= DEFEND_RANGE,
      )
      .sort(
        (a, b) =>
          tileDistance(a.position, player.position) - tileDistance(b.position, player.position),
      )[0];
    if (attacker) this.defend(player, attacker);
  }

  /** Ya tiene a quién pegarle (vivo y a la vista). */
  private fighting(player: Player): boolean {
    const id = player.combat.targetId;
    const target = id ? this.world.getMobile(id) : undefined;
    return !!target && !target.combat.isDead && !this.world.isHidden(target);
  }
}
