import {
  SHIPS,
  SHIP_LEVELS,
  SHIP_LEVEL_NAMES,
  hullCondition,
  levelAtLeast,
  type EntityId,
  type RelativeHeading,
  type ShipAction,
  type ShipLevel,
  type ShipOrder,
  type ShipSecurity,
  type ShipSecurityChange,
  type ShipSnapshot,
} from '@fenix/shared';
import { el } from './dom';
import { GameWindow } from './game-window';

/** Lo que la ventana le pide al juego. */
export interface ShipCommands {
  order(shipId: EntityId, order: ShipOrder): void;
  action(shipId: EntityId, action: ShipAction): void;
  security(shipId: EntityId, change: ShipSecurityChange): void;
}

/** La rosa del timón: flechas relativas a la proa (arriba es adelante). */
const HELM: readonly (readonly [string, RelativeHeading | 'stop', string])[] = [
  ['↖', 7, 'Adelante a babor'],
  ['↑', 0, 'Adelante'],
  ['↗', 1, 'Adelante a estribor'],
  ['←', 6, 'A babor'],
  ['■', 'stop', 'Alto'],
  ['→', 2, 'A estribor'],
  ['↙', 5, 'Atrás a babor'],
  ['↓', 4, 'Atrás'],
  ['↘', 3, 'Atrás a estribor'],
];

const SPEEDS = [
  ['fast', 'A toda vela'],
  ['slow', 'Despacio'],
  ['one', 'Un paso'],
] as const;

/**
 * La ventana del barco, como el timón y la lista de tripulantes de UO: el
 * timón (para la tripulación), los cañones, reparar, abrir la bodega y, para
 * el capitán, quién puede qué: con nombre, o todo el grupo o el gremio.
 */
export class ShipWindow {
  readonly window: GameWindow;
  private shipId: EntityId | null = null;
  private level: ShipLevel = 'denied';
  private security: ShipSecurity | null = null;
  private speed: 'fast' | 'slow' | 'one' = 'fast';
  private ship: ShipSnapshot | null = null;

  constructor(private readonly commands: ShipCommands) {
    this.window = new GameWindow('barco', 'Barco', { x: 300, y: 110 });
    this.window.element.classList.add('ship-window');
  }

  get openShipId(): EntityId | null {
    return this.window.element.hidden ? null : this.shipId;
  }

  open(
    shipId: EntityId,
    level: ShipLevel,
    security: ShipSecurity | undefined,
    ship?: ShipSnapshot,
  ): void {
    this.shipId = shipId;
    this.level = level;
    this.security = security ?? null;
    if (ship) this.ship = ship;
    this.render();
    this.window.show();
  }

  /** Cambiaron los barcos que se ven: si el de la ventana cambió (casco, nombre), se actualiza. */
  update(ships: readonly ShipSnapshot[]): void {
    if (!this.shipId) return;
    const ship = ships.find((s) => s.id === this.shipId);
    if (!ship) {
      this.window.hide();
      return;
    }
    const changed = !this.ship || ship.hits !== this.ship.hits || ship.name !== this.ship.name;
    this.ship = ship;
    if (changed && !this.window.element.hidden) this.render();
  }

  private render(): void {
    const ship = this.ship;
    const id = this.shipId;
    if (!ship || !id) return;
    const definition = SHIPS[ship.kind];
    this.window.setTitle(`«${ship.name}»`);
    const sections: HTMLElement[] = [
      el('p', {
        className: 'ship-summary',
        text: `${capitalize(definition.name)} de ${ship.owner} · casco ${hullCondition(ship.hits, ship.maxHits)} · sos ${SHIP_LEVEL_NAMES[this.level]}`,
      }),
      this.hullBar(ship),
    ];
    if (levelAtLeast(this.level, 'crew')) sections.push(this.helm(id));
    if (levelAtLeast(this.level, 'crew') && definition.cannons > 0) sections.push(this.cannons(id));
    sections.push(this.chores(id));
    if (this.level === 'captain' && this.security)
      sections.push(this.crew(id, this.security, ship));
    this.window.body.replaceChildren(...sections);
  }

  private hullBar(ship: ShipSnapshot): HTMLElement {
    const share = Math.round((ship.hits / ship.maxHits) * 100);
    return el(
      'div',
      {
        className: 'ship-hull',
        attrs: { role: 'meter', 'aria-label': 'Casco', 'aria-valuenow': String(share) },
      },
      [el('div', { className: 'ship-hull-fill', attrs: { style: `width:${share}%` } })],
    );
  }

  private helm(id: EntityId): HTMLElement {
    const rose = el('div', { className: 'ship-helm' });
    for (const [symbol, heading, label] of HELM) {
      const button = this.button(symbol, label, () =>
        this.commands.order(
          id,
          heading === 'stop' ? { kind: 'stop' } : { kind: 'move', heading, speed: this.speed },
        ),
      );
      button.classList.add('ship-helm-button');
      rose.append(button);
    }
    const speeds = el(
      'div',
      { className: 'ship-speeds', attrs: { role: 'radiogroup', 'aria-label': 'Velocidad' } },
      SPEEDS.map(([speed, label]) => {
        const b = this.button(label, label, () => {
          this.speed = speed;
          this.render();
        });
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', String(this.speed === speed));
        return b;
      }),
    );
    const turns = el('div', { className: 'ship-row' }, [
      this.button('Virar a babor', 'Virar a babor', () =>
        this.commands.order(id, { kind: 'turn', side: 'left' }),
      ),
      this.button('Dar la vuelta', 'Dar la vuelta', () =>
        this.commands.order(id, { kind: 'turn', side: 'around' }),
      ),
      this.button('Virar a estribor', 'Virar a estribor', () =>
        this.commands.order(id, { kind: 'turn', side: 'right' }),
      ),
    ]);
    return el('section', { className: 'ship-section' }, [
      el('h3', { text: 'Timón' }),
      rose,
      speeds,
      turns,
      el('p', {
        className: 'window-hint',
        text: 'También se le habla al timonel: «adelante», «despacio atrás», «virar a babor», «alto»…',
      }),
    ]);
  }

