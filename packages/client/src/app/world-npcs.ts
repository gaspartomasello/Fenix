import type { NpcRole } from '@fenix/shared';
import type { ClientGame } from '../core/client-game';
import type { GameRenderer } from '../rendering/game-renderer';
import type { WorldTooltip } from '../ui/world-tooltip';

/** Tocar a un personaje del pueblo abre su tienda o el banco. */
export class WorldNpcs {
  private readonly abort = new AbortController();

  constructor(
    private readonly game: ClientGame,
    private readonly renderer: GameRenderer,
    private readonly tooltip: WorldTooltip,
    private readonly onOpen: (npcId: string, role: NpcRole) => void,
  ) {
    const canvas = renderer.canvas;
    const signal = this.abort.signal;
    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e), { signal });
    canvas.addEventListener('pointermove', (e) => this.onHover(e), { signal });
  }

  hasNpcAt(point: { x: number; y: number }): boolean {
    return this.renderer.npcAt(point) !== null;
  }

  destroy(): void {
    this.abort.abort();
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const id = this.renderer.npcAt(this.local(e));
    const role = id ? this.game.entity(id)?.npc : null;
    if (!id || !role) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    this.onOpen(id, role);
  }

  private onHover(e: PointerEvent): void {
    if (e.pointerType !== 'mouse' || e.buttons !== 0) return;
    const id = this.renderer.npcAt(this.local(e));
    const npc = id ? this.game.entity(id) : undefined;
    if (!npc) return;
    const action = npc.npc === 'banker' ? 'clic para abrir el banco' : 'clic para comerciar';
    this.tooltip.show(`${npc.name} · ${action}`, e.clientX, e.clientY);
  }

  private local(e: PointerEvent): { x: number; y: number } {
    const rect = this.renderer.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
}
