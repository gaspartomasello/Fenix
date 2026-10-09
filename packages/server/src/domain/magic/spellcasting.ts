import {
  MAX_SUMMONS,
  SPELLS,
  SPELL_RANGE,
  attributeModifier,
  cureChance,
  describeItem,
  paralyzeDurationMs,
  poisonDurationMs,
  poisonLevel,
  PROTECTION_ARMOR,
  resistChance,
  rollSpellPower,
  spellDurationMs,
  spellSuccessChance,
  summonDurationMs,
  tileDistance,
  type EntityId,
  type ItemKind,
  type Position,
  type SpellKey,
} from '@fenix/shared';
import { Creature } from '../creatures/creature';
import { emptyChanges, type ItemChanges } from '../items/items';
import type { Mobile } from '../mobile';
import { Npc } from '../npcs/npc';
import { Player } from '../player';
import { pvpRefusal } from '../social/pvp';
import type { World } from '../world';

export interface CastRequest {
  readonly targetId?: EntityId;
  readonly position?: Position;
  /** Pergamino del que se lee el hechizo (no hace falta libro ni reactivos). */
  readonly scrollId?: EntityId;
}

export type StartCastResult =
  | {
      ok: true;
      itemChanges: ItemChanges;
      /** El objetivo es otro jugador y el hechizo lo daña: cuenta como agresión. */
      aggressionAgainst: Player | null;
    }
  | { ok: false; reason: string };

/** Comida que puede salir del hechizo Crear comida. */
const CREATED_FOOD: readonly ItemKind[] = ['apple', 'fish-steak', 'cooked-ribs'];

/**
 * Empieza a lanzar un hechizo: valida libro (o pergamino), Magia, maná,
 * reactivos y objetivo; gasta maná y reactivos (como en UO, aunque después falle).
 */
export function startCast(
  player: Player,
  spellKey: SpellKey,
  request: CastRequest,
  world: World,
  now: number,
): StartCastResult {
  const spell = SPELLS[spellKey];
  const fail = (reason: string): StartCastResult => ({ ok: false, reason });
  const items = world.items;

  if (player.combat.isDead) return fail('Los fantasmas no pueden lanzar hechizos.');
  if (player.combat.isParalyzed) return fail('Estás paralizado.');
  if (player.pendingCast) return fail('Ya estás lanzando un hechizo.');

  const scroll = request.scrollId ? items.get(request.scrollId) : undefined;
  if (request.scrollId) {
    if (
      !scroll ||
      scroll.kind !== `scroll-${spellKey}` ||
      scroll.location.type !== 'backpack' ||
      scroll.location.ownerId !== player.id
    )
      return fail('Ese pergamino no está en tu mochila.');
  } else if (items.countInBackpack(player.id, 'spellbook') === 0) {
    return fail('Necesitás un libro de hechizos en la mochila.');
  }
  if (player.skills.get('magery') < spell.minSkill)
    return fail(`Tu Magia no alcanza para ${spell.name}.`);
  if (player.combat.current.mana < spell.mana) return fail('No tenés suficiente maná.');
  if (!scroll) {
    const missing = spell.reagents.filter(
      (r) => items.countInBackpack(player.id, r.kind) < r.amount,
    );
    if (missing.length > 0) {
      return fail(
        `Te faltan reactivos: ${missing.map((r) => describeItem(r.kind, r.amount)).join(', ')}.`,
      );
    }
  }

  let targetId = player.id;
  let position: Position | undefined;
  let aggressionAgainst: Player | null = null;
  switch (spell.target) {
    case 'self':
      break;
    case 'beneficial': {
      const target = request.targetId ? world.getMobile(request.targetId) : player;
      if (spell.effect.kind === 'resurrect') {
        if (!(target instanceof Player) || !target.combat.isDead || target.id === player.id)
          return fail('Elegí a un fantasma.');
      } else if (!target || target instanceof Npc || target.combat.isDead)
        return fail('Elegí a alguien vivo.');
      if (tileDistance(target.position, player.position) > SPELL_RANGE)
        return fail('Está demasiado lejos.');
      targetId = target.id;
      break;
    }
    case 'harmful': {
      const target = request.targetId ? world.getMobile(request.targetId) : undefined;
      if (!target || target.id === player.id || target.combat.isDead)
        return fail('Elegí a quién lanzarle el hechizo.');
      if (target instanceof Npc) return fail(`No podés atacar a ${target.name}.`);
      if (tileDistance(target.position, player.position) > SPELL_RANGE)
        return fail('Está demasiado lejos.');
      if (target instanceof Player) {
        const refusal = pvpRefusal(player, target, world);
        if (refusal) return fail(refusal);
        aggressionAgainst = target;
      }
      targetId = target.id;
      break;
    }
    case 'location': {
      if (!request.position) return fail('Elegí un lugar.');
      if (spell.effect.kind === 'summon' && world.summonsOf(player.id).length >= MAX_SUMMONS)
        return fail('Ya tenés demasiadas criaturas invocadas.');
      if (tileDistance(request.position, player.position) > SPELL_RANGE)
        return fail('Está demasiado lejos.');
      if (!world.map.isWalkable(request.position) || world.isOccupied(request.position, player.id))
        return fail('No podés ir ahí.');
      position = request.position;
      break;
    }
  }

  const changes = emptyChanges();
  if (scroll) items.consumeFromBackpack(player.id, scroll.kind, 1, changes);
  else
    for (const reagent of spell.reagents)
      items.consumeFromBackpack(player.id, reagent.kind, reagent.amount, changes);
  player.combat.spendMana(spell.mana);
  player.pendingCast = {
    spell: spellKey,
    targetId,
    ...(position ? { position } : {}),
    resolveAt: now + spell.castMs,
  };
  return { ok: true, itemChanges: changes, aggressionAgainst };
}

