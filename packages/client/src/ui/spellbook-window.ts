import {
  SPELLS,
  SPELL_KEYS,
  describeItem,
  formatSkill,
  type SkillValues,
  type SpellKey,
} from '@fenix/shared';
import { el } from './dom';
import { GameWindow } from './game-window';

/** Libro de hechizos: cada hechizo con su costo, reactivos y un botón para lanzarlo. */
export class SpellbookWindow {
  readonly window: GameWindow;
  private readonly list: HTMLElement;

  constructor(private readonly onCast: (spell: SpellKey) => void) {
    this.window = new GameWindow('hechizos', 'Libro de hechizos', { x: 270, y: 150 });
    this.list = el('ol', { className: 'spell-list' });
    this.window.body.append(
      this.list,
      el('p', {
        className: 'window-hint',
        text: 'Atajos: teclas 1 a 5. Los de ataque piden elegir una criatura.',
      }),
    );
    this.render(null);
  }

  render(skills: SkillValues | null): void {
    const magery = skills?.magery ?? 0;
    this.list.replaceChildren(
      ...SPELL_KEYS.map((key, index) => {
        const spell = SPELLS[key];
        const reagents = spell.reagents.map((r) => describeItem(r.kind, r.amount)).join(', ');
        const locked = magery < spell.minSkill;
        const button = el('button', {
          className: 'button button--small',
          text: 'Lanzar',
          attrs: { type: 'button', 'aria-label': `Lanzar ${spell.name}` },
        });
        button.disabled = locked;
        button.addEventListener('click', () => this.onCast(key));
        return el('li', { className: `spell${locked ? ' spell--locked' : ''}` }, [
          el('div', { className: 'spell-info' }, [
            el('strong', { text: `${index + 1}. ${spell.name}` }),
            el('span', {
              className: 'spell-meta',
              text: `${spell.mana} de maná · ${reagents}${locked ? ` · requiere Magia ${formatSkill(spell.minSkill)}` : ''}`,
            }),
          ]),
          button,
        ]);
      }),
    );
  }
}
