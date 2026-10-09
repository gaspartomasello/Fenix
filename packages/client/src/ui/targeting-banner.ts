import { el } from './dom';

/** Aviso mientras se elige el objetivo de un hechizo. */
export class TargetingBanner {
  readonly element: HTMLElement;
  private readonly text: HTMLElement;

  constructor() {
    this.text = el('span');
    this.element = el('div', { className: 'panel targeting-banner', attrs: { role: 'status' } }, [
      this.text,
    ]);
    this.element.hidden = true;
  }

  show(text: string): void {
    this.text.textContent = text;
    this.element.hidden = false;
  }

  hide(): void {
    this.element.hidden = true;
  }
}
