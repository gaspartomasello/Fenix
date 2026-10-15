import {
  ATTRIBUTE_NAMES,
  CREATURE_FAME,
  poisonDurationMs,
  REGEN_INTERVAL_MS,
  SPELLS,
  describeItem,
  step,
  tileDistance,
  wearsMetalArmor,
  type Position,
} from '@fenix/shared';
import { outOfAmmo, trySwing, type SwingResult } from '../domain/combat/combat';
import { resolveBandage } from '../domain/healing/bandage';
import {
  breatheFire,
  resolveCreatureCast,
  startCreatureCast,
} from '../domain/creatures/creature-magic';
import { commitAggression } from './use-cases/aggression';
import { CORPSE_MS, Creature, RESPAWN_MS } from '../domain/creatures/creature';
import { canMoveTo, chooseStep, updateTarget } from '../domain/creatures/creature-ai';
import { rollLoot } from '../domain/creatures/loot';
import { resolveCast } from '../domain/magic/spellcasting';
import type { Mobile } from '../domain/mobile';
import { Player } from '../domain/player';
import type { World } from '../domain/world';
import type { Corpses } from './corpses';
import type { MountActions } from './use-cases/mount-actions';
import type { ItemNotifications } from './item-notifications';
import type { MobileNotifications } from './mobile-notifications';
import type { IdGenerator, Notifier, RandomSource } from './ports';
import type { SocialNotifications } from './social-notifications';

/** Distancia al santuario para que un fantasma vuelva a la vida. */
export const SHRINE_RANGE = 2;
/** Vida con la que se resucita. */
export const RESURRECT_HEALTH = 0.5;

/**
 * El pulso del mundo: cada tick hace actuar a las criaturas, resuelve golpes
 * y hechizos, regenera vitales y resucita a los fantasmas que llegan al santuario.
 */
export class GameLoop {
  private readonly shrines: readonly Position[];

  constructor(
    private readonly world: World,
    private readonly mobiles: MobileNotifications,
    private readonly items: ItemNotifications,
    private readonly notifier: Notifier,
    private readonly ids: IdGenerator,
    private readonly random: RandomSource,
    private readonly social: SocialNotifications,
    /** Mueve a un jugador al instante, avisando a quienes lo ven. */
    private readonly teleport: (player: Player, position: Position) => void,
    private readonly corpses: Corpses,
    private readonly mounts: MountActions,
  ) {
    this.shrines = world.map.statics.filter((s) => s.kind === 'shrine');
  }

  tick(now: number): void {
    for (const player of this.world.allPlayers()) this.tickPlayer(player, now);
    for (const creature of this.world.allCreatures()) this.tickCreature(creature, now);
  }

  private readonly roll = (): number => this.random.next();
  private readonly newId = (): string => this.ids.next();

  /** Efectos que vencen y pulsos de veneno, que pueden matar. */
  private tickEffects(mobile: Mobile, now: number): void {
    const tick = mobile.combat.tickEffects(now, this.roll);
    if (tick.poisonDamage > 0) {
      this.mobiles.broadcastHealth(mobile);
      if (mobile instanceof Player) this.mobiles.sendVitals(mobile);
    }
    if (tick.changed && mobile instanceof Player) this.mobiles.sendEffects(mobile);
    if (tick.killed) {
      const poisoner = tick.poisonerId ? this.world.getMobile(tick.poisonerId) : undefined;
      if (mobile instanceof Player)
        this.notifier.send(mobile.id, { type: 'system', text: 'El veneno terminó con vos.' });
      this.handleKill(poisoner, mobile, now);
    }
  }

  /** Avisa los atributos que subieron entrenando (y los vitales, cuyos máximos cambian). */
  private announceStatGains(player: Player): void {
    if (player.statGains.length === 0) return;
    for (const key of player.statGains.splice(0)) {
      this.notifier.send(player.id, {
        type: 'system',
        text: `Tu ${ATTRIBUTE_NAMES[key].toLowerCase()} subió a ${player.combat.baseAttributes[key]}.`,
      });
    }
    this.mobiles.sendEffects(player);
  }

