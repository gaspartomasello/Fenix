import type { EntityId } from '@fenix/shared/protocol/messages';
import { Creature } from '../../../domain/creatures/creature';
import { Npc } from '../../../domain/npcs/npc';
import { Player } from '../../../domain/player';
import { pvpRefusal } from '../../../domain/social/pvp';
import type { World } from '../../../domain/world';
import type { MobileNotifications } from '../../kernel/mobile-notifications';
import type { Clock, Notifier } from '../../ports';
import type { SocialNotifications } from '../../kernel/social-notifications';
import type { WarMode } from './war-mode';
import { safetyRefusal } from '../../kernel/aggression';

/** Elegir a quién atacar (el golpe lo da el ciclo del juego cuando está al alcance). */
export class Attack {
  constructor(
    private readonly world: World,
    private readonly clock: Clock,
    private readonly mobiles: MobileNotifications,
    private readonly social: SocialNotifications,
    private readonly notifier: Notifier,
    private readonly warMode: WarMode,
  ) {}

  execute(playerId: EntityId, targetId: EntityId): void {
    const player = this.world.get(playerId);
    if (!player) return;
    const refuse = (text: string): void => this.notifier.send(playerId, { type: 'system', text });

    if (player.combat.isDead) return refuse('Los fantasmas no pueden pelear.');
    const target = this.world.getMobile(targetId);
    if (!target || target.id === playerId || this.world.isHidden(target)) return;
    if (target instanceof Npc) return refuse(`No podés atacar a ${target.name}.`);
    if (target instanceof Creature && target.ownerId === playerId)
      return refuse(target.isPet ? 'Es tu montura.' : 'Es una criatura que invocaste vos.');
    if (target.combat.isDead) return;
    // La montura de otro jugador: atacarla es atacarlo a él (mismas reglas y mismas consecuencias).
    const owner = target instanceof Creature && target.isPet ? this.petOwner(target) : undefined;
    if (owner) {
      if (this.world.map.safeZoneAt(player.position) || this.world.map.safeZoneAt(target.position))
        return refuse('Dentro del pueblo no se puede atacar la montura de otro jugador.');
      const reason = pvpRefusal(player, owner, this.world) ?? safetyRefusal(player, owner);
      if (reason) return refuse(reason);
    }
    if (target instanceof Player) {
      const reason = pvpRefusal(player, target, this.world);
      if (reason) return refuse(reason);
    }
    // Con el seguro puesto no se ataca a un inocente (persona o gente de paz de los caminos).
    const unsafe = safetyRefusal(player, target);
    if (unsafe) return refuse(unsafe);
    // Elegirlo no es un crimen (lo es lastimarlo), pero el otro se entera.
    if (target instanceof Player)
      this.notifier.send(target.id, { type: 'system', text: `¡${player.name} te está atacando!` });

    // Atacar pone en modo guerra.
    this.warMode.set(player, true);
    player.combat.targetId = target.id;
    this.mobiles.sendTarget(player);
  }

  /** Entrar o salir del modo guerra (en paz se deja de atacar). */
  setWarMode(playerId: EntityId, war: boolean): void {
    const player = this.world.get(playerId);
    if (player && !player.combat.isDead) this.warMode.set(player, war);
  }

  private petOwner(pet: Creature): Player | undefined {
    return pet.ownerId ? this.world.get(pet.ownerId) : undefined;
  }

  stop(playerId: EntityId): void {
    const player = this.world.get(playerId);
    if (!player || player.combat.targetId === null) return;
    player.combat.targetId = null;
    this.mobiles.sendTarget(player);
  }
}