export type CastOutcome =
  | { kind: 'fizzled' }
  | { kind: 'lost-target' }
  | {
      kind: 'success';
      target: Mobile;
      /** Daño, curación o maná, según el hechizo (0 si no aplica). */
      amount: number;
      killed: boolean;
      /** La Resistencia mágica del objetivo aguantó parte del hechizo. */
      resisted: boolean;
      /** Cambiaron los efectos del objetivo o del lanzador. */
      effectsChanged: readonly Mobile[];
      /** A dónde se mueve el lanzador (teletransporte); lo hace el caso de uso. */
      moveTo?: Position;
      message?: string;
      itemChanges?: ItemChanges;
      /** Terremoto: a quiénes alcanzó. */
      areaHits?: readonly AreaHit[];
      /** Criatura que apareció invocada. */
      summoned?: Creature;
      /** El objetivo volvió a la vida. */
      revived?: boolean;
    };

export interface AreaHit {
  readonly target: Mobile;
  readonly amount: number;
  readonly killed: boolean;
  readonly resisted: boolean;
}

/** Vida con la que vuelve quien es resucitado con el hechizo. */
export const RESURRECTION_HEALTH = 0.5;

/** Resistencia mágica del objetivo: la habilidad del jugador, o la de pelea de la criatura. */
export function magicResistOf(target: Mobile): number {
  if (target instanceof Player) return target.skills.get('magic-resist');
  if (target instanceof Creature)
    return target.definition.abilities?.magicResist ?? target.definition.skill / 2;
  return 0;
}

