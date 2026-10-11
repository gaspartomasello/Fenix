import {
  CIRCLE_NAMES,
  SPELLS,
  SPELL_CIRCLES,
  spellsOfCircle,
  type BackpackItemSnapshot,
  type SkillValues,
  type SpellTarget,
} from '@fenix/shared';
import {
  HOTBAR_SIZE,
  countInBackpack,
  hotbarKey,
  isHotbarItem,
  slotLabel,
  type HotbarSlot,
} from '../core/hotbar';
import { el } from './dom';
import { GameWindow } from './game-window';
import { itemIconUrl } from './item-icons';

/** Cuánto hay que mantener apretado un casillero (con el dedo) para cambiarlo. */
const LONG_PRESS_MS = 550;

/** Color del ícono de un hechizo según a quién va. */
const SPELL_TONE: Readonly<Record<SpellTarget, string>> = {
  harmful: 'hotbar-spell--harmful',
  beneficial: 'hotbar-spell--beneficial',
  self: 'hotbar-spell--self',
  location: 'hotbar-spell--location',
};

export interface HotbarCallbacks {
  /** Tocar un casillero con algo (o su tecla). */
  readonly onUse: (index: number) => void;
  /** Se cambió lo que hay en un casillero. */
  readonly onAssign: (index: number, slot: HotbarSlot) => void;
}

/**
 * Barra de atajos abajo al centro: vendas, pociones y hechizos a un toque.
 * Las teclas 1 a 0 usan cada casillero. Un casillero vacío (o el clic
 * derecho, o mantener apretado con el dedo) abre la ventana para elegir qué
 * poner: los objetos que se usan de la mochila y los hechizos que ya se
 * pueden lanzar.
 */
export class HotbarBar {
  readonly element: HTMLElement;
  readonly editor: GameWindow;
  private readonly buttons: HTMLButtonElement[] = [];
  private readonly abort = new AbortController();
  private slots: readonly HotbarSlot[] = [];
  private backpack: readonly BackpackItemSnapshot[] = [];
  private skills: SkillValues | null = null;
  private editing: number | null = null;

