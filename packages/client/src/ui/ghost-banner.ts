import { el } from './dom';

/** Aviso fijo mientras el jugador es un fantasma. */
export class GhostBanner {
  readonly element: HTMLElement;

  constructor() {
    this.element = el('div', { className: 'panel ghost-banner', attrs: { role: 'status' } }, [
      el('strong', { text: 'Sos un fantasma.' }),
      el('span', {
        text: ' Caminá hasta el santuario (el cristal azul en la plaza de Puerto Ceniza) para volver a la vida.',
      }),
    ]);
    this.element.hidden = true;
  }

  setVisible(visible: boolean): void {
    this.element.hidden = !visible;
  }
}
