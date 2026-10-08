import {
  SKILL_DESCRIPTIONS,
  SKILL_KEYS,
  SKILL_NAMES,
  SKILL_TOTAL_CAP,
  formatSkill,
  type SkillValues,
} from '@fenix/shared';
import { el } from './dom';
import { GameWindow } from './game-window';

/** Lista de habilidades con su valor y el total respecto del tope. */
export class SkillsWindow {
  readonly window: GameWindow;
  private readonly list: HTMLElement;
  private readonly total: HTMLElement;

  constructor() {
    this.window = new GameWindow('habilidades', 'Habilidades', { x: 16, y: 150 });
    this.list = el('dl', { className: 'skills-list' });
    this.total = el('p', { className: 'window-hint' });
    this.window.body.append(
      this.list,
      this.total,
      el('p', { className: 'window-hint', text: 'Suben de a 0,1 cada vez que las usás.' }),
    );
  }

  render(values: SkillValues): void {
    this.list.replaceChildren(
      ...SKILL_KEYS.flatMap((key) => [
        el('dt', { text: SKILL_NAMES[key], attrs: { title: SKILL_DESCRIPTIONS[key] } }),
        el('dd', { text: formatSkill(values[key]) }),
      ]),
    );
    const sum = SKILL_KEYS.reduce((acc, key) => acc + values[key], 0);
    this.total.textContent = `Total: ${formatSkill(sum)} de ${formatSkill(SKILL_TOTAL_CAP)}`;
  }
}
