import type { EntityId, SocialRequest } from '@fenix/shared';
import type { Player } from '../../domain/player';
import type { World } from '../../domain/world';
import type { Clock } from '../ports';
import type { SocialNotifications } from '../social-notifications';

/** Grupos y gremios: invitar, aceptar, rechazar, crear y salir. */
export class SocialActions {
  constructor(
    private readonly world: World,
    private readonly clock: Clock,
    private readonly social: SocialNotifications,
  ) {}

  execute(playerId: EntityId, request: SocialRequest): void {
    const player = this.world.get(playerId);
    if (!player) return;
    switch (request.command) {
      case 'party-invite':
        return this.partyInvite(player, request.name ?? '');
      case 'party-accept':
        return this.partyAccept(player);
      case 'party-decline':
        return this.partyDecline(player);
      case 'party-leave':
        return this.partyLeave(player, 'saliste del grupo');
      case 'guild-create':
        return this.guildCreate(player, request.name ?? '', request.tag ?? '');
      case 'guild-invite':
        return this.guildInvite(player, request.name ?? '');
      case 'guild-accept':
        return this.guildAccept(player);
      case 'guild-decline':
        return this.guildDecline(player);
      case 'guild-leave':
        return this.guildLeave(player);
    }
  }

  /** Al salir del mundo deja el grupo y olvida invitaciones; el gremio se conserva. */
  disconnect(player: Player): void {
    this.world.guilds.clearInvite(player.name);
    this.partyLeave(player, null);
  }

  private refuse(player: Player, text: string): void {
    this.social.tell([player.id], text);
  }

  private findTarget(player: Player, name: string): Player | null {
    const target = this.world.findByName(name);
    if (!target) {
      this.refuse(player, `No hay nadie conectado con el nombre «${name.trim()}».`);
      return null;
    }
    return target;
  }

  private partyInvite(player: Player, name: string): void {
    const target = this.findTarget(player, name);
    if (!target) return;
    const result = this.world.parties.invite(player.id, target.id, this.clock.now());
    if (!result.ok) return this.refuse(player, result.reason);
    this.social.tell([player.id], `Invitaste a ${target.name} a tu grupo.`);
    this.social.tell(
      [target.id],
      `${player.name} te invita a su grupo. Abrí la ventana social (O) para responder.`,
    );
    this.social.sendSocial(target);
  }

  private partyAccept(player: Player): void {
    const result = this.world.parties.accept(player.id, this.clock.now());
    if (!result.ok) return this.refuse(player, result.reason);
    const party = result.value;
    this.social.tell(party.members, `${player.name} se unió al grupo.`);
    this.social.refreshParty(party);
  }

  private partyDecline(player: Player): void {
    const fromId = this.world.parties.decline(player.id);
    if (fromId) this.social.tell([fromId], `${player.name} rechazó tu invitación al grupo.`);
    this.social.sendSocial(player);
  }

  private partyLeave(player: Player, message: string | null): void {
    const result = this.world.parties.leave(player.id);
    if (!result) {
      if (message) this.refuse(player, 'No estás en un grupo.');
      return;
    }
    const { party, dissolved } = result;
    this.social.tell(party.members, `${player.name} salió del grupo.`);
    if (dissolved.length > 0) this.social.tell(dissolved, 'El grupo se disolvió.');
    if (message) {
      this.social.tell([player.id], `Saliste del grupo.`);
      this.social.sendSocial(player);
    }
    this.social.refreshParty(party, dissolved);
  }

  private guildCreate(player: Player, name: string, tag: string): void {
    const result = this.world.guilds.create(player.name, name, tag);
    if (!result.ok) return this.refuse(player, result.reason);
    this.social.tell([player.id], `Fundaste el gremio ${result.value.name} [${result.value.tag}].`);
    this.social.statusChanged(player);
  }

  private guildInvite(player: Player, name: string): void {
    const target = this.findTarget(player, name);
    if (!target) return;
    const result = this.world.guilds.invite(player.name, target.name, this.clock.now());
    if (!result.ok) return this.refuse(player, result.reason);
    this.social.tell([player.id], `Invitaste a ${target.name} al gremio.`);
    this.social.tell(
      [target.id],
      `${player.name} te invita al gremio ${result.value.name}. Abrí la ventana social (O) para responder.`,
    );
    this.social.sendSocial(target);
  }

  private guildAccept(player: Player): void {
    const result = this.world.guilds.accept(player.name, this.clock.now());
    if (!result.ok) return this.refuse(player, result.reason);
    const guild = result.value;
    const online = this.social.onlineMembers(guild);
    this.social.tell(
      online.map((p) => p.id),
      `${player.name} se unió al gremio ${guild.name}.`,
    );
    this.social.statusChanged(player);
    this.social.refreshGuild(guild);
  }

  private guildDecline(player: Player): void {
    const fromName = this.world.guilds.decline(player.name);
    const inviter = fromName ? this.world.findByName(fromName) : undefined;
    if (inviter) this.social.tell([inviter.id], `${player.name} rechazó tu invitación al gremio.`);
    this.social.sendSocial(player);
  }

  private guildLeave(player: Player): void {
    const guild = this.world.guilds.leave(player.name);
    if (!guild) return this.refuse(player, 'No estás en un gremio.');
    this.social.tell([player.id], `Saliste del gremio ${guild.name}.`);
    const online = this.social.onlineMembers(guild);
    this.social.tell(
      online.map((p) => p.id),
      `${player.name} salió del gremio.`,
    );
    this.social.statusChanged(player);
    this.social.refreshGuild(guild);
  }
}
