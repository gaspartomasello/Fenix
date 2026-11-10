/**
 * Galería de ventanas (solo en desarrollo: `npm run dev` y abrir /ventanas.html).
 * Muestra cada ventana con datos de ejemplo, sin jugar hasta abrirla, para
 * revisar su aspecto en la computadora y en el celular (`?tactil` simula el
 * dedo). `?ventana=casa` muestra una sola.
 */
import { emptyDesign } from '@fenix/shared/housing/design';
import type { HouseSnapshot } from '@fenix/shared/protocol/messages';
import '../styles.css';
import { HouseDesignWindow } from '../ui/house-design-window';
import { HouseWindow } from '../ui/house-window';
import { prefersTouch } from '../ui/touch-hud';

const ui = document.getElementById('ui');
if (!ui) throw new Error('Falta #ui');
if (prefersTouch()) document.documentElement.classList.add('touch-ui');
document.body.style.background =
  'repeating-linear-gradient(45deg, #2c4a2a 0 24px, #335532 24px 48px)';

const house: HouseSnapshot = {
  id: 'casa-1',
  kind: 'lot-medium',
  x: 100,
  y: 100,
  slots: [],
  name: 'La Fragua',
  owner: 'Gaspar',
  public: false,
  design: emptyDesign('lot-medium'),
};

const gallery: Record<string, () => void> = {
  casa: () => {
    const window = new HouseWindow({
      action: () => undefined,
      security: () => undefined,
      design: () => undefined,
    });
    ui.append(window.window.element);
    window.open(
      house,
      'owner',
      { public: false, coOwners: ['Elena'], friends: ['Julián', 'Lucía'], banned: [] },
      { used: 12, max: 125 },
    );
  },
  diseno: () => {
    const window = new HouseDesignWindow({
      confirm: () => undefined,
      carried: () => 40,
      gold: () => 5000,
    });
    ui.append(window.window.element);
    window.open(house);
  },
};

const only = new URLSearchParams(location.search).get('ventana');
for (const [name, show] of Object.entries(gallery)) if (!only || only === name) show();
