import { CHEST_ART, isPlacedChest } from '@fenix/shared/housing/furniture';
import { insideHouse } from '@fenix/shared/housing/structure';
import type { GroundItemSnapshot } from '@fenix/shared/protocol/messages';
import { STATICS, staticContainerId } from '@fenix/shared/world/statics';
import type { ClientGame } from '../core/client-game';
import type { GameRenderer } from '../rendering/game-renderer';
import type { ConfirmDialog } from '../ui/confirm-dialog';
import type { WorldTooltip } from '../ui/world-tooltip';

/**
 * Muebles que guardan cosas: doble clic (o un toque) sobre un
 * cofre, un barril, un cajón o una biblioteca lo abre y muestra lo que tiene.
 * También los cofres de las casas (el que trae la casa y los que se ponen):
 * en un cofre puesto de la casa propia se elige abrirlo, girarlo o guardarlo.
 * El servidor decide (hay que estar cerca y ser de la casa).
 */
export class WorldContainers {
  private readonly abort = new AbortController();

  constructor(
    private readonly game: ClientGame,
    private readonly renderer: GameRenderer,
    private readonly tooltip: WorldTooltip,
    private readonly confirm: ConfirmDialog,
  ) {
    const canvas = renderer.canvas;
    const signal = this.abort.signal;
    canvas.addEventListener('dblclick', (e) => this.open(e), { signal });
    canvas.addEventListener(
      'pointerdown',
      (e) => {
        if (e.pointerType !== 'mouse') this.open(e);
      },
      { signal },
    );
    canvas.addEventListener('pointermove', (e) => this.onHover(e), { signal });
  }

  hasContainerAt(point: { x: number; y: number }): boolean {
    return this.renderer.containerAt(point) !== null || this.chestAt(point) !== null;
  }

  /** El cofre de una casa bajo un punto (un objeto fijo del suelo). */
  private chestAt(point: { x: number; y: number }): GroundItemSnapshot | null {
    const item = this.renderer.groundItemAt(point);
    return item && CHEST_ART[item.kind] ? item : null;
  }

  /** ¿Es de la casa propia? (el servidor igual lo vuelve a mirar). */
  private ownHouseAt(position: { x: number; y: number }): boolean {
    const self = this.game.self;
    if (!self) return false;
    return this.game.houses.some(
      (h) => h.owner.toLowerCase() === self.name.toLowerCase() && insideHouse(h, position),
    );
  }

  private openChest(chest: GroundItemSnapshot): void {
    if (!isPlacedChest(chest.kind) || !this.ownHouseAt(chest.position)) {
      this.game.useItem(chest.id);
      return;
    }
    const at = chest.position;
    this.confirm.ask(
      'Cofre',
      'Es un cofre de tu casa: podés abrirlo, girarlo o guardarlo en la mochila (vacío).',
      'Abrir',
      () => this.game.useItem(chest.id),
      [
        { label: 'Girar', run: () => this.game.furnitureAction(at, 'turn') },
        { label: 'Guardar', run: () => this.game.furnitureAction(at, 'pickUp') },
      ],
    );
  }

  destroy(): void {
    this.abort.abort();
  }

  private open(e: MouseEvent): void {
    const point = this.local(e);
    const at = this.renderer.containerAt(point);
    const chest = at ? null : this.chestAt(point);
    if (!at && !chest) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    if (at) this.game.openContainer(staticContainerId(at));
    else if (chest) this.openChest(chest);
  }

  private onHover(e: PointerEvent): void {
    if (e.pointerType !== 'mouse' || e.buttons !== 0) return;
    const point = this.local(e);
    if (this.chestAt(point)) {
      this.tooltip.show('Cofre · doble clic para abrir', e.clientX, e.clientY);
      return;
    }
    const at = this.renderer.containerAt(point);
    if (!at) return;
    const placed = this.game.map?.statics.find((s) => s.x === at.x && s.y === at.y);
    if (!placed) return;
    const name = STATICS[placed.kind].name;
    this.tooltip.show(
      `${name.charAt(0).toUpperCase() + name.slice(1)} · doble clic para abrir`,
      e.clientX,
      e.clientY,
    );
  }

  private local(e: MouseEvent): { x: number; y: number } {
    const rect = this.renderer.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
}
