import { RECIPES, describeItem, formatSkill, type SkillValues } from '@fenix/shared';
import { el } from './dom';
import { GameWindow } from './game-window';
import { itemIconUrl } from './item-icons';

/** Herrería: recetas con sus lingotes y la habilidad que piden. */
export class CraftingWindow {
  readonly window: GameWindow;
  private readonly list: HTMLElement;

  constructor(private readonly onCraft: (recipe: string) => void) {
    this.window = new GameWindow('herreria', 'Herrería', { x: 290, y: 150 });
    this.list = el('ul', { className: 'shop-list' });
    this.window.body.append(
      el('p', {
        className: 'window-hint',
        text: 'Hace falta estar al lado del yunque y la forja.',
      }),
      this.list,
    );
    this.render(null);
  }

  render(skills: SkillValues | null): void {
    const skill = skills?.blacksmithy ?? 0;
    this.list.replaceChildren(
      ...RECIPES.map((recipe) => {
        const locked = skill < recipe.minSkill;
        const button = el('button', {
          className: 'button button--small',
          text: 'Fabricar',
          attrs: { type: 'button' },
        });
        button.disabled = locked;
        button.addEventListener('click', () => this.onCraft(recipe.key));
        const requirement = locked ? ` · requiere Herrería ${formatSkill(recipe.minSkill)}` : '';
        return el('li', { className: `shop-row${locked ? ' spell--locked' : ''}` }, [
          el('img', {
            className: 'shop-icon',
            attrs: { src: itemIconUrl(recipe.result), alt: '' },
          }),
          el('div', { className: 'shop-info' }, [
            el('span', { text: describeItem(recipe.result) }),
            el('span', {
              className: 'shop-price',
              text: `${describeItem('iron-ingot', recipe.ingots)}${requirement}`,
            }),
          ]),
          el('div', { className: 'shop-controls' }, [button]),
        ]);
      }),
    );
  }
}
