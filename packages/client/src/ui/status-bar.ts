import { el } from './dom';

export interface StatusInfo {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly online: number;
}

/** Barra superior con el personaje, la posición y la gente conectada. */
export class StatusBar {
  readonly element: HTMLElement;
  private readonly text: HTMLElement;
  private last = '';

  constructor() {
    this.text = el('span');
    this.element = el('div', { className: 'status-bar panel' }, [
      this.text,
      el('span', {
        className: 'status-help',
        text: 'Flechas/WASD o clic derecho para moverte · Shift corre · Rueda: zoom',
      }),
    ]);
  }

  update({ name, x, y, online }: StatusInfo): void {
    const value = `${name} · (${x}, ${y}) · ${online} en línea`;
    if (value === this.last) return;
    this.last = value;
    this.text.textContent = value;
  }

  destroy(): void {
    this.element.remove();
  }
}
