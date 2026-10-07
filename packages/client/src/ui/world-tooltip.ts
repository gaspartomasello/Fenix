import { el } from './dom';

/** Cartelito con el nombre de lo que hay bajo el puntero. */
export class WorldTooltip {
  readonly element: HTMLElement;

  constructor() {
    this.element = el('div', { className: 'world-tooltip', attrs: { role: 'tooltip' } });
    this.element.hidden = true;
  }

  show(text: string, clientX: number, clientY: number): void {
    this.element.textContent = text;
    this.element.hidden = false;
    this.element.style.transform = `translate(${clientX + 14}px, ${clientY + 12}px)`;
  }

  hide(): void {
    this.element.hidden = true;
  }
}
