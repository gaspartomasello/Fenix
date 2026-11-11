import { ITEMS, describeItem, type ItemKind } from '@fenix/shared/items/item-catalog';
import { el, onPress } from './dom';
import { GameWindow } from './game-window';
import { itemIconUrl } from './item-icons';

/**
 * Lo que se vio al fisgonear la mochila de alguien (con la habilidad
 * Fisgonear): sus cosas, en casilleros. Tocar una es intentar robarla (con
 * Robar); si te descubren, quedás como criminal.
 */
export class SnoopWindow {
  readonly window: GameWindow;
  private readonly grid: HTMLElement;
  private targetId: string | null = null;

  constructor(private readonly steal: (targetId: string, kind: ItemKind) => void) {
    this.window = new GameWindow('fisgoneo', 'Mochila ajena', { x: 160, y: 140 });
    this.window.element.classList.add('snoop-window');
    this.grid = el('div', { className: 'snoop-grid' });
    this.window.body.append(
      this.grid,
      el('p', {
        className: 'window-hint',
        text: 'Tocá algo para intentar robarlo. Si te descubren, quedás como criminal.',
      }),
    );
  }

  show(targetId: string, name: string, items: readonly { kind: ItemKind; amount: number }[]): void {
    this.targetId = targetId;
    this.window.setTitle(`Mochila de ${name}`);
    this.grid.replaceChildren(
      ...(items.length === 0
        ? [el('p', { className: 'snoop-empty', text: 'Está vacía.' })]
        : items.map(({ kind, amount }) => {
            const label = amount > 1 ? `${amount} ${ITEMS[kind].plural}` : describeItem(kind);
            const slot = el(
              'button',
              {
                className: 'snoop-item',
                attrs: { type: 'button', title: `Robar: ${label}`, 'aria-label': `Robar ${label}` },
              },
              [
                el('img', {
                  attrs: { src: itemIconUrl(kind, amount), alt: '', draggable: 'false' },
                }),
                ...(amount > 1
                  ? [el('span', { className: 'snoop-amount', text: String(amount) })]
                  : []),
              ],
            );
            onPress(slot, () => {
              if (this.targetId) this.steal(this.targetId, kind);
            });
            return slot;
          })),
    );
    this.window.show();
  }
}
