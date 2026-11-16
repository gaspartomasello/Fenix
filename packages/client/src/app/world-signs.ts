import type { GameRenderer } from '../rendering/game-renderer';
import type { SignWindow } from '../ui/sign-window';
import type { WorldTooltip } from '../ui/world-tooltip';

/** Dos toques seguidos en menos de esto (milisegundos) son un doble toque. */
const DOUBLE_TAP_MS = 400;

/**
 * Los carteles de los caminos: al pasar el puntero (o tocarlos una vez) se ve
 * que es un cartel; con doble clic (o dos toques) se abre la tabla con las
 * indicaciones.
 */
export class WorldSigns {
  private readonly abort = new AbortController();
  private lastTap: { at: number; text: string } | null = null;

  constructor(
    private readonly renderer: GameRenderer,
    private readonly tooltip: WorldTooltip,
    private readonly window: SignWindow,
  ) {
    const canvas = renderer.canvas;
    const signal = this.abort.signal;
    canvas.addEventListener('pointermove', (e) => this.onHover(e), { signal });
    canvas.addEventListener('pointerdown', (e) => this.onTouch(e), { signal });
    canvas.addEventListener('dblclick', (e) => this.onDoubleClick(e), { signal });
  }

  destroy(): void {
    this.abort.abort();
  }

  private onHover(e: PointerEvent): void {
    if (e.pointerType !== 'mouse' || e.buttons !== 0) return;
    if (this.renderer.signAt(this.local(e)))
      this.tooltip.show('Cartel · doble clic para leerlo', e.clientX, e.clientY);
  }

  private onDoubleClick(e: MouseEvent): void {
    const text = this.renderer.signAt(this.local(e));
    if (!text) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    this.tooltip.hide();
    this.window.show(text);
  }

  /** En pantallas táctiles: un toque dice que es un cartel; dos toques lo abren. */
  private onTouch(e: PointerEvent): void {
    if (e.pointerType === 'mouse') return;
    const text = this.renderer.signAt(this.local(e));
    if (!text) return;
    const now = performance.now();
    if (this.lastTap && this.lastTap.text === text && now - this.lastTap.at < DOUBLE_TAP_MS) {
      this.lastTap = null;
      this.tooltip.hide();
      this.window.show(text);
      return;
    }
    this.lastTap = { at: now, text };
    this.tooltip.show('Cartel · tocalo dos veces para leerlo', e.clientX, e.clientY);
  }

  private local(e: MouseEvent): { x: number; y: number } {
    const rect = this.renderer.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
}
