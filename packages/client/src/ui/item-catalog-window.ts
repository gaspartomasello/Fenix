import { armorRating, weaponByKind } from '@fenix/shared/combat/weapons';
import { ITEMS, ITEM_KINDS, type ItemKind } from '@fenix/shared/items/item-catalog';
import { SPELLS } from '@fenix/shared/magic/spell-catalog';
import { STATICS, type StaticKind } from '@fenix/shared/world/statics';
import { PIECE_GROUPS, worldPieces } from '../core/world-pieces';
import { el } from './dom';
import { GameWindow } from './game-window';
import { itemDetails } from './item-label';
import { itemIconUrl } from './item-icons';
import { staticIconUrl } from './static-icons';

/** Grupos de la ventana, en el orden en que se muestran. */
const GROUPS = [
  'Armas y munición',
  'Escudos',
  'Armaduras',
  'Ropa',
  'Comida y bebida',
  'Pociones',
  'Magia y pergaminos',
  'Herramientas',
  'Recipientes',
  'Recursos',
  'Muebles',
  'Otros',
] as const;
type Group = (typeof GROUPS)[number];

/** Los reactivos: lo que gastan los hechizos. */
const REAGENTS: ReadonlySet<ItemKind> = new Set(
  Object.values(SPELLS).flatMap((spell) => spell.reagents.map((r) => r.kind)),
);

/** En qué grupo de la lista va cada objeto. */
export function catalogGroup(kind: ItemKind): Group {
  const definition = ITEMS[kind];
  if (definition.furniture) return 'Muebles';
  if ((weaponByKind(kind) && kind !== 'pickaxe') || kind === 'arrow' || kind === 'bolt')
    return 'Armas y munición';
  if (definition.use === 'spellbook') return 'Magia y pergaminos';
  if (definition.slot === 'leftHand' && !definition.light) return 'Escudos';
  if (definition.slot && armorRating(kind) > 0 && definition.slot !== 'cloak') return 'Armaduras';
  if (definition.slot && !definition.light) return 'Ropa';
  if (definition.potion) return 'Pociones';
  if (definition.use === 'eat' || definition.use === 'drink') return 'Comida y bebida';
  if (
    definition.spell ||
    definition.use === 'scroll' ||
    definition.use === 'mastery' ||
    REAGENTS.has(kind)
  )
    return 'Magia y pergaminos';
  if (definition.capacity && !definition.fixed) return 'Recipientes';
  if (
    kind === 'bloody-bandage' ||
    ['tool', 'craft', 'dig', 'lockpick', 'dye', 'bandage', 'map'].includes(definition.use)
  )
    return 'Herramientas';
  if (definition.stackable) return 'Recursos';
  return 'Otros';
}

type Tab = 'items' | 'pieces';

/**
 * Todos los objetos del juego, agrupados y con buscador (`/objetos`, solo
 * administradores): un clic crea la cantidad pedida en la mochila. En otra
 * solapa, las piezas fijas del mundo (muebles, luces, árboles, paredes,
 * ruinas), para verlas todas juntas.
 */
export class ItemCatalogWindow {
  readonly window: GameWindow;
  private readonly search: HTMLInputElement;
  private readonly amount: HTMLElement;
  private readonly amountInput: HTMLInputElement;
  private readonly lists: Record<Tab, HTMLElement>;
  private readonly tabs: Record<Tab, HTMLButtonElement>;
  private readonly hint: HTMLElement;
  private readonly rendered = new Set<Tab>();
  private tab: Tab = 'items';
  private readonly pieces = worldPieces();
  private readonly pieceCount = [...this.pieces.values()].reduce((n, l) => n + l.length, 0);

  constructor(private readonly create: (kind: ItemKind, amount: number) => void) {
    this.window = new GameWindow('objetos', 'Todos los objetos', { x: 260, y: 70 });
    this.window.element.classList.add('catalog-window');
    this.search = el('input', {
      className: 'catalog-search',
      attrs: { type: 'search', placeholder: 'Buscar…', 'aria-label': 'Buscar' },
    });
    this.amountInput = el('input', {
      className: 'catalog-amount',
      attrs: { type: 'number', min: '1', max: '60000', value: '1', 'aria-label': 'Cantidad' },
    });
    this.amount = el('label', { className: 'catalog-amount-label', text: 'Cantidad ' }, [
      this.amountInput,
    ]);
    this.lists = {
      items: el('div', { className: 'catalog-list' }),
      pieces: el('div', { className: 'catalog-list' }),
    };
    const tab = (key: Tab, label: string): HTMLButtonElement => {
      const button = el('button', {
        className: 'tab',
        text: label,
        attrs: { type: 'button', role: 'tab' },
      });
      button.addEventListener('click', () => this.show(key));
      return button;
    };
    this.tabs = { items: tab('items', 'Objetos'), pieces: tab('pieces', 'Muebles y mundo') };
    this.hint = el('p', { className: 'window-hint catalog-hint' });
    this.search.addEventListener('input', () => this.filter());
    this.window.body.append(
      el('div', { className: 'tabs catalog-tabs', attrs: { role: 'tablist' } }, [
        this.tabs.items,
        this.tabs.pieces,
      ]),
      el('div', { className: 'catalog-tools' }, [this.search, this.amount]),
      this.lists.items,
      this.lists.pieces,
      this.hint,
    );
  }

