import { el } from './dom';

export interface StatusInfo {
  readonly name: string;
  readonly region: string;
  readonly time: string;
  readonly x: number;
  readonly y: number;
  readonly visible: number;
}

/**
 * Barra superior con el personaje, la posición y la gente conectada; a la
 * derecha van los botones del juego (Mochila, Personaje, Mapa…).
 */
export class StatusBar {
  readonly element: HTMLElement;
  private readonly text: HTMLElement;
  private last = '';

  constructor() {
    this.text = el('span');
    this.element = el('div', { className: 'status-bar panel' }, [this.text]);
  }

  /** Pone los botones del juego en la barra, a la derecha. */
  dock(buttons: HTMLElement): void {
    this.element.append(buttons);
  }

  update({ name, region, time, x, y, visible }: StatusInfo): void {
    const others = visible - 1;
    const company =
      others === 0 ? 'nadie cerca' : others === 1 ? '1 jugador cerca' : `${others} jugadores cerca`;
    const value = `${name} · ${region} (${x}, ${y}) · ${time} · ${company}`;
    if (value === this.last) return;
    this.last = value;
    this.text.textContent = value;
  }

  destroy(): void {
    this.element.remove();
  }
}
