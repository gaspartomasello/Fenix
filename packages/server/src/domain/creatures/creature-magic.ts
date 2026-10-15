import {
  SPELLS,
  attributeModifier,
  paralyzeDurationMs,
  poisonDurationMs,
  poisonLevel,
  resistChance,
  rollSpellPower,
  spellDurationMs,
  tileDistance,
  type SpellKey,
} from '@fenix/shared';
import { magicResistOf } from '../magic/spellcasting';
import type { Mobile } from '../mobile';
import type { World } from '../world';
import { Npc } from '../npcs/npc';
import { Creature } from './creature';

export interface CreatureSpellOutcome {
  readonly spell: SpellKey;
  readonly target: Mobile;
  readonly amount: number;
  readonly killed: boolean;
  readonly resisted: boolean;
  /** Cambiaron los efectos del objetivo (veneno, parálisis, atributos). */
  readonly effectsChanged: boolean;
}

/**
 * Elige y empieza a lanzar un hechizo: curarse si le queda poca vida, o
 * uno de ataque al objetivo. Devuelve el hechizo, o null si no le toca.
 */
export function startCreatureCast(
  creature: Creature,
  target: Mobile,
  now: number,
  random: () => number,
): SpellKey | null {
  const spells = creature.definition.abilities?.spells;
  if (!spells || creature.pendingCast || now < creature.nextSpellAt) return null;
  if (creature.combat.isParalyzed) return null;
  const distance = tileDistance(creature.position, target.position);
  if (distance > spells.range + 3) return null;
  const healing = spells.heal && creature.combat.health < 0.4 ? spells.heal : null;
  const spell = healing ?? spells.attack[Math.floor(random() * spells.attack.length)];
  if (!spell) return null;
  creature.pendingCast = {
    spell,
    targetId: healing ? creature.id : target.id,
    resolveAt: now + SPELLS[spell].castMs,
  };
  creature.nextSpellAt = now + SPELLS[spell].castMs + spells.cooldownMs;
  return spell;
}

/** Resuelve el hechizo de la criatura (las criaturas no fallan, pero se puede resistir). */
export function resolveCreatureCast(
  creature: Creature,
  world: World,
  now: number,
  random: () => number,
): CreatureSpellOutcome | null {
  const pending = creature.pendingCast;
  if (!pending || now < pending.resolveAt) return null;
  creature.pendingCast = null;
  const magery = creature.definition.abilities?.spells?.magery ?? 0;
  const spell = SPELLS[pending.spell];
  const target = world.getMobile(pending.targetId);
  if (!target || target.combat.isDead || tileDistance(target.position, creature.position) > 12)
    return null;
  const harmful = target !== creature;
  const resisted = harmful && random() < resistChance(magicResistOf(target), spell.circle);
  const result = (amount: number, killed: boolean, effectsChanged: boolean) => ({
    spell: pending.spell,
    target,
    amount,
    killed,
    resisted,
    effectsChanged,
  });
  const effect = spell.effect;
  switch (effect.kind) {
    case 'damage': {
      const rolled = rollSpellPower(spell, magery, random);
      const amount = resisted ? Math.max(1, Math.round(rolled / 2)) : rolled;
      return result(amount, target.combat.takeDamage(amount), false);
    }
    case 'heal': {
      const amount = rollSpellPower(spell, magery, random);
      target.combat.heal(amount);
      return result(amount, false, false);
    }
    case 'poison': {
      const level = poisonLevel(magery) - (resisted ? 1 : 0);
      if (level > 0)
        target.combat.applyEffect('poison', level, poisonDurationMs(level), now, creature.id);
      return result(level, false, level > 0);
    }
    case 'paralyze': {
      const ms = paralyzeDurationMs(magery);
      target.combat.applyEffect('paralyzed', 0, resisted ? ms / 2 : ms, now);
      return result(0, false, true);
    }
    case 'attribute':
      for (const attribute of effect.attributes)
        target.combat.applyEffect(
          attribute,
          attributeModifier(magery) * effect.sign,
          spellDurationMs(magery),
          now,
        );
      return result(0, false, true);
    case 'mana-drain': {
      const rolled = rollSpellPower(spell, magery, random);
      return result(
        target.combat.spendMana(resisted ? Math.round(rolled / 2) : rolled),
        false,
        false,
      );
    }
    default:
      return null;
  }
}

export interface BreathHit {
  readonly target: Mobile;
  readonly amount: number;
  readonly killed: boolean;
}

/** Aliento de fuego: daña al objetivo y a quienes estén pegados a él (menos a la criatura). */
export function breatheFire(
  creature: Creature,
  target: Mobile,
  world: World,
  now: number,
  random: () => number,
): BreathHit[] | null {
  const breath = creature.definition.abilities?.breath;
  if (!breath || now < creature.nextBreathAt || creature.combat.isParalyzed) return null;
  if (tileDistance(creature.position, target.position) > breath.range) return null;
  creature.nextBreathAt = now + breath.cooldownMs;
  const [min, max] = breath.power;
  const hits: BreathHit[] = [];
  for (const mobile of world.mobilesNear(target.position)) {
    if (mobile === creature || mobile.combat.isDead) continue;
    if (tileDistance(mobile.position, target.position) > 1) continue;
    // Ni la gente del pueblo ni otras criaturas salvajes.
    if (mobile instanceof Npc || (mobile instanceof Creature && !mobile.ownerId)) continue;
    const full = min + Math.floor(random() * (max - min + 1));
    // Lejos del centro del fuego, la mitad.
    const amount = mobile === target ? full : Math.round(full / 2);
    hits.push({ target: mobile, amount, killed: mobile.combat.takeDamage(amount) });
  }
  return hits;
}