  /** Un golpe corta la concentración de quien está lanzando, salvo con Protección. */
  private disrupt(mobile: Mobile): void {
    if (!(mobile instanceof Player) || !mobile.pendingCast) return;
    if (mobile.combat.effect('protection')) return;
    mobile.pendingCast = null;
    this.notifier.send(mobile.id, {
      type: 'system',
      text: 'Te desconcentraste y el hechizo se perdió.',
    });
  }

  private finishBandage(player: Player): void {
    const outcome = resolveBandage(player, this.world, this.roll);
    if (!outcome) return;
    const say = (text: string): void => this.notifier.send(player.id, { type: 'system', text });
    switch (outcome.kind) {
      case 'lost-target':
        say('Te alejaste demasiado y la venda no sirvió.');
        return;
      case 'failed':
        say('La venda no quedó bien puesta.');
        break;
      case 'healed': {
        const { target, amount, cured } = outcome;
        const self = target.id === player.id;
        const parts = [
          cured ? 'sacaste el veneno' : '',
          amount > 0 ? `curaste ${amount} puntos de vida` : '',
        ].filter(Boolean);
        say(
          parts.length > 0
            ? `${capitalize(parts.join(' y '))}${self ? '' : ` a ${target.name}`}.`
            : 'El veneno no te dejó curar las heridas.',
        );
        this.mobiles.broadcastHealth(target);
        if (target instanceof Player) {
          this.mobiles.sendVitals(target);
          if (cured) this.mobiles.sendEffects(target);
        }
      }
    }
    this.mobiles.skillGains(outcome.gains.map((skill) => ({ player, skill })));
  }

  private tickPlayer(player: Player, now: number): void {
    if (player.reputation.refresh(now)) this.social.statusChanged(player);
    if (player.combat.isDead) {
      this.tryResurrect(player, now);
      return;
    }
    this.announceStatGains(player);
    this.tickEffects(player, now);
    if (player.combat.isDead) return;
    if (player.pendingCast && now >= player.pendingCast.resolveAt) this.finishCast(player, now);
    if (player.pendingBandage && now >= player.pendingBandage.resolveAt) this.finishBandage(player);

    const targetId = player.combat.targetId;
    if (targetId) {
      const target = this.world.getMobile(targetId);
      if (!target || target.combat.isDead) {
        player.combat.targetId = null;
        this.mobiles.sendTarget(player);
      } else if (outOfAmmo(player, this.world)) {
        player.combat.targetId = null;
        this.mobiles.sendTarget(player);
        this.notifier.send(player.id, { type: 'system', text: 'No te quedan flechas.' });
      } else {
        const result = trySwing(player, target, this.world, now, this.roll);
        if (result) this.resolveSwing(result, now);
      }
    }

    // Meditación: hasta 3 veces más rápido el maná con la habilidad al máximo,
    // pero no funciona con armadura de metal (como en UO).
    const meditates = !wearsMetalArmor(this.world.items.lookOf(player.id));
    const meditation = meditates ? player.skills.get('meditation') : 0;
    const manaInterval = REGEN_INTERVAL_MS.mana * (1 - meditation / 1500);
    const regen = player.combat.regenerate(now, manaInterval);
    if (regen.hits || regen.mana || regen.stamina) {
      this.mobiles.sendVitals(player);
      if (regen.hits) this.mobiles.broadcastHealth(player);
    }
    if (meditates && regen.mana && player.skills.tryGain('meditation', this.roll)) {
      this.mobiles.skillGains([{ player, skill: 'meditation' }]);
    }
  }

