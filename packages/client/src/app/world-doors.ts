import { STATICS } from '@fenix/shared/world/statics';
import type { ClientGame } from '../core/client-game';
import type { GameRenderer } from '../rendering/game-renderer';
import type { WorldTooltip } from '../ui/world-tooltip';

/**
 * Puertas, como en UO: doble clic (o un toque, en pantallas táctiles) sobre
 * una puerta la abre o la cierra. El servidor decide (hay que estar al lado).
 */
export class WorldDoors {
  private readonly abort = new AbortController();

  constructor(
    private readonly game: ClientGame,
    private readonly renderer: GameRenderer,
    private readonly tooltip: WorldTooltip,
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

  hasDoorAt(point: { x: number; y: number }): boolean {
    return this.renderer.doorAt(point) !== null;
  }

  destroy(): void {
    this.abort.abort();
  }

  private use(e: MouseEvent): void {
    const door = this.renderer.doorAt(this.local(e));
    if (!door) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    this.game.useDoor(door);
  }

  private onHover(e: PointerEvent): void {
    if (e.pointerType !== 'mouse' || e.buttons !== 0) return;
    const door = this.renderer.doorAt(this.local(e));
    if (!door) return;
    const map = this.game.map;
    const kind = map?.doorAt(door);
    if (!map || !kind) return;
    const name = STATICS[kind].name;
    const label = name.charAt(0).toUpperCase() + name.slice(1);
    this.tooltip.show(
      map.isDoorOpen(door)
        ? `${label} (abierta) · doble clic para cerrarla`
        : `${label} · doble clic para abrirla`,
      e.clientX,
      e.clientY,
    );
  }

  private local(e: MouseEvent): { x: number; y: number } {
    const rect = this.renderer.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
}
