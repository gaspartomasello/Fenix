import { COFFIN_HEIGHT, COFFIN_INTERIOR, COFFIN_WIDTH, drawCoffin } from '@fenix/art';
import { CORPSE_AREA, ITEM_ICON_SIZE, describeItem } from '@fenix/shared';
import { toCanvas } from '../platform/canvas';
import type { CorpseContents } from '../core/client-game';
import { destinationFor, type ItemActions } from './backpack-window';
import { el } from './dom';
import { liftElement, type DragController } from './drag-controller';
import { GameWindow } from './game-window';
import { itemIconUrl } from './item-icons';

let coffinUrl: string | null = null;

/** El ataúd se dibuja una sola vez. */
function coffinImage(): string {
  coffinUrl ??= toCanvas(drawCoffin()).toDataURL();
  return coffinUrl;
}

/**
 * Lo que tiene un cuerpo, en un ataúd como en UO: se arrastra cada objeto a
 * la mochila (o a donde se quiera), doble clic lo guarda, y "Tomar todo" se
 * lleva todo junto.
 */
export class CorpseWindow {
  readonly window: GameWindow;
  private readonly area: HTMLElement;
  private readonly empty: HTMLElement;
  private corpseId: string | null = null;

  constructor(
    private readonly drag: DragController,
    private readonly actions: ItemActions,
    lootAll: (corpseId: string) => void,
  ) {
    this.window = new GameWindow('cuerpo', 'Cuerpo', { x: 780, y: 120 });
    this.window.element.classList.add('coffin-window');
    const coffin = el('div', { className: 'coffin' });
    coffin.style.width = `${COFFIN_WIDTH}px`;
    coffin.style.height = `${COFFIN_HEIGHT}px`;
    coffin.style.backgroundImage = `url(${coffinImage()})`;
    this.area = el('div', { className: 'coffin-area' });
    this.area.style.left = `${COFFIN_INTERIOR.x}px`;
    this.area.style.top = `${COFFIN_INTERIOR.y}px`;
    this.area.style.width = `${CORPSE_AREA.width}px`;
    this.area.style.height = `${CORPSE_AREA.height}px`;
    this.empty = el('p', { className: 'coffin-empty', text: 'No queda nada.' });
    coffin.append(this.area, this.empty);
    const takeAll = el('button', {
      className: 'paperdoll-button',
      text: 'Tomar todo',
      attrs: { type: 'button' },
    });
    takeAll.addEventListener('click', () => {
      if (this.corpseId) lootAll(this.corpseId);
    });
    this.window.body.append(coffin, el('div', { className: 'window-actions' }, [takeAll]));
  }

  render(corpse: CorpseContents): void {
    this.corpseId = corpse.corpseId;
    this.window.setTitle(`Cuerpo: ${corpse.name}`);
    this.empty.hidden = corpse.items.length > 0;
    this.area.replaceChildren(
      ...corpse.items.map((item) => {
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
              lift: liftElement(icon),
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
