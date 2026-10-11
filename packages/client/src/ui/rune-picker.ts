import { SPELLS, type BackpackItemSnapshot, type EntityId, type SpellKey } from '@fenix/shared';
import { el } from './dom';
import { GameWindow } from './game-window';
import { itemIconUrl } from './item-icons';
import { itemLabel } from './item-label';

/**
 * Elegir con qué runa viajar (Recordar, Portal) o cuál marcar (Marcar):
 * una ventana con las runas de la mochila y el lugar que guarda cada una.
 */
export class RunePicker {
  readonly window: GameWindow;

  constructor(
    private readonly onPick: (spell: SpellKey, runeId: EntityId, scrollId?: EntityId) => void,
  ) {
    this.window = new GameWindow('runas', 'Runas', { x: 300, y: 160 });
  }

  /** Abre la ventana para el hechizo; devuelve un aviso si no hay runas que sirvan. */
  open(
    spell: SpellKey,
    backpack: readonly BackpackItemSnapshot[],
    scrollId?: EntityId,
  ): string | null {
    const marking = SPELLS[spell].effect.kind === 'mark';
    const runes = backpack.filter((i) => i.kind === 'rune' && (marking || i.mark));
    if (runes.length === 0)
      return marking
        ? 'Necesitás una runa en la mochila (se compran a la maga).'
        : 'Necesitás una runa marcada en la mochila: marcala con Marcar en el lugar al que quieras volver.';
    this.window.setTitle(`${SPELLS[spell].name}: elegí una runa`);
    this.window.body.replaceChildren(
      el(
        'div',
        { className: 'rune-list' },
        runes.map((rune) => {
          const button = el('button', { className: 'hotbar-option', attrs: { type: 'button' } }, [
            el('img', { attrs: { src: itemIconUrl('rune'), alt: '', draggable: 'false' } }),
            el('span', { text: itemLabel(rune) }),
          ]);
          button.addEventListener('click', () => {
            this.window.hide();
            this.onPick(spell, rune.id, scrollId);
          });
          return button;
        }),
      ),
      el('p', {
        className: 'window-hint',
        text: marking
          ? 'La runa va a guardar el lugar donde estás parado.'
          : 'El hechizo te lleva al lugar que guarda la runa.',
      }),
    );
    this.window.show();
    return null;
  }
}
