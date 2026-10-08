import {
  CIRCLE_NAMES,
  SPELL_CIRCLES,
  describeItem,
  formatSkill,
  spellsOfCircle,
  type SkillValues,
  type SpellCircle,
  type SpellKey,
} from '@fenix/shared';
import { el } from './dom';
import { GameWindow } from './game-window';

/** Cómo se elige el objetivo de cada tipo de hechizo, para la ayuda. */
const TARGET_HINTS = {
  self: 'a vos',
  beneficial: 'a quien elijas',
  harmful: 'a un enemigo',
  location: 'a un lugar',
} as const;

/**
 * Libro de hechizos, como en UO: una página por círculo, cada hechizo con
 * su maná, reactivos y un botón para lanzarlo. Las teclas 1 a 8 lanzan los
 * hechizos de la página abierta.
 */
export class SpellbookWindow {
  readonly window: GameWindow;
  private readonly tabs: HTMLElement;
  private readonly list: HTMLElement;
  private circle: SpellCircle = 1;
  private skills: SkillValues | null = null;

  constructor(private readonly onCast: (spell: SpellKey) => void) {
    this.window = new GameWindow('hechizos', 'Libro de hechizos', { x: 270, y: 150 });
    this.tabs = el('div', { className: 'tabs tabs--circles', attrs: { role: 'tablist' } });
    this.list = el('ol', { className: 'spell-list' });
    this.window.body.append(
      this.tabs,
      this.list,
      el('p', {
        className: 'window-hint',
        text: 'Atajos: teclas 1 a 8 para los hechizos de esta página.',
      }),
    );
    this.render(null);
  }

  /** El hechizo en la posición `index` (0, 1…) de la página abierta. */
  spellAt(index: number): SpellKey | undefined {
    return spellsOfCircle(this.circle)[index]?.key;
  }

  render(skills: SkillValues | null): void {
    this.skills = skills;
    this.tabs.replaceChildren(
      ...SPELL_CIRCLES.map((circle) => {
        const tab = el('button', {
          className: 'tab',
          text: String(circle),
          attrs: {
            type: 'button',
            role: 'tab',
            title: CIRCLE_NAMES[circle],
            'aria-label': CIRCLE_NAMES[circle],
            'aria-selected': String(circle === this.circle),
          },
        });
        tab.addEventListener('click', () => {
          this.circle = circle;
          this.render(this.skills);
        });
        return tab;
      }),
    );
    const magery = skills?.magery ?? 0;
    this.list.replaceChildren(
      ...spellsOfCircle(this.circle).map((spell, index) => {
        const reagents = spell.reagents.map((r) => describeItem(r.kind, r.amount)).join(', ');
        const locked = magery < spell.minSkill;
        const button = el('button', {
          className: 'button button--small',
          text: 'Lanzar',
          attrs: { type: 'button', 'aria-label': `Lanzar ${spell.name}` },
        });
        button.disabled = locked;
        button.addEventListener('click', () => this.onCast(spell.key));
        return el('li', { className: `spell${locked ? ' spell--locked' : ''}` }, [
          el('div', { className: 'spell-info', attrs: { title: spell.description } }, [
            el('strong', { text: `${index + 1}. ${spell.name}` }),
            el('span', { className: 'spell-meta', text: spell.description }),
            el('span', {
              className: 'spell-meta',
              text: `${spell.mana} de maná · ${TARGET_HINTS[spell.target]} · ${reagents}${locked ? ` · requiere Magia ${formatSkill(spell.minSkill)}` : ''}`,
            }),
          ]),
          button,
        ]);
      }),
    );
  }
}
