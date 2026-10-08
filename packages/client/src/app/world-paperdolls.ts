import type { ClientGame } from '../core/client-game';
import type { GameRenderer } from '../rendering/game-renderer';
import type { PaperdollViewer } from '../ui/paperdoll-viewer';

/**
 * Doble clic (o doble toque) sobre una persona: abre su ventana de
 * personaje, como en UO. Sobre uno mismo abre la propia, con sus botones.
 */
export class WorldPaperdolls {
  private readonly abort = new AbortController();

  constructor(
    private readonly game: ClientGame,
    private readonly renderer: GameRenderer,
    private readonly viewer: PaperdollViewer,
    private readonly openOwn: () => void,
  ) {
    renderer.canvas.addEventListener('dblclick', (e) => this.onDoubleClick(e), {
      signal: this.abort.signal,
    });
  }

  destroy(): void {
    this.abort.abort();
  }

  private onDoubleClick(e: MouseEvent): void {
    const rect = this.renderer.canvas.getBoundingClientRect();
    const id = this.renderer.humanAt({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    if (!id) return;
    if (id === this.game.selfId) {
      this.openOwn();
      return;
    }
    const entity = this.game.entity(id);
    if (!entity) return;
    this.viewer.show(
      id,
      { appearance: entity.appearance, role: entity.npc, equipment: entity.equipment },
      {
        name: entity.name,
        title: null,
        notoriety: entity.notoriety,
        guildTag: entity.guildTag,
      },
    );
  }
}