  private finishCast(player: Player, now: number): void {
    const spellKey = player.pendingCast?.spell;
    const outcome = resolveCast(player, this.world, this.newId, now, this.roll);
    if (!outcome || !spellKey) return;
    const spell = SPELLS[spellKey];
    if (player.skills.tryGain('magery', this.roll))
      this.mobiles.skillGains([{ player, skill: 'magery' }]);

    switch (outcome.kind) {
      case 'lost-target':
        this.notifier.send(player.id, {
          type: 'system',
          text: 'El objetivo ya no está al alcance.',
        });
        return;
      case 'fizzled':
        this.notifier.send(player.id, { type: 'system', text: `${spell.name}: el hechizo falló.` });
        return;
      case 'success': {
        const { target, amount, killed, resisted, effectsChanged, moveTo, message } = outcome;
        if (moveTo) this.teleport(player, moveTo);
        if (outcome.summoned) this.mobiles.appear(outcome.summoned);
        if (outcome.revived && target instanceof Player) {
          this.mobiles.sendVitals(target);
          this.notifier.send(target.id, {
            type: 'system',
            text: `¡${player.name} te devolvió la vida!`,
          });
        }
        for (const hit of outcome.areaHits ?? []) {
          this.mobiles.spellEffect(player, hit.target, spellKey, hit.amount, hit.resisted);
          this.mobiles.broadcastHealth(hit.target);
          this.disrupt(hit.target);
          if (hit.target instanceof Player) {
            this.mobiles.sendVitals(hit.target);
            commitAggression(player, hit.target, now, this.notifier, this.social);
          }
          if (hit.killed) this.handleKill(player, hit.target, now);
        }
        this.mobiles.spellEffect(player, target, spellKey, amount, resisted);
        this.mobiles.broadcastHealth(target);
        this.mobiles.sendVitals(player);
        if (target instanceof Player && target !== player) this.mobiles.sendVitals(target);
        for (const changed of effectsChanged)
          if (changed instanceof Player) this.mobiles.sendEffects(changed);
        if (outcome.itemChanges) this.items.publish(outcome.itemChanges, player.id);
        if (message) this.notifier.send(player.id, { type: 'system', text: message });
        if (spell.target === 'harmful') {
          if (spell.effect.kind === 'damage' && amount > 0) this.disrupt(target);
          if (target instanceof Player) {
            if (resisted)
              this.notifier.send(target.id, {
                type: 'system',
                text: 'Tu Resistencia mágica aguantó parte del hechizo.',
              });
            if (target.skills.tryGain('magic-resist', this.roll))
              this.mobiles.skillGains([{ player: target, skill: 'magic-resist' }]);
          }
        }
        if (killed) this.handleKill(player, target, now);
      }
    }
  }

  private tickCreature(creature: Creature, now: number): void {
    if (creature.gone) {
      if (creature.respawnAt !== null && now >= creature.respawnAt) {
        creature.respawn();
        this.mobiles.appear(creature);
      }
      return;
    }
    // Una invocación se desvanece al terminar su tiempo.
    if (creature.expiresAt !== null && now >= creature.expiresAt && !creature.combat.isDead) {
      this.dismiss(creature);
      return;
    }
    if (!creature.combat.isDead) this.tickEffects(creature, now);
    if (creature.combat.isDead) {
      if (creature.despawnAt !== null && now >= creature.despawnAt) {
        // Las invocaciones no reaparecen: se van del mundo.
        if (creature.ownerId) {
          this.dismiss(creature);
          return;
        }
        this.mobiles.disappear(creature);
        this.corpses.remove(creature.id);
        creature.gone = true;
        creature.respawnAt = now + RESPAWN_MS;
      }
      return;
    }

    const target = updateTarget(creature, this.world);
    this.creatureAbilities(creature, target, now);
    if (creature.combat.isDead) return;
    if (target && !creature.fleeing) {
      const result = trySwing(creature, target, this.world, now, this.roll);
      if (result) this.resolveSwing(result, now);
    }
    if (now >= creature.nextMoveAt && !creature.combat.isParalyzed) {
      const direction = chooseStep(creature, target, this.world, this.roll);
      creature.nextMoveAt =
        now + creature.definition.moveMs * (direction === null && !target ? 3 : 1);
      if (direction !== null && canMoveTo(creature, direction, this.world)) {
        const watchersBefore = this.mobiles.watchers(creature);
        creature.position = step(creature.position, direction);
        creature.direction = direction;
        this.mobiles.moved(creature, watchersBefore);
      }
    }
    // Las criaturas solo se curan cuando dejan de pelear.
    if (!target && creature.combat.regenerate(now).hits) this.mobiles.broadcastHealth(creature);
  }

