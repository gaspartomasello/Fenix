import { DYE_HUES, isDyeable, type EntityId, type ItemSnapshot } from '@fenix/shared';
import { el } from './dom';
import { GameWindow } from './game-window';
import { itemIconUrl } from './item-icons';
import { itemLabel } from './item-label';

/**
 * La tina de tintura: se elige un color de la paleta y después la prenda (de
 * lo que uno lleva en la mochila o puesto) que se quiere teñir. Cada teñida
 * gasta una tintura.
 */
export class DyeWindow {
  readonly window: GameWindow;
  private hue = DYE_HUES[0]?.hue ?? 0xb02a2a;
  private readonly palette: HTMLElement;
  private readonly list: HTMLElement;
  private readonly hint: HTMLElement;
  private items: readonly ItemSnapshot[] = [];
  private dyes = 0;

  constructor(private readonly dye: (itemId: EntityId, hue: number) => void) {
    this.window = new GameWindow('tintura', 'Tina de tintura', { x: 320, y: 140 });
    this.window.element.classList.add('dye-window');
    this.palette = el('div', { className: 'dye-palette', attrs: { role: 'radiogroup' } });
    this.list = el('ul', { className: 'dye-items' });
    this.hint = el('p', { className: 'window-hint' });
    this.window.body.append(
      el('p', { className: 'dye-step', text: '1. Elegí un color' }),
      this.palette,
      el('p', { className: 'dye-step', text: '2. Tocá la prenda que querés teñir' }),
      this.list,
      this.hint,
    );
  }

  open(items: readonly ItemSnapshot[], dyes: number): void {
    this.update(items, dyes);
    this.window.show();
  }

  /** Lo que lleva encima cambió (se tiñó algo o se gastó una tintura). */
  update(items: readonly ItemSnapshot[], dyes: number): void {
    this.items = items.filter((i) => isDyeable(i.kind));
    this.dyes = dyes;
    this.render();
  }

  private render(): void {
    this.palette.replaceChildren(
      ...DYE_HUES.map(({ hue, name }) => {
        const swatch = el('button', {
          className: 'dye-swatch',
          attrs: {
            type: 'button',
            role: 'radio',
            title: name,
            'aria-label': name,
            'aria-checked': String(hue === this.hue),
            style: `background:#${hue.toString(16).padStart(6, '0')}`,
          },
        });
        swatch.addEventListener('click', () => {
          this.hue = hue;
          this.render();
        });
        return swatch;
      }),
    );
    this.list.replaceChildren(
      ...this.items.map((item) => {
        const label = itemLabel(item);
        const button = el(
          'button',
          {
            className: 'dye-item',
            attrs: { type: 'button', title: `Teñir ${label}`, 'aria-label': `Teñir ${label}` },
          },
          [el('img', { attrs: { src: itemIconUrl(item.kind, 1, item.hue), alt: '' } })],
        );
        button.disabled = this.dyes === 0;
        button.addEventListener('click', () => this.dye(item.id, this.hue));
        return el('li', {}, [button]);
      }),
    );
    if (this.items.length === 0)
      this.list.append(
        el('li', { className: 'shop-empty', text: 'No llevás nada que se pueda teñir.' }),
      );
    this.hint.textContent =
      this.dyes === 0
        ? 'No te quedan tinturas: la sastra las vende.'
        : `Te quedan ${this.dyes} tinturas. La ropa de tela y el cuero se tiñen; el metal y el hueso, no.`;
  }
}
