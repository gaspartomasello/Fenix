import { STATICS } from '@fenix/shared/world/statics';
import type { ClientGame } from '../core/client-game';
import type { GameRenderer } from '../rendering/game-renderer';
import type { ConfirmDialog } from '../ui/confirm-dialog';
import type { WorldTooltip } from '../ui/world-tooltip';

/**
 * Los muebles puestos en las casas: doble clic (o un toque) sobre uno de la
 * casa propia pregunta si girarlo o guardarlo en la mochila. El servidor
 * decide si se puede (el dueño o un copropietario, y estando cerca).
 */
export class WorldFurniture {
  private readonly abort = new AbortController();

  constructor(
    private readonly game: ClientGame,
    private readonly renderer: GameRenderer,
    private readonly tooltip: WorldTooltip,
    private readonly confirm: ConfirmDialog,
  ) {
    const canvas = renderer.canvas;
    const signal = this.abort.signal;
    canvas.addEventListener('dblclick', (e) => this.use(e), { signal });
    canvas.addEventListener(
      'pointerdown',
      (e) => {
        if (e.pointerType !== 'mouse') this.use(e);
      },
      { signal },
    );
    canvas.addEventListener('pointermove', (e) => this.onHover(e), { signal });
  }

  /** ¿Hay un mueble propio bajo el punto? (los ajenos se ven, pero no se tocan). */
  hasFurnitureAt(point: { x: number; y: number }): boolean {
    return this.ownAt(point) !== null;
  }

  destroy(): void {
    this.abort.abort();
  }

  private ownAt(point: { x: number; y: number }) {
    const at = this.renderer.furnitureAt(point);
    const piece = at ? this.game.furnitureAt(at) : null;
    const self = this.game.self;
    if (!at || !piece || !self) return null;
    return piece.owner.toLowerCase() === self.name.toLowerCase() ? { at, piece } : null;
  }

  private use(e: MouseEvent): void {
    const found = this.ownAt(this.local(e));
    if (!found) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    const name = STATICS[found.piece.kind].name;
    this.confirm.ask(
      capitalize(name),
      'Es un mueble de tu casa: podés girarlo o guardarlo en la mochila.',
      'Girar',
      () => this.game.furnitureAction(found.at, 'turn'),
      { label: 'Guardar', run: () => this.game.furnitureAction(found.at, 'pickUp') },
    );
  }

  private onHover(e: PointerEvent): void {
    if (e.pointerType !== 'mouse' || e.buttons !== 0) return;
    const found = this.ownAt(this.local(e));
    if (!found) return;
    this.tooltip.show(
      `${capitalize(STATICS[found.piece.kind].name)} · doble clic para girarlo o guardarlo`,
      e.clientX,
      e.clientY,
    );
  }

  private local(e: MouseEvent): { x: number; y: number } {
    const rect = this.renderer.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
