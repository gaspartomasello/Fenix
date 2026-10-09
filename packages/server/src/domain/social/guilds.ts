import { INVITE_MS, validateGuild } from '@fenix/shared';

/**
 * Un gremio. Los miembros se guardan por nombre de personaje (los nombres
 * son únicos), así la membresía sobrevive a desconectarse.
 */
export class Guild {
  readonly members = new Set<string>();

  constructor(
    readonly name: string,
    readonly tag: string,
  ) {}
}

interface Invite {
  readonly guild: Guild;
  readonly fromName: string;
  readonly expiresAt: number;
}

export type GuildResult<T> = { ok: true; value: T } | { ok: false; reason: string };

const key = (name: string): string => name.toLocaleLowerCase();

/** Todos los gremios y las invitaciones pendientes. */
export class Guilds {
  private readonly guilds: Guild[] = [];
  private readonly byMember = new Map<string, Guild>();
  private readonly invites = new Map<string, Invite>();

  of(memberName: string): Guild | undefined {
    return this.byMember.get(key(memberName));
  }

  sameGuild(a: string, b: string): boolean {
    const guild = this.of(a);
    return guild !== undefined && guild === this.of(b);
  }

  all(): readonly Guild[] {
    return this.guilds;
  }

  inviterOf(name: string, now: number): string | null {
    const invite = this.invites.get(key(name));
    if (!invite) return null;
    if (now >= invite.expiresAt) {
      this.invites.delete(key(name));
      return null;
    }
    return invite.fromName;
  }

  create(founder: string, rawName: string, rawTag: string): GuildResult<Guild> {
    if (this.of(founder)) return { ok: false, reason: 'Ya estás en un gremio.' };
    const validation = validateGuild(rawName, rawTag);
    if (!validation.ok) return validation;
    const { name, tag } = validation;
    if (this.guilds.some((g) => key(g.name) === key(name)))
      return { ok: false, reason: 'Ya existe un gremio con ese nombre.' };
    if (this.guilds.some((g) => g.tag === tag))
      return { ok: false, reason: 'Esas siglas ya están en uso.' };
    const guild = new Guild(name, tag);
    this.guilds.push(guild);
    this.join(guild, founder);
    return { ok: true, value: guild };
  }

  /** Al cargar un personaje guardado: vuelve a su gremio, o lo refunda si ya no existe. */
  restore(memberName: string, name: string, tag: string): Guild | null {
    if (this.of(memberName)) return this.of(memberName) ?? null;
    let guild = this.guilds.find((g) => key(g.name) === key(name));
    if (!guild) {
      if (this.guilds.some((g) => g.tag === tag)) return null;
      guild = new Guild(name, tag);
      this.guilds.push(guild);
    }
    this.join(guild, memberName);
    return guild;
  }

  /** Agrega un miembro directamente. */
  join(guild: Guild, name: string): void {
    guild.members.add(name);
    this.byMember.set(key(name), guild);
  }

  invite(fromName: string, toName: string, now: number): GuildResult<Guild> {
    const guild = this.of(fromName);
    if (!guild) return { ok: false, reason: 'No estás en un gremio.' };
    if (this.of(toName)) return { ok: false, reason: 'Ya está en un gremio.' };
    this.invites.set(key(toName), { guild, fromName, expiresAt: now + INVITE_MS });
    return { ok: true, value: guild };
  }

  accept(name: string, now: number): GuildResult<Guild> {
    const fromName = this.inviterOf(name, now);
    const invite = this.invites.get(key(name));
    this.invites.delete(key(name));
    if (!fromName || !invite) return { ok: false, reason: 'No tenés invitaciones a un gremio.' };
    if (this.of(name)) return { ok: false, reason: 'Ya estás en un gremio.' };
    if (!this.guilds.includes(invite.guild))
      return { ok: false, reason: 'Ese gremio ya no existe.' };
    this.join(invite.guild, name);
    return { ok: true, value: invite.guild };
  }

  decline(name: string): string | null {
    const invite = this.invites.get(key(name));
    this.invites.delete(key(name));
    return invite?.fromName ?? null;
  }

  /** Sale del gremio; si queda vacío, el gremio se disuelve. */
  leave(name: string): Guild | null {
    const guild = this.of(name);
    if (!guild) return null;
    guild.members.delete(name);
    this.byMember.delete(key(name));
    if (guild.members.size === 0) this.guilds.splice(this.guilds.indexOf(guild), 1);
    return guild;
  }

  /** Olvida invitaciones pendientes (al salir del mundo). */
  clearInvite(name: string): void {
    this.invites.delete(key(name));
  }
}