  private cannons(id: EntityId): HTMLElement {
    return el('section', { className: 'ship-section' }, [
      el('h3', { text: 'Cañones' }),
      el('div', { className: 'ship-row' }, [
        this.button('Fuego por babor', 'Disparar el cañón de babor', () =>
          this.commands.action(id, 'fire-port'),
        ),
        this.button('Fuego por estribor', 'Disparar el cañón de estribor', () =>
          this.commands.action(id, 'fire-starboard'),
        ),
      ]),
      el('p', {
        className: 'window-hint',
        text: 'Cada disparo gasta una bala de cañón (de tu mochila o de la bodega).',
      }),
    ]);
  }

  private chores(id: EntityId): HTMLElement {
    const row = el('div', { className: 'ship-row' });
    if (levelAtLeast(this.level, 'crew'))
      row.append(
        this.button('Reparar', 'Reparar el casco', () => this.commands.action(id, 'repair')),
      );
    if (levelAtLeast(this.level, 'officer'))
      row.append(
        this.button('Abrir la bodega', 'Abrir la bodega', () => this.commands.action(id, 'hold')),
      );
    if (this.level === 'captain')
      row.append(
        this.button('Guardar el barco', 'Guardar el barco en su maqueta', () =>
          this.commands.action(id, 'dock'),
        ),
      );
    return el('section', { className: 'ship-section' }, [el('h3', { text: 'Barco' }), row]);
  }

  private crew(id: EntityId, security: ShipSecurity, ship: ShipSnapshot): HTMLElement {
    const send = (change: ShipSecurityChange): void => this.commands.security(id, change);
    const rename = el('input', {
      className: 'ship-input',
      attrs: { type: 'text', maxlength: '30', value: ship.name, 'aria-label': 'Nombre del barco' },
    });
    const renameRow = el('div', { className: 'ship-row' }, [
      rename,
      this.button('Cambiar nombre', 'Cambiar el nombre del barco', () => {
        const name = rename.value.trim();
        if (name) send({ kind: 'rename', name });
      }),
    ]);
    const defaults = el('div', { className: 'ship-defaults' }, [
      this.levelPicker('Cualquiera', security.everyone, (level) =>
        send({ kind: 'default', who: 'everyone', level }),
      ),
      this.levelPicker('Tu grupo', security.party, (level) =>
        send({ kind: 'default', who: 'party', level }),
      ),
      this.levelPicker('Tu gremio', security.guild, (level) =>
        send({ kind: 'default', who: 'guild', level }),
      ),
    ]);
    const list = el(
      'ul',
      { className: 'ship-manifest' },
      Object.entries(security.manifest).map(([name, level]) =>
        el('li', {}, [
          el('span', { className: 'ship-manifest-name', text: name }),
          this.levelPicker(
            `Permiso de ${name}`,
            level,
            (next) => send({ kind: 'set', name, level: next }),
            true,
          ),
          this.button('Quitar', `Quitar a ${name} de la lista`, () =>
            send({ kind: 'remove', name }),
          ),
        ]),
      ),
    );
    const who = el('input', {
      className: 'ship-input',
      attrs: {
        type: 'text',
        maxlength: '30',
        placeholder: 'Nombre del personaje',
        'aria-label': 'Nombre del personaje',
      },
    });
    let chosen: ShipLevel = 'crew';
    const add = el('div', { className: 'ship-row' }, [
      who,
      this.levelPicker('Permiso nuevo', chosen, (level) => (chosen = level), true),
      this.button('Dar permiso', 'Dar permiso', () => {
        const name = who.value.trim();
        if (name) send({ kind: 'set', name, level: chosen });
      }),
    ]);
    return el('section', { className: 'ship-section' }, [
      el('h3', { text: 'Tripulación' }),
      renameRow,
      defaults,
      list,
      add,
      el('p', {
        className: 'window-hint',
        text: 'Pasajero: sube a bordo. Tripulante: además gobierna, dispara y repara. Oficial: además abre la bodega. Capitán: todo.',
      }),
    ]);
  }

  private levelPicker(
    label: string,
    value: ShipLevel,
    onChange: (level: ShipLevel) => void,
    compact = false,
  ): HTMLElement {
    const select = el(
      'select',
      { className: 'ship-select', attrs: { 'aria-label': label } },
      SHIP_LEVELS.map((level) => {
        const option = el('option', { text: SHIP_LEVEL_NAMES[level], attrs: { value: level } });
        option.selected = level === value;
        return option;
      }),
    );
    select.addEventListener('change', () => onChange(select.value as ShipLevel));
    return compact
      ? select
      : el('label', { className: 'ship-default' }, [el('span', { text: label }), select]);
  }

  private button(text: string, label: string, onPress: () => void): HTMLButtonElement {
    const button = el('button', {
      className: 'ship-button',
      text,
      attrs: { type: 'button', 'aria-label': label, title: label },
    });
    button.addEventListener('click', onPress);
    return button;
  }
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
