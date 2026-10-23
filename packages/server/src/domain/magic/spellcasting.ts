import { CREATURES } from '@fenix/shared/creatures/creature-catalog';
import { tileDistance, type Position } from '@fenix/shared/geometry/position';
import { describeItem, type ItemKind } from '@fenix/shared/items/item-catalog';
import {
  attributeModifier,
  cureChance,
  paralyzeDurationMs,
  poisonDurationMs,
  poisonLevel,
  PROTECTION_ARMOR,
  spellDurationMs,
} from '@fenix/shared/magic/effects';
import {
  MAX_SUMMONS,
  SPELLS,
  SPELL_RANGE,
  resistChance,
  rollSpellPower,
  spellDamageBonus,
  spellSuccessChance,
  summonDurationMs,
  dispelChance,
  reactiveArmorPool,
  type PolymorphForm,
  type FieldKind,
  type SpellKey,
} from '@fenix/shared/magic/spell-catalog';
import type { EntityId } from '@fenix/shared/protocol/messages';
import { hasLineOfSight } from '@fenix/shared/rules/line-of-sight';
import { invisibilityMs, revealRadius } from '@fenix/shared/skills/stealth';
import { STATIC_CONTAINERS, staticContainerId } from '@fenix/shared/world/statics';
import { Creature } from '../creatures/creature';
import { emptyChanges, type ItemChanges } from '../items/items';
import { freeSpotNear } from '../persistence/saved-character';
import type { Mobile } from '../mobile';
import { Npc } from '../npcs/npc';
import { Player } from '../player';
import { randomDisguise } from './disguise';
import { pvpRefusal } from '../social/pvp';
import type { World } from '../world';

export interface CastRequest {
  readonly targetId?: EntityId;
  readonly position?: Position;
  /** Pergamino del que se lee el hechizo (no hace falta libro ni reactivos). */
  readonly scrollId?: EntityId;
  /** Runa de la mochila (Marcar, Recordar, Portal). */
  readonly runeId?: EntityId;
  /** Forma elegida para Transformación. */
  readonly form?: PolymorphForm;
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

  if (spell.effect.kind === 'polymorph') {
    if (!request.form) return fail('Elegí en qué querés transformarte.');
    if (player.mount) return fail('Bajate de la montura para transformarte.');
  }

  let targetId = player.id;
  let position: Position | undefined;
  let runeId: EntityId | undefined;
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
      if (otherLevel(world, player.position, target.position)) return fail(OTHER_LEVEL);
      targetId = target.id;
      break;
    }
    case 'harmful': {
      const target = request.targetId ? world.getMobile(request.targetId) : undefined;
      if (!target || target.id === player.id || target.combat.isDead || world.isHidden(target))
        return fail('Elegí a quién lanzarle el hechizo.');
      if (target instanceof Npc) return fail(`No podés atacar a ${target.name}.`);
      if (spell.effect.kind === 'dispel' && !isSummoned(target))
        return fail('Solo se pueden disipar criaturas invocadas.');
      if (tileDistance(target.position, player.position) > SPELL_RANGE)
        return fail('Está demasiado lejos.');
      if (otherLevel(world, player.position, target.position)) return fail(OTHER_LEVEL);
      if (target instanceof Player) {
        const refusal = pvpRefusal(player, target, world);
        if (refusal) return fail(refusal);
        aggressionAgainst = target;
      }
      targetId = target.id;
      break;
    }
    case 'rune': {
      const rune = request.runeId ? items.get(request.runeId) : undefined;
      if (
        !rune ||
        rune.kind !== 'rune' ||
        rune.location.type !== 'backpack' ||
        rune.location.ownerId !== player.id
      )
        return fail('Elegí una runa de tu mochila.');
      if (spell.effect.kind === 'mark') {
        if (world.map.regionAt(player.position)?.dungeon)
          return fail('La magia de este lugar no deja marcar runas.');
      } else if (!rune.mark) {
        return fail('Esa runa está en blanco: marcala primero con Marcar.');
      }
      runeId = rune.id;
      break;
    }
    case 'location': {
      if (!request.position) return fail('Elegí un lugar.');
      if (spell.effect.kind === 'summon' && world.summonsOf(player.id).length >= MAX_SUMMONS)
        return fail('Ya tenés demasiadas criaturas invocadas.');
      if (tileDistance(request.position, player.position) > SPELL_RANGE)
        return fail('Está demasiado lejos.');
      if (otherLevel(world, player.position, request.position)) return fail(OTHER_LEVEL);
      const kind = spell.effect.kind;
      if (kind === 'trap' || kind === 'lock') {
        // La trampa y la cerradura van en un cofre o mueble del mundo.
        if (!staticContainerAt(request.position, world))
          return fail('Elegí un cofre, un barril o un mueble que guarde cosas.');
      } else if (kind === 'telekinesis') {
        if (!world.map.doorAt(request.position) && !staticContainerAt(request.position, world))
          return fail('Elegí una puerta, un cofre o un mueble.');
      } else if (kind === 'field') {
        if (!world.map.isWalkable(request.position)) return fail('No se puede levantar ahí.');
      } else if (
        // Revelar y disipar van a cualquier lugar; para ir o invocar, tiene que estar libre.
        kind !== 'reveal' &&
        kind !== 'dispel-field' &&
        kind !== 'mass-dispel' &&
        (!world.map.isWalkable(request.position) || world.isOccupied(request.position, player.id))
      )
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
    ...(runeId ? { runeId } : {}),
    ...(spell.effect.kind === 'polymorph' && request.form ? { form: request.form } : {}),
    resolveAt: now + spell.castMs,
  };
  return { ok: true, itemChanges: changes, aggressionAgainst };
}

