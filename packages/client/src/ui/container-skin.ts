import type { ContainerArt } from '@fenix/art';
import { toCanvas } from '../platform/canvas';
import { el } from './dom';
import type { GameWindow } from './game-window';

/** Cada dibujo se hace una sola vez. */
const urls = new Map<ContainerArt, string>();

function imageOf(art: ContainerArt): string {
  let url = urls.get(art);
  if (!url) {
    url = toCanvas(art.draw()).toDataURL();
    urls.set(art, url);
  }
  return url;
}

/**
 * Viste una ventana de recipiente con su dibujo, como en UO (la mochila de
 * cuero, la bolsa, el cofre abierto): el marco de la ventana desaparece y la
 * zona de los objetos queda en el hueco del dibujo.
 */
export class ContainerSkin {
  readonly element: HTMLElement;
  private art: ContainerArt | null = null;

  constructor(
    private readonly window: GameWindow,
    private readonly area: HTMLElement,
  ) {
    this.element = el('div', { className: 'container-skin' });
  }

  /** Cambia el dibujo (o lo saca, con `null`: queda la zona lisa de siempre). */
  wear(art: ContainerArt | null): void {
    if (art === this.art) return;
    this.art = art;
    this.window.element.classList.toggle('skinned-window', art !== null);
    if (!art) {
      this.element.replaceWith(this.area);
      this.area.style.position = '';
      return;
    }
    this.element.style.width = `${art.width}px`;
    this.element.style.height = `${art.height}px`;
    this.element.style.backgroundImage = `url(${imageOf(art)})`;
    if (this.area.parentElement !== this.element) {
      this.area.replaceWith(this.element);
      this.element.prepend(this.area);
    }
    this.area.style.position = 'absolute';
    this.area.style.left = `${art.interior.x}px`;
    this.area.style.top = `${art.interior.y}px`;
  }
}
