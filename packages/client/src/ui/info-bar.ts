import type { InfoChip } from '../core/options';
import { el } from './dom';
import { itemIconUrl } from './item-icons';

/**
 * Barra de información en una línea, como la de un asistente de UO: los
 * reactivos con su cantidad, el oro, el peso… lo que se elija en Opciones.
 * Lo que se está acabando se resalta.
 */
export class InfoBar {
  readonly element: HTMLElement;
  private last = '';

  constructor() {
    this.element = el('div', { className: 'info-bar', attrs: { 'aria-label': 'Información' } });
  }

  render(chips: readonly InfoChip[]): void {
    const signature = chips.map((c) => `${c.key}=${c.value}${c.low ? '!' : ''}`).join('|');
    if (signature === this.last) return;
    this.last = signature;
    this.element.hidden = chips.length === 0;
    this.element.replaceChildren(
      ...chips.map((chip) => {
        const node = el(
          'span',
          {
            className: chip.low ? 'info-chip info-chip--low' : 'info-chip',
            attrs: { title: `${chip.label}: ${chip.value}` },
          },
          [
            chip.icon
              ? el('img', {
                  className: 'info-chip-icon',
                  attrs: { src: itemIconUrl(chip.icon), alt: chip.label, draggable: 'false' },
                })
              : el('span', { className: 'info-chip-label', text: chip.label }),
            el('span', { className: 'info-chip-value', text: chip.value }),
          ],
        );
        return node;
      }),
    );
  }

  destroy(): void {
    this.element.remove();
  }
}
