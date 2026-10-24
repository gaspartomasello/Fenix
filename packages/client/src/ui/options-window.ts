import { ITEMS, ITEM_KINDS } from '@fenix/shared/items/item-catalog';
import { SPELLS, SPELL_KEYS } from '@fenix/shared/magic/spell-catalog';
import { SKILL_NAMES } from '@fenix/shared/skills/skill-catalog';
import { ACTIVE_SKILLS } from '@fenix/shared/skills/stealth';
import { isHotbarItem } from '../core/hotbar';
import {
  COMMANDS,
  INFO_ITEMS,
  actionLabel,
  comboOf,
  defaultOptions,
  removeHotkey,
  setHotkey,
  type GameOptions,
  type HotkeyAction,
  type InfoKey,
} from '../core/options';
import { el } from './dom';
import { GameWindow } from './game-window';

type Tab = 'info' | 'general' | 'hotkeys';

const TABS: readonly { key: Tab; label: string }[] = [
  { key: 'info', label: 'Barra de información' },
  { key: 'general', label: 'General' },
  { key: 'hotkeys', label: 'Atajos de teclado' },
];

const TOGGLES: readonly { key: 'names' | 'numbers' | 'minimap' | 'hotbar'; label: string }[] = [
  { key: 'names', label: 'Nombres sobre las cabezas' },
  { key: 'numbers', label: 'Números de daño y curación' },
  { key: 'minimap', label: 'Mapa chico en la esquina' },
  { key: 'hotbar', label: 'Barra de atajos de abajo' },
];

/**
 * Opciones del jugador, como las de un asistente de UO: qué muestra la barra
 * de información de arriba (y en qué orden), qué se ve en pantalla y los
 * atajos de teclado. Cada cambio se aplica y se guarda al momento.
 */
export class OptionsWindow {
  readonly window: GameWindow;
  private readonly tabs: HTMLElement;
  private readonly page: HTMLElement;
  private tab: Tab = 'info';
  private options: GameOptions;
  /** La combinación grabada para el atajo nuevo. */
  private pendingCombo: string | null = null;
  private capturing: AbortController | null = null;

  constructor(
    initial: GameOptions,
    private readonly onChange: (options: GameOptions) => void,
    /** En el celular no hay teclado: la pestaña de atajos explica cómo hacerlo con el dedo. */
    private readonly touch: boolean,
  ) {
    this.options = initial;
    this.window = new GameWindow('opciones', 'Opciones', { x: 340, y: 90 });
    this.window.element.classList.add('options-window');
    this.tabs = el('div', { className: 'tabs', attrs: { role: 'tablist' } });
    this.page = el('div', { className: 'options-page' });
    this.window.body.append(this.tabs, this.page);
    this.render();
  }

  private change(next: GameOptions): void {
    this.options = next;
    this.onChange(next);
    this.render();
  }

  private render(): void {
    this.tabs.replaceChildren(
      ...TABS.map(({ key, label }) => {
        const tab = el('button', {
          className: 'tab',
          text: label,
          attrs: { type: 'button', role: 'tab', 'aria-selected': String(key === this.tab) },
        });
        tab.addEventListener('click', () => {
          this.stopCapture();
          this.tab = key;
          this.render();
        });
        return tab;
      }),
    );
    if (this.tab === 'info') this.renderInfo();
    else if (this.tab === 'general') this.renderGeneral();
    else this.renderHotkeys();
  }

  // ---------------------------------------------------------- barra de información

  private renderInfo(): void {
    const shown = this.options.info;
    const hidden = INFO_ITEMS.filter((i) => !shown.includes(i.key));
    const labelOf = (key: InfoKey): string => INFO_ITEMS.find((i) => i.key === key)?.label ?? key;
    const move = (key: InfoKey, step: -1 | 1): void => {
      const list = [...shown];
      const at = list.indexOf(key);
      const to = at + step;
      if (to < 0 || to >= list.length) return;
      [list[at], list[to]] = [list[to] as InfoKey, list[at] as InfoKey];
      this.change({ ...this.options, info: list });
    };
    const row = (key: InfoKey, on: boolean, index: number): HTMLElement => {
      const check = el('input', { attrs: { type: 'checkbox', 'aria-label': labelOf(key) } });
      check.checked = on;
      check.addEventListener('change', () =>
        this.change({
          ...this.options,
          info: on ? shown.filter((k) => k !== key) : [...shown, key],
        }),
      );
      const controls: HTMLElement[] = [];
      if (on) {
        const up = smallButton('↑', `Subir ${labelOf(key)}`, () => move(key, -1));
        const down = smallButton('↓', `Bajar ${labelOf(key)}`, () => move(key, 1));
        up.disabled = index === 0;
        down.disabled = index === shown.length - 1;
        controls.push(up, down);
      }
      return el('li', { className: 'options-row' }, [
        el('label', { className: 'options-check' }, [check, document.createTextNode(labelOf(key))]),
        el('span', { className: 'options-order' }, controls),
      ]);
    };
    this.page.replaceChildren(
      el('p', {
        className: 'window-hint',
        text: 'Lo que marques se ve en una línea arriba de todo, en este orden. Lo que se está acabando se pone rojo.',
      }),
      el('ul', { className: 'options-list' }, [
        ...shown.map((key, i) => row(key, true, i)),
        ...hidden.map((item) => row(item.key, false, 0)),
      ]),
    );
  }

  // ---------------------------------------------------------- general

