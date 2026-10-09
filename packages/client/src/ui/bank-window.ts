import {
  BACKPACK_AREA,
  ITEM_ICON_SIZE,
  describeItem,
  type BackpackItemSnapshot,
} from '@fenix/shared';
import { destinationFor, type ItemActions } from './backpack-window';
import { el } from './dom';
import type { DragController } from './drag-controller';
import { GameWindow } from './game-window';
import { itemIconUrl } from './item-icons';

/** Caja del banco: se arrastran objetos entre la mochila y el banco, cerca de la banquera. */
export class BankWindow {
  readonly window: GameWindow;
  private readonly area: HTMLElement;

  constructor(
    private readonly drag: DragController,
    private readonly actions: ItemActions,
  ) {
    this.window = new GameWindow('banco', 'Caja del banco', { x: 290, y: 420 });
    this.area = el('div', { className: 'backpack-area bank-area', attrs: { 'data-drop': 'bank' } });
    this.area.style.width = `${BACKPACK_AREA.width}px`;
    this.area.style.height = `${BACKPACK_AREA.height}px`;
    this.window.body.append(
      this.area,
      el('p', { className: 'window-hint', text: 'Arrastrá objetos desde o hacia la mochila.' }),
    );
  }

  render(items: readonly BackpackItemSnapshot[]): void {
    this.area.replaceChildren(
      ...items.map((item) => {
        const label = describeItem(item.kind, item.amount);
        const icon = el(
          'button',
          { className: 'item-icon', attrs: { type: 'button', title: label, 'aria-label': label } },
          [
            el('img', {
              attrs: { src: itemIconUrl(item.kind, item.amount), alt: '', draggable: 'false' },
            }),
          ],
        );
        if (item.amount > 1)
          icon.append(el('span', { className: 'item-amount', text: String(item.amount) }));
        icon.style.left = `${item.position.x}px`;
        icon.style.top = `${item.position.y}px`;
        icon.style.width = `${ITEM_ICON_SIZE}px`;
        icon.style.height = `${ITEM_ICON_SIZE}px`;
        icon.addEventListener('pointerdown', (e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          e.preventDefault();
          this.drag.begin(
            {
              id: item.id,
              iconUrl: itemIconUrl(item.kind, item.amount),
              onDrop: (target) => {
                const to = destinationFor(target, this.actions, item.kind);
                if (to) this.actions.moveItem(item.id, to);
              },
              onDoubleTap: () => this.actions.moveItem(item.id, { type: 'backpack' }),
            },
            e,
          );
        });
        return icon;
      }),
    );
  }
}
