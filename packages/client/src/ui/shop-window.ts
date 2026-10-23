import { VENDORS, type NpcRole } from '@fenix/shared/economy/vendors';
import { ITEMS, describeItem, type ItemKind } from '@fenix/shared/items/item-catalog';
import type { BackpackItemSnapshot } from '@fenix/shared/protocol/messages';
import { el } from './dom';
import { GameWindow } from './game-window';
import { itemIconUrl } from './item-icons';
import { itemDetails, shopCategory, type ShopCategory } from './item-label';

const CATEGORIES: readonly { key: ShopCategory | 'all'; label: string }[] = [
  { key: 'all', label: 'Todo' },
  { key: 'weapons', label: 'Armas' },
  { key: 'armor', label: 'Armaduras y ropa' },
  { key: 'food', label: 'Comida' },
  { key: 'other', label: 'Otros' },
];

export interface ShopActions {
  readonly buy: (vendorId: string, kind: ItemKind, amount: number) => void;
  readonly sell: (vendorId: string, itemId: string) => void;
}

/** Tienda de un comerciante: lo que vende, lo que compra de tu mochila y tu oro. */
export class ShopWindow {
  readonly window: GameWindow;
  private vendor: { id: string; role: NpcRole } | null = null;
  private tab: 'buy' | 'sell' = 'buy';
  private category: ShopCategory | 'all' = 'all';
  private readonly filters: HTMLElement;
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
    this.filters = el('div', { className: 'shop-filters' });
    this.window.body.append(
      this.greeting,
      el('div', { className: 'tabs', attrs: { role: 'tablist' } }, [this.tabs.buy, this.tabs.sell]),
      this.filters,
      this.list,
      this.gold,
    );
  }

  open(vendorId: string, role: NpcRole): void {
    this.vendor = { id: vendorId, role };
    this.tab = 'buy';
    this.category = 'all';
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
      // En las tiendas grandes, estantes para encontrar las cosas.
      const present = new Set(definition.sells.map((o) => shopCategory(o.kind)));
      const shelves = CATEGORIES.filter((c) => c.key === 'all' || present.has(c.key));
      this.filters.hidden = definition.sells.length <= 8 || shelves.length <= 2;
      this.filters.replaceChildren(
        ...shelves.map((c) => {
          const chip = el('button', {
            className: 'shop-filter',
            text: c.label,
            attrs: { type: 'button', 'aria-pressed': String(this.category === c.key) },
          });
          chip.addEventListener('click', () => {
            this.category = c.key;
            this.render();
          });
          return chip;
        }),
      );
      const shown = definition.sells.filter(
        (o) =>
          this.filters.hidden || this.category === 'all' || shopCategory(o.kind) === this.category,
      );
      this.list.replaceChildren(
        ...shown.map((offer) => {
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
          const units = (): number =>
            Math.max(1, Math.min(100, Math.floor(Number(amount.value) || 1)));
          button.addEventListener('click', () => this.actions.buy(vendor.id, offer.kind, units()));
          const row = this.row(
            offer.kind,
            describeItem(offer.kind),
            stackable ? `${offer.price} c/u` : `${offer.price} monedas`,
            [amount, button],
          );
          // Con varias unidades, el total y si alcanza el oro.
          amount.addEventListener('input', () => {
            const total = units() * offer.price;
            const price = row.querySelector('.shop-price');
            if (price)
              price.textContent =
                units() > 1 ? `${offer.price} c/u · total ${total}` : `${offer.price} c/u`;
            button.disabled = gold < total;
          });
          return row;
        }),
      );
      return;
    }

    this.filters.hidden = true;
    const sellable = this.backpack.filter((item) =>
      definition.buys.some((o) => o.kind === item.kind),
    );
    if (sellable.length === 0) {
      this.list.replaceChildren(
        el('li', { className: 'shop-empty', text: 'No tenés nada que le interese.' }),
      );
      return;
    }
    const priceOf = (item: BackpackItemSnapshot): number =>
      (definition.buys.find((o) => o.kind === item.kind)?.price ?? 0) * item.amount;
    const all = el('button', {
      className: 'button button--small shop-sell-all',
      text: `Vender todo (${sellable.reduce((sum, i) => sum + priceOf(i), 0)} monedas)`,
      attrs: { type: 'button' },
    });
    all.addEventListener('click', () => {
      for (const item of sellable) this.actions.sell(vendor.id, item.id);
    });
    this.list.replaceChildren(
      el('li', { className: 'shop-row shop-row--all' }, [all]),
      ...sellable.map((item) => {
        const price = priceOf(item);
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
        ...(itemDetails(kind)
          ? [el('span', { className: 'shop-details', text: itemDetails(kind) })]
          : []),
        el('span', { className: 'shop-price', text: price }),
      ]),
      el('div', { className: 'shop-controls' }, controls),
    ]);
  }
}
