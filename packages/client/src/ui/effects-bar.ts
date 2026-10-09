import { EFFECT_NAMES, type EffectKind } from '@fenix/shared';
import type { EffectsState } from '../core/client-game';
import { el } from './dom';

/** Si el efecto ayuda o perjudica (para el color). */
const HARMFUL: ReadonlySet<EffectKind> = new Set<EffectKind>(['poison', 'paralyzed']);

/**
 * Efectos activos propios (como los íconos de UO): nombre, cuánto suben o
 * bajan y el tiempo que les queda. Se ve debajo de las barras de vida.
 */
export class EffectsBar {
  readonly element: HTMLElement;
  private state: EffectsState | null = null;

  constructor(private readonly clock: () => number) {
    this.element = el('ul', {
      className: 'effects-bar',
      attrs: { 'aria-label': 'Efectos activos' },
    });
    window.setInterval(() => this.refresh(), 1000);
  }

  update(state: EffectsState): void {
    this.state = state;
    this.refresh();
  }

  private refresh(): void {
    const state = this.state;
    if (!state) return;
    const elapsed = this.clock() - state.receivedAt;
    const active = state.effects.filter((e) => e.remainingMs > elapsed);
    this.element.hidden = active.length === 0;
    this.element.replaceChildren(
      ...active.map((effect) => {
        const seconds = Math.ceil((effect.remainingMs - elapsed) / 1000);
        const time = seconds >= 60 ? `${Math.ceil(seconds / 60)} min` : `${seconds} s`;
        const harmful = HARMFUL.has(effect.kind) || effect.amount < 0;
        const amount =
          effect.kind === 'poison'
            ? ` (nivel ${effect.amount})`
            : effect.amount !== 0
              ? ` ${effect.amount > 0 ? '+' : ''}${effect.amount}`
              : '';
        return el('li', {
          className: `effect${harmful ? ' effect--harmful' : ''}`,
          text: `${EFFECT_NAMES[effect.kind]}${amount} · ${time}`,
        });
      }),
    );
  }
}
