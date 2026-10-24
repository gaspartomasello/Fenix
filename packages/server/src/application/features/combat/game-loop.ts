import { REGEN_INTERVAL_MS } from '@fenix/shared/combat/vitals';
import { wearsMetalArmor } from '@fenix/shared/combat/weapons';
import { step } from '@fenix/shared/geometry/direction';
import { tileDistance, type Position } from '@fenix/shared/geometry/position';
import { describeItem } from '@fenix/shared/items/item-catalog';
import { poisonDurationMs } from '@fenix/shared/magic/effects';
import { SPELLS, type SpellKey } from '@fenix/shared/magic/spell-catalog';
import { hasLineOfSight } from '@fenix/shared/rules/line-of-sight';
import { ATTRIBUTE_NAMES } from '@fenix/shared/skills/stat-gain';
import { CREATURE_FAME } from '@fenix/shared/social/reputation';
import { TREASURE_MAP_DROPS } from '@fenix/shared/treasure/treasure';
import { missingAmmo, trySwing, type SwingResult } from '../../../domain/combat/combat';
import { resolveBandage } from '../../../domain/healing/bandage';
import {
  breatheFire,
  resolveCreatureCast,
  startCreatureCast,
} from '../../../domain/creatures/creature-magic';
import { commitAggression } from '../../kernel/aggression';
import {
  CORPSE_MS,
  Creature,
  EMPTY_CORPSE_MS,
  RESPAWN_MS,
} from '../../../domain/creatures/creature';
import { canMoveTo, chooseStep, updateTarget } from '../../../domain/creatures/creature-ai';
import { rollLoot } from '../../../domain/creatures/loot';
import {
  landDelayedSpell,
  resolveCast,
  type CastOutcome,
  type DelayedSpell,
} from '../../../domain/magic/spellcasting';
import type { Mobile } from '../../../domain/mobile';
import { Player } from '../../../domain/player';
import type { World } from '../../../domain/world';
import type { EventBus } from '../../kernel/event-bus';
import type { GameEvents } from '../../kernel/game-events';
import type { GameServices } from '../../kernel/services';
import { Fields, type FieldHit } from './fields';
import type { WarMode } from './war-mode';
import type { ItemNotifications } from '../../kernel/item-notifications';
import type { MobileNotifications } from '../../kernel/mobile-notifications';
import type { IdGenerator, Notifier, RandomSource } from '../../ports';
import type { SocialNotifications } from '../../kernel/social-notifications';

