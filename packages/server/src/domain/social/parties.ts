import { INVITE_MS, PARTY_MAX, type EntityId } from '@fenix/shared';

/** Un grupo de jugadores que comparten chat y no se atacan entre sí. */
export class Party {
  readonly members: EntityId[];

  constructor(public leaderId: EntityId) {
    this.members = [leaderId];
  }

  get isFull(): boolean {
    return this.members.length >= PARTY_MAX;
  }
}

interface Invite {
  readonly fromId: EntityId;
  readonly expiresAt: number;
}

export type PartyResult<T> = { ok: true; value: T } | { ok: false; reason: string };

/** Todos los grupos del mundo y las invitaciones pendientes. */
export class Parties {
  private readonly byMember = new Map<EntityId, Party>();
  private readonly invites = new Map<EntityId, Invite>();

  of(playerId: EntityId): Party | undefined {
    return this.byMember.get(playerId);
  }

  sameParty(a: EntityId, b: EntityId): boolean {
    const party = this.byMember.get(a);
    return party !== undefined && party === this.byMember.get(b);
  }

  /** Quién invitó a este jugador, si la invitación sigue vigente. */
  inviterOf(playerId: EntityId, now: number): EntityId | null {
    const invite = this.invites.get(playerId);
    if (!invite) return null;
    if (now >= invite.expiresAt) {
      this.invites.delete(playerId);
      return null;
    }
    return invite.fromId;
  }

  invite(fromId: EntityId, toId: EntityId, now: number): PartyResult<void> {
    const party = this.byMember.get(fromId);
    if (fromId === toId) return { ok: false, reason: 'No podés invitarte a vos mismo.' };
    if (party && party.leaderId !== fromId)
      return { ok: false, reason: 'Solo quien lidera el grupo puede invitar.' };
    if (party?.isFull) return { ok: false, reason: 'El grupo está completo.' };
    if (this.byMember.has(toId)) return { ok: false, reason: 'Ya está en un grupo.' };
    this.invites.set(toId, { fromId, expiresAt: now + INVITE_MS });
    return { ok: true, value: undefined };
  }

  accept(playerId: EntityId, now: number): PartyResult<Party> {
    const fromId = this.inviterOf(playerId, now);
    this.invites.delete(playerId);
    if (!fromId) return { ok: false, reason: 'No tenés invitaciones a un grupo.' };
    if (this.byMember.has(playerId)) return { ok: false, reason: 'Ya estás en un grupo.' };
    let party = this.byMember.get(fromId);
    if (!party) {
      party = new Party(fromId);
      this.byMember.set(fromId, party);
    }
    if (party.isFull) return { ok: false, reason: 'El grupo está completo.' };
    party.members.push(playerId);
    this.byMember.set(playerId, party);
    return { ok: true, value: party };
  }

  decline(playerId: EntityId): EntityId | null {
    const invite = this.invites.get(playerId);
    this.invites.delete(playerId);
    return invite?.fromId ?? null;
  }

  /**
   * Saca al jugador de su grupo (y de invitaciones). Si quedan menos de dos,
   * el grupo se disuelve. Devuelve el grupo afectado y quiénes quedaron sin grupo.
   */
  leave(playerId: EntityId): { party: Party; dissolved: EntityId[] } | null {
    this.invites.delete(playerId);
    const party = this.byMember.get(playerId);
    if (!party) return null;
    party.members.splice(party.members.indexOf(playerId), 1);
    this.byMember.delete(playerId);
    const dissolved: EntityId[] = [];
    if (party.members.length < 2) {
      for (const id of party.members) {
        this.byMember.delete(id);
        dissolved.push(id);
      }
      party.members.length = 0;
    } else if (party.leaderId === playerId) {
      party.leaderId = party.members[0] ?? playerId;
    }
    return { party, dissolved };
  }
}
