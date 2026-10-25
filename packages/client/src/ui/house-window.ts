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
export class HouseWindow {
  readonly window: GameWindow;
  private houseId: EntityId | null = null;
  private level: HouseLevel = 'visitor';
  private security: HouseSecurity | null = null;
  private storage: { used: number; max: number } | null = null;
  private house: HouseSnapshot | null = null;
  /** Demoler pide confirmación: el segundo toque es el que vale. */
  private confirming = false;

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
    if (this.houseId !== house.id) this.confirming = false;
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
    const plan = HOUSE_PLANS[house.kind];
    this.window.setTitle(`«${house.name}»`);
    const floors = plan.lot
      ? `de ${plan.width}×${plan.height}, hasta ${plan.floors + 1} plantas`
      : plan.floors === 0
        ? 'una planta'
        : `${plan.floors + 1} plantas`;
    const sections: HTMLElement[] = [
      el('p', {
        className: 'house-summary',
        text: `${capitalize(plan.name)} de ${house.owner} · ${floors} · ${house.public ? 'pública' : 'privada'}`,
      }),
      el('p', {
        className: 'house-summary',
        text: `Sos ${HOUSE_LEVEL_NAMES[this.level]} de esta casa.${this.storage ? ` Cofres: ${this.storage.used} de ${this.storage.max} lugares ocupados.` : ''}`,
      }),
    ];
    if (house.design && this.level === 'owner')
      sections.push(
        el('section', { className: 'house-section' }, [
          el('h3', { text: 'Casa a medida' }),
          el('p', {
            className: 'window-hint',
            text: 'Poné pisos, paredes, ventanas, puertas, escaleras y cofres, planta por planta. Se paga con oro o con materiales.',
          }),
          this.button('Diseñar la casa', 'Abrir la ventana de diseño', () =>
            this.commands.design(id),
          ),
        ]),
      );
    if (houseLevelAtLeast(this.level, 'co-owner') && this.security)
      sections.push(this.manage(id, house, this.security));
    this.window.body.replaceChildren(...sections);
  }

  private manage(id: EntityId, house: HouseSnapshot, security: HouseSecurity): HTMLElement {
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
    const sections: HTMLElement[] = [
      el('section', { className: 'house-section' }, [
        el('h3', { text: 'Casa' }),
        el('div', { className: 'house-row' }, [
          rename,
          this.button('Cambiar nombre', 'Cambiar el nombre de la casa', () => {
            const name = rename.value.trim();
            if (name) send({ kind: 'rename', name });
          }),
        ]),
        el('div', { className: 'house-row' }, [
          this.button(
            security.public ? 'Hacerla privada' : 'Hacerla pública',
            security.public
              ? 'Privada: solo los amigos abren las puertas'
              : 'Pública: cualquiera abre las puertas, menos los echados',
            () => send({ kind: 'public', on: !security.public }),
          ),
          this.button('Echar a las visitas', 'Sacar afuera a quien no sea amigo de la casa', () =>
            this.commands.action(id, 'eject'),
          ),
        ]),
      ]),
    ];
    for (const { list, title, hint, ownerOnly } of LISTS) {
      if (ownerOnly && this.level !== 'owner') continue;
      sections.push(this.list(list, title, hint, security, send));
    }
    if (this.level === 'owner') {
      const demolish = this.button(
        this.confirming ? '¿Seguro? Tocá de nuevo para demoler' : 'Demoler la casa',
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
      sections.push(
        el('section', { className: 'house-section' }, [
          el('h3', { text: 'Demoler' }),
          el('p', {
            className: 'window-hint',
            text: house.design
              ? 'Con los cofres vacíos y nada en el piso, el lote vuelve a ser escritura y te devuelven la mitad de los materiales de la obra.'
              : 'Con los cofres vacíos y nada en el piso, la casa vuelve a ser escritura.',
          }),
          demolish,
        ]),
      );
    }
    return el('div', {}, sections);
  }

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
    return el('section', { className: 'house-section' }, [
      el('h3', { text: title }),
      el('p', { className: 'window-hint', text: hint }),
      el(
        'ul',
        { className: 'house-list' },
        names.length === 0
          ? [el('li', { className: 'shop-empty', text: 'Nadie todavía.' })]
          : names.map((name) =>
              el('li', {}, [
                el('span', { className: 'house-list-name', text: name }),
                this.button('Quitar', `Quitar a ${name} de ${title.toLowerCase()}`, () =>
                  send({ kind: 'remove', list, name }),
                ),
              ]),
            ),
      ),
      el('div', { className: 'house-row' }, [
        who,
        this.button('Agregar', `Agregar a ${title.toLowerCase()}`, add),
      ]),
    ]);
  }

  private button(text: string, label: string, onClick: () => void): HTMLButtonElement {
    const button = el('button', {
      className: 'button button--small',
      text,
      attrs: { type: 'button', 'aria-label': label, title: label },
    });
    button.addEventListener('click', onClick);
    return button;
  }
}

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
