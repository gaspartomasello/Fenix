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
  private readonly parts = {
    name: el('span', { className: 'status-name' }),
    place: el('span', { className: 'status-place' }),
    time: el('span', { className: 'status-time' }),
    company: el('span', { className: 'status-company' }),
  };
  private last = '';

  constructor() {
    // Cada dato en su lugar: con el dedo se muestran solo el lugar y la hora.
    this.text = el('span', { className: 'status-text' }, [
      this.parts.name,
      this.parts.place,
      this.parts.time,
      this.parts.company,
    ]);
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
    const place = `${region} (${x}, ${y})`;
    const value = `${name}|${place}|${time}|${company}`;
    if (value === this.last) return;
    this.last = value;
    this.parts.name.textContent = name;
    this.parts.place.textContent = place;
    this.parts.time.textContent = time;
    this.parts.company.textContent = company;
  }

  destroy(): void {
    this.element.remove();
  }
}
