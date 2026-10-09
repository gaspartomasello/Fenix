import { describeItem, type ItemDestination } from '@fenix/shared';
import type { ClientGame } from '../core/client-game';
import type { GameRenderer } from '../rendering/game-renderer';
import { destinationFor, type ItemActions } from '../ui/backpack-window';
import type { DragController } from '../ui/drag-controller';
import { itemIconUrl } from '../ui/item-icons';
import type { WorldTooltip } from '../ui/world-tooltip';

/**
 * Interacción con los objetos tirados en el mundo: nombre al pasar el
 * mouse, arrastrarlos y doble clic (o doble toque) para levantarlos.
 */
export class WorldItems {
  readonly actions: ItemActions;
  private readonly abort = new AbortController();

  constructor(
    private readonly game: ClientGame,
    private readonly renderer: GameRenderer,
    private readonly drag: DragController,
    private readonly tooltip: WorldTooltip,
  ) {
    this.actions = {
      moveItem: (itemId, to) => game.moveItem(itemId, to),
      useItem: (itemId) => game.useItem(itemId),
      worldDestination: (clientX, clientY) => this.groundAt(clientX, clientY),
    };

    const canvas = renderer.canvas;
    canvas.dataset.drop = 'world';
    const signal = this.abort.signal;
    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e), { signal });
    canvas.addEventListener('pointermove', (e) => this.onHover(e), { signal });
    canvas.addEventListener('pointerleave', () => tooltip.hide(), { signal });
  }

  /** ¿Hay un objeto bajo este punto del canvas? */
  hasItemAt(point: { x: number; y: number }): boolean {
    return this.renderer.groundItemAt(point) !== null;
  }

  destroy(): void {
    this.abort.abort();
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const item = this.renderer.groundItemAt(this.local(e));
    if (!item) return;
    e.preventDefault();
    this.tooltip.hide();
    this.drag.begin(
      {
        id: item.id,
        iconUrl: itemIconUrl(item.kind, item.amount),
        onDrop: (target) => {
          const to = destinationFor(target, this.actions, item.kind);
          if (to) this.game.moveItem(item.id, to);
        },
        onDoubleTap: () => this.game.moveItem(item.id, { type: 'backpack' }),
      },
      e,
    );
  }

  private onHover(e: PointerEvent): void {
    if (e.pointerType !== 'mouse' || e.buttons !== 0) return;
    const point = this.local(e);
    const item = this.renderer.groundItemAt(point);
    if (item) this.tooltip.show(describeItem(item.kind, item.amount), e.clientX, e.clientY);
    else if (this.renderer.creatureAt(point) === null && this.renderer.npcAt(point) === null) {
      this.tooltip.hide();
    }
  }

  private groundAt(clientX: number, clientY: number): ItemDestination {
    const rect = this.renderer.canvas.getBoundingClientRect();
    return {
      type: 'ground',
      position: this.renderer.screenToTile({ x: clientX - rect.left, y: clientY - rect.top }),
    };
  }

  private local(e: PointerEvent): { x: number; y: number } {
    const rect = this.renderer.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
}
