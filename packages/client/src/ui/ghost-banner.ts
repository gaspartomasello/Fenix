import { el } from './dom';

/** Aviso fijo mientras el jugador es un fantasma. */
export class GhostBanner {
  readonly element: HTMLElement;

  constructor() {
    this.element = el('div', { className: 'panel ghost-banner', attrs: { role: 'status' } }, [
      el('strong', { text: 'Sos un fantasma.' }),
      el('span', {
        text: ' Caminá hasta el santuario de cualquier pueblo (el cristal azul de la plaza) para volver a la vida.',
      }),
    ]);
    this.element.hidden = true;
  }

  setVisible(visible: boolean): void {
    this.element.hidden = !visible;
  }
}