  /**
   * Lo que hace cada criatura además de pegar: regenerarse, lanzar
   * hechizos (o curarse) y escupir fuego.
   */
  private creatureAbilities(creature: Creature, target: Mobile | null, now: number): void {
    const abilities = creature.definition.abilities;
    const elapsed = creature.lastTickAt ? now - creature.lastTickAt : 0;
    creature.lastTickAt = now;
    if (!abilities) return;
    if (abilities.regeneration && creature.combat.health < 1) {
      creature.regenCarry += (abilities.regeneration * elapsed) / 1000;
      const whole = Math.floor(creature.regenCarry);
      if (whole > 0) {
        creature.regenCarry -= whole;
        creature.combat.heal(whole);
        this.mobiles.broadcastHealth(creature);
      }
    }
    const cast = resolveCreatureCast(creature, this.world, now, this.roll);
    if (cast) {
      this.mobiles.spellEffect(creature, cast.target, cast.spell, cast.amount, cast.resisted);
      this.afterHarm(creature, cast.target, cast.amount, cast.killed, cast.effectsChanged, now);
    }
    if (!target || creature.fleeing) return;
    const spell = startCreatureCast(creature, target, now, this.roll);
    if (spell) this.mobiles.castStart(creature, spell);
    // El aliento no sale siempre que puede: así no es predecible.
    const hits =
      this.roll() < 0.5 ? breatheFire(creature, target, this.world, now, this.roll) : null;
    for (const hit of hits ?? []) {
      this.mobiles.spellEffect(creature, hit.target, 'flamestrike', hit.amount, false);
      this.afterHarm(creature, hit.target, hit.amount, hit.killed, false, now);
    }
  }

  /** Avisos después de que una criatura dañó o hechizó a alguien. */
  private afterHarm(
    attacker: Mobile,
    target: Mobile,
    amount: number,
    killed: boolean,
    effectsChanged: boolean,
    now: number,
  ): void {
    this.mobiles.broadcastHealth(target);
    if (target instanceof Player) {
      this.mobiles.sendVitals(target);
      if (effectsChanged) this.mobiles.sendEffects(target);
    }
    if (amount > 0 && target !== attacker) this.disrupt(target);
    if (killed) this.handleKill(attacker, target, now);
  }

  /** Saca una invocación del mundo (se le terminó el tiempo, murió o se fue su dueño). */
  dismiss(creature: Creature): void {
    this.mobiles.disappear(creature);
    creature.gone = true;
    this.world.removeCreature(creature.id);
  }

  private resolveSwing(result: SwingResult, now: number): void {
    // Una criatura salvaje sin pelea se da vuelta contra quien la golpea (persona o invocación).
    const { attacker, target } = result;
    if (target instanceof Creature && !target.ownerId && target.combat.targetId === null)
      target.combat.targetId = attacker.id;
    this.mobiles.swing(result);
    // Algunas criaturas envenenan al morder.
    const venom = attacker instanceof Creature ? attacker.definition.abilities?.poison : undefined;
    if (venom && result.hit && !result.blocked && !result.killed && this.roll() < venom.chance) {
      target.combat.applyEffect(
        'poison',
        venom.level,
        poisonDurationMs(venom.level),
        now,
        attacker.id,
      );
      if (target instanceof Player) {
        this.mobiles.sendEffects(target);
        this.notifier.send(target.id, { type: 'system', text: '¡Te envenenaron!' });
      }
    }
    if (result.itemChanges) this.items.publish(result.itemChanges, result.attacker.id);
    if (result.hit && !result.blocked && result.damage > 0) this.disrupt(result.target);
    if (result.killed) this.handleKill(result.attacker, result.target, now);
  }

