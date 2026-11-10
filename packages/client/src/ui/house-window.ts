import {
  HOUSE_LEVEL_NAMES,
  HOUSE_PLANS,
  houseLevelAtLeast,
  type HouseLevel,
  type HouseList,
  type HouseSecurity,
} from '@fenix/shared/housing/houses';
import type {
  EntityId,
  HouseAction,
  HouseSecurityChange,
  HouseSnapshot,
} from '@fenix/shared/protocol/messages';
import { el } from './dom';
import { GameWindow } from './game-window';

/** Lo que la ventana le pide al juego. */
export interface HouseCommands {
  action(houseId: EntityId, action: HouseAction): void;
  security(houseId: EntityId, change: HouseSecurityChange): void;
  /** Abrir la ventana para diseñar la casa a medida. */
  design(houseId: EntityId): void;
}

const LISTS: readonly { list: HouseList; title: string; hint: string; ownerOnly: boolean }[] = [
  {
    list: 'co-owners',
    title: 'Copropietarios',
    hint: 'La administran con vos (no la pueden demoler).',
    ownerOnly: true,
  },
  {
    list: 'friends',
    title: 'Amigos',
    hint: 'Abren las puertas y los cofres y levantan lo que hay adentro.',
    ownerOnly: false,
  },
  {
    list: 'banned',
    title: 'Echados',
    hint: 'No pueden entrar, ni con la casa pública.',
    ownerOnly: false,
  },
];

/**
 * La ventana de una casa, como el cartel de las casas de UO: de quién es, qué
 * casa es y quién es uno ahí. El dueño y los copropietarios le cambian el
 * nombre, la hacen pública o privada, manejan las listas (copropietarios,
 * amigos y echados), echan a las visitas y el dueño la puede demoler.
 */
type Tab = 'house' | 'people';

export class HouseWindow {
  readonly window: GameWindow;
  private houseId: EntityId | null = null;
  private level: HouseLevel = 'visitor';
  private security: HouseSecurity | null = null;
  private storage: { used: number; max: number } | null = null;
  private house: HouseSnapshot | null = null;
  /** Demoler pide confirmación: el segundo toque es el que vale. */
  private confirming = false;
  /** Solapa abierta: la casa en sí o la gente (copropietarios, amigos, echados). */
  private tab: Tab = 'house';

  constructor(private readonly commands: HouseCommands) {
    this.window = new GameWindow('casa', 'Casa', { x: 320, y: 100 });
    this.window.element.classList.add('house-window');
  }

  get openHouseId(): EntityId | null {
    return this.window.element.hidden ? null : this.houseId;
  }

  open(
    house: HouseSnapshot,
    level: HouseLevel,
    security?: HouseSecurity,
    storage?: { used: number; max: number },
  ): void {
    if (this.houseId !== house.id) {
      this.confirming = false;
      this.tab = 'house';
    }
    this.houseId = house.id;
    this.house = house;
    this.level = level;
    this.security = security ?? null;
    this.storage = storage ?? null;
    this.render();
    this.window.show();
  }

  /** La casa cambió (o se demolió): se actualiza o se cierra. */
  update(house: HouseSnapshot | undefined): void {
    if (!this.houseId || this.window.element.hidden) return;
    if (!house) {
      this.window.hide();
      return;
    }
    if (house.id !== this.houseId) return;
    this.house = house;
    this.render();
  }

  private render(): void {
    const house = this.house;
    const id = this.houseId;
    if (!house || !id) return;
    this.window.setTitle(`«${house.name}»`);
    const parts: HTMLElement[] = [this.plate(house)];
    if (this.storage) parts.push(meter(this.storage.used, this.storage.max));
    const manages = houseLevelAtLeast(this.level, 'co-owner') && this.security !== null;
    if (manages && this.security) {
      parts.push(this.tabs());
      parts.push(
        this.tab === 'house'
          ? this.houseTab(id, house, this.security)
          : this.peopleTab(this.security, (change) => this.commands.security(id, change)),
      );
    } else if (house.design && this.level === 'owner') parts.push(this.designSection(id));
    this.window.body.replaceChildren(...parts);
  }

