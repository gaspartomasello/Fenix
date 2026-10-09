import { SKILL_NAMES, formatSkill, type EntityId, type SpellKey } from '@fenix/shared';
import type { SkillGain, SwingResult } from '../domain/combat/combat';
import type { Mobile } from '../domain/mobile';
import { Player } from '../domain/player';
import type { World } from '../domain/world';
import type { Clock, Notifier } from './ports';

/**
 * Avisos sobre jugadores y criaturas: vitales propios, vida de quienes se
 * ven, golpes, y aparecer o desaparecer del rango de visión.
 */
export class MobileNotifications {
  constructor(
    private readonly world: World,
    private readonly notifier: Notifier,
    private readonly clock: Clock,
  ) {}

  /** Efectos activos propios y atributos, con lo que cambió (y los vitales, cuyos máximos dependen de ellos). */
  sendEffects(player: Player): void {
    this.notifier.send(player.id, {
      type: 'effects',
      effects: player.combat.effectsSnapshot(this.clock.now()),
      attributes: player.combat.attributes,
    });
    this.sendVitals(player);
  }

  sendVitals(player: Player): void {
    this.notifier.send(player.id, {
      type: 'vitals',
      vitals: player.combat.current,
      dead: player.combat.isDead,
    });
  }

  /** La vida de un jugador también la ven sus compañeros de grupo, aunque estén lejos. */
  broadcastHealth(mobile: Mobile): void {
    const party = this.world.parties.of(mobile.id)?.members ?? [];
    this.notifier.sendMany(new Set([...this.watchers(mobile), ...party]), {
      type: 'mobileHealth',
      id: mobile.id,
      health: mobile.combat.health,
      dead: mobile.combat.isDead,
    });
  }

  swing(result: SwingResult): void {
    const { attacker, target, hit, blocked, damage, ranged } = result;
    this.notifier.sendMany(new Set([...this.watchers(target), ...this.watchers(attacker)]), {
      type: 'swing',
      attackerId: attacker.id,
      targetId: target.id,
      hit,
      blocked,
      damage,
      ...(ranged ? { ranged } : {}),
    });
    this.skillGains(result.gains);
    if (hit && !blocked) {
      this.broadcastHealth(target);
      if (target instanceof Player) this.sendVitals(target);
    }
  }

  sendSkills(player: Player): void {
    this.notifier.send(player.id, { type: 'skills', values: player.skills.snapshot() });
  }

  /** Avisa cada habilidad que subió y manda la lista actualizada. */
  skillGains(gains: readonly SkillGain[]): void {
    const players = new Set<Player>();
    for (const { player, skill } of gains) {
      players.add(player);
      this.notifier.send(player.id, {
        type: 'system',
        text: `Tu habilidad de ${SKILL_NAMES[skill]} subió a ${formatSkill(player.skills.get(skill))}.`,
      });
    }
    players.forEach((player) => this.sendSkills(player));
  }

  castStart(caster: Mobile, spell: SpellKey): void {
    this.notifier.sendMany(this.watchers(caster), {
      type: 'castStart',
      casterId: caster.id,
      spell,
    });
  }

  spellEffect(
    caster: Mobile,
    target: Mobile,
    spell: SpellKey,
    amount: number,
    resisted: boolean,
  ): void {
    this.notifier.sendMany(new Set([...this.watchers(target), ...this.watchers(caster)]), {
      type: 'spellEffect',
      casterId: caster.id,
      targetId: target.id,
      spell,
      amount,
      ...(resisted ? { resisted } : {}),
    });
  }

  sendTarget(player: Player): void {
    this.notifier.send(player.id, { type: 'combatTarget', targetId: player.combat.targetId });
  }

  appear(mobile: Mobile): void {
    this.notifier.sendMany(this.watchers(mobile), {
      type: 'mobileAppeared',
      mobile: this.world.snapshotOf(mobile),
    });
  }

  disappear(mobile: Mobile, watchers: readonly EntityId[] = this.watchers(mobile)): void {
    this.notifier.sendMany(watchers, { type: 'mobileDisappeared', id: mobile.id });
  }

  /** Después de que una criatura se movió: el paso a quienes la seguían viendo, y aparecer/desaparecer al resto. */
  moved(mobile: Mobile, watchersBefore: readonly EntityId[]): void {
    const before = new Set(watchersBefore);
    const after = this.watchers(mobile);
    const afterSet = new Set(after);
    this.notifier.sendMany(
      after.filter((id) => before.has(id)),
      {
        type: 'mobileMoved',
        id: mobile.id,
        position: mobile.position,
        direction: mobile.direction,
        mode: 'walk',
      },
    );
    this.notifier.sendMany(
      after.filter((id) => !before.has(id)),
      { type: 'mobileAppeared', mobile: this.world.snapshotOf(mobile) },
    );
    this.disappear(
      mobile,
      watchersBefore.filter((id) => !afterSet.has(id)),
    );
  }

  /** Jugadores (los únicos que reciben mensajes) que ven a este mobile. */
  watchers(mobile: Mobile): EntityId[] {
    return this.world
      .mobilesNear(mobile.position)
      .filter((m): m is Player => m instanceof Player)
      .map((p) => p.id);
  }
}
