import { ITEMS, type ItemKind } from '@fenix/shared/items/item-catalog';
import { el, onPress } from './dom';
import { itemIconUrl } from './item-icons';

/**
 * Cuántos mover de una pila, como el cartelito de UO: el objeto, una barra que
 * se desliza de 1 a la pila entera, el número, "Todo" y "Aceptar". Igual en la
 * computadora y en el celular (con el dedo se desliza la barra; los botones
 * − y + afinan de a uno). En la computadora también se escribe el número,
 * Enter acepta y Escape cancela. Tocar afuera es cancelar.
 */
export class AmountPicker {
  readonly element: HTMLElement;
  private pending: ((amount: number | null) => void) | null = null;
  private max = 1;
  private readonly slider = el('input', {
    className: 'amount-slider',
    attrs: { type: 'range', min: '1', max: '1', step: '1', 'aria-label': 'Cantidad' },
  });
  private readonly number = el('input', {
    className: 'amount-number',
    attrs: { type: 'text', inputmode: 'numeric', 'aria-label': 'Cantidad' },
  });
  private readonly icon = el('img', { className: 'amount-icon', attrs: { alt: '' } });
  private readonly title = el('span', { className: 'amount-title' });

  constructor() {
    const step = (text: string, label: string, delta: number): HTMLElement => {
      const button = el('button', {
        className: 'amount-step',
        text,
        attrs: { type: 'button', 'aria-label': label },
      });
      onPress(button, () => this.set(this.value() + delta));
      return button;
    };
    const all = el('button', {
      className: 'button button--plaque amount-all',
      text: 'Todo',
      attrs: { type: 'button' },
    });
    onPress(all, () => this.finish(this.max));
    const ok = el('button', {
      className: 'button button--small amount-ok',
      text: 'Aceptar',
      attrs: { type: 'button' },
    });
    onPress(ok, () => this.finish(this.value()));
    const close = el('button', {
      className: 'window-close',
      text: '✕',
      attrs: { type: 'button', 'aria-label': 'Cancelar' },
    });
    onPress(close, () => this.finish(null));
    this.slider.addEventListener('input', () => this.set(Number(this.slider.value)));
    this.number.addEventListener('input', () => {
      const digits = this.number.value.replace(/\D/g, '');
      if (digits) this.set(Number(digits), false);
    });
    this.number.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.finish(this.value());
      else if (e.key === 'Escape') this.finish(null);
      e.stopPropagation();
    });
    const panel = el('div', { className: 'panel amount-panel', attrs: { role: 'dialog' } }, [
      el('div', { className: 'amount-head' }, [this.icon, this.title, close]),
      el('div', { className: 'amount-row' }, [
        step('−', 'Uno menos', -1),
        this.slider,
        step('+', 'Uno más', 1),
      ]),
      el('div', { className: 'amount-row amount-row--actions' }, [this.number, all, ok]),
    ]);
    this.element = el('div', { className: 'amount-picker' }, [panel]);
    this.element.hidden = true;
    this.element.addEventListener('pointerdown', (e) => {
      if (e.target === this.element) this.finish(null);
    });
    window.addEventListener(
      'keydown',
      (e) => {
        if (!this.pending || e.target === this.number) return;
        if (e.key === 'Escape') this.finish(null);
        else if (e.key === 'Enter') this.finish(this.value());
        else return;
        e.preventDefault();
        e.stopPropagation();
      },
      { capture: true },
    );
  }

  /** Pregunta cuántos de `max` (null si se cancela). Arranca en la pila entera. */
  ask(kind: ItemKind, max: number): Promise<number | null> {
    this.pending?.(null);
    this.max = max;
    const item = ITEMS[kind];
    this.icon.src = itemIconUrl(kind, max);
    this.title.textContent = `${max} ${item.plural}`;
    this.slider.max = String(max);
    this.set(max);
    this.element.hidden = false;
    // En la computadora, el número queda listo para escribir encima.
    if (window.matchMedia('(pointer: fine)').matches) {
      this.number.focus();
      this.number.select();
    }
    return new Promise((resolve) => {
      this.pending = resolve;
    });
  }

  private value(): number {
    return Math.max(1, Math.min(this.max, Number(this.slider.value) || 1));
  }

  private set(amount: number, writeNumber = true): void {
    const value = Math.max(1, Math.min(this.max, Math.round(amount)));
    this.slider.value = String(value);
    if (writeNumber || Number(this.number.value) > this.max) this.number.value = String(value);
    // La barra se pinta llena hasta donde está el tirador.
    const fill = this.max > 1 ? ((value - 1) / (this.max - 1)) * 100 : 100;
    this.slider.style.setProperty('--fill', `${fill}%`);
  }

  private finish(amount: number | null): void {
    if (!this.pending) return;
    const resolve = this.pending;
    this.pending = null;
    this.element.hidden = true;
    this.number.blur();
    resolve(amount === null ? null : Math.max(1, Math.min(this.max, Math.floor(amount))));
  }
}