/** Más allá de esta distancia de todo jugador, las criaturas duermen. */
export const AWAKE_RANGE = 32;

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
  /** Muros y campos mágicos. */
  private readonly fields: Fields;
  constructor(
    private readonly world: World,
    private readonly mobiles: MobileNotifications,
    private readonly items: ItemNotifications,
    private readonly notifier: Notifier,
    private readonly ids: IdGenerator,
    private readonly random: RandomSource,
    private readonly social: SocialNotifications,
    /** Lo que le importa a otros módulos (muertes, hechizos sobre muebles…) se avisa acá. */
    private readonly events: EventBus<GameEvents>,
    private readonly services: Pick<
      GameServices,
      'movement' | 'corpses' | 'mounts' | 'portals' | 'stealth'
    >,
    private readonly warMode: WarMode,
  ) {
    this.shrines = world.map.statics.filter((s) => s.kind === 'shrine');
    this.fields = new Fields(world, ids, items);
  }

  tick(now: number): void {
    for (const player of this.world.allPlayers()) this.tickPlayer(player, now);
    for (const creature of this.world.allCreatures()) this.tickCreature(creature, now);
    this.landDelayedSpells(now);
    for (const hit of this.fields.tick(now, this.roll)) this.fieldHit(hit, now);
  }

  /** Hechizos lanzados que todavía no cayeron (la Explosión). */
  private delayedSpells: DelayedSpell[] = [];

  private landDelayedSpells(now: number): void {
    if (this.delayedSpells.length === 0) return;
    const due = this.delayedSpells.filter((d) => now >= d.landAt);
    if (due.length === 0) return;
    this.delayedSpells = this.delayedSpells.filter((d) => now < d.landAt);
    for (const delayed of due) {
      // Si el lanzador se fue del mundo, el hechizo se pierde.
      const caster = this.world.get(delayed.casterId);
      if (!caster) continue;
      const outcome = landDelayedSpell(delayed, this.world, this.roll);
      if (outcome) this.castSucceeded(caster, delayed.spell, outcome, now);
    }
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
        tone: 'stat',
      });
    }
    this.mobiles.sendEffects(player);
  }

  /**
   * Un golpe corta la concentración de quien está lanzando, salvo con
   * Protección. A las criaturas también: un mago esquelético al que le pegan
   * pierde el hechizo (y el maná que gastó), como en UO.
   */
  private disrupt(mobile: Mobile): void {
    if (mobile instanceof Creature && mobile.pendingCast) {
      mobile.pendingCast = null;
      for (const id of this.mobiles.watchers(mobile))
        this.notifier.send(id, {
          type: 'system',
          text: `${capitalize(mobile.definition.article === 'una' ? 'la' : 'el')} ${mobile.name} pierde la concentración.`,
        });
      return;
    }
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
    this.expireLook(player);
    if (player.combat.isDead) return;
    if (player.pendingCast && now >= player.pendingCast.resolveAt) this.finishCast(player, now);
    if (player.pendingBandage && now >= player.pendingBandage.resolveAt) this.finishBandage(player);

    const targetId = player.combat.targetId;
    if (targetId) {
      const target = this.world.getMobile(targetId);
      const ammo = missingAmmo(player, this.world);
      if (!target || target.combat.isDead || this.world.isHidden(target)) {
        player.combat.targetId = null;
        this.mobiles.sendTarget(player);
        this.warMode.nextAttacker(player);
      } else if (ammo) {
        player.combat.targetId = null;
        this.mobiles.sendTarget(player);
        const missing = ammo === 'bolt' ? 'virotes' : 'flechas';
        this.notifier.send(player.id, { type: 'system', text: `No te quedan ${missing}.` });
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

  /** Se terminó el Incógnito o la Transformación (o murió): vuelve a ser quien era. */
  private expireLook(player: Player): void {
    let changed = false;
    if (player.disguise && !player.combat.effect('incognito')) {
      player.disguise = null;
      changed = true;
    }
    if (player.form && !player.combat.effect('polymorph')) {
      player.form = null;
      changed = true;
    }
    if (!changed) return;
    this.mobiles.look(player);
    if (!player.combat.isDead)
      this.notifier.send(player.id, { type: 'system', text: 'Volvés a ser vos.' });
  }

  private finishCast(player: Player, now: number): void {
    const spellKey = player.pendingCast?.spell;
    const outcome = resolveCast(player, this.world, this.newId, now, this.roll);
    if (!outcome || !spellKey) return;
    const spell = SPELLS[spellKey];
    if (player.skills.tryGain('magery', this.roll))
      this.mobiles.skillGains([{ player, skill: 'magery' }]);
    // Evaluar inteligencia se aprende con los hechizos de daño que salen.
    const damaging = spell.effect.kind === 'damage' || spell.effect.kind === 'area-damage';
    if (
      damaging &&
      (outcome.kind === 'success' || outcome.kind === 'delayed') &&
      player.skills.tryGain('evaluating-intelligence', this.roll)
    )
      this.mobiles.skillGains([{ player, skill: 'evaluating-intelligence' }]);

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
      case 'blocked':
        this.notifier.send(player.id, {
          type: 'system',
          text: `${spell.name}: el hechizo falló, el objetivo no está a la vista.`,
        });
        return;
      case 'delayed':
        // El maná ya se gastó; cae en un rato y mientras tanto se puede lanzar otro.
        this.delayedSpells.push(outcome.delayed);
        this.mobiles.sendVitals(player);
        return;
      case 'success':
        this.castSucceeded(player, spellKey, outcome, now);
    }
  }

  /** Lo que pasa cuando un hechizo cae: efecto a la vista, vida, avisos y muertes. */
  private castSucceeded(
    player: Player,
    spellKey: SpellKey,
    outcome: Extract<CastOutcome, { kind: 'success' }>,
    now: number,
  ): void {
    const spell = SPELLS[spellKey];
    const { target, amount, killed, resisted, effectsChanged, moveTo, message } = outcome;
    if (moveTo) this.services.movement.teleport(player, moveTo);
    if (outcome.gate)
      this.services.portals.open(outcome.gate.from, outcome.gate.to, now, player.id);
    if (outcome.field) {
      const raised = this.fields.raise(
        outcome.field.kind,
        outcome.field.at,
        outcome.field.from,
        now,
        player.id,
      );
      if (raised === 0)
        this.notifier.send(player.id, { type: 'system', text: 'No hubo lugar para levantarlo.' });
    }
    if (outcome.trap)
      this.events.emit('magicTrap', {
        casterId: player.id,
        containerId: outcome.trap.containerId,
        armed: outcome.trap.armed,
      });
    if (outcome.lock) this.events.emit('magicLock', { casterId: player.id, ...outcome.lock });
    if (outcome.telekinesis)
      this.events.emit('telekinesis', { casterId: player.id, position: outcome.telekinesis });
    if (outcome.dispelField && !this.fields.dispel(outcome.dispelField))
      this.notifier.send(player.id, { type: 'system', text: 'Ahí no hay ningún campo mágico.' });
    for (const creature of outcome.dispelled ?? []) {
      this.mobiles.spellEffect(player, creature, spellKey, 0, false);
      this.dismiss(creature);
      if (creature.ownerId && creature.ownerId !== player.id)
        this.notifier.send(creature.ownerId, {
          type: 'system',
          text: `Disiparon a tu ${creature.name}.`,
        });
    }
    if (outcome.dispelled && outcome.dispelled.length > 0)
      this.notifier.send(player.id, {
        type: 'system',
        text:
          outcome.dispelled.length === 1
            ? `${capitalize(outcome.dispelled[0]?.name ?? '')} se desvaneció.`
            : `Se desvanecieron ${outcome.dispelled.length} invocaciones.`,
      });
    if (outcome.lookChanged) this.mobiles.look(player);
    if (outcome.reflectedBy) {
      this.mobiles.spellEffect(outcome.reflectedBy, player, 'magic-reflection', 0, false);
      this.notifier.send(player.id, {
        type: 'system',
        text: `¡${outcome.reflectedBy.name} te devolvió el hechizo!`,
      });
      if (outcome.reflectedBy instanceof Player)
        this.notifier.send(outcome.reflectedBy.id, {
          type: 'system',
          text: 'Tu Reflejo mágico devolvió el hechizo.',
        });
    }
    if (outcome.conceal)
      this.services.stealth.conceal(outcome.conceal.target, outcome.conceal.until);
    if (outcome.revealAt) {
      const found = this.services.stealth.revealArea(
        outcome.revealAt.position,
        outcome.revealAt.radius,
        player,
      );
      this.notifier.send(player.id, {
        type: 'system',
        text: found > 0 ? `Revelar descubrió a ${found}.` : 'No había nadie escondido.',
      });
    }
    // Un hechizo de daño descubre al que estaba escondido.
    if (spell.target === 'harmful' && outcome.target instanceof Player && outcome.target !== player)
      this.services.stealth.reveal(outcome.target, 'Un hechizo te descubrió.');
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
        // Las invocaciones y las que creó un administrador no reaparecen: se van del mundo.
        if (creature.ownerId || creature.temporary) {
          this.dismiss(creature);
          return;
        }
        this.mobiles.disappear(creature);
        this.services.corpses.remove(creature.id);
        creature.gone = true;
        creature.respawnAt = now + RESPAWN_MS;
      }
      return;
    }

    // Lejos de todo jugador la criatura duerme (como en UO): no piensa ni camina.
    // Las invocaciones y monturas siguen a su dueño siempre.
    if (!creature.ownerId && !this.world.anyPlayerNear(creature.position, AWAKE_RANGE)) return;
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
    // Las que saben magia recuperan maná despacio (un punto cada 2 segundos).
    if (abilities.spells && creature.combat.current.mana < creature.combat.current.maxMana) {
      creature.manaCarry += elapsed / CREATURE_MANA_MS;
      const whole = Math.floor(creature.manaCarry);
      if (whole > 0) {
        creature.manaCarry -= whole;
        creature.combat.restoreMana(whole);
      }
    }
    const cast = resolveCreatureCast(creature, this.world, now, this.roll);
    if (cast) {
      this.mobiles.spellEffect(creature, cast.target, cast.spell, cast.amount, cast.resisted);
      this.afterHarm(creature, cast.target, cast.amount, cast.killed, cast.effectsChanged, now);
    }
    if (!target || creature.fleeing) return;
    // Sin verlo (una pared, otro piso) no le tira hechizos ni fuego: se acerca.
    const visible = hasLineOfSight(this.world.map, creature.position, target.position);
    const spell = startCreatureCast(creature, target, now, this.roll, visible);
    if (spell) this.mobiles.castStart(creature, spell);
    // El aliento no sale siempre que puede: así no es predecible.
    const hits =
      visible && this.roll() < 0.5
        ? breatheFire(creature, target, this.world, now, this.roll)
        : null;
    for (const hit of hits ?? []) {
      this.mobiles.spellEffect(creature, hit.target, 'flamestrike', hit.amount, false);
      this.afterHarm(creature, hit.target, hit.amount, hit.killed, false, now);
    }
  }

  /** Un campo mágico castigó a quien estaba parado adentro. */
  private fieldHit(hit: FieldHit, now: number): void {
    const { target } = hit;
    const killed = hit.damage > 0 ? target.combat.takeDamage(hit.damage) : false;
    const caster = this.world.getMobile(hit.casterId);
    if (target instanceof Player) {
      const text =
        hit.kind === 'fire'
          ? `¡Te quemás! (${hit.damage})`
          : hit.kind === 'poison'
            ? 'Los vapores te envenenan.'
            : 'Quedaste helado: no te podés mover.';
      this.notifier.send(target.id, { type: 'system', text });
    }
    this.afterHarm(caster ?? target, target, hit.damage, killed, true, now);
  }

  /** Daña directo (una trampa que estalla), con los avisos y la muerte de siempre. */
  hurt(target: Mobile, amount: number, now: number): void {
    if (target.combat.isDead) return;
    const killed = target.combat.takeDamage(amount);
    this.afterHarm(target, target, amount, killed, false, now);
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
    else if (target instanceof Player) this.warMode.defend(target, attacker);
  }

  /** Saca una invocación del mundo (se le terminó el tiempo, murió o se fue su dueño). */
  /** Avisa al dueño que atacan a su montura (una vez cada tanto, no en cada golpe). */
  private warnPetOwner(pet: Creature, attacker: Mobile, now: number): void {
    if (!pet.ownerId || attacker.id === pet.ownerId || now < pet.ownerWarnedUntil) return;
    pet.ownerWarnedUntil = now + PET_WARNING_MS;
    const article = attacker instanceof Creature ? `${attacker.definition.article} ` : '';
    this.notifier.send(pet.ownerId, {
      type: 'system',
      text: `¡${capitalize(article + attacker.name)} ataca a tu ${pet.name}!`,
    });
  }

  /** Mata al instante (un administrador del juego), como si lo hubiera matado `by`. */
  slay(victim: Mobile, by: Mobile, now: number): void {
    if (victim.combat.isDead) return;
    victim.combat.takeDamage(victim.combat.current.hits);
    this.mobiles.broadcastHealth(victim);
    this.handleKill(by, victim, now);
  }

  dismiss(creature: Creature): void {
    this.mobiles.disappear(creature);
    creature.gone = true;
    this.world.removeCreature(creature.id);
  }

  private resolveSwing(result: SwingResult, now: number): void {
    // Una criatura salvaje sin pelea se da vuelta contra quien la golpea (persona o invocación).
    const { attacker, target } = result;
    // Pegar, o recibir un golpe, descubre al escondido.
    if (attacker instanceof Player)
      this.services.stealth.reveal(attacker, 'Atacaste y te descubriste.');
    if (target instanceof Player && result.hit && !result.blocked)
      this.services.stealth.reveal(target, 'Te golpearon y te descubrieron.');
    if (target instanceof Creature && !target.ownerId && target.combat.targetId === null)
      target.combat.targetId = attacker.id;
    if (target instanceof Creature && target.isPet) this.warnPetOwner(target, attacker, now);
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
    // La Armadura reactiva le devolvió parte del golpe al atacante.
    if (result.reflected) {
      this.mobiles.broadcastHealth(attacker);
      if (attacker instanceof Player) {
        this.mobiles.sendVitals(attacker);
        this.notifier.send(attacker.id, {
          type: 'system',
          text: `La armadura reactiva te devolvió ${result.reflected} de daño.`,
        });
      }
      if (target instanceof Player) this.mobiles.sendEffects(target);
      if (result.reflectKilled) this.handleKill(target, attacker, now);
    }
    if (result.hit && !result.blocked && result.damage > 0) this.disrupt(result.target);
    if (result.killed) this.handleKill(result.attacker, result.target, now);
    else if (target instanceof Player) this.warMode.defend(target, attacker);
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
      this.services.mounts.dismountOnDeath(victim);
      this.mobiles.broadcastHealth(victim);
      this.mobiles.sendVitals(victim);
      this.mobiles.sendTarget(victim);
      this.notifier.send(victim.id, {
        type: 'system',
        text: 'Moriste. Caminá hasta el santuario de un pueblo (el cristal azul de la plaza) para volver a la vida.',
      });
      if (killer instanceof Player && killer !== victim) this.handlePlayerKill(killer, victim, now);
      return;
    }

    const creature = victim as Creature;
    creature.despawnAt = now + CORPSE_MS;
    // La montura muerta queda tirada un rato (sin botín) y el dueño se queda sin ella.
    if (creature.isPet && creature.ownerId) {
      creature.despawnAt = now + EMPTY_CORPSE_MS;
      this.notifier.send(creature.ownerId, {
        type: 'system',
        text: `Mataron a tu ${creature.name}. Podés comprar otra montura en la caballeriza.`,
      });
    }
    if (killer instanceof Player) {
      this.notifier.send(killer.id, {
        type: 'system',
        text: `Mataste ${creature.definition.article} ${creature.name}.`,
      });
      if (killer.combat.targetId === creature.id) {
        killer.combat.targetId = null;
        this.mobiles.sendTarget(killer);
        // Si otra criatura le sigue pegando, sigue con esa.
        this.warMode.nextAttacker(killer);
      }
      const fame = CREATURE_FAME[creature.body] ?? 0;
      killer.reputation.award(fame, fame);
      this.social.sendSocial(killer);
      if (!creature.temporary && !creature.ownerId)
        this.events.emit('creatureKilled', { killer, creature });
      if (!creature.ownerId) this.events.emit('creatureSlain', { killer, creature });
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
    // Algunas llevan encima un mapa del tesoro (las que aparecen de un tesoro, no).
    const map = TREASURE_MAP_DROPS[creature.definition.kind];
    const withMap = map && !creature.temporary && this.roll() < map.chance ? map : null;
    if (withMap) drops.push({ kind: 'treasure-map', amount: 1 });
    if (!this.services.corpses.fill(creature, drops)) return;
    if (withMap)
      this.events.emit('treasureMapDropped', { corpseId: creature.id, level: withMap.level });
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

/** Cada cuánto recupera un punto de maná una criatura que lanza hechizos. */
const CREATURE_MANA_MS = 2000;

/** Cada cuánto se repite el aviso de que atacan a la montura. */
const PET_WARNING_MS = 20_000;

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
