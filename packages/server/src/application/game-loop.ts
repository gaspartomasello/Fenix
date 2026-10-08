import {
  CREATURE_FAME,
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
import { CORPSE_MS, RESPAWN_MS, type Creature } from '../domain/creatures/creature';
import { canMoveTo, chooseStep, updateTarget } from '../domain/creatures/creature-ai';
import { rollLoot } from '../domain/creatures/loot';
import { resolveCast } from '../domain/magic/spellcasting';
import type { Mobile } from '../domain/mobile';
import { Player } from '../domain/player';
import type { World } from '../domain/world';
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
    if (!creature.combat.isDead) this.tickEffects(creature, now);
    if (creature.combat.isDead) {
      if (creature.despawnAt !== null && now >= creature.despawnAt) {
        this.mobiles.disappear(creature);
        creature.gone = true;
        creature.respawnAt = now + RESPAWN_MS;
      }
      return;
    }

    const target = updateTarget(creature, this.world);
    if (target) {
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

  private resolveSwing(result: SwingResult, now: number): void {
    this.mobiles.swing(result);
    if (result.itemChanges) this.items.publish(result.itemChanges, result.attacker.id);
    if (result.hit && !result.blocked && result.damage > 0) this.disrupt(result.target);
    if (result.killed) this.handleKill(result.attacker, result.target, now);
  }

  /** Muerte de un jugador (queda fantasma) o de una criatura (botín y reaparición). */
  private handleKill(killer: Mobile | undefined, victim: Mobile, now: number): void {
    if (victim instanceof Player) {
      victim.pendingCast = null;
      victim.pendingBandage = null;
      this.mobiles.sendEffects(victim);
      victim.combat.targetId = null;
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

  private dropLoot(creature: Creature): void {
    const drops = rollLoot(creature.definition, this.roll);
    for (const drop of drops) {
      const item = this.world.items.add(this.ids.next(), drop.kind, drop.amount, {
        type: 'ground',
        position: creature.position,
      });
      this.items.publish(
        { groundRemoved: [], groundAdded: [item], inventories: new Set(), looks: new Set() },
        creature.id,
      );
    }
    const names = drops.map((d) => describeItem(d.kind, d.amount));
    if (names.length === 0) return;
    for (const id of this.mobiles.watchers(creature)) {
      this.notifier.send(id, {
        type: 'system',
        text: `${capitalize(creature.definition.article)} ${creature.name} dejó: ${names.join(', ')}.`,
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