  /** La placa de arriba: qué casa es, de quién, uno quién es ahí y el sello de pública o privada. */
  private plate(house: HouseSnapshot): HTMLElement {
    const plan = HOUSE_PLANS[house.kind];
    const floors = plan.lot
      ? `${plan.width}×${plan.height}, hasta ${plan.floors + 1} plantas`
      : plan.floors === 0
        ? 'una planta'
        : `${plan.floors + 1} plantas`;
    return el('div', { className: 'house-plate' }, [
      el('div', { className: 'house-plate-text' }, [
        el('span', { className: 'house-plate-kind', text: `${capitalize(plan.name)} · ${floors}` }),
        el('span', {
          className: 'house-plate-owner',
          text: `De ${house.owner} · sos ${HOUSE_LEVEL_NAMES[this.level]}`,
        }),
      ]),
      el('span', {
        className: house.public ? 'house-seal is-public' : 'house-seal',
        text: house.public ? 'Pública' : 'Privada',
        attrs: {
          title: house.public
            ? 'Pública: cualquiera abre las puertas, menos los echados'
            : 'Privada: solo los amigos abren las puertas',
        },
      }),
    ]);
  }

  private tabs(): HTMLElement {
    const security = this.security;
    const people = security
      ? security.coOwners.length + security.friends.length + security.banned.length
      : 0;
    const tab = (key: Tab, label: string): HTMLElement => {
      const node = el('button', {
        className: 'tab',
        text: label,
        attrs: { type: 'button', role: 'tab', 'aria-selected': String(this.tab === key) },
      });
      node.addEventListener('click', () => {
        this.tab = key;
        this.render();
      });
      return node;
    };
    return el('div', { className: 'tabs house-tabs', attrs: { role: 'tablist' } }, [
      tab('house', 'Casa'),
      tab('people', people > 0 ? `Gente (${people})` : 'Gente'),
    ]);
  }

