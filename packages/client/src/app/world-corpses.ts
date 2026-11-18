import type { ClientGame } from '../core/client-game';
import type { GameRenderer } from '../rendering/game-renderer';
import type { WorldTooltip } from '../ui/world-tooltip';

/**
 * Revisar cuerpos: doble clic (o un toque, en pantallas táctiles) sobre una
 * criatura muerta, o sobre el cuerpo o los huesos de un jugador (también el
 * propio), abre la ventana con lo que tiene adentro.
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
    return this.corpseAt(point) !== null;
  }

  destroy(): void {
    this.abort.abort();
  }

  /** El cuerpo bajo un punto: el de una criatura, o el de un jugador (un objeto en el suelo). */
  private corpseAt(point: { x: number; y: number }): string | null {
    return this.renderer.corpseAt(point) ?? this.renderer.playerCorpseAt(point)?.id ?? null;
  }

  private open(e: MouseEvent): void {
    const id = this.corpseAt(this.local(e));
    if (!id) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    this.game.openCorpse(id);
  }

  private onHover(e: PointerEvent): void {
    if (e.pointerType !== 'mouse' || e.buttons !== 0) return;
    const point = this.local(e);
    const id = this.renderer.corpseAt(point);
    const corpse = id ? this.game.entity(id) : undefined;
    const player = corpse ? null : this.renderer.playerCorpseAt(point);
    const name = corpse?.name ?? player?.corpseOf;
    if (name)
      this.tooltip.show(
        `${player?.kind === 'player-bones' ? 'Restos' : 'Cuerpo'}: ${name} · doble clic para revisarlo`,
        e.clientX,
        e.clientY,
      );
  }

  private local(e: MouseEvent): { x: number; y: number } {
    const rect = this.renderer.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
}
