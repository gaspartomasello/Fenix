import { drawCreatureFrame } from '@fenix/art';
import { CREATURES, Direction, type EntityId, type PolymorphForm } from '@fenix/shared';
import { toCanvas } from '../platform/canvas';
import { el } from './dom';
import { GameWindow } from './game-window';

/** Como en UO, primero los animales y aparte las criaturas. */
const GROUPS: readonly { title: string; forms: readonly PolymorphForm[] }[] = [
  {
    title: 'Animales',
    forms: ['horse-chestnut', 'wolf', 'panther', 'gorilla', 'black-bear', 'grizzly', 'polar-bear'],
  },
  { title: 'Criaturas', forms: ['orc', 'lizardman', 'troll', 'skeleton'] },
];

const portraits = new Map<PolymorphForm, string>();

/** Retrato de la forma, de costado, recortado del lienzo grande. */
function portraitUrl(form: PolymorphForm): string {
  let url = portraits.get(form);
  if (!url) {
    url = toCanvas(drawCreatureFrame(form, Direction.NorthEast, 'idle')).toDataURL();
    portraits.set(form, url);
  }
  return url;
}

/** Transformación: una ventana para elegir en qué animal o criatura convertirse. */
export class PolymorphPicker {
  readonly window: GameWindow;
  private scrollId: EntityId | undefined;

  constructor(private readonly onPick: (form: PolymorphForm, scrollId?: EntityId) => void) {
    this.window = new GameWindow('transformacion', 'Transformación', { x: 300, y: 140 });
    this.window.body.append(
      ...GROUPS.flatMap(({ title, forms }) => [
        el('h3', { className: 'polymorph-title', text: title }),
        el(
          'div',
          { className: 'polymorph-list' },
          forms.map((form) => {
            const button = el(
              'button',
              { className: 'polymorph-option', attrs: { type: 'button' } },
              [
                el('img', { attrs: { src: portraitUrl(form), alt: '', draggable: 'false' } }),
                el('span', { text: capitalize(CREATURES[form].name) }),
              ],
            );
            button.addEventListener('click', () => {
              this.window.hide();
              this.onPick(form, this.scrollId);
            });
            return button;
          }),
        ),
      ]),
      el('p', {
        className: 'window-hint',
        text: 'Tomás esa forma un rato; al terminar, volvés a ser vos.',
      }),
    );
  }

  open(scrollId?: EntityId): void {
    this.scrollId = scrollId;
    this.window.show();
  }
}

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
