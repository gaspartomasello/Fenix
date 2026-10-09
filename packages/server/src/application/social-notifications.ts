import type { EntityId } from '@fenix/shared';
import type { Player } from '../domain/player';
import type { Guild } from '../domain/social/guilds';
import type { Party } from '../domain/social/parties';
import type { World } from '../domain/world';
import type { MobileNotifications } from './mobile-notifications';
import type { Clock, Notifier } from './ports';

/** Avisos sociales: estado del grupo y del gremio, reputación, y cambios de nombre visibles. */
export class SocialNotifications {
  constructor(
    private readonly world: World,
    private readonly clock: Clock,
    private readonly mobiles: MobileNotifications,
    private readonly notifier: Notifier,
  ) {}

  /** Manda al jugador su estado social completo. */
  sendSocial(player: Player): void {
    const now = this.clock.now();
    const party = this.world.parties.of(player.id);
    const guild = this.world.guilds.of(player.name);
    const partyInviter = this.world.parties.inviterOf(player.id, now);
    const { reputation } = player;
    this.notifier.send(player.id, {
      type: 'social',
      party: party
        ? {
            leaderId: party.leaderId,
            members: party.members.flatMap((id) => {
              const member = this.world.get(id);
              return member ? [{ id, name: member.name, health: member.combat.health }] : [];
            }),
          }
        : null,
      guild: guild ? { name: guild.name, tag: guild.tag, members: [...guild.members] } : null,
      invites: {
        party: partyInviter ? (this.world.get(partyInviter)?.name ?? null) : null,
        guild: this.world.guilds.inviterOf(player.name, now),
      },
      fame: reputation.fame,
      karma: reputation.karma,
      murders: reputation.murders,
      notoriety: reputation.notoriety,
    });
  }

  /** Reputación o gremio cambiaron: lo ven quienes están cerca y el propio jugador. */
  statusChanged(player: Player): void {
    const snapshot = this.world.snapshotOf(player);
    this.notifier.sendMany(this.mobiles.watchers(player), {
      type: 'mobileStatus',
      id: player.id,
      notoriety: snapshot.notoriety,
      guildTag: snapshot.guildTag,
    });
    this.sendSocial(player);
  }

  refreshParty(party: Party, extra: readonly EntityId[] = []): void {
    for (const id of [...party.members, ...extra]) {
      const member = this.world.get(id);
      if (member) this.sendSocial(member);
    }
  }

  refreshGuild(guild: Guild): void {
    for (const player of this.onlineMembers(guild)) this.sendSocial(player);
  }

  onlineMembers(guild: Guild): Player[] {
    return [...guild.members].flatMap((name) => {
      const player = this.world.findByName(name);
      return player ? [player] : [];
    });
  }

  tell(playerIds: readonly EntityId[], text: string): void {
    this.notifier.sendMany(playerIds, { type: 'system', text });
  }
}
