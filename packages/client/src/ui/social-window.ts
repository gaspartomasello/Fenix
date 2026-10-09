import {
  GUILD_NAME,
  GUILD_TAG,
  NOTORIETY_NAMES,
  PARTY_MAX,
  reputationTitle,
  type EntityId,
  type SocialCommand,
} from '@fenix/shared';
import type { SocialState } from '../core/client-game';
import { el } from './dom';
import { GameWindow } from './game-window';

export type SocialAction = (command: SocialCommand, name?: string, tag?: string) => void;

/** Reputación, invitaciones, grupo y gremio, con botones para todo lo que se hace por chat. */
export class SocialWindow {
  readonly window: GameWindow;
  private readonly reputation = el('section', { className: 'social-section' });
  private readonly invites = el('section', { className: 'social-section social-invites' });
  private readonly party = el('section', { className: 'social-section' });
  private readonly guild = el('section', { className: 'social-section' });

  constructor(private readonly act: SocialAction) {
    this.window = new GameWindow('social', 'Social', { x: 290, y: 90 });
    this.window.body.append(
      this.reputation,
      this.invites,
      this.party,
      this.guild,
      el('p', {
        className: 'window-hint',
        text: 'En el chat: /g habla al grupo, /gr al gremio, /ayuda muestra los comandos.',
      }),
    );
  }

  render(state: SocialState, selfId: EntityId | null): void {
    this.renderReputation(state);
    this.renderInvites(state);
    this.renderParty(state, selfId);
    this.renderGuild(state);
  }

  private renderReputation(state: SocialState): void {
    this.reputation.replaceChildren(
      el('h3', { className: 'social-heading', text: 'Reputación' }),
      el('p', {
        className: `social-notoriety social-notoriety--${state.notoriety}`,
        text: `${NOTORIETY_NAMES[state.notoriety]} · ${reputationTitle(state.fame, state.karma)}`,
      }),
      el('dl', { className: 'skills-list' }, [
        el('dt', { text: 'Fama' }),
        el('dd', { text: String(state.fame) }),
        el('dt', { text: 'Karma' }),
        el('dd', { text: String(state.karma) }),
        el('dt', { text: 'Muertes de inocentes' }),
        el('dd', { text: String(state.murders) }),
      ]),
    );
  }

  private renderInvites(state: SocialState): void {
    const rows: HTMLElement[] = [];
    if (state.invites.party)
      rows.push(
        this.inviteRow(
          `${state.invites.party} te invita a su grupo.`,
          'party-accept',
          'party-decline',
        ),
      );
    if (state.invites.guild)
      rows.push(
        this.inviteRow(
          `${state.invites.guild} te invita a su gremio.`,
          'guild-accept',
          'guild-decline',
        ),
      );
    this.invites.hidden = rows.length === 0;
    this.invites.replaceChildren(...rows);
  }

  private inviteRow(text: string, accept: SocialCommand, decline: SocialCommand): HTMLElement {
    return el('div', { className: 'social-invite' }, [
      el('span', { text }),
      el('div', { className: 'shop-controls' }, [
        this.button('Aceptar', () => this.act(accept)),
        this.button('Rechazar', () => this.act(decline)),
      ]),
    ]);
  }

  private renderParty(state: SocialState, selfId: EntityId | null): void {
    const heading = el('h3', { className: 'social-heading', text: 'Grupo' });
    const party = state.party;
    if (!party) {
      this.party.replaceChildren(
        heading,
        el('p', { className: 'window-hint', text: 'No estás en un grupo.' }),
        this.nameForm('Nombre de quien invitar', 'Invitar', (name) =>
          this.act('party-invite', name),
        ),
      );
      return;
    }
    const members = el(
      'ul',
      { className: 'social-members' },
      party.members.map((member) =>
        el('li', { className: 'social-member' }, [
          el('span', {
            text: member.id === party.leaderId ? `${member.name} (líder)` : member.name,
          }),
          el('span', { className: 'social-health' }, [
            el('span', {
              className: 'social-health-fill',
              attrs: { style: `width: ${Math.round(member.health * 100)}%` },
            }),
          ]),
        ]),
      ),
    );
    const canInvite = party.leaderId === selfId && party.members.length < PARTY_MAX;
    this.party.replaceChildren(
      heading,
      members,
      ...(canInvite
        ? [
            this.nameForm('Nombre de quien invitar', 'Invitar', (name) =>
              this.act('party-invite', name),
            ),
          ]
        : []),
      this.button('Salir del grupo', () => this.act('party-leave')),
    );
  }

  private renderGuild(state: SocialState): void {
    const heading = el('h3', { className: 'social-heading', text: 'Gremio' });
    const guild = state.guild;
    if (!guild) {
      const name = this.input('Nombre del gremio', GUILD_NAME.max);
      const tag = this.input('Siglas', GUILD_TAG.max);
      tag.classList.add('social-tag-input');
      const form = el('form', { className: 'social-form' }, [
        name,
        tag,
        el('button', {
          className: 'button button--small',
          text: 'Fundar',
          attrs: { type: 'submit' },
        }),
      ]);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.act('guild-create', name.value, tag.value);
      });
      this.guild.replaceChildren(
        heading,
        el('p', { className: 'window-hint', text: 'No estás en un gremio. Podés fundar uno:' }),
        form,
      );
      return;
    }
    this.guild.replaceChildren(
      heading,
      el('p', { className: 'social-guild-name', text: `${guild.name} [${guild.tag}]` }),
      el(
        'ul',
        { className: 'social-members' },
        guild.members.map((member) => el('li', { className: 'social-member', text: member })),
      ),
      this.nameForm('Nombre de quien reclutar', 'Reclutar', (name) =>
        this.act('guild-invite', name),
      ),
      this.button('Dejar el gremio', () => this.act('guild-leave')),
    );
  }

  private nameForm(placeholder: string, label: string, onSubmit: (name: string) => void) {
    const input = this.input(placeholder, 16);
    const form = el('form', { className: 'social-form' }, [
      input,
      el('button', { className: 'button button--small', text: label, attrs: { type: 'submit' } }),
    ]);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (input.value.trim()) onSubmit(input.value.trim());
      input.value = '';
    });
    return form;
  }

  private input(placeholder: string, maxLength: number): HTMLInputElement {
    return el('input', {
      className: 'field social-input',
      attrs: {
        type: 'text',
        placeholder,
        'aria-label': placeholder,
        maxlength: String(maxLength),
        autocomplete: 'off',
      },
    });
  }

  private button(text: string, onClick: () => void): HTMLButtonElement {
    const button = el('button', {
      className: 'button button--small',
      text,
      attrs: { type: 'button' },
    });
    button.addEventListener('click', onClick);
    return button;
  }
}
