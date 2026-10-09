import type { ClientGame } from '../core/client-game';
import type { GameRenderer } from '../rendering/game-renderer';
import type { WorldTooltip } from '../ui/world-tooltip';

/**
 * Revisar cuerpos: doble clic (o un toque, en pantallas táctiles) sobre una
 * criatura muerta abre la ventana con lo que tiene adentro.
 */
export class WorldCorpses {
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

  hasCorpseAt(point: { x: number; y: number }): boolean {
    return this.renderer.corpseAt(point) !== null;
  }

  destroy(): void {
    this.abort.abort();
  }

  private open(e: MouseEvent): void {
    const id = this.renderer.corpseAt(this.local(e));
    if (!id) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    this.game.openCorpse(id);
  }

  private onHover(e: PointerEvent): void {
    if (e.pointerType !== 'mouse' || e.buttons !== 0) return;
    const id = this.renderer.corpseAt(this.local(e));
    const corpse = id ? this.game.entity(id) : undefined;
    if (corpse)
      this.tooltip.show(`Cuerpo: ${corpse.name} · doble clic para revisarlo`, e.clientX, e.clientY);
  }

  private local(e: MouseEvent): { x: number; y: number } {
    const rect = this.renderer.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
}