  constructor(private readonly callbacks: HotbarCallbacks) {
    const signal = this.abort.signal;
    this.element = el('div', {
      className: 'hotbar',
      attrs: { role: 'toolbar', 'aria-label': 'Barra de atajos' },
    });
    for (let index = 0; index < HOTBAR_SIZE; index++) {
      const button = el('button', { className: 'hotbar-slot', attrs: { type: 'button' } });
      let pressTimer: number | null = null;
      let longPressed = false;
      button.addEventListener(
        'pointerdown',
        (e) => {
          longPressed = false;
          if (e.pointerType === 'mouse') return;
          pressTimer = window.setTimeout(() => {
            longPressed = true;
            this.edit(index);
          }, LONG_PRESS_MS);
        },
        { signal },
      );
      const cancel = (): void => {
        if (pressTimer !== null) window.clearTimeout(pressTimer);
        pressTimer = null;
      };
      button.addEventListener('pointerup', cancel, { signal });
      button.addEventListener('pointerleave', cancel, { signal });
      button.addEventListener('pointercancel', cancel, { signal });
      button.addEventListener(
        'click',
        () => {
          if (longPressed) return;
          if (this.slots[index]) this.callbacks.onUse(index);
          else this.edit(index);
        },
        { signal },
      );
      button.addEventListener(
        'contextmenu',
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.edit(index);
        },
        { signal },
      );
      this.buttons.push(button);
      this.element.append(button);
    }
    this.editor = new GameWindow('atajo', 'Atajo', { x: 320, y: 120 });
    window.addEventListener(
      'keydown',
      (e) => {
        if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
        const index = e.key === '0' ? 9 : Number(e.key) - 1;
        if (!Number.isInteger(index) || index < 0 || index >= HOTBAR_SIZE) return;
        // Con el libro abierto, los números son de su página (lo maneja el libro).
        if (e.defaultPrevented) return;
        if (!this.slots[index]) return;
        e.preventDefault();
        this.callbacks.onUse(index);
      },
      { signal },
    );
  }

  render(
    slots: readonly HotbarSlot[],
    backpack: readonly BackpackItemSnapshot[],
    skills: SkillValues | null,
  ): void {
    this.slots = slots;
    this.backpack = backpack;
    this.skills = skills;
    this.buttons.forEach((button, index) => this.paint(button, index));
    if (this.editing !== null && this.editor.visible) this.renderEditor(this.editing);
  }

  /** Marca un casillero un instante (se usó). */
  flash(index: number): void {
    const button = this.buttons[index];
    if (!button) return;
    button.classList.remove('hotbar-slot--used');
    void button.offsetWidth;
    button.classList.add('hotbar-slot--used');
  }

  destroy(): void {
    this.abort.abort();
    this.element.remove();
    this.editor.destroy();
  }

  private paint(button: HTMLButtonElement, index: number): void {
    const slot = this.slots[index] ?? null;
    const key = el('kbd', { className: 'hotbar-key', text: hotbarKey(index) });
    button.classList.toggle('hotbar-slot--empty', !slot);
    const label = slotLabel(slot);
    button.title = slot
      ? `${label} (tecla ${hotbarKey(index)}; clic derecho para cambiarlo)`
      : 'Casillero vacío: tocá para elegir un atajo';
    button.setAttribute('aria-label', slot ? `Usar ${label}` : `Elegir atajo ${index + 1}`);
    if (!slot) {
      button.replaceChildren(el('span', { className: 'hotbar-plus', text: '+' }), key);
      return;
    }
    if (slot.type === 'item') {
      const count = countInBackpack(this.backpack, slot.kind);
      button.classList.toggle('hotbar-slot--missing', count === 0);
      const icon = el('img', {
        attrs: { src: itemIconUrl(slot.kind, Math.max(1, count)), alt: '', draggable: 'false' },
      });
      button.replaceChildren(
        icon,
        el('span', { className: 'hotbar-count', text: String(count) }),
        key,
      );
      return;
    }
    const spell = SPELLS[slot.spell];
    const locked = (this.skills?.magery ?? 0) < spell.minSkill;
    button.classList.toggle('hotbar-slot--missing', locked);
    button.replaceChildren(
      el('span', { className: `hotbar-spell ${SPELL_TONE[spell.target]}` }, [
        el('span', { className: 'hotbar-spell-initials', text: initials(spell.name) }),
        el('span', { className: 'hotbar-spell-circle', text: String(spell.circle) }),
      ]),
      key,
    );
  }

  private edit(index: number): void {
    this.editing = index;
    this.renderEditor(index);
    this.editor.show();
  }

  private renderEditor(index: number): void {
    this.editor.setTitle(`Atajo ${hotbarKey(index)}`);
    const choose = (slot: HotbarSlot): void => {
      this.callbacks.onAssign(index, slot);
      this.editor.hide();
      this.editing = null;
    };
    const option = (text: string, slot: HotbarSlot, icon?: HTMLElement): HTMLElement => {
      const button = el('button', { className: 'hotbar-option', attrs: { type: 'button' } }, [
        ...(icon ? [icon] : []),
        el('span', { text }),
      ]);
      button.addEventListener('click', () => choose(slot));
      return button;
    };
    // Objetos que se usan: los de la mochila (sin repetir el tipo).
    const kinds = [...new Set(this.backpack.map((i) => i.kind))].filter(isHotbarItem);
    const items = kinds.map((kind) =>
      option(
        `${slotLabel({ type: 'item', kind })} (${countInBackpack(this.backpack, kind)})`,
        { type: 'item', kind },
        el('img', { attrs: { src: itemIconUrl(kind), alt: '', draggable: 'false' } }),
      ),
    );
    const magery = this.skills?.magery ?? 0;
    const circles = SPELL_CIRCLES.flatMap((circle) => {
      const spells = spellsOfCircle(circle).filter((s) => magery >= s.minSkill);
      if (spells.length === 0) return [];
      return [
        el('h3', { className: 'hotbar-heading', text: CIRCLE_NAMES[circle] }),
        el(
          'div',
          { className: 'hotbar-options' },
          spells.map((s) =>
            option(
              s.name,
              { type: 'spell', spell: s.key },
              el('span', { className: `hotbar-spell hotbar-spell--mini ${SPELL_TONE[s.target]}` }, [
                el('span', { className: 'hotbar-spell-initials', text: initials(s.name) }),
              ]),
            ),
          ),
        ),
      ];
    });
    const clear = el('button', {
      className: 'button button--small',
      text: 'Vaciar casillero',
      attrs: { type: 'button' },
    });
    clear.addEventListener('click', () => choose(null));
    this.editor.body.replaceChildren(
      el('div', { className: 'hotbar-editor' }, [
        el('p', {
          className: 'window-hint',
          text: `Ahora: ${slotLabel(this.slots[index] ?? null)}. Elegí qué poner en este casillero.`,
        }),
        el('h3', { className: 'hotbar-heading', text: 'Objetos de la mochila' }),
        items.length > 0
          ? el('div', { className: 'hotbar-options' }, items)
          : el('p', { className: 'window-hint', text: 'No tenés objetos que se usen.' }),
        ...(circles.length > 0
          ? circles
          : [el('p', { className: 'window-hint', text: 'Todavía no sabés lanzar hechizos.' })]),
        el('div', { className: 'window-actions' }, [clear]),
      ]),
    );
  }
}

/** Dos letras para el ícono de un hechizo: "Flecha mágica" → "FM". */
function initials(name: string): string {
  const words = name.split(/\s+/).filter((w) => w.length > 2 || /^[A-ZÁÉÍÓÚ]/.test(w));
  const letters = (words.length > 1 ? words.slice(0, 2).map((w) => w[0]) : [name.slice(0, 2)])
    .join('')
    .toUpperCase();
  return letters;
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}
