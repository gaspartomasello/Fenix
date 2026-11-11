import type { ClientGame } from '../core/client-game';
import type { GameRenderer } from '../rendering/game-renderer';
import type { ConfirmDialog } from '../ui/confirm-dialog';
import type { WorldTooltip } from '../ui/world-tooltip';

/**
 * Los santuarios (la piedra azul de cada ciudad): doble clic (o un toque)
 * pregunta si se lo quiere como hogar, el lugar al que se vuelve con `home`
 * siendo fantasma.
 */
export class WorldShrines {
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

  hasShrineAt(point: { x: number; y: number }): boolean {
    return this.renderer.shrineAt(point) !== null;
  }

  destroy(): void {
    this.abort.abort();
  }

  private use(e: MouseEvent): void {
    const at = this.renderer.shrineAt(this.local(e));
    if (!at) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    this.confirm.ask(
      'Santuario',
      '¿Querés que este santuario sea tu hogar? Al morir, escribiendo «home» vas a volver acá.',
      'Aceptar',
      () => this.game.setHome(at),
    );
  }

  private onHover(e: PointerEvent): void {
    if (e.pointerType !== 'mouse' || e.buttons !== 0) return;
    if (!this.renderer.shrineAt(this.local(e))) return;
    this.tooltip.show('Santuario · doble clic para elegirlo como hogar', e.clientX, e.clientY);
  }

  private local(e: MouseEvent): { x: number; y: number } {
    const rect = this.renderer.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
}
