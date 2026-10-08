import {
  CRAFT_TOOLS,
  SKILL_NAMES,
  STATION_NAMES,
  describeItem,
  formatSkill,
  recipesOf,
  type CraftSkill,
  type SkillValues,
} from '@fenix/shared';
import { el } from './dom';
import { GameWindow } from './game-window';
import { itemIconUrl } from './item-icons';

/**
 * Ventana de un oficio (se abre con doble clic sobre su herramienta): las
 * recetas por grupo, con sus materiales y la habilidad que piden.
 */
export class CraftingWindow {
  readonly window: GameWindow;
  private readonly hint: HTMLElement;
  private readonly list: HTMLElement;
  private skill: CraftSkill = 'blacksmithy';
  private skills: SkillValues | null = null;

  constructor(private readonly onCraft: (recipe: string) => void) {
    this.window = new GameWindow('oficio', 'Oficio', { x: 290, y: 150 });
    this.hint = el('p', { className: 'window-hint' });
    this.list = el('ul', { className: 'shop-list' });
    this.window.body.append(this.hint, this.list);
    this.render(null);
  }

  open(skill: CraftSkill): void {
    this.skill = skill;
    this.render(this.skills);
    this.window.show();
  }

  render(skills: SkillValues | null): void {
    this.skills = skills;
    const skill = this.skill;
    const value = skills?.[skill] ?? 0;
    const recipes = recipesOf(skill);
    this.window.setTitle(SKILL_NAMES[skill]);
    const station = recipes.find((r) => r.station)?.station;
    this.hint.textContent = [
      `Tu ${SKILL_NAMES[skill]}: ${formatSkill(value)}.`,
      `Necesitás ${describeItem(CRAFT_TOOLS[skill])} en la mochila`,
      station ? ` y estar ${STATION_NAMES[station]}.` : '.',
    ].join(' ');

    const rows: HTMLElement[] = [];
    let category = '';
    for (const recipe of recipes) {
      if (recipe.category !== category) {
        category = recipe.category;
        rows.push(el('li', { className: 'shop-group', text: category }));
      }
      const locked = value < recipe.minSkill;
      const button = el('button', {
        className: 'button button--small',
        text: 'Fabricar',
        attrs: {
          type: 'button',
          'aria-label': `Fabricar ${describeItem(recipe.result, recipe.amount)}`,
        },
      });
      button.disabled = locked;
      button.addEventListener('click', () => this.onCraft(recipe.key));
      const materials = recipe.materials.map((m) => describeItem(m.kind, m.amount)).join(', ');
      const extra = [
        recipe.mana ? `${recipe.mana} de maná` : '',
        locked ? `requiere ${formatSkill(recipe.minSkill)}` : '',
      ].filter(Boolean);
      rows.push(
        el('li', { className: `shop-row${locked ? ' spell--locked' : ''}` }, [
          el('img', {
            className: 'shop-icon',
            attrs: { src: itemIconUrl(recipe.result), alt: '' },
          }),
          el('div', { className: 'shop-info' }, [
            el('span', { text: describeItem(recipe.result, recipe.amount) }),
            el('span', {
              className: 'shop-price',
              text: [materials, ...extra].join(' · '),
            }),
          ]),
          el('div', { className: 'shop-controls' }, [button]),
        ]),
      );
    }
    this.list.replaceChildren(...rows);
  }
}
