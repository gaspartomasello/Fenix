import { CHEST_ART, POUCH_ART, type ContainerArt } from '@fenix/art';
import { BACKPACK_AREA, ITEM_ICON_SIZE } from '@fenix/shared';
import type { ContainerContents } from '../core/client-game';
import { destinationFor, type ItemActions } from './backpack-window';
import { itemLabel } from './item-label';
import { el } from './dom';
import { liftElement, type DragController } from './drag-controller';
import { ContainerSkin } from './container-skin';
import { GameWindow } from './game-window';
import { itemIconUrl } from './item-icons';

/** Los recipientes que tienen dibujo propio. */
const SKINS: Partial<Record<string, ContainerArt>> = {
  bag: POUCH_ART,
  chest: CHEST_ART,
  box: CHEST_ART,
};

/**
 * Un recipiente abierto, como en UO: una bolsa, una caja, un cofre, un
 * barril o una biblioteca. Cada uno se ve con su madera o su cuero; se
 * arrastra para guardar o sacar, y doble clic sobre una bolsa de adentro la
 * abre también.
 */
export class ContainerWindow {
  readonly window: GameWindow;
  private readonly area: HTMLElement;
  private readonly empty: HTMLElement;
  private readonly skin: ContainerSkin;

  constructor(
    readonly containerId: string,
    private readonly drag: DragController,
    private readonly actions: ItemActions,
    slot: number,
  ) {
    this.window = new GameWindow(`recipiente-${slot % 4}`, 'Recipiente', {
      x: 300 + (slot % 4) * 40,
      y: 140 + (slot % 4) * 40,
    });
    this.area = el('div', {
      className: 'backpack-area container-area',
      attrs: { 'data-drop': 'container', 'data-container': containerId },
    });
    this.area.style.width = `${BACKPACK_AREA.width}px`;
    this.area.style.height = `${BACKPACK_AREA.height}px`;
    this.empty = el('p', { className: 'container-empty', text: 'Está vacío.' });
    this.window.body.append(
      this.area,
      this.empty,
      el('p', {
        className: 'window-hint',
        text: 'Arrastrá para guardar o sacar · doble clic para usar',
      }),
    );
    this.skin = new ContainerSkin(this.window, this.area);
  }

  render(contents: ContainerContents): void {
    const title = contents.name.charAt(0).toUpperCase() + contents.name.slice(1);
    this.window.setTitle(title);
    this.area.dataset.look = contents.look;
    // Las bolsas y los cofres se ven como en UO; lo demás, con su madera de siempre.
    this.skin.wear(SKINS[contents.look] ?? null);
    this.empty.hidden = contents.items.length > 0;
    this.area.replaceChildren(
      ...contents.items.map((item) => {
        const label = itemLabel(item);
        const icon = el(
          'button',
          { className: 'item-icon', attrs: { type: 'button', title: label, 'aria-label': label } },
          [
            el('img', {
              attrs: {
                src: itemIconUrl(item.kind, item.amount, item.hue),
                alt: '',
                draggable: 'false',
              },
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
              iconUrl: itemIconUrl(item.kind, item.amount, item.hue),
              lift: liftElement(icon),
              onDrop: (target) => {
                const to = destinationFor(target, this.actions, item.kind);
                if (!to) return false;
                this.actions.moveItem(item.id, to);
                return true;
              },
              onDoubleTap: () => this.actions.useItem(item.id),
            },
            e,
          );
        });
        return icon;
      }),
    );
  }
}
