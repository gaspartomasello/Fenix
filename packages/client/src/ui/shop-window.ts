import {
  ITEMS,
  VENDORS,
  describeItem,
  type BackpackItemSnapshot,
  type ItemKind,
  type NpcRole,
} from '@fenix/shared';
import { el } from './dom';
import { GameWindow } from './game-window';
import { itemIconUrl } from './item-icons';

export interface ShopActions {
  readonly buy: (vendorId: string, kind: ItemKind, amount: number) => void;
  readonly sell: (vendorId: string, itemId: string) => void;
}

/** Tienda de un comerciante: lo que vende, lo que compra de tu mochila y tu oro. */
export class ShopWindow {
  readonly window: GameWindow;
  private vendor: { id: string; role: NpcRole } | null = null;
  private tab: 'buy' | 'sell' = 'buy';
  private readonly greeting: HTMLElement;
  private readonly gold: HTMLElement;
  private readonly list: HTMLElement;
  private readonly tabs: Record<'buy' | 'sell', HTMLButtonElement>;
  private backpack: readonly BackpackItemSnapshot[] = [];

  constructor(private readonly actions: ShopActions) {
    this.window = new GameWindow('tienda', 'Tienda', { x: 290, y: 150 });
    this.greeting = el('p', { className: 'shop-greeting' });
    this.gold = el('p', { className: 'shop-gold' });
    const tab = (key: 'buy' | 'sell', label: string): HTMLButtonElement => {
      const button = el('button', {
        className: 'tab',
        text: label,
        attrs: { type: 'button', role: 'tab' },
      });
      button.addEventListener('click', () => {
        this.tab = key;
        this.render();
      });
      return button;
    };
    this.tabs = { buy: tab('buy', 'Comprar'), sell: tab('sell', 'Vender') };
    this.list = el('ul', { className: 'shop-list' });
    this.window.body.append(
      this.greeting,
      el('div', { className: 'tabs', attrs: { role: 'tablist' } }, [this.tabs.buy, this.tabs.sell]),
      this.list,
      this.gold,
    );
  }

  open(vendorId: string, role: NpcRole): void {
    this.vendor = { id: vendorId, role };
    this.tab = 'buy';
    this.render();
    this.window.show();
  }

  update(backpack: readonly BackpackItemSnapshot[]): void {
    this.backpack = backpack;
    if (this.window.visible) this.render();
  }

  private render(): void {
    const vendor = this.vendor;
    if (!vendor) return;
    const definition = VENDORS[vendor.role];
    this.window.setTitle(definition.name);
    this.greeting.textContent = `«${definition.greeting}»`;
    const gold = this.backpack
      .filter((i) => i.kind === 'gold')
      .reduce((sum, i) => sum + i.amount, 0);
    this.gold.textContent = `Tenés ${gold} monedas de oro en la mochila.`;
    this.tabs.buy.setAttribute('aria-selected', String(this.tab === 'buy'));
    this.tabs.sell.setAttribute('aria-selected', String(this.tab === 'sell'));

    if (this.tab === 'buy') {
      this.list.replaceChildren(
        ...definition.sells.map((offer) => {
          const stackable = ITEMS[offer.kind].stackable;
          const amount = el('input', {
            className: 'field shop-amount',
            attrs: {
              type: 'number',
              min: '1',
              max: stackable ? '100' : '1',
              value: '1',
              'aria-label': 'Cantidad',
            },
          });
          amount.disabled = !stackable;
          const button = el('button', {
            className: 'button button--small',
            text: 'Comprar',
            attrs: { type: 'button' },
          });
          button.disabled = gold < offer.price;
          button.addEventListener('click', () => {
            const units = Math.max(1, Math.min(100, Math.floor(Number(amount.value) || 1)));
            this.actions.buy(vendor.id, offer.kind, units);
          });
          return this.row(offer.kind, describeItem(offer.kind), `${offer.price} c/u`, [
            amount,
            button,
          ]);
        }),
      );
      return;
    }

    const sellable = this.backpack.filter((item) =>
      definition.buys.some((o) => o.kind === item.kind),
    );
    if (sellable.length === 0) {
      this.list.replaceChildren(
        el('li', { className: 'shop-empty', text: 'No tenés nada que le interese.' }),
      );
      return;
    }
    this.list.replaceChildren(
      ...sellable.map((item) => {
        const price = (definition.buys.find((o) => o.kind === item.kind)?.price ?? 0) * item.amount;
        const button = el('button', {
          className: 'button button--small',
          text: 'Vender',
          attrs: { type: 'button' },
        });
        button.addEventListener('click', () => this.actions.sell(vendor.id, item.id));
        return this.row(item.kind, describeItem(item.kind, item.amount), `${price} monedas`, [
          button,
        ]);
      }),
    );
  }

  private row(kind: ItemKind, label: string, price: string, controls: HTMLElement[]): HTMLElement {
    return el('li', { className: 'shop-row' }, [
      el('img', { className: 'shop-icon', attrs: { src: itemIconUrl(kind), alt: '' } }),
      el('div', { className: 'shop-info' }, [
        el('span', { text: label }),
        el('span', { className: 'shop-price', text: price }),
      ]),
      el('div', { className: 'shop-controls' }, controls),
    ]);
  }
}
