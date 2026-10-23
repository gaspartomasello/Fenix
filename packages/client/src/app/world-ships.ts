import { SHIPS } from '@fenix/shared/ships/ships';
import type { ClientGame } from '../core/client-game';
import type { GameRenderer } from '../rendering/game-renderer';
import type { WorldTooltip } from '../ui/world-tooltip';

/**
 * Los barcos en el mundo: doble clic sobre uno lo aborda (si el capitán te
 * dio permiso) y, ya a bordo, abre la ventana del barco. Sobre la cubierta se
 * camina como en el suelo; lo de encima (la bodega, la gente) tiene prioridad.
 */
export class WorldShips {
  private readonly abort = new AbortController();

  constructor(
    private readonly game: ClientGame,
    private readonly renderer: GameRenderer,
    private readonly tooltip: WorldTooltip,
  ) {
    const canvas = renderer.canvas;
    const signal = this.abort.signal;
    canvas.addEventListener('dblclick', (e) => this.use(e), { signal });
    canvas.addEventListener('pointermove', (e) => this.onHover(e), { signal });
  }

  destroy(): void {
    this.abort.abort();
  }

  private use(e: MouseEvent): void {
    const point = this.local(e);
    const ship = this.renderer.shipAt(point);
    if (!ship || this.busy(point)) return;
    e.preventDefault();
    if (this.game.shipAboard?.id === ship.id) this.game.shipAction(ship.id, 'panel');
    else this.game.boardShip(ship.id);
  }

  private onHover(e: PointerEvent): void {
    if (e.pointerType !== 'mouse' || e.buttons !== 0) return;
    const point = this.local(e);
    const ship = this.renderer.shipAt(point);
    if (!ship || this.busy(point)) return;
    const aboard = this.game.shipAboard?.id === ship.id;
    this.tooltip.show(
      `«${ship.name}» · ${SHIPS[ship.kind].name} de ${ship.owner} · doble clic para ${aboard ? 'ver el barco' : 'subir'}`,
      e.clientX,
      e.clientY,
    );
  }

  /** Hay algo encima de la cubierta que se lleva el clic (un objeto o alguien). */
  private busy(point: { x: number; y: number }): boolean {
    return (
      this.renderer.groundItemAt(point) !== null ||
      this.renderer.creatureAt(point) !== null ||
      this.renderer.humanAt(point, false) !== null
    );
  }

  private local(e: MouseEvent): { x: number; y: number } {
    const rect = this.renderer.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
}
