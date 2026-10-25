import type { Position } from '@fenix/shared/geometry/position';
import { HOUSE_PLANS, houseKindOfDeed, type HouseKind } from '@fenix/shared/housing/houses';
import { houseOrigin, placementProblem } from '@fenix/shared/housing/structure';
import type { ClientGame } from '../core/client-game';
import type { GameRenderer } from '../rendering/game-renderer';
import type { ScreenPoint } from '../rendering/iso';
import type { TargetingBanner } from '../ui/targeting-banner';
import type { WorldTooltip } from '../ui/world-tooltip';

/** Lo que se está levantando: la escritura y la casa, y dónde se mostró por última vez. */
interface Placing {
  readonly deedId: string;
  readonly kind: HouseKind;
  shown: Position | null;
}

/**
 * Las casas en el mundo: doble clic en el cartel abre la ventana de la casa,
 * y al usar una escritura se elige dónde levantarla viendo la casa en el
 * suelo (verde si se puede, roja si no). Con el mouse la casa sigue al
 * puntero y un clic la levanta; con el dedo, el primer toque la muestra y el
 * segundo en el mismo lugar la levanta. Escape (o Cancelar) no hace nada.
 */
export class WorldHouses {
  private readonly abort = new AbortController();
  private placing: Placing | null = null;

  constructor(
    private readonly game: ClientGame,
    private readonly renderer: GameRenderer,
    private readonly tooltip: WorldTooltip,
    private readonly banner: TargetingBanner,
  ) {
    const canvas = renderer.canvas;
    const signal = this.abort.signal;
    canvas.addEventListener('dblclick', (e) => this.openSign(e), { signal });
    canvas.addEventListener('pointermove', (e) => this.onMove(e), { signal });
    // En captura: mientras se elige el lugar, el toque no camina ni agarra nada.
    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e), { signal, capture: true });
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape' && this.placing) {
          e.stopImmediatePropagation();
          this.stop();
        }
      },
      { signal, capture: true },
    );
  }

  /** ¿Se está eligiendo dónde levantar una casa? */
  get isPlacing(): boolean {
    return this.placing !== null;
  }

  /** Usar una escritura: empezar a elegir dónde levantar la casa. */
  place(deedId: string, deedKind: string): void {
    const kind = houseKindOfDeed(deedKind);
    if (!kind) return;
    this.placing = { deedId, kind, shown: null };
    this.banner.show(
      `${capitalize(HOUSE_PLANS[kind].name)}: elegí dónde levantarla. Verde, se puede; rojo, no (Escape cancela).`,
    );
    const self = this.game.self;
    if (self) this.preview(self.position);
  }

  destroy(): void {
    this.stop();
    this.abort.abort();
  }

  private stop(): void {
    this.placing = null;
    this.renderer.hideHousePreview();
    this.banner.hide();
  }

  private onMove(e: PointerEvent): void {
    const point = this.local(e);
    if (this.placing) {
      if (e.pointerType === 'mouse') this.preview(this.renderer.screenToTile(point));
      return;
    }
    if (e.pointerType !== 'mouse' || e.buttons !== 0) return;
    const house = this.signAt(point);
    if (house)
      this.tooltip.show(
        `«${house.name}» · casa de ${house.owner} · doble clic para verla`,
        e.clientX,
        e.clientY,
      );
  }

  private onPointerDown(e: PointerEvent): void {
    const placing = this.placing;
    if (!placing || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    const tile = this.renderer.screenToTile(this.local(e));
    // Con el dedo, el primer toque muestra la casa; el segundo, en el mismo lugar, la levanta.
    const same = placing.shown && placing.shown.x === tile.x && placing.shown.y === tile.y;
    if (e.pointerType !== 'mouse' && !same) {
      this.preview(tile);
      return;
    }
    this.game.placeHouse(placing.deedId, tile);
    this.stop();
  }

  private preview(tile: Position): void {
    const placing = this.placing;
    const map = this.game.map;
    if (!placing || !map) return;
    placing.shown = tile;
    const valid = placementProblem(map, placing.kind, houseOrigin(placing.kind, tile)) === null;
    this.renderer.showHousePreview(placing.kind, tile, valid);
  }

  private openSign(e: MouseEvent): void {
    if (this.placing) return;
    const house = this.signAt(this.local(e));
    if (!house) return;
    e.preventDefault();
    this.game.houseAction(house.id, 'panel');
  }

  /** La casa cuyo cartel está bajo el puntero (el poste sube un poco sobre su tile). */
  private signAt(point: ScreenPoint) {
    for (const tile of this.renderer.tilesUnder(point, [0, 14, 28])) {
      const house = this.game.houseWithSign(tile);
      if (house) return house;
    }
    return undefined;
  }

  private local(e: MouseEvent): ScreenPoint {
    const rect = this.renderer.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
}

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