  /** Muerte de un jugador (queda fantasma) o de una criatura (botín y reaparición). */
  private handleKill(killedBy: Mobile | undefined, victim: Mobile, now: number): void {
    // Lo que mata una invocación cuenta para su dueño.
    const killer =
      killedBy instanceof Creature && killedBy.ownerId
        ? (this.world.get(killedBy.ownerId) ?? killedBy)
        : killedBy;
    if (victim instanceof Player) {
      victim.pendingCast = null;
      victim.pendingBandage = null;
      this.mobiles.sendEffects(victim);
      victim.combat.targetId = null;
      this.mounts.dismountOnDeath(victim);
      this.mobiles.broadcastHealth(victim);
      this.mobiles.sendVitals(victim);
      this.mobiles.sendTarget(victim);
      this.notifier.send(victim.id, {
        type: 'system',
        text: 'Moriste. Caminá hasta el santuario de Puerto Ceniza para volver a la vida.',
      });
      if (killer instanceof Player && killer !== victim) this.handlePlayerKill(killer, victim, now);
      return;
    }

    const creature = victim as Creature;
    creature.despawnAt = now + CORPSE_MS;
    if (killer instanceof Player) {
      this.notifier.send(killer.id, {
        type: 'system',
        text: `Mataste ${creature.definition.article} ${creature.name}.`,
      });
      if (killer.combat.targetId === creature.id) {
        killer.combat.targetId = null;
        this.mobiles.sendTarget(killer);
      }
      const fame = CREATURE_FAME[creature.body] ?? 0;
      killer.reputation.award(fame, fame);
      this.social.sendSocial(killer);
    }
    this.dropLoot(creature);
  }

  /** Matar a un inocente suma una muerte; matar a un criminal o asesino da fama y karma. */
  private handlePlayerKill(killer: Player, victim: Player, now: number): void {
    if (killer.combat.targetId === victim.id) {
      killer.combat.targetId = null;
      this.mobiles.sendTarget(killer);
    }
    this.notifier.send(victim.id, { type: 'system', text: `${killer.name} te mató.` });
    if (victim.reputation.notoriety === 'innocent') {
      const changed = killer.reputation.addMurder(now);
      this.notifier.send(killer.id, {
        type: 'system',
        text: `Asesinaste a ${victim.name}. Llevás ${killer.reputation.murders} muertes de inocentes.`,
      });
      if (changed) this.social.statusChanged(killer);
      else this.social.sendSocial(killer);
      return;
    }
    killer.reputation.award(100, 100);
    this.notifier.send(killer.id, {
      type: 'system',
      text: `Mataste a ${victim.name}, que era ${victim.reputation.notoriety === 'murderer' ? 'un asesino' : 'criminal'}.`,
    });
    this.social.sendSocial(killer);
  }

  /** El botín queda dentro del cuerpo, que se revisa con doble clic. */
  private dropLoot(creature: Creature): void {
    // Las invocaciones no dejan nada: se desvanecen.
    if (creature.ownerId) return;
    const drops = rollLoot(creature.definition, this.roll);
    if (!this.corpses.fill(creature, drops)) return;
    const names = drops.map((d) => describeItem(d.kind, d.amount));
    for (const id of this.mobiles.watchers(creature)) {
      this.notifier.send(id, {
        type: 'system',
        text: `El cuerpo ${creature.definition.article === 'una' ? 'de la' : 'del'} ${creature.name} tiene: ${names.join(', ')}. Doble clic para revisarlo.`,
      });
    }
  }

  private tryResurrect(player: Player, now: number): void {
    const nearShrine = this.shrines.some((s) => tileDistance(s, player.position) <= SHRINE_RANGE);
    if (!nearShrine) return;
    player.combat.resurrect(RESURRECT_HEALTH, now);
    this.mobiles.sendVitals(player);
    this.mobiles.broadcastHealth(player);
    this.notifier.send(player.id, { type: 'system', text: '¡Volviste a la vida!' });
  }
}

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
