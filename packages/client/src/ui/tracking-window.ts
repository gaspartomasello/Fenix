import {
  TRACKING_CATEGORIES,
  TRACKING_CATEGORY_NAMES,
  describeTrack,
  type EntityId,
  type Position,
  type TrackSighting,
  type TrackingCategory,
} from '@fenix/shared';
import { el } from './dom';
import { GameWindow } from './game-window';

/**
 * Rastrear: se elige qué buscar y aparece la lista de rastros, del más
 * cercano al más lejano; tocar uno lo sigue con la flecha.
 */
export class TrackingWindow {
  readonly window: GameWindow;
  private readonly list: HTMLElement;
  private readonly hint: HTMLElement;

  constructor(
    private readonly track: (category: TrackingCategory) => void,
    private readonly follow: (sighting: TrackSighting) => void,
  ) {
    this.window = new GameWindow('rastrear', 'Rastrear', { x: 320, y: 110 });
    const buttons = TRACKING_CATEGORIES.map((category) => {
      const button = el('button', {
        className: 'button button--small',
        text: TRACKING_CATEGORY_NAMES[category],
        attrs: { type: 'button' },
      });
      button.addEventListener('click', () => {
        this.hint.textContent = 'Buscando rastros…';
        this.list.replaceChildren();
        this.track(category);
      });
      return button;
    });
    this.list = el('ul', { className: 'tracking-list' });
    this.hint = el('p', { className: 'window-hint', text: '¿Qué querés rastrear?' });
    this.window.body.append(
      el('div', { className: 'tracking-buttons' }, buttons),
      this.list,
      this.hint,
    );
  }

  open(): void {
    this.window.show();
  }

  /** Muestra lo que encontró. */
  show(category: TrackingCategory, found: readonly TrackSighting[]): void {
    this.window.show();
    const name = TRACKING_CATEGORY_NAMES[category].toLocaleLowerCase();
    this.hint.textContent =
      found.length > 0
        ? 'Tocá un rastro para seguirlo con la flecha.'
        : `No encontrás rastros de ${name} cerca.`;
    this.list.replaceChildren(
      ...found.map((sighting) => {
        const button = el('button', {
          className: 'tracking-entry',
          attrs: { type: 'button' },
        });
        button.append(
          el('span', { className: 'tracking-name', text: sighting.name }),
          el('span', {
            className: 'tracking-where',
            text: describeTrack(sighting.direction, sighting.distance),
          }),
        );
        button.addEventListener('click', () => {
          this.follow(sighting);
          this.window.hide();
        });
        return el('li', {}, [button]);
      }),
    );
  }
}

/**
 * Flecha alrededor del personaje que apunta al rastro que se sigue, con su
 * nombre y a cuántos pasos está. Se esconde al perderlo.
 */
export class TrackingArrow {
  readonly element: HTMLElement;
  private readonly arrow: HTMLElement;
  private readonly label: HTMLElement;
  private target: { id: EntityId; name: string; at: Position } | null = null;

  constructor() {
    this.arrow = el('div', { className: 'tracking-arrow', text: '➤' });
    this.label = el('div', { className: 'tracking-label' });
    this.element = el('div', { className: 'tracking-pointer', attrs: { 'aria-live': 'polite' } }, [
      this.arrow,
      this.label,
    ]);
    this.element.hidden = true;
  }

  get followingId(): EntityId | null {
    return this.target?.id ?? null;
  }

  follow(id: EntityId, name: string): void {
    this.target = { id, name, at: this.target?.id === id ? this.target.at : { x: 0, y: 0 } };
  }

  /** Nueva posición del rastro. */
  point(id: EntityId, name: string, at: Position): void {
    if (this.target && this.target.id !== id) return;
    this.target = { id, name, at };
  }

  lose(): void {
    this.target = null;
    this.element.hidden = true;
  }

  /** Ubica la flecha: `self` es la posición propia; `center`, dónde está en la pantalla. */
  update(self: Position | null, center: { x: number; y: number }): void {
    const target = this.target;
    if (!target || !self || (target.at.x === 0 && target.at.y === 0)) {
      this.element.hidden = true;
      return;
    }
    const dx = target.at.x - self.x;
    const dy = target.at.y - self.y;
    const steps = Math.max(Math.abs(dx), Math.abs(dy));
    // En la vista isométrica, x avanza abajo a la derecha e y abajo a la izquierda.
    const sx = dx - dy;
    const sy = (dx + dy) / 2;
    const angle = Math.atan2(sy, sx);
    const radius = 64;
    this.element.hidden = false;
    this.element.style.left = `${center.x + Math.cos(angle) * radius}px`;
    this.element.style.top = `${center.y + Math.sin(angle) * radius}px`;
    this.arrow.style.transform = `rotate(${angle}rad)`;
    this.label.textContent =
      steps <= 1 ? `${target.name} · acá` : `${target.name} · ${steps} pasos`;
  }
}
