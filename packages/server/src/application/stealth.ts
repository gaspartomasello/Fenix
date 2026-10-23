import {
  HIDE_BLOCK_RANGE,
  detectChance,
  detectRange,
  hideChance,
  stealthSteps,
  tileDistance,
  type ActiveSkill,
  type EntityId,
  type Position,
} from '@fenix/shared';
import { Creature } from '../domain/creatures/creature';
import { Player } from '../domain/player';
import type { World } from '../domain/world';
import type { MobileNotifications } from './mobile-notifications';
import type { Notifier, RandomSource } from './ports';

/**
 * Esconderse, Sigilo y Mirar (y lo que hacen Invisibilidad y Revelar). Un
 * jugador escondido no aparece para nadie más: se les manda que desapareció
 * y, mientras tanto, ningún aviso suyo les llega (ver `MobileNotifications`).
 * Al descubrirse vuelve a aparecer. Las reglas (probabilidades) están en
 * `@fenix/shared`.
 */
export class Stealth {
  constructor(
    private readonly world: World,
    private readonly mobiles: MobileNotifications,
    private readonly notifier: Notifier,
    private readonly random: RandomSource,
  ) {}

  /** Usar una habilidad a propósito. */
  use(playerId: EntityId, skill: ActiveSkill): void {
    const player = this.world.get(playerId);
    if (!player) return;
    if (player.combat.isDead) return this.say(player, 'Los fantasmas no pueden hacer eso.');
    if (skill === 'hiding') this.hide(player);
    else if (skill === 'detect-hidden') this.detect(player);
  }

  /** Esconderse: tirada de Esconderse; no se puede con alguien atacándote de cerca, ni montado. */
  private hide(player: Player): void {
    if (player.hidden) return this.say(player, 'Ya estás escondido.');
    if (player.mount) return this.say(player, 'Bajate de la montura para esconderte.');
    const pressed = this.world
      .mobilesNear(player.position)
      .some(
        (m) =>
          m instanceof Creature &&
          !m.combat.isDead &&
          m.combat.targetId === player.id &&
          tileDistance(m.position, player.position) <= HIDE_BLOCK_RANGE,
      );
    if (pressed) return this.say(player, 'No podés esconderte con alguien atacándote de cerca.');
    const skill = player.skills.get('hiding');
    this.practice(player, 'hiding');
    if (this.roll() >= hideChance(skill))
      return this.say(player, 'No encontraste dónde esconderte.');
    this.conceal(player, null);
    const steps = stealthSteps(player.skills.get('stealth'));
    this.say(
      player,
      steps > 0
        ? `Te escondiste. Podés dar ${steps} pasos sin que te vean.`
        : 'Te escondiste. Si te movés, te van a ver.',
    );
  }

  /** Mirar: busca escondidos alrededor; cada uno, con una tirada contra su Esconderse. */
  private detect(player: Player): void {
    const skill = player.skills.get('detect-hidden');
    this.practice(player, 'detect-hidden');
    const found = this.hiddenNear(player.position, detectRange(skill), player.id).filter(
      (other) => this.roll() < detectChance(skill, other.skills.get('hiding')),
    );
    for (const other of found) this.reveal(other, `${player.name} te encontró.`);
    this.say(
      player,
      found.length > 0
        ? `Encontraste a ${found.map((p) => p.name).join(', ')}.`
        : 'No ves a nadie escondido.',
    );
  }

  /**
   * Esconde a un jugador (Esconderse o Invisibilidad). Con `until`, la
   * Invisibilidad se acaba sola; los pasos permitidos salen de su Sigilo.
   */
  conceal(player: Player, until: number | null): void {
    const watchers = this.mobiles.watchers(player).filter((id) => id !== player.id);
    player.hidden = { steps: stealthSteps(player.skills.get('stealth')), until };
    if (player.combat.targetId) {
      player.combat.targetId = null;
      this.mobiles.sendTarget(player);
    }
    this.mobiles.disappear(player, watchers);
    this.notifier.send(player.id, { type: 'hiddenChanged', hidden: true });
  }

  /** Descubre a un jugador escondido (si lo estaba) y vuelve a aparecer para los demás. */
  reveal(player: Player, text = 'Ya no estás escondido.'): void {
    if (!player.hidden) return;
    player.hidden = null;
    this.mobiles.appear(player);
    this.notifier.send(player.id, { type: 'hiddenChanged', hidden: false });
    this.say(player, text);
  }

  /** Revelar: descubre a todos los escondidos alrededor de un lugar. */
  revealArea(at: Position, radius: number, by: Player): number {
    const found = this.hiddenNear(at, radius, by.id);
    for (const other of found) this.reveal(other, 'Una luz te descubrió.');
    return found.length;
  }

  /**
   * Un paso escondido: correr o quedarse sin pasos de Sigilo lo descubre.
   * Cada paso escondido practica Sigilo.
   */
  step(player: Player, running: boolean): void {
    const hidden = player.hidden;
    if (!hidden) return;
    if (running) return this.reveal(player, 'Corriendo no se puede ir escondido.');
    if (hidden.steps <= 0) return this.reveal(player, 'Te vieron al moverte.');
    hidden.steps -= 1;
    this.practice(player, 'stealth');
  }

  /** Se le acaba la Invisibilidad a quien la tenía. */
  tick(now: number): void {
    for (const player of this.world.allPlayers()) {
      const until = player.hidden?.until;
      if (until !== undefined && until !== null && now >= until)
        this.reveal(player, 'Se te pasó la Invisibilidad.');
    }
  }

  private hiddenNear(at: Position, radius: number, except: EntityId): Player[] {
    return this.world
      .mobilesNear(at)
      .filter(
        (m): m is Player =>
          m instanceof Player &&
          m.id !== except &&
          m.hidden !== null &&
          tileDistance(m.position, at) <= radius,
      );
  }

  private practice(player: Player, skill: 'hiding' | 'stealth' | 'detect-hidden'): void {
    if (player.skills.tryGain(skill, this.roll)) this.mobiles.skillGains([{ player, skill }]);
  }

  private readonly roll = (): number => this.random.next();

  private say(player: Player, text: string): void {
    this.notifier.send(player.id, { type: 'system', text });
  }
}
