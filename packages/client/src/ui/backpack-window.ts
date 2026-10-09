import {
  BACKPACK_AREA,
  ITEMS,
  ITEM_ICON_SIZE,
  describeItem,
  type BackpackItemSnapshot,
  type ItemDestination,
  type ItemKind,
} from '@fenix/shared';
import { el } from './dom';
import type { DragController, DropTarget } from './drag-controller';
import { GameWindow } from './game-window';
import { itemIconUrl } from './item-icons';

export interface ItemActions {
  readonly moveItem: (itemId: string, to: ItemDestination) => void;
  readonly useItem: (itemId: string) => void;
  /** Convierte un punto de la pantalla en el tile del mundo donde soltar. */
  readonly worldDestination: (clientX: number, clientY: number) => ItemDestination | null;
}

/** Traduce el lugar donde se soltó un objeto en un destino para el servidor. */
export function destinationFor(
  target: DropTarget,
  actions: ItemActions,
  kind: ItemKind,
): ItemDestination | null {
  switch (target.kind) {
    case 'paperdoll': {
      const slot = ITEMS[kind].slot;
      return slot ? { type: 'equipment', slot } : null;
    }
    case 'backpack':
      return { type: 'backpack', position: target.position };
    case 'bank':
      return { type: 'bank', position: target.position };
    case 'slot':
      return { type: 'equipment', slot: target.slot };
    case 'world':
      return actions.worldDestination(target.clientX, target.clientY);
  }
}

/** Ventana de la mochila: los objetos se ubican libremente, como en UO. */
export class BackpackWindow {
  readonly window: GameWindow;
  private readonly area: HTMLElement;

  constructor(
    private readonly drag: DragController,
    private readonly actions: ItemActions,
  ) {
    this.window = new GameWindow('mochila', 'Mochila', { x: window.innerWidth - 300, y: 80 });
    this.area = el('div', { className: 'backpack-area', attrs: { 'data-drop': 'backpack' } });
    this.area.style.width = `${BACKPACK_AREA.width}px`;
    this.area.style.height = `${BACKPACK_AREA.height}px`;
    this.window.body.append(
      this.area,
      el('p', { className: 'window-hint', text: 'Arrastrá para mover · doble clic para usar' }),
    );
  }

  render(items: readonly BackpackItemSnapshot[]): void {
    this.area.replaceChildren(...items.map((item) => this.icon(item)));
  }

  private icon(item: BackpackItemSnapshot): HTMLElement {
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
          onDoubleTap: () => this.actions.useItem(item.id),
        },
        e,
      );
    });
    icon.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.actions.useItem(item.id);
    });
    return icon;
  }
}
