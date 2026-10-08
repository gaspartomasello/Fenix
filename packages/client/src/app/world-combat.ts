import type { ClientGame } from '../core/client-game';
import type { GameRenderer } from '../rendering/game-renderer';
import type { WorldTooltip } from '../ui/world-tooltip';

/**
 * Pelear desde el mundo: clic (o toque) sobre una criatura para atacarla,
 * Escape para dejar de atacar, y su nombre al pasar el mouse.
 */
export class WorldCombat {
  private readonly abort = new AbortController();

  constructor(
    private readonly game: ClientGame,
    private readonly renderer: GameRenderer,
    private readonly tooltip: WorldTooltip,
  ) {
    const canvas = renderer.canvas;
    const signal = this.abort.signal;
    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e), { signal });
    canvas.addEventListener('pointermove', (e) => this.onHover(e), { signal });
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement)) game.stopAttack();
      },
      { signal },
    );
  }

  /** ¿Hay una criatura bajo este punto del canvas? */
  hasCreatureAt(point: { x: number; y: number }): boolean {
    return this.renderer.creatureAt(point) !== null;
  }

  destroy(): void {
    this.abort.abort();
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const id = this.renderer.creatureAt(this.local(e));
    if (!id) return;
    // Atacar tiene prioridad sobre agarrar un objeto que esté debajo.
    e.stopImmediatePropagation();
    e.preventDefault();
    this.game.attack(id);
  }

  private onHover(e: PointerEvent): void {
    if (e.pointerType !== 'mouse' || e.buttons !== 0) return;
    const id = this.renderer.creatureAt(this.local(e));
    if (!id) return;
    const creature = [...this.game.allEntities()].find((entity) => entity.id === id);
    if (creature) this.tooltip.show(`${creature.name} · clic para atacar`, e.clientX, e.clientY);
  }

  private local(e: PointerEvent): { x: number; y: number } {
    const rect = this.renderer.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
}
