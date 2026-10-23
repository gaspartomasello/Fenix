import { DYE_FAMILIES, dyeName, isDyeable } from '@fenix/shared/items/dyes';
import type { EntityId, ItemSnapshot } from '@fenix/shared/protocol/messages';
import { el } from './dom';
import { GameWindow } from './game-window';
import { itemIconUrl } from './item-icons';
import { itemLabel } from './item-label';

const css = (hue: number): string => `#${hue.toString(16).padStart(6, '0')}`;

/**
 * La tina de tintura, como en UO: primero se elige el color en su panel
 * (cada tono con sus matices, del más claro al más oscuro, y los grises) y
 * el agua de la tina queda de ese color; después se toca la prenda o la
 * bolsa (de lo que uno lleva en la mochila o puesto) que se quiere teñir.
 * Cada teñida gasta una tintura; cambiar el color de la tina, no.
 */
export class DyeWindow {
  readonly window: GameWindow;
  /** El color elegido en el panel (todavía no puesto en la tina). */
  private picked: number | null = null;
  private tubId: EntityId | null = null;
  private readonly panel: HTMLElement;
  private readonly preview: HTMLElement;
  private readonly previewName: HTMLElement;
  private readonly apply: HTMLButtonElement;
  private readonly tubIcon: HTMLImageElement;
  private readonly tubName: HTMLElement;
  private readonly list: HTMLElement;
  private readonly hint: HTMLElement;
  private items: readonly ItemSnapshot[] = [];
  private dyes = 0;

  constructor(
    private readonly dye: (itemId: EntityId, hue: number) => void,
    private readonly tint: (tubId: EntityId, hue: number) => void,
  ) {
    this.window = new GameWindow('tintura', 'Tina de tintura', { x: 300, y: 110 });
    this.window.element.classList.add('dye-window');
    this.panel = el('div', { className: 'hue-panel', attrs: { role: 'radiogroup' } });
    this.preview = el('span', { className: 'hue-preview' });
    this.previewName = el('span', { className: 'hue-preview-name' });
    this.apply = el('button', {
      className: 'button button--small',
      text: 'Teñir la tina',
      attrs: { type: 'button' },
    });
    this.apply.addEventListener('click', () => {
      if (this.picked !== null && this.tubId) this.tint(this.tubId, this.picked);
    });
    this.tubIcon = el('img', { className: 'hue-tub', attrs: { alt: '', draggable: 'false' } });
    this.tubName = el('span', { className: 'hue-tub-name' });
    this.list = el('ul', { className: 'dye-items' });
    this.hint = el('p', { className: 'window-hint' });
    this.window.body.append(
      el('p', { className: 'dye-step', text: '1. Elegí el color de la tina' }),
      this.panel,
      el('div', { className: 'hue-bar' }, [this.preview, this.previewName, this.apply]),
      el('div', { className: 'hue-bar' }, [this.tubIcon, this.tubName]),
      el('p', { className: 'dye-step', text: '2. Tocá lo que querés teñir' }),
      this.list,
      this.hint,
    );
    this.renderPanel();
  }

  open(tubId: EntityId, items: readonly ItemSnapshot[], dyes: number): void {
    this.tubId = tubId;
    this.picked = this.tubHue(items);
    this.update(items, dyes);
    this.window.show();
  }

  /** Lo que lleva encima cambió (se tiñó algo, se gastó una tintura o la tina cambió de color). */
  update(items: readonly ItemSnapshot[], dyes: number): void {
    this.items = items;
    this.dyes = dyes;
    this.render();
  }

  /** El color del agua de la tina abierta (null si nunca se le eligió uno). */
  private tubHue(items: readonly ItemSnapshot[] = this.items): number | null {
    return items.find((i) => i.id === this.tubId)?.hue ?? null;
  }

  /** El panel: una columna por tono, de claro (arriba) a oscuro (abajo). */
  private renderPanel(): void {
    this.panel.replaceChildren(
      ...DYE_FAMILIES.map((family) =>
        el(
          'div',
          { className: 'hue-column', attrs: { title: family.name } },
          family.hues.map((hue) => {
            const name = dyeName(hue);
            const swatch = el('button', {
              className: 'hue-swatch',
              attrs: {
                type: 'button',
                role: 'radio',
                title: name,
                'aria-label': name,
                style: `background:${css(hue)}`,
              },
            });
            swatch.dataset.hue = String(hue);
            swatch.addEventListener('click', () => {
              this.picked = hue;
              this.render();
            });
            return swatch;
          }),
        ),
      ),
    );
  }

  private render(): void {
    const current = this.tubHue();
    for (const swatch of this.panel.querySelectorAll<HTMLElement>('.hue-swatch'))
      swatch.setAttribute('aria-checked', String(Number(swatch.dataset.hue) === this.picked));
    this.preview.style.background = this.picked === null ? 'transparent' : css(this.picked);
    this.previewName.textContent =
      this.picked === null ? 'Elegí un color del panel.' : capitalize(dyeName(this.picked));
    this.apply.disabled = this.picked === null || this.picked === current;
    const tub = this.items.find((i) => i.id === this.tubId);
    this.tubIcon.src = itemIconUrl('dye-tub', 1, tub?.hue ?? undefined);
    this.tubName.textContent =
      current === null ? 'La tina todavía no tiene color.' : `La tina tiñe de ${dyeName(current)}.`;

    const dyeable = this.items.filter((i) => isDyeable(i.kind));
    this.list.replaceChildren(
      ...dyeable.map((item) => {
        const label = itemLabel(item);
        const button = el(
          'button',
          {
            className: 'dye-item',
            attrs: { type: 'button', title: `Teñir ${label}`, 'aria-label': `Teñir ${label}` },
          },
          [el('img', { attrs: { src: itemIconUrl(item.kind, 1, item.hue), alt: '' } })],
        );
        button.disabled = this.dyes === 0 || current === null;
        button.addEventListener('click', () => {
          if (current !== null) this.dye(item.id, current);
        });
        return el('li', {}, [button]);
      }),
    );
    if (dyeable.length === 0)
      this.list.append(
        el('li', { className: 'shop-empty', text: 'No llevás nada que se pueda teñir.' }),
      );
    this.hint.textContent =
      current === null
        ? 'Elegí un color y tocá «Teñir la tina»: después tocá lo que quieras teñir de ese color.'
        : this.dyes === 0
          ? 'No te quedan tinturas: la sastra las vende.'
          : `Te quedan ${this.dyes} tinturas. La ropa de tela, el cuero y las bolsas se tiñen; el metal y el hueso, no.`;
  }
}

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
