import { el } from './dom';

export interface StatusInfo {
  readonly name: string;
  readonly region: string;
  readonly time: string;
  readonly x: number;
  readonly y: number;
  readonly visible: number;
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
        text: 'Flechas/WASD, clic derecho o tocá para moverte · Shift: correr · Rueda del mouse: acercar o alejar',
      }),
    ]);
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
