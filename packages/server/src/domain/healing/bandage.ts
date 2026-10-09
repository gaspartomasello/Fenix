import {
  BANDAGE_RANGE,
  bandageChance,
  bandageCurePower,
  bandageDelayMs,
  canCurePoison,
  cureChance,
  rollBandageHeal,
  tileDistance,
  type EntityId,
  type SkillKey,
} from '@fenix/shared';
import { emptyChanges, type ItemChanges } from '../items/items';
import type { Mobile } from '../mobile';
import { Player } from '../player';
import type { World } from '../world';

export type StartBandageResult =
  { ok: true; changes: ItemChanges; target: Player } | { ok: false; reason: string };

/** Empezar a vendar a alguien (o a uno mismo): gasta la venda y tarda unos segundos. */
export function startBandage(
  player: Player,
  itemId: EntityId,
  targetId: EntityId,
  world: World,
  now: number,
): StartBandageResult {
  const fail = (reason: string): StartBandageResult => ({ ok: false, reason });
  if (player.combat.isDead) return fail('Los fantasmas no pueden curar.');
  if (player.pendingBandage) return fail('Ya estás vendando a alguien.');
  const bandage = world.items.get(itemId);
  if (!bandage || bandage.kind !== 'bandage' || bandage.ownerId() !== player.id)
    return fail('Necesitás vendas en la mochila.');
  const target = world.getMobile(targetId);
  if (!(target instanceof Player)) return fail('Solo podés vendar a personas.');
  if (target.combat.isDead) return fail('Ya no se puede ayudar con vendas.');
  if (tileDistance(target.position, player.position) > BANDAGE_RANGE)
    return fail('Acercate más para vendar.');
  const self = target.id === player.id;
  if (
    target.combat.current.hits >= target.combat.current.maxHits &&
    !target.combat.effect('poison')
  )
    return fail(self ? 'No estás herido.' : `${target.name} no está herido.`);

  const changes = emptyChanges();
  world.items.consumeFromBackpack(player.id, 'bandage', 1, changes);
  const delay = bandageDelayMs(player.combat.attributes.dexterity, self);
  player.pendingBandage = { targetId: target.id, resolveAt: now + delay };
  return { ok: true, changes, target };
}

export type BandageOutcome =
  | { kind: 'lost-target' }
  | { kind: 'failed'; gains: SkillKey[] }
  | { kind: 'healed'; target: Mobile; amount: number; cured: boolean; gains: SkillKey[] };

/** Termina la venda: cura según Primeros auxilios y Anatomía, y puede sacar el veneno. */
export function resolveBandage(
  player: Player,
  world: World,
  random: () => number,
): BandageOutcome | null {
  const pending = player.pendingBandage;
  if (!pending) return null;
  player.pendingBandage = null;
  const target = world.getMobile(pending.targetId);
  if (
    !target ||
    target.combat.isDead ||
    player.combat.isDead ||
    tileDistance(target.position, player.position) > BANDAGE_RANGE
  )
    return { kind: 'lost-target' };

  const healing = player.skills.get('healing');
  const anatomy = player.skills.get('anatomy');
  const gains = (['healing', 'anatomy'] as const).filter((skill) =>
    player.skills.tryGain(skill, random),
  );
  if (random() >= bandageChance(healing)) return { kind: 'failed', gains };

  let cured = false;
  const poison = target.combat.effect('poison');
  if (poison && canCurePoison(healing, anatomy)) {
    if (random() < cureChance(bandageCurePower(healing, anatomy), poison.amount)) {
      target.combat.removeEffect('poison');
      cured = true;
    }
  }
  const amount = poison && !cured ? 0 : rollBandageHeal(healing, anatomy, random);
  target.combat.heal(amount);
  return { kind: 'healed', target, amount, cured, gains };
}