  open(): void {
    this.show(this.tab);
    this.window.show();
    this.search.focus();
  }

  private show(tab: Tab): void {
    this.tab = tab;
    if (!this.rendered.has(tab)) {
      this.rendered.add(tab);
      if (tab === 'items') this.renderItems();
      else this.renderPieces();
    }
    for (const key of ['items', 'pieces'] as const) {
      this.lists[key].hidden = key !== tab;
      this.tabs[key].setAttribute('aria-selected', String(key === tab));
    }
    this.amount.hidden = tab !== 'items';
    this.hint.textContent =
      tab === 'items'
        ? `${ITEM_KINDS.length} objetos · tocá uno para crearlo en tu mochila`
        : `${this.pieceCount} piezas del mundo · se ponen con los mapas o al construir`;
    this.filter();
  }

  private renderItems(): void {
    const byGroup = new Map<Group, ItemKind[]>(GROUPS.map((g) => [g, []]));
    for (const kind of ITEM_KINDS) byGroup.get(catalogGroup(kind))?.push(kind);
    this.lists.items.replaceChildren(
      ...GROUPS.map((group) =>
        section(
          group,
          (byGroup.get(group) ?? []).map((k) => this.item(k)),
        ),
      ),
    );
  }

  private renderPieces(): void {
    this.lists.pieces.replaceChildren(
      ...PIECE_GROUPS.map((group) =>
        section(
          group,
          (this.pieces.get(group) ?? []).map((kind) => piece(kind)),
        ),
      ),
    );
  }

  private item(kind: ItemKind): HTMLElement {
    const { name } = ITEMS[kind];
    const details = itemDetails(kind);
    const button = entry(itemIconUrl(kind), name, details ? `${name} — ${details}` : name, kind);
    button.addEventListener('click', () => {
      const amount = Math.max(1, Math.min(60000, Math.floor(Number(this.amountInput.value) || 1)));
      this.create(kind, amount);
    });
    return button;
  }

  private filter(): void {
    const query = plain(this.search.value.trim());
    for (const section of this.lists[this.tab].querySelectorAll<HTMLElement>('.catalog-group')) {
      let shown = 0;
      for (const item of section.querySelectorAll<HTMLElement>('.catalog-item')) {
        const match = !query || (item.dataset.search ?? '').includes(query);
        item.hidden = !match;
        if (match) shown++;
      }
      section.hidden = shown === 0;
    }
  }
}

/** Un grupo con su título y sus casilleros (vacío, no se muestra). */
function section(title: string, entries: HTMLElement[]): HTMLElement {
  const group = el('section', { className: 'catalog-group' }, [
    el('h3', { className: 'catalog-title', text: title }),
    el('div', { className: 'catalog-grid' }, entries),
  ]);
  group.hidden = entries.length === 0;
  return group;
}

/** Un casillero: el dibujo y el nombre abajo. */
function entry(icon: string, name: string, title: string, key: string): HTMLButtonElement {
  return el(
    'button',
    {
      className: 'catalog-item',
      attrs: { type: 'button', title, 'data-search': `${plain(name)} ${key}` },
    },
    [
      el('span', { className: 'catalog-icon' }, [
        el('img', { attrs: { src: icon, alt: '', loading: 'lazy', draggable: 'false' } }),
      ]),
      el('span', { className: 'catalog-name', text: name }),
    ],
  );
}

/** Una pieza del mundo: solo para verla (no va en la mochila). */
function piece(kind: StaticKind): HTMLElement {
  const { name, lightRadius } = STATICS[kind];
  const button = entry(
    staticIconUrl(kind),
    name,
    lightRadius > 0 ? `${name} — alumbra de noche` : name,
    kind,
  );
  button.classList.add('catalog-item--piece');
  button.tabIndex = -1;
  return button;
}

/** Minúsculas y sin tildes, para buscar como se escriba. */
function plain(text: string): string {
  return text.toLocaleLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
