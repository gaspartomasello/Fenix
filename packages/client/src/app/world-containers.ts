import { STATICS, staticContainerId } from '@fenix/shared';
import type { ClientGame } from '../core/client-game';
import type { GameRenderer } from '../rendering/game-renderer';
import type { WorldTooltip } from '../ui/world-tooltip';

/**
 * Muebles que guardan cosas, como en UO: doble clic (o un toque) sobre un
 * cofre, un barril, un cajón o una biblioteca lo abre y muestra lo que tiene.
 * El servidor decide (hay que estar cerca).
 */
export class WorldContainers {
  private readonly abort = new AbortController();

  constructor(
    private readonly game: ClientGame,
    private readonly renderer: GameRenderer,
    private readonly tooltip: WorldTooltip,
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
    return this.renderer.containerAt(point) !== null;
  }

  destroy(): void {
    this.abort.abort();
  }

  private open(e: MouseEvent): void {
    const at = this.renderer.containerAt(this.local(e));
    if (!at) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    this.game.openContainer(staticContainerId(at));
  }

  private onHover(e: PointerEvent): void {
    if (e.pointerType !== 'mouse' || e.buttons !== 0) return;
    const at = this.renderer.containerAt(this.local(e));
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