  private renderGeneral(): void {
    const reset = el('button', {
      className: 'button button--small',
      text: 'Volver a las opciones de fábrica',
      attrs: { type: 'button' },
    });
    reset.addEventListener('click', () => this.change(defaultOptions()));
    this.page.replaceChildren(
      el(
        'ul',
        { className: 'options-list' },
        TOGGLES.filter((t) => !(this.touch && t.key === 'hotbar')).map(({ key, label }) => {
          const check = el('input', { attrs: { type: 'checkbox' } });
          check.checked = this.options[key];
          check.addEventListener('change', () =>
            this.change({ ...this.options, [key]: check.checked }),
          );
          return el('li', { className: 'options-row' }, [
            el('label', { className: 'options-check' }, [check, document.createTextNode(label)]),
          ]);
        }),
      ),
      reset,
    );
  }

  // ---------------------------------------------------------- atajos de teclado

  private renderHotkeys(): void {
    if (this.touch) {
      this.page.replaceChildren(
        el('p', {
          className: 'window-hint',
          text: 'En el celular no hay teclado: tus atajos son la barra de abajo y los cuatro alrededor de Atacar. Mantené apretado un casillero para cambiarlo.',
        }),
      );
      return;
    }
    const list = el(
      'ul',
      { className: 'options-list hotkey-list' },
      [...this.options.hotkeys]
        .sort((a, b) => a.combo.localeCompare(b.combo, 'es', { numeric: true }))
        .map((hotkey) => {
          const remove = smallButton('Quitar', `Quitar el atajo ${hotkey.combo}`, () =>
            this.change({
              ...this.options,
              hotkeys: removeHotkey(this.options.hotkeys, hotkey.combo),
            }),
          );
          return el('li', { className: 'options-row' }, [
            el('kbd', { className: 'hotkey-combo', text: hotkey.combo }),
            el('span', { className: 'hotkey-action', text: actionLabel(hotkey.action) }),
            remove,
          ]);
        }),
    );
    if (this.options.hotkeys.length === 0)
      list.append(el('li', { className: 'shop-empty', text: 'Todavía no tenés atajos.' }));

    const record = el('button', {
      className: 'button button--small hotkey-record',
      text: this.capturing
        ? 'Apretá la tecla…'
        : this.pendingCombo
          ? `Tecla: ${this.pendingCombo}`
          : 'Elegir tecla',
      attrs: { type: 'button' },
    });
    record.addEventListener('click', () => this.startCapture());
    const select = actionSelect();
    const add = el('button', {
      className: 'button button--small',
      text: 'Agregar',
      attrs: { type: 'button' },
    });
    add.disabled = !this.pendingCombo;
    add.addEventListener('click', () => {
      const action = parseAction(select.value);
      if (!this.pendingCombo || !action) return;
      const combo = this.pendingCombo;
      this.pendingCombo = null;
      this.change({ ...this.options, hotkeys: setHotkey(this.options.hotkeys, { combo, action }) });
    });
    this.page.replaceChildren(
      list,
      el('div', { className: 'hotkey-editor' }, [record, select, add]),
      el('p', {
        className: 'window-hint',
        text: 'Sirven las teclas F1 a F12, letras y números con Ctrl, Alt o Shift, y el teclado numérico. Caminar (WASD, flechas), Enter y Escape quedan para el juego.',
      }),
    );
  }

  /** Espera la próxima tecla y la usa como combinación del atajo nuevo. */
  private startCapture(): void {
    this.stopCapture();
    const abort = new AbortController();
    this.capturing = abort;
    window.addEventListener(
      'keydown',
      (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.key === 'Escape') {
          this.stopCapture();
          this.render();
          return;
        }
        const combo = comboOf(e);
        if (!combo) return;
        this.pendingCombo = combo;
        this.stopCapture();
        this.render();
      },
      { capture: true, signal: abort.signal },
    );
    this.render();
  }

  private stopCapture(): void {
    this.capturing?.abort();
    this.capturing = null;
  }

  destroy(): void {
    this.stopCapture();
    this.window.destroy();
  }
}

function smallButton(text: string, label: string, onClick: () => void): HTMLButtonElement {
  const button = el('button', {
    className: 'button button--small',
    text,
    attrs: { type: 'button', 'aria-label': label },
  });
  button.addEventListener('click', onClick);
  return button;
}

/** Elegir qué hace el atajo: un hechizo (por círculo), un objeto, una habilidad o un comando. */
function actionSelect(): HTMLSelectElement {
  const option = (value: string, text: string): HTMLOptionElement =>
    el('option', { text, attrs: { value } });
  const group = (label: string, options: HTMLOptionElement[]): HTMLOptGroupElement =>
    el('optgroup', { attrs: { label } }, options);
  const circles = [1, 2, 3, 4, 5, 6, 7, 8].map((circle) =>
    group(
      `Hechizos · círculo ${circle}`,
      SPELL_KEYS.filter((k) => SPELLS[k].circle === circle).map((k) =>
        option(`spell:${k}`, SPELLS[k].name),
      ),
    ),
  );
  return el(
    'select',
    { className: 'hotkey-select', attrs: { 'aria-label': 'Qué hace el atajo' } },
    [
      group(
        'Comandos',
        COMMANDS.map((c) => option(`command:${c.key}`, c.label)),
      ),
      ...circles,
      group(
        'Objetos',
        ITEM_KINDS.filter(isHotbarItem).map((k) =>
          option(`item:${k}`, capitalize(ITEMS[k].plural)),
        ),
      ),
      group(
        'Habilidades',
        ACTIVE_SKILLS.map((s) => option(`skill:${s}`, SKILL_NAMES[s])),
      ),
    ],
  );
}

function parseAction(value: string): HotkeyAction | null {
  const [type, key] = value.split(':') as [string, string];
  if (type === 'spell') return { type, spell: key as never };
  if (type === 'item') return { type, kind: key as never };
  if (type === 'skill') return { type, skill: key as never };
  if (type === 'command') return { type, command: key as never };
  return null;
}

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
