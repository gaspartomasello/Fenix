import { SKILL_NAMES, type AccountMessage, type CharacterSummary } from '@fenix/shared';
import { drawPortrait } from './appearance-picker';
import { el } from './dom';

export interface CharacterListOptions {
  readonly onPlay: (name: string) => void;
  readonly onCreate: () => void;
  readonly onDelete: (name: string) => void;
}

/** Cuánto espera la confirmación de borrar un personaje. */
const CONFIRM_MS = 4000;

/** Los personajes de la cuenta: elegir con cuál jugar, crear uno nuevo o borrar. */
export class CharacterListScreen {
  readonly element: HTMLElement;
  private readonly list: HTMLElement;
  private readonly title: HTMLElement;
  private readonly errorText: HTMLElement;

  constructor(private readonly options: CharacterListOptions) {
    this.title = el('h1', { className: 'title title--small', text: 'Tus personajes' });
    this.list = el('div', { className: 'character-slots' });
    this.errorText = el('p', { className: 'login-error', attrs: { role: 'alert' } });
    this.element = el('div', { className: 'login-screen' }, [
      el('div', { className: 'panel login-panel character-list-panel' }, [
        this.title,
        el('p', {
          className: 'subtitle',
          text: 'Elegí con quién jugar o creá un personaje nuevo.',
        }),
        this.list,
        this.errorText,
      ]),
    ]);
  }

  show(account: AccountMessage): void {
    this.title.textContent = `Cuenta de ${account.name}`;
    this.errorText.textContent = '';
    const slots: HTMLElement[] = account.characters.map((c) => this.slot(c));
    for (let i = account.characters.length; i < account.slots; i++) slots.push(this.emptySlot());
    this.list.replaceChildren(...slots);
    this.setBusy(false);
  }

  showError(message: string): void {
    this.errorText.textContent = message;
    this.setBusy(false);
  }

  setBusy(busy: boolean): void {
    this.list.querySelectorAll('button').forEach((b) => (b.disabled = busy));
  }

  destroy(): void {
    this.element.remove();
  }

  private slot(character: CharacterSummary): HTMLElement {
    const portrait = el('canvas', {
      className: 'character-portrait',
      attrs: { 'aria-hidden': 'true' },
    });
    drawPortrait(portrait, character.appearance, undefined, 1);
    const skills = character.topSkills
      .map(({ skill, value }) => `${SKILL_NAMES[skill]} ${(value / 10).toFixed(1)}`)
      .join(' · ');
    const play = el('button', {
      className: 'button button--small',
      text: 'Jugar',
      attrs: { type: 'button' },
    });
    play.addEventListener('click', () => {
      this.setBusy(true);
      this.options.onPlay(character.name);
    });
    const remove = el('button', {
      className: 'button button--small button--quiet',
      text: 'Borrar',
      attrs: { type: 'button', 'aria-label': `Borrar a ${character.name}` },
    });
    let armed = 0;
    remove.addEventListener('click', () => {
      // Dos clics: el primero pide confirmación, porque borrar es para siempre.
      if (!armed) {
        remove.textContent = '¿Seguro? Borrar';
        armed = window.setTimeout(() => {
          armed = 0;
          remove.textContent = 'Borrar';
        }, CONFIRM_MS);
        return;
      }
      window.clearTimeout(armed);
      this.setBusy(true);
      this.options.onDelete(character.name);
    });
    return el('div', { className: 'character-slot' }, [
      portrait,
      el('div', { className: 'character-slot__text' }, [
        el('strong', { text: character.name }),
        el('span', { className: 'character-slot__skills', text: skills }),
      ]),
      el('div', { className: 'character-slot__actions' }, [play, remove]),
    ]);
  }

  private emptySlot(): HTMLElement {
    const create = el('button', {
      className: 'button button--small button--quiet',
      text: 'Crear personaje',
      attrs: { type: 'button' },
    });
    create.addEventListener('click', () => this.options.onCreate());
    return el('div', { className: 'character-slot character-slot--empty' }, [
      el('span', { className: 'character-slot__skills', text: 'Lugar libre' }),
      create,
    ]);
  }
}
