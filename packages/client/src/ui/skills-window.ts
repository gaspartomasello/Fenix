import type { Attributes } from '@fenix/shared/combat/vitals';
import {
  SKILL_DESCRIPTIONS,
  SKILL_GROUPS,
  SKILL_KEYS,
  SKILL_NAMES,
  SKILL_TOTAL_CAP,
  formatSkill,
  type SkillValues,
  type SkillKey,
  type SkillDirection,
  type SkillDirections,
} from '@fenix/shared/skills/skill-catalog';
import { ATTRIBUTE_NAMES } from '@fenix/shared/skills/stat-gain';
import { isActiveSkill, type ActiveSkill } from '@fenix/shared/skills/stealth';
import { el } from './dom';
import { GameWindow } from './game-window';

/** Habilidades agrupadas (combate, magia, recolección, oficios) y el total respecto del tope. */
export class SkillsWindow {
  readonly window: GameWindow;
  private readonly list: HTMLElement;
  private readonly total: HTMLElement;
  private readonly attributes: HTMLElement;

  constructor(
    private readonly onUse: (skill: ActiveSkill) => void = () => undefined,
    private readonly onDirection: (skill: SkillKey, direction: SkillDirection) => void = () =>
      undefined,
  ) {
    this.window = new GameWindow('habilidades', 'Habilidades', { x: 16, y: 150 });
    this.attributes = el('p', { className: 'skills-attributes' });
    this.list = el('dl', { className: 'skills-list' });
    this.total = el('p', { className: 'window-hint' });
    this.window.body.append(
      this.attributes,
      this.list,
      this.total,
      el('p', {
        className: 'window-hint',
        text: '↑ sube · ↓ cede puntos al llegar al tope · 🔒 conserva su valor.',
      }),
    );
  }

  /** Fuerza, destreza e inteligencia (con lo que suman o restan los efectos). */
  renderAttributes(attributes: Attributes): void {
    this.attributes.textContent = (['strength', 'dexterity', 'intelligence'] as const)
      .map((key) => `${ATTRIBUTE_NAMES[key]} ${attributes[key]}`)
      .join(' · ');
  }

  render(values: SkillValues, directions: SkillDirections = {}): void {
    this.list.replaceChildren(
      ...SKILL_GROUPS.flatMap((group) => [
        el('dt', { className: 'skills-group', text: group.name }),
        ...group.skills.flatMap((key) => [
          el('dt', { text: SKILL_NAMES[key], attrs: { title: SKILL_DESCRIPTIONS[key] } }),
          el('dd', {}, [
            document.createTextNode(formatSkill(values[key])),
            this.directionButton(key, directions[key] ?? 'up'),
            ...(isActiveSkill(key) ? [this.useButton(key)] : []),
          ]),
        ]),
      ]),
    );
    const sum = SKILL_KEYS.reduce((acc, key) => acc + values[key], 0);
    this.total.textContent = `Total: ${formatSkill(sum)} de ${formatSkill(SKILL_TOTAL_CAP)}`;
  }

  private directionButton(skill: SkillKey, direction: SkillDirection): HTMLElement {
    const next: Record<SkillDirection, SkillDirection> = { up: 'down', down: 'lock', lock: 'up' };
    const names = { up: 'Subir', down: 'Bajar', lock: 'Bloquear' };
    const button = el('button', {
      className: `skills-direction skills-direction--${direction}`,
      text: { up: '▲', down: '▼', lock: '🔒' }[direction],
      attrs: {
        type: 'button',
        title: `${names[direction]} ${SKILL_NAMES[skill]}`,
        'aria-label': `${SKILL_NAMES[skill]}: ${names[direction]}. Tocar para cambiar.`,
      },
    });
    button.addEventListener('click', () => this.onDirection(skill, next[direction]));
    return button;
  }

  /** Las que se usan a propósito tienen su botón. */
  private useButton(skill: ActiveSkill): HTMLElement {
    const button = el('button', {
      className: 'button button--small button--quiet skills-use',
      text: 'Usar',
      attrs: { type: 'button', 'aria-label': `Usar ${SKILL_NAMES[skill]}` },
    });
    button.addEventListener('click', () => this.onUse(skill));
    return button;
  }
}