export type CastOutcome =
  | { kind: 'fizzled' }
  /** Algo tapó la vista del objetivo (una pared, una reja): el hechizo se pierde. */
  | { kind: 'blocked' }
  | { kind: 'lost-target' }
  /** Salió, pero cae más tarde (Explosión): lo agenda el ciclo del juego. */
  | { kind: 'delayed'; delayed: DelayedSpell }
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
      /** Invisibilidad: a quién esconder y hasta cuándo (lo hace el ciclo del juego). */
      conceal?: { target: Player; until: number };
      /** Revelar: alrededor de qué lugar y hasta qué distancia. */
      revealAt?: { position: Position; radius: number };
      /** Portal abierto: dónde aparece cada puerta (las crea el ciclo del juego). */
      gate?: { from: Position; to: Position };
      /** El objetivo volvió a la vida. */
      revived?: boolean;
      /** Muro o campo a levantar: de qué, dónde y desde dónde se lanzó (lo hace el ciclo del juego). */
      field?: { kind: FieldKind; at: Position; from: Position };
      /** Trampa puesta o sacada en un mueble (lo hace el caso de uso de los recipientes). */
      trap?: { containerId: string; armed: boolean };
      /** Cerradura mágica puesta o abierta (lo hace el caso de uso de los recipientes). */
      lock?: { containerId: string; locked: boolean; magery: number };
      /** Telequinesis: la puerta o el mueble que se movió desde lejos. */
      telekinesis?: Position;
      /** Disipar campo: el tile del muro o campo a deshacer. */
      dispelField?: Position;
      /** Invocaciones que desaparecen (Disipar). */
      dispelled?: readonly Creature[];
      /** Le cambió el nombre, la cara o la forma al lanzador: hay que avisarlo a los que lo ven. */
      lookChanged?: boolean;
      /** Reflejo mágico: quién devolvió el hechizo (el lanzador lo recibe). */
      reflectedBy?: Mobile;
    };

/** Un hechizo lanzado que todavía no cayó. */
export interface DelayedSpell {
  readonly spell: SpellKey;
  readonly casterId: EntityId;
  readonly targetId: EntityId;
  /** Magia y bonus de daño del lanzador al lanzarlo (no cambian si suben después). */
  readonly magery: number;
  readonly damageBonus: number;
  readonly landAt: number;
}

export interface AreaHit {
  readonly target: Mobile;
  readonly amount: number;
  readonly killed: boolean;
  readonly resisted: boolean;
}

const OTHER_LEVEL = 'Está en otro piso: desde acá no se puede apuntar.';

