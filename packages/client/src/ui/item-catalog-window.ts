import { armorRating, weaponByKind } from '@fenix/shared/combat/weapons';
import { ITEMS, ITEM_KINDS, type ItemKind } from '@fenix/shared/items/item-catalog';
import { SPELLS } from '@fenix/shared/magic/spell-catalog';
import { el } from './dom';
import { GameWindow } from './game-window';
import { itemDetails } from './item-label';
import { itemIconUrl } from './item-icons';

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
  if ((weaponByKind(kind) && kind !== 'pickaxe') || kind === 'arrow' || kind === 'bolt')
    return 'Armas y munición';
  if (definition.slot === 'leftHand' && !definition.light) return 'Escudos';
  if (definition.slot && armorRating(kind) > 0 && definition.slot !== 'cloak') return 'Armaduras';
  if (definition.slot && !definition.light) return 'Ropa';
  if (definition.potion) return 'Pociones';
  if (definition.use === 'eat' || definition.use === 'drink') return 'Comida y bebida';
  if (
    definition.spell ||
    definition.use === 'spellbook' ||
    definition.use === 'scroll' ||
    definition.use === 'mastery' ||
    REAGENTS.has(kind)
  )
    return 'Magia y pergaminos';
  if (definition.capacity && !definition.fixed) return 'Recipientes';
  if (['tool', 'craft', 'dig', 'lockpick', 'dye', 'bandage', 'map'].includes(definition.use))
    return 'Herramientas';
  if (definition.stackable) return 'Recursos';
  return 'Otros';
}

/**
 * Todos los objetos del juego, agrupados y con buscador (`/objetos`, solo
 * administradores): un clic crea la cantidad pedida en la mochila.
 */
export class ItemCatalogWindow {
  readonly window: GameWindow;
  private readonly search: HTMLInputElement;
  private readonly amount: HTMLInputElement;
  private readonly list: HTMLElement;
  private rendered = false;

  constructor(private readonly create: (kind: ItemKind, amount: number) => void) {
    this.window = new GameWindow('objetos', 'Todos los objetos', { x: 260, y: 70 });
    this.search = el('input', {
      className: 'catalog-search',
      attrs: { type: 'search', placeholder: 'Buscar…', 'aria-label': 'Buscar objeto' },
    });
    this.amount = el('input', {
      className: 'catalog-amount',
      attrs: { type: 'number', min: '1', max: '60000', value: '1', 'aria-label': 'Cantidad' },
    });
    this.list = el('div', { className: 'catalog-list' });
    this.search.addEventListener('input', () => this.filter());
    this.window.body.append(
      el('div', { className: 'catalog-tools' }, [
        this.search,
        el('label', { className: 'catalog-amount-label', text: 'Cantidad ' }, [this.amount]),
      ]),
      this.list,
      el('p', {
        className: 'window-hint',
        text: `${ITEM_KINDS.length} objetos · clic para crearlo en tu mochila`,
      }),
    );
  }

  open(): void {
    if (!this.rendered) this.render();
    this.window.show();
    this.search.focus();
  }

  private render(): void {
    this.rendered = true;
    const byGroup = new Map<Group, ItemKind[]>(GROUPS.map((g) => [g, []]));
    for (const kind of ITEM_KINDS) byGroup.get(catalogGroup(kind))?.push(kind);
    this.list.replaceChildren(
      ...GROUPS.filter((g) => (byGroup.get(g)?.length ?? 0) > 0).map((group) =>
        el('section', { className: 'catalog-group' }, [
          el('h3', { className: 'catalog-title', text: group }),
          el(
            'div',
            { className: 'catalog-grid' },
            (byGroup.get(group) ?? []).map((kind) => this.entry(kind)),
          ),
        ]),
      ),
    );
  }

  private entry(kind: ItemKind): HTMLElement {
    const { name } = ITEMS[kind];
    const details = itemDetails(kind);
    const button = el(
      'button',
      {
        className: 'catalog-item',
        attrs: {
          type: 'button',
          title: details ? `${name} — ${details}` : name,
          'data-search': `${plain(name)} ${kind}`,
        },
      },
      [
        el('img', { attrs: { src: itemIconUrl(kind), alt: '', loading: 'lazy' } }),
        el('span', { className: 'catalog-name', text: name }),
      ],
    );
    button.addEventListener('click', () => {
      const amount = Math.max(1, Math.min(60000, Math.floor(Number(this.amount.value) || 1)));
      this.create(kind, amount);
    });
    return button;
  }

  private filter(): void {
    const query = plain(this.search.value.trim());
    for (const section of this.list.querySelectorAll<HTMLElement>('.catalog-group')) {
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

/** Minúsculas y sin tildes, para buscar como se escriba. */
function plain(text: string): string {
  return text.toLocaleLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
