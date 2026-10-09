import type { Vitals } from '@fenix/shared';
import { el } from './dom';

interface Bar {
  readonly fill: HTMLElement;
  readonly value: HTMLElement;
}

/** Barras de vida, maná y energía del jugador. */
export class VitalsPanel {
  readonly element: HTMLElement;
  private readonly bars: Record<'hits' | 'mana' | 'stamina', Bar>;

  constructor() {
    const bar = (label: string, modifier: string): [HTMLElement, Bar] => {
      const fill = el('div', { className: `vital-fill vital-fill--${modifier}` });
      const value = el('span', { className: 'vital-value' });
      const row = el('div', { className: 'vital-row' }, [
        el('span', { className: 'vital-label', text: label }),
        el('div', { className: 'vital-track', attrs: { role: 'meter', 'aria-label': label } }, [
          fill,
          value,
        ]),
      ]);
      return [row, { fill, value }];
    };
    const [hitsRow, hits] = bar('Vida', 'hits');
    const [manaRow, mana] = bar('Maná', 'mana');
    const [staminaRow, stamina] = bar('Energía', 'stamina');
    this.bars = { hits, mana, stamina };
    this.element = el('div', { className: 'panel vitals-panel' }, [hitsRow, manaRow, staminaRow]);
  }

  update(vitals: Vitals): void {
    this.set(this.bars.hits, vitals.hits, vitals.maxHits);
    this.set(this.bars.mana, vitals.mana, vitals.maxMana);
    this.set(this.bars.stamina, vitals.stamina, vitals.maxStamina);
  }

  destroy(): void {
    this.element.remove();
  }

  private set(bar: Bar, value: number, max: number): void {
    const ratio = max > 0 ? value / max : 0;
    bar.fill.style.width = `${Math.round(ratio * 100)}%`;
    bar.value.textContent = `${value} / ${max}`;
    bar.fill.parentElement?.setAttribute('aria-valuenow', String(value));
    bar.fill.parentElement?.setAttribute('aria-valuemax', String(max));
  }
}
