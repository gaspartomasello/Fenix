import type { ClientGame } from '../core/client-game';
import type { GameRenderer } from '../rendering/game-renderer';
import type { WorldTooltip } from '../ui/world-tooltip';

/**
 * Montar y desmontar desde el mundo, como en UO: doble clic (o un toque)
 * sobre la montura propia para subirse, y doble clic sobre uno mismo,
 * estando montado, para bajarse.
 */
export class WorldMounts {
  private readonly abort = new AbortController();

  constructor(
    private readonly game: ClientGame,
    private readonly renderer: GameRenderer,
    private readonly tooltip: WorldTooltip,
  ) {
    const canvas = renderer.canvas;
    const signal = this.abort.signal;
    canvas.addEventListener('dblclick', (e) => this.onActivate(e), { signal });
    canvas.addEventListener(
      'pointerdown',
      (e) => {
        if (e.pointerType !== 'mouse') this.onActivate(e, true);
      },
      { signal },
    );
    canvas.addEventListener('pointermove', (e) => this.onHover(e), { signal });
  }

  hasPetAt(point: { x: number; y: number }): boolean {
    return this.renderer.ownPetAt(point) !== null;
  }

  destroy(): void {
    this.abort.abort();
  }

  private onActivate(e: MouseEvent, touch = false): void {
    const point = this.local(e);
    const pet = this.renderer.ownPetAt(point);
    if (pet) {
      e.stopImmediatePropagation();
      e.preventDefault();
      this.game.mount(pet);
      return;
    }
    // Bajarse con un toque sobre uno mismo sería muy fácil por error: solo doble clic.
    if (!touch && this.game.self?.mount && this.renderer.selfAt(point)) {
      e.stopImmediatePropagation();
      e.preventDefault();
      this.game.dismount();
    }
  }

  private onHover(e: PointerEvent): void {
    if (e.pointerType !== 'mouse' || e.buttons !== 0) return;
    const id = this.renderer.ownPetAt(this.local(e));
    const pet = id ? this.game.entity(id) : undefined;
    if (pet) this.tooltip.show(`Tu ${pet.name} · doble clic para montar`, e.clientX, e.clientY);
  }

  private local(e: MouseEvent): { x: number; y: number } {
    const rect = this.renderer.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
}