/** Resuelve el hechizo pendiente: tirada de éxito y su efecto. */
export function resolveCast(
  player: Player,
  world: World,
  ids: () => EntityId,
  now: number,
  random: () => number,
): CastOutcome | null {
  const pending = player.pendingCast;
  if (!pending) return null;
  player.pendingCast = null;
  const spell = SPELLS[pending.spell];
  const magery = player.skills.get('magery');

  // Resurrección va a un fantasma; todo lo demás, a alguien vivo.
  const wantsGhost = spell.effect.kind === 'resurrect';
  const target = world.getMobile(pending.targetId);
  if (
    !target ||
    target.combat.isDead !== wantsGhost ||
    tileDistance(target.position, player.position) > SPELL_RANGE
  ) {
    return { kind: 'lost-target' };
  }
  if (random() >= spellSuccessChance(spell, magery)) return { kind: 'fizzled' };

  const harmful = spell.target === 'harmful';
  const resisted = harmful && random() < resistChance(magicResistOf(target), spell.circle);
  const success = (
    extra: Partial<Extract<CastOutcome, { kind: 'success' }>> = {},
  ): CastOutcome => ({
    kind: 'success',
    target,
    amount: 0,
    killed: false,
    resisted,
    effectsChanged: [],
    ...extra,
  });
  const duration = (ms: number): number => (resisted ? Math.round(ms / 2) : ms);
  const effect = spell.effect;

  switch (effect.kind) {
    case 'damage': {
      const rolled = rollSpellPower(spell, magery, random);
      const amount = resisted ? Math.max(1, Math.round(rolled / 2)) : rolled;
      const killed = target.combat.takeDamage(amount);
      // La criatura se da vuelta contra quien la atacó.
      if (!killed && target instanceof Creature) target.combat.targetId = player.id;
      return success({ amount, killed });
    }
    case 'heal': {
      const amount = rollSpellPower(spell, magery, random);
      target.combat.heal(amount);
      return success({ amount });
    }
    case 'attribute': {
      const amount = attributeModifier(magery) * effect.sign;
      for (const attribute of effect.attributes)
        target.combat.applyEffect(attribute, amount, duration(spellDurationMs(magery)), now);
      if (harmful) provoke(target, player);
      return success({ effectsChanged: [target] });
    }
    case 'cure': {
      const poison = target.combat.effect('poison');
      if (!poison) return success({ message: 'No había veneno que curar.' });
      if (random() >= cureChance(magery / 1000, poison.amount))
        return success({ message: 'El veneno es demasiado fuerte: no lo pudiste sacar.' });
      target.combat.removeEffect('poison');
      return success({ effectsChanged: [target] });
    }
    case 'poison': {
      const level = poisonLevel(magery) - (resisted ? 1 : 0);
      provoke(target, player);
      if (level <= 0) return success();
      target.combat.applyEffect('poison', level, poisonDurationMs(level), now, player.id);
      return success({ amount: level, effectsChanged: [target] });
    }
    case 'paralyze':
      target.combat.applyEffect('paralyzed', 0, duration(paralyzeDurationMs(magery)), now);
      provoke(target, player);
      return success({ effectsChanged: [target] });
    case 'protection':
      target.combat.applyEffect('protection', PROTECTION_ARMOR, spellDurationMs(magery), now);
      return success({ effectsChanged: [target] });
    case 'night-sight':
      target.combat.applyEffect('night-sight', 0, spellDurationMs(magery) * 4, now);
      return success({ effectsChanged: [target] });
    case 'mana-drain': {
      const rolled = rollSpellPower(spell, magery, random);
      const drained = target.combat.spendMana(resisted ? Math.round(rolled / 2) : rolled);
      if (effect.steal) player.combat.restoreMana(drained);
      provoke(target, player);
      return success({ amount: drained });
    }
    case 'teleport': {
      const position = pending.position;
      if (!position || !world.map.isWalkable(position) || world.isOccupied(position, player.id))
        return { kind: 'lost-target' };
      return success({ moveTo: position });
    }
    case 'area-damage': {
      const hits: AreaHit[] = [];
      for (const mobile of world.mobilesNear(player.position)) {
        if (mobile === player || mobile instanceof Npc || mobile.combat.isDead) continue;
        if (tileDistance(mobile.position, player.position) > effect.radius) continue;
        if (mobile instanceof Creature && mobile.ownerId === player.id) continue;
        if (mobile instanceof Player && pvpRefusal(player, mobile, world)) continue;
        const held = random() < resistChance(magicResistOf(mobile), spell.circle);
        const rolled = rollSpellPower(spell, magery, random);
        const amount = held ? Math.max(1, Math.round(rolled / 2)) : rolled;
        const killed = mobile.combat.takeDamage(amount);
        if (!killed) provoke(mobile, player);
        hits.push({ target: mobile, amount, killed, resisted: held });
      }
      return success({ areaHits: hits });
    }
    case 'resurrect':
      target.combat.resurrect(RESURRECTION_HEALTH, now);
      return success({ revived: true });
    case 'summon': {
      const position = pending.position;
      if (
        !position ||
        !world.map.isWalkable(position) ||
        world.isOccupied(position, player.id) ||
        world.summonsOf(player.id).length >= MAX_SUMMONS
      )
        return { kind: 'lost-target' };
      const creature = new Creature(ids(), effect.creature, position, {
        ownerId: player.id,
        expiresAt: now + summonDurationMs(magery),
      });
      world.addCreature(creature);
      return success({ target: creature, summoned: creature });
    }
    case 'create-food': {
      const food = CREATED_FOOD[Math.floor(random() * CREATED_FOOD.length)] ?? 'apple';
      const changes = emptyChanges();
      if (!world.items.addToBackpack(player.id, food, 1, ids, changes))
        return success({ message: 'Tu mochila está llena.' });
      return success({
        itemChanges: changes,
        message: `Apareció ${describeItem(food)} en tu mochila.`,
      });
    }
  }
}

/** Un hechizo dañino hace que la criatura se dé vuelta contra quien lo lanzó. */
function provoke(target: Mobile, caster: Player): void {
  if (target instanceof Creature && !target.combat.isDead) target.combat.targetId = caster.id;
}
