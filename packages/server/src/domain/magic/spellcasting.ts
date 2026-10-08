import {
  SPELLS,
  SPELL_RANGE,
  describeItem,
  rollSpellPower,
  spellSuccessChance,
  tileDistance,
  type EntityId,
  type SpellKey,
} from '@fenix/shared';
import { Creature } from '../creatures/creature';
import { emptyChanges, type ItemChanges } from '../items/items';
import type { Mobile } from '../mobile';
import type { Player } from '../player';
import type { World } from '../world';

export type StartCastResult =
  { ok: true; targetId: EntityId; itemChanges: ItemChanges } | { ok: false; reason: string };

/**
 * Empieza a lanzar un hechizo: valida libro, Magia, maná, reactivos y
 * objetivo; gasta maná y reactivos (como en UO, aunque después falle).
 */
export function startCast(
  player: Player,
  spellKey: SpellKey,
  requestedTarget: EntityId | undefined,
  world: World,
  now: number,
): StartCastResult {
  const spell = SPELLS[spellKey];
  const fail = (reason: string): StartCastResult => ({ ok: false, reason });
  const items = world.items;

  if (player.combat.isDead) return fail('Los fantasmas no pueden lanzar hechizos.');
  if (player.pendingCast) return fail('Ya estás lanzando un hechizo.');
  if (items.countInBackpack(player.id, 'spellbook') === 0)
    return fail('Necesitás un libro de hechizos en la mochila.');
  if (player.skills.get('magery') < spell.minSkill)
    return fail(`Tu Magia no alcanza para ${spell.name}.`);
  if (player.combat.current.mana < spell.mana) return fail('No tenés suficiente maná.');
  const missing = spell.reagents.filter((r) => items.countInBackpack(player.id, r.kind) < r.amount);
  if (missing.length > 0) {
    return fail(
      `Te faltan reactivos: ${missing.map((r) => describeItem(r.kind, r.amount)).join(', ')}.`,
    );
  }

  let targetId = player.id;
  if (spell.target === 'creature') {
    const target = requestedTarget ? world.getMobile(requestedTarget) : undefined;
    if (!(target instanceof Creature) || target.combat.isDead)
      return fail('Elegí una criatura como objetivo.');
    if (tileDistance(target.position, player.position) > SPELL_RANGE)
      return fail('Está demasiado lejos.');
    targetId = target.id;
  }

  const changes = emptyChanges();
  for (const reagent of spell.reagents)
    items.consumeFromBackpack(player.id, reagent.kind, reagent.amount, changes);
  player.combat.spendMana(spell.mana);
  player.pendingCast = { spell: spellKey, targetId, resolveAt: now + spell.castMs };
  return { ok: true, targetId, itemChanges: changes };
}

export type CastOutcome =
  | { kind: 'fizzled' }
  | { kind: 'lost-target' }
  | { kind: 'success'; target: Mobile; amount: number; killed: boolean };

/** Resuelve el hechizo pendiente: tirada de éxito y efecto (curar, dañar o luz). */
export function resolveCast(
  player: Player,
  world: World,
  random: () => number,
): CastOutcome | null {
  const pending = player.pendingCast;
  if (!pending) return null;
  player.pendingCast = null;
  const spell = SPELLS[pending.spell];
  const magery = player.skills.get('magery');

  const target = world.getMobile(pending.targetId);
  if (
    !target ||
    target.combat.isDead ||
    tileDistance(target.position, player.position) > SPELL_RANGE
  ) {
    return { kind: 'lost-target' };
  }
  if (random() >= spellSuccessChance(spell, magery)) return { kind: 'fizzled' };

  const amount = rollSpellPower(spell, magery, random);
  if (spell.target === 'creature') {
    const killed = target.combat.takeDamage(amount);
    // La criatura se da vuelta contra quien la atacó.
    if (!killed && target instanceof Creature) target.combat.targetId = player.id;
    return { kind: 'success', target, amount, killed };
  }
  if (amount > 0) target.combat.heal(amount);
  return { kind: 'success', target, amount, killed: false };
}