/** ¿Están en distinto nivel (un piso alto y la calle)? */
function otherLevel(world: World, a: Position, b: Position): boolean {
  return world.map.levelAt(a) !== world.map.levelAt(b);
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
  // Evaluar inteligencia agranda el daño (no las curas ni el maná).
  const damageBonus = spellDamageBonus(player.skills.get('evaluating-intelligence'));

  // Resurrección va a un fantasma; todo lo demás, a alguien vivo.
  const wantsGhost = spell.effect.kind === 'resurrect';
  let target = world.getMobile(pending.targetId);
  if (
    !target ||
    target.combat.isDead !== wantsGhost ||
    tileDistance(target.position, player.position) > SPELL_RANGE
  ) {
    return { kind: 'lost-target' };
  }
  // Como en UO: si al terminar de conjurar el objetivo no está a la vista, el hechizo falla.
  const aim = pending.position ?? (target.id === player.id ? null : target.position);
  if (aim && !hasLineOfSight(world.map, player.position, aim)) return { kind: 'blocked' };
  if (random() >= spellSuccessChance(spell, magery)) return { kind: 'fizzled' };

  const harmful = spell.target === 'harmful';
  // Reflejo mágico: un hechizo dañino contra uno solo vuelve contra quien lo lanzó.
  let reflectedBy: Mobile | undefined;
  if (
    harmful &&
    target !== player &&
    REFLECTABLE.has(spell.effect.kind) &&
    target.combat.removeEffect('magic-reflection')
  ) {
    reflectedBy = target;
    target = player;
  }
  const resisted = harmful && random() < resistChance(magicResistOf(target), spell.circle);
  const success = (
    extra: Partial<Extract<CastOutcome, { kind: 'success' }>> = {},
  ): CastOutcome => ({
    kind: 'success',
    target,
    amount: 0,
    killed: false,
    resisted,
    ...extra,
    effectsChanged: reflectedBy
      ? [...(extra.effectsChanged ?? []), reflectedBy]
      : (extra.effectsChanged ?? []),
    ...(reflectedBy ? { reflectedBy } : {}),
  });
  const duration = (ms: number): number => (resisted ? Math.round(ms / 2) : ms);
  const effect = spell.effect;

  if (effect.kind === 'damage' && spell.delayMs) {
    return {
      kind: 'delayed',
      delayed: {
        spell: pending.spell,
        casterId: player.id,
        targetId: target.id,
        magery,
        damageBonus,
        landAt: now + spell.delayMs,
      },
    };
  }

  switch (effect.kind) {
    case 'damage': {
      const rolled = Math.round(rollSpellPower(spell, magery, random) * damageBonus);
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
    case 'invisibility':
      if (!(target instanceof Player))
        return success({ message: 'Solo se puede volver invisible a una persona.' });
      return success({ conceal: { target, until: now + invisibilityMs(magery) } });
    case 'reveal':
      return success({
        revealAt: { position: pending.position ?? player.position, radius: revealRadius(magery) },
      });
    case 'mark':
    case 'recall':
    case 'gate':
      return travel(player, world, pending.runeId, effect.kind, success);
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
        const rolled = Math.round(rollSpellPower(spell, magery, random) * damageBonus);
        const amount = held ? Math.max(1, Math.round(rolled / 2)) : rolled;
        const killed = mobile.combat.takeDamage(amount);
        if (!killed) provoke(mobile, player);
        hits.push({ target: mobile, amount, killed, resisted: held });
      }
      return success({ areaHits: hits });
    }
    case 'field': {
      const at = pending.position;
      if (!at) return { kind: 'lost-target' };
      return success({ field: { kind: effect.field, at, from: player.position } });
    }
    case 'trap': {
      const at = pending.position;
      const placed = at ? staticContainerAt(at, world) : undefined;
      if (!at || !placed) return { kind: 'lost-target' };
      return success({ trap: { containerId: staticContainerId(at), armed: effect.armed } });
    }
    case 'area-cure':
    case 'area-protection': {
      const changed: Mobile[] = [];
      let cured = 0;
      for (const mobile of world.mobilesNear(player.position)) {
        if (mobile.combat.isDead || mobile instanceof Npc) continue;
        if (tileDistance(mobile.position, player.position) > effect.radius) continue;
        // Aliados: uno mismo, las personas cercanas y las criaturas propias.
        const ally =
          mobile === player ||
          mobile instanceof Player ||
          (mobile instanceof Creature && mobile.ownerId === player.id);
        if (!ally) continue;
        if (effect.kind === 'area-protection') {
          mobile.combat.applyEffect('protection', PROTECTION_ARMOR, spellDurationMs(magery), now);
          changed.push(mobile);
        } else {
          const poison = mobile.combat.effect('poison');
          if (poison && random() < cureChance(magery / 1000, poison.amount)) {
            mobile.combat.removeEffect('poison');
            changed.push(mobile);
            cured += 1;
          }
        }
      }
      return success({
        effectsChanged: changed,
        message:
          effect.kind === 'area-protection'
            ? `Protegiste a ${changed.length === 1 ? 'vos mismo' : `${changed.length} aliados`}.`
            : cured > 0
              ? `Sacaste el veneno a ${cured}.`
              : 'Nadie cerca estaba envenenado.',
      });
    }
    case 'burst':
    case 'burst-curse': {
      const hits: AreaHit[] = [];
      const changed: Mobile[] = [];
      for (const mobile of world.mobilesNear(target.position)) {
        if (mobile === player || mobile instanceof Npc || mobile.combat.isDead) continue;
        if (tileDistance(mobile.position, target.position) > effect.radius) continue;
        if (mobile instanceof Creature && mobile.ownerId === player.id) continue;
        if (mobile !== target && mobile instanceof Player && pvpRefusal(player, mobile, world))
          continue;
        const held = random() < resistChance(magicResistOf(mobile), spell.circle);
        if (effect.kind === 'burst-curse') {
          const amount = -attributeModifier(magery);
          const ms = spellDurationMs(magery);
          for (const attribute of ['strength', 'dexterity', 'intelligence'] as const)
            mobile.combat.applyEffect(attribute, amount, held ? Math.round(ms / 2) : ms, now);
          provoke(mobile, player);
          changed.push(mobile);
          continue;
        }
        const rolled = Math.round(rollSpellPower(spell, magery, random) * damageBonus);
        const amount = held ? Math.max(1, Math.round(rolled / 2)) : rolled;
        const killed = mobile.combat.takeDamage(amount);
        if (!killed) provoke(mobile, player);
        hits.push({ target: mobile, amount, killed, resisted: held });
      }
      return success({ areaHits: hits, effectsChanged: changed });
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
      const kind = effect.choices
        ? (effect.choices[Math.floor(random() * effect.choices.length)] ?? effect.creature)
        : effect.creature;
      const creature = new Creature(ids(), kind, position, {
        ownerId: player.id,
        expiresAt: now + summonDurationMs(magery),
      });
      world.addCreature(creature);
      return success({ target: creature, summoned: creature });
    }
    case 'reactive-armor':
      target.combat.applyEffect(
        'reactive-armor',
        reactiveArmorPool(magery),
        spellDurationMs(magery),
        now,
      );
      return success({ effectsChanged: [target] });
    case 'magic-reflection':
      target.combat.applyEffect('magic-reflection', 1, spellDurationMs(magery) * 2, now);
      return success({ effectsChanged: [target] });
    case 'lock': {
      const at = pending.position;
      if (!at || !staticContainerAt(at, world)) return { kind: 'lost-target' };
      return success({
        lock: { containerId: staticContainerId(at), locked: effect.locked, magery },
      });
    }
    case 'telekinesis': {
      const at = pending.position;
      if (!at) return { kind: 'lost-target' };
      return success({ telekinesis: at });
    }
    case 'dispel-field': {
      const at = pending.position;
      if (!at) return { kind: 'lost-target' };
      return success({ dispelField: at });
    }
    case 'dispel': {
      if (!isSummoned(target)) return success({ message: 'Eso no es una criatura invocada.' });
      provoke(target, player);
      if (random() >= dispelChance(magery))
        return success({ message: `${capitalize(target.name)} resistió el hechizo.` });
      return success({ dispelled: [target] });
    }
    case 'mass-dispel': {
      const at = pending.position ?? player.position;
      const gone: Creature[] = [];
      for (const mobile of world.mobilesNear(at)) {
        if (!isSummoned(mobile) || mobile.ownerId === player.id) continue;
        if (tileDistance(mobile.position, at) > effect.radius) continue;
        if (random() < dispelChance(magery)) gone.push(mobile);
      }
      return success({
        dispelled: gone,
        ...(gone.length === 0 ? { message: 'No desapareció ninguna invocación.' } : {}),
      });
    }
    case 'incognito':
      if (player.form) return success({ message: 'No podés cambiarte la cara transformado.' });
      player.disguise = randomDisguise(player.appearance, random);
      player.combat.applyEffect('incognito', 0, spellDurationMs(magery) * 2, now);
      return success({
        effectsChanged: [player],
        lookChanged: true,
        message: `Ahora te ven como ${player.disguise.name}.`,
      });
    case 'polymorph': {
      const form = pending.form;
      if (!form) return { kind: 'lost-target' };
      if (player.mount) return success({ message: 'Bajate de la montura para transformarte.' });
      player.form = form;
      player.combat.applyEffect('polymorph', 0, spellDurationMs(magery) * 2, now);
      return success({
        effectsChanged: [player],
        lookChanged: true,
        message: `Te transformaste en ${CREATURES[form].article} ${CREATURES[form].name}.`,
      });
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

/** Hechizos dañinos que el Reflejo mágico devuelve (los de área, no). */
const REFLECTABLE: ReadonlySet<string> = new Set([
  'damage',
  'attribute',
  'poison',
  'paralyze',
  'mana-drain',
  'dispel',
]);

/** Una criatura que llegó invocada con un hechizo (no las monturas). */
function isSummoned(mobile: Mobile): mobile is Creature {
  return mobile instanceof Creature && mobile.ownerId !== null && mobile.expiresAt !== null;
}

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** El mueble que guarda cosas en ese tile, si hay. */
function staticContainerAt(at: Position, world: World): boolean {
  return world.map.statics.some((s) => s.x === at.x && s.y === at.y && !!STATIC_CONTAINERS[s.kind]);
}

/** Un hechizo dañino hace que la criatura se dé vuelta contra quien lo lanzó. */
function provoke(target: Mobile, caster: Player): void {
  if (target instanceof Creature && !target.combat.isDead) target.combat.targetId = caster.id;
}

/**
 * Cae un hechizo demorado: si el objetivo sigue vivo (y en el mundo), recibe
 * el daño, con su tirada de Resistencia mágica en ese momento. Cayó aunque se
 * haya alejado: el hechizo ya estaba encima suyo.
 */
export function landDelayedSpell(
  delayed: DelayedSpell,
  world: World,
  random: () => number,
): Extract<CastOutcome, { kind: 'success' }> | null {
  const target = world.getMobile(delayed.targetId);
  const spell = SPELLS[delayed.spell];
  if (!target || target.combat.isDead || spell.effect.kind !== 'damage') return null;
  const resisted = random() < resistChance(magicResistOf(target), spell.circle);
  const rolled = Math.round(rollSpellPower(spell, delayed.magery, random) * delayed.damageBonus);
  const amount = resisted ? Math.max(1, Math.round(rolled / 2)) : rolled;
  const killed = target.combat.takeDamage(amount);
  // La criatura se da vuelta contra quien la atacó.
  if (!killed && target instanceof Creature) target.combat.targetId = delayed.casterId;
  return { kind: 'success', target, amount, killed, resisted, effectsChanged: [] };
}

/**
 * Viajes con runas. Marcar graba en la runa el lugar donde está el
 * lanzador; Recordar lo lleva al lugar de la runa; Portal abre una puerta al
 * lado suyo y otra en ese lugar, que cualquiera puede cruzar un rato.
 */
function travel(
  player: Player,
  world: World,
  runeId: EntityId | undefined,
  kind: 'mark' | 'recall' | 'gate',
  success: (extra?: Partial<Extract<CastOutcome, { kind: 'success' }>>) => CastOutcome,
): CastOutcome {
  const rune = runeId ? world.items.get(runeId) : undefined;
  const inBackpack =
    rune?.location.type === 'backpack' &&
    rune.location.ownerId === player.id &&
    rune.kind === 'rune';
  if (!rune || !inBackpack) return { kind: 'lost-target' };
  if (kind === 'mark') {
    const label = world.map.regionAt(player.position)?.name ?? 'Tierras salvajes';
    rune.mark = { x: player.position.x, y: player.position.y, label };
    const itemChanges = emptyChanges();
    itemChanges.inventories.add(player.id);
    return success({
      itemChanges,
      message: `Marcaste la runa: ${label} (${rune.mark.x}, ${rune.mark.y}).`,
    });
  }
  if (!rune.mark) return { kind: 'lost-target' };
  // Justo en el lugar marcado; si hay alguien parado ahí, al lado.
  const marked = { x: rune.mark.x, y: rune.mark.y };
  const destination =
    world.map.isWalkable(marked) && !world.isOccupied(marked)
      ? marked
      : freeSpotNear(world, marked);
  if (kind === 'recall') return success({ moveTo: destination });
  return success({ gate: { from: freeSpotNear(world, player.position), to: destination } });
}
