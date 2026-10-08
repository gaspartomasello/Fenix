import type { ClientGame } from '../core/client-game';
import type { GameRenderer } from '../rendering/game-renderer';
import type { WorldTooltip } from '../ui/world-tooltip';

/**
 * Pelear desde el mundo: clic (o toque) sobre una criatura para atacarla
 * (o sobre otra persona, en modo guerra), Escape para dejar de atacar, y su
 * nombre al pasar el mouse.
 */
export class WorldCombat {
  private readonly abort = new AbortController();
  /** Mientras se elige objetivo, el próximo clic sobre una criatura va acá en vez de atacar. */
  private picking: { onPick: (id: string) => void; onCancel: () => void } | null = null;

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
        if (e.key !== 'Escape' || e.target instanceof HTMLInputElement) return;
        if (this.picking) this.cancelPick();
        else game.stopAttack();
      },
      { signal },
    );
  }

  /** El próximo clic sobre una criatura la elige como objetivo (Escape cancela). */
  pickCreature(onPick: (id: string) => void, onCancel: () => void): void {
    this.cancelPick();
    this.picking = { onPick, onCancel };
  }

  get isPicking(): boolean {
    return this.picking !== null;
  }

  private cancelPick(): void {
    const picking = this.picking;
    this.picking = null;
    picking?.onCancel();
  }

  /** ¿Hay algo atacable bajo este punto del canvas? */
  hasTargetAt(point: { x: number; y: number }): boolean {
    return this.targetAt(point) !== null;
  }

  /** Criatura bajo el punto; en modo guerra (y sin elegir hechizo) también personas. */
  private targetAt(point: { x: number; y: number }): string | null {
    const creature = this.renderer.creatureAt(point);
    if (creature || this.picking || !this.game.warMode) return creature;
    return this.renderer.playerAt(point);
  }

  destroy(): void {
    this.abort.abort();
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const id = this.targetAt(this.local(e));
    if (!id) return;
    // Atacar tiene prioridad sobre agarrar un objeto que esté debajo.
    e.stopImmediatePropagation();
    e.preventDefault();
    if (this.picking) {
      const { onPick } = this.picking;
      this.picking = null;
      onPick(id);
      return;
    }
    this.game.attack(id);
  }

  private onHover(e: PointerEvent): void {
    if (e.pointerType !== 'mouse' || e.buttons !== 0) return;
    const id = this.targetAt(this.local(e));
    if (!id) return;
    const creature = this.game.entity(id);
    const action = this.picking ? 'clic para elegir' : 'clic para atacar';
    if (creature) this.tooltip.show(`${creature.name} · ${action}`, e.clientX, e.clientY);
  }

  private local(e: PointerEvent): { x: number; y: number } {
    const rect = this.renderer.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
}
