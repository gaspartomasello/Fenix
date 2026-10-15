import { ART_DETAIL, drawMountFrame } from '@fenix/art';
import {
  Direction,
  MOUNTS,
  MOUNT_KINDS,
  VENDORS,
  type BackpackItemSnapshot,
  type MountKind,
} from '@fenix/shared';
import { toCanvas } from '../platform/canvas';
import { el } from './dom';
import { GameWindow } from './game-window';

const portraits = new Map<MountKind, string>();

/** Recorte del lienzo de la montura (en pixeles de pantalla) donde entra el animal. */
const PORTRAIT = { x: 16, y: 54, width: 88, height: 68 } as const;

/** Retrato de la montura, de costado, para la lista de la caballeriza. */
function portraitUrl(kind: MountKind): string {
  let url = portraits.get(kind);
  if (!url) {
    const full = toCanvas(drawMountFrame(kind, Direction.NorthEast, 'idle'));
    const crop = document.createElement('canvas');
    crop.width = PORTRAIT.width * ART_DETAIL;
    crop.height = PORTRAIT.height * ART_DETAIL;
    crop
      .getContext('2d')
      ?.drawImage(
        full,
        PORTRAIT.x * ART_DETAIL,
        PORTRAIT.y * ART_DETAIL,
        crop.width,
        crop.height,
        0,
        0,
        crop.width,
        crop.height,
      );
    url = crop.toDataURL();
    portraits.set(kind, url);
  }
  return url;
}

/** La caballeriza: las monturas en venta, con su retrato y su precio. */
export class StableWindow {
  readonly window: GameWindow;
  private vendorId: string | null = null;
  private readonly list: HTMLElement;
  private readonly gold: HTMLElement;
  private backpack: readonly BackpackItemSnapshot[] = [];

  constructor(private readonly buy: (vendorId: string, mount: MountKind) => void) {
    const definition = VENDORS.stablemaster;
    this.window = new GameWindow('caballeriza', definition.name, { x: 290, y: 150 });
    this.list = el('ul', { className: 'shop-list stable-list' });
    this.gold = el('p', { className: 'shop-gold' });
    this.window.body.append(
      el('p', { className: 'shop-greeting', text: `«${definition.greeting}»` }),
      this.list,
      this.gold,
      el('p', {
        className: 'window-hint',
        text: 'La montura te sigue. Doble clic sobre ella para montar; sobre vos, para bajarte.',
      }),
    );
  }

  open(vendorId: string): void {
    this.vendorId = vendorId;
    this.render();
    this.window.show();
  }

  update(backpack: readonly BackpackItemSnapshot[]): void {
    this.backpack = backpack;
    if (this.window.visible) this.render();
  }

  private render(): void {
    const vendorId = this.vendorId;
    if (!vendorId) return;
    const gold = this.backpack
      .filter((i) => i.kind === 'gold')
      .reduce((sum, i) => sum + i.amount, 0);
    this.gold.textContent = `Tenés ${gold} monedas de oro en la mochila.`;
    this.list.replaceChildren(
      ...MOUNT_KINDS.map((kind) => {
        const { name, price } = MOUNTS[kind];
        const button = el('button', {
          className: 'button button--small',
          text: 'Comprar',
          attrs: { type: 'button' },
        });
        button.disabled = gold < price;
        button.addEventListener('click', () => this.buy(vendorId, kind));
        return el('li', { className: 'shop-row stable-row' }, [
          el('img', {
            className: 'stable-portrait',
            attrs: { src: portraitUrl(kind), alt: '', draggable: 'false' },
          }),
          el('div', { className: 'shop-info' }, [
            el('span', { text: name }),
            el('span', { className: 'shop-price', text: `${price} monedas` }),
          ]),
          button,
        ]);
      }),
    );
  }
}
