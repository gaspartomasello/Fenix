import type { Position } from '@fenix/shared';
import type { GameRenderer } from '../rendering/game-renderer';

/**
 * Modo "elegí un lugar": el próximo toque en el mundo devuelve el tile en
 * vez de mover, atacar o agarrar. Escape cancela.
 */
export class TilePicker {
  private picking: { onPick: (tile: Position) => void; onCancel: () => void } | null = null;
  private readonly abort = new AbortController();

  constructor(private readonly renderer: GameRenderer) {
    const signal = this.abort.signal;
    // En captura: se adelanta a los demás manejadores del canvas.
    renderer.canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e), {
      signal,
      capture: true,
    });
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape' && this.picking) {
          e.stopImmediatePropagation();
          this.cancel();
        }
      },
      { signal, capture: true },
    );
  }

  get isPicking(): boolean {
    return this.picking !== null;
  }

  pick(onPick: (tile: Position) => void, onCancel: () => void): void {
    this.cancel();
    this.picking = { onPick, onCancel };
  }

  cancel(): void {
    const picking = this.picking;
    this.picking = null;
    picking?.onCancel();
  }

  destroy(): void {
    this.abort.abort();
  }

  private onPointerDown(e: PointerEvent): void {
    if (!this.picking || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    const rect = this.renderer.canvas.getBoundingClientRect();
    const tile = this.renderer.screenToTile({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    const { onPick } = this.picking;
    this.picking = null;
    onPick(tile);
  }
}
