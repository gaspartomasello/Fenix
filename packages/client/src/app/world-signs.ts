import type { GameRenderer } from '../rendering/game-renderer';
import type { WorldTooltip } from '../ui/world-tooltip';

/** Los carteles de los caminos dicen adónde llevan al pasar el puntero (o al tocarlos). */
export class WorldSigns {
  private readonly abort = new AbortController();

  constructor(
    private readonly renderer: GameRenderer,
    private readonly tooltip: WorldTooltip,
  ) {
    const canvas = renderer.canvas;
    const signal = this.abort.signal;
    canvas.addEventListener('pointermove', (e) => this.onHover(e), { signal });
    canvas.addEventListener('pointerdown', (e) => this.onTouch(e), { signal });
  }

  destroy(): void {
    this.abort.abort();
  }

  private onHover(e: PointerEvent): void {
    if (e.pointerType !== 'mouse' || e.buttons !== 0) return;
    const text = this.renderer.signAt(this.local(e));
    if (text) this.tooltip.show(`Cartel: ${text}`, e.clientX, e.clientY);
  }

  /** En pantallas táctiles no hay puntero: se lee al tocarlo. */
  private onTouch(e: PointerEvent): void {
    if (e.pointerType === 'mouse') return;
    const text = this.renderer.signAt(this.local(e));
    if (text) this.tooltip.show(`Cartel: ${text}`, e.clientX, e.clientY);
  }

  private local(e: PointerEvent): { x: number; y: number } {
    const rect = this.renderer.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
}