  private houseTab(id: EntityId, house: HouseSnapshot, security: HouseSecurity): HTMLElement {
    const send = (change: HouseSecurityChange): void => this.commands.security(id, change);
    const rename = el('input', {
      className: 'house-input',
      attrs: {
        type: 'text',
        maxlength: '30',
        value: house.name,
        'aria-label': 'Nombre de la casa',
      },
    });
    const doRename = (): void => {
      const name = rename.value.trim();
      if (name) send({ kind: 'rename', name });
    };
    rename.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doRename();
    });
    const parts: HTMLElement[] = [];
    if (house.design && this.level === 'owner') parts.push(this.designSection(id));
    parts.push(
      el('section', { className: 'house-section' }, [
        el('div', { className: 'house-row' }, [
          rename,
          plaque('Renombrar', 'Cambiar el nombre de la casa', doRename),
        ]),
        el('div', { className: 'house-row' }, [
          plaque(
            security.public ? 'Hacerla privada' : 'Hacerla pública',
            security.public
              ? 'Privada: solo los amigos abren las puertas'
              : 'Pública: cualquiera abre las puertas, menos los echados',
            () => send({ kind: 'public', on: !security.public }),
          ),
          plaque('Echar a las visitas', 'Sacar afuera a quien no sea amigo de la casa', () =>
            this.commands.action(id, 'eject'),
          ),
        ]),
      ]),
    );
    if (this.level === 'owner') parts.push(this.demolishSection(id, house));
    return el('div', { className: 'house-page' }, parts);
  }

  private designSection(id: EntityId): HTMLElement {
    const design = el('button', {
      className: 'button button--small',
      text: 'Diseñar la casa',
      attrs: { type: 'button', title: 'Abrir la ventana de diseño' },
    });
    design.addEventListener('click', () => this.commands.design(id));
    return el('section', { className: 'house-section house-design' }, [
      design,
      el('p', {
        className: 'window-hint',
        text: 'Pisos, paredes, puertas y cofres, planta por planta, con oro o materiales.',
      }),
    ]);
  }

  private demolishSection(id: EntityId, house: HouseSnapshot): HTMLElement {
    const demolish = plaque(
      this.confirming ? '¿Seguro? Tocá de nuevo' : 'Demoler la casa',
      'Demoler la casa (vuelve la escritura)',
      () => {
        if (!this.confirming) {
          this.confirming = true;
          this.render();
          return;
        }
        this.confirming = false;
        this.commands.action(id, 'demolish');
      },
    );
    demolish.classList.add('house-danger');
    return el('section', { className: 'house-section house-demolish' }, [
      demolish,
      el('p', {
        className: 'window-hint',
        text: house.design
          ? 'Con los cofres vacíos y nada en el piso, vuelve a ser escritura y te devuelven la mitad de los materiales.'
          : 'Con los cofres vacíos y nada en el piso, vuelve a ser escritura.',
      }),
    ]);
  }

  private peopleTab(
    security: HouseSecurity,
    send: (change: HouseSecurityChange) => void,
  ): HTMLElement {
    return el(
      'div',
      { className: 'house-page house-page--people' },
      LISTS.filter(({ ownerOnly }) => !ownerOnly || this.level === 'owner').map(
        ({ list, title, hint }) => this.list(list, title, hint, security, send),
      ),
    );
  }

  /** Una lista de gente: fichas con el nombre (✕ lo saca) y un campo para sumar a alguien. */
  private list(
    list: HouseList,
    title: string,
    hint: string,
    security: HouseSecurity,
    send: (change: HouseSecurityChange) => void,
  ): HTMLElement {
    const names =
      list === 'co-owners'
        ? security.coOwners
        : list === 'friends'
          ? security.friends
          : security.banned;
    const who = el('input', {
      className: 'house-input',
      attrs: {
        type: 'text',
        maxlength: '30',
        placeholder: 'Nombre',
        'aria-label': `Agregar a ${title.toLowerCase()}`,
      },
    });
    const add = (): void => {
      const name = who.value.trim();
      if (name) send({ kind: 'add', list, name });
    };
    who.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') add();
    });
    const addButton = el('button', {
      className: 'house-add',
      text: '+',
      attrs: {
        type: 'button',
        title: `Agregar a ${title.toLowerCase()}`,
        'aria-label': `Agregar a ${title.toLowerCase()}`,
      },
    });
    addButton.addEventListener('click', add);
    return el('section', { className: `house-section house-people house-people--${list}` }, [
      el('h3', { className: 'house-people-title', text: title, attrs: { title: hint } }),
      el('p', { className: 'window-hint', text: hint }),
      el(
        'ul',
        { className: 'house-chips' },
        names.length === 0
          ? [el('li', { className: 'house-chips-empty', text: 'Nadie todavía.' })]
          : names.map((name) => {
              const remove = el('button', {
                className: 'house-chip-remove',
                text: '✕',
                attrs: {
                  type: 'button',
                  'aria-label': `Quitar a ${name} de ${title.toLowerCase()}`,
                },
              });
              remove.addEventListener('click', () => send({ kind: 'remove', list, name }));
              return el('li', { className: 'house-chip' }, [el('span', { text: name }), remove]);
            }),
      ),
      el('div', { className: 'house-row' }, [who, addButton]),
    ]);
  }
}

/** Botón secundario: una placa de bronce, justa a la palabra. */
function plaque(text: string, label: string, onClick: () => void): HTMLButtonElement {
  const button = el('button', {
    className: 'button button--plaque',
    text,
    attrs: { type: 'button', 'aria-label': label, title: label },
  });
  button.addEventListener('click', onClick);
  return button;
}

/** Cuánto de los cofres está ocupado, como una barra de vida. */
function meter(used: number, max: number): HTMLElement {
  const fill = el('span', { className: 'house-meter-fill' });
  fill.style.width = `${Math.min(100, Math.round((used / Math.max(1, max)) * 100))}%`;
  return el(
    'div',
    { className: 'house-meter', attrs: { title: 'Lugares ocupados en los cofres' } },
    [
      el('span', { className: 'house-meter-label', text: 'Cofres' }),
      el('span', { className: 'house-meter-bar' }, [fill]),
      el('span', { className: 'house-meter-value', text: `${used} / ${max}` }),
    ],
  );
}

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
