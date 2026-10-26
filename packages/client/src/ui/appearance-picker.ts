import {
  CLOTH_HUES,
  DEFAULT_APPEARANCE,
  FACIAL_HAIR_NAMES,
  GENDERS,
  GENDER_NAMES,
  HAIR_STYLE_NAMES,
  HAIR_HUES,
  SKIN_TONES,
  type Appearance,
  type FacialHair,
  type HairStyle,
} from '@fenix/shared/character/appearance';
import { startingClothes } from '@fenix/shared/character/creation';
import { Direction } from '@fenix/shared/geometry/direction';
import type { EquipmentHues, EquipmentLook } from '@fenix/shared/protocol/messages';
import { drawCharacterFrame } from '@fenix/art';
import { toCanvas } from '../platform/canvas';
import { el, hexColor } from './dom';
import {
  drawPaintedPortrait,
  portraitBeards,
  portraitFaces,
  portraitHairStyles,
} from './portrait-art';

const PREVIEW_SCALE = 2;
const PREVIEW_DIRECTIONS = [
  Direction.SouthEast,
  Direction.East,
  Direction.NorthEast,
  Direction.North,
];

/** Dibuja un personaje quieto en un canvas (vista previa, lista de personajes). */
export function drawPortrait(
  canvas: HTMLCanvasElement,
  appearance: Appearance,
  direction: Direction = Direction.SouthEast,
  scale = PREVIEW_SCALE,
): void {
  // Con la ropa con la que empieza (camisa del color elegido y pantalón o pollera).
  const clothes = startingClothes(appearance);
  const equipment: EquipmentLook = Object.fromEntries(clothes.map((c) => [c.slot, c.kind]));
  const hues: EquipmentHues = Object.fromEntries(
    clothes.flatMap((c) => (c.hue === undefined ? [] : [[c.slot, c.hue]])),
  );
  const art = toCanvas(
    drawCharacterFrame(appearance, direction, 'idle', equipment, null, null, undefined, hues),
  );
  canvas.width = art.width * scale;
  canvas.height = art.height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(art, 0, 0, canvas.width, canvas.height);
}

/** Un selector con flechas (◀ nombre ▶) sobre una lista que puede cambiar. */
interface Stepper<T> {
  readonly row: HTMLElement;
  /** Cambia las opciones (y, si el elegido ya no está, toma el primero). */
  setOptions(options: readonly T[]): void;
}

/**
 * El retrato pintado grande y la vista previa del mundo que gira, con filas
 * para elegir cuerpo, ropa, piel y pelo, y selectores con flechas para el
 * rostro, el peinado y la barba (solo los que ya tienen dibujo).
 */
export class AppearancePicker {
  readonly preview: HTMLElement;
  private readonly world: HTMLCanvasElement;
  private readonly portrait: HTMLCanvasElement;
  readonly rows: HTMLElement[];
  private appearance: Appearance = DEFAULT_APPEARANCE;
  private readonly face: Stepper<number>;
  private readonly hair: Stepper<HairStyle>;
  /** Las mujeres no eligen barba. */
  private readonly beard: Stepper<FacialHair>;
  private previewTurn = 0;
  private readonly previewTimer: number;

  constructor() {
    this.world = el('canvas', { className: 'login-preview', attrs: { 'aria-hidden': 'true' } });
    this.portrait = el('canvas', {
      className: 'login-portrait',
      attrs: { role: 'img', 'aria-label': 'Retrato del personaje' },
    });
    this.preview = el('div', { className: 'login-looks' }, [this.portrait, this.world]);
    this.face = this.stepper<number>(
      'Rostro',
      (n) => `Rostro ${n + 1}`,
      (face) => ({ face }),
    );
    this.hair = this.stepper<HairStyle>(
      'Peinado',
      (s) => HAIR_STYLE_NAMES[s],
      (hairStyle) => ({ hairStyle }),
    );
    this.beard = this.stepper<FacialHair>(
      'Barba',
      (b) => FACIAL_HAIR_NAMES[b],
      (facialHair) => ({ facialHair }),
    );
    this.rows = [
      this.genderRow(),
      this.swatchRow('Ropa', CLOTH_HUES, 'clothHue'),
      this.swatchRow('Piel', SKIN_TONES, 'skinTone'),
      this.swatchRow('Pelo', HAIR_HUES, 'hairHue'),
      this.face.row,
      this.hair.row,
      this.beard.row,
    ];
    this.applyGender();
    this.drawPreview();
    this.previewTimer = window.setInterval(() => {
      this.previewTurn = (this.previewTurn + 1) % PREVIEW_DIRECTIONS.length;
      this.drawPreview();
    }, 1200);
  }

  get value(): Appearance {
    return this.appearance;
  }

  destroy(): void {
    window.clearInterval(this.previewTimer);
  }

  private swatchRow(label: string, colors: readonly number[], key: keyof Appearance): HTMLElement {
    const buttons = colors.map((color) => {
      const button = el('button', {
        className: 'swatch',
        attrs: { type: 'button', 'aria-label': `${label} ${hexColor(color)}` },
      });
      button.style.backgroundColor = hexColor(color);
      button.setAttribute('aria-pressed', String(this.appearance[key] === color));
      button.addEventListener('click', () => {
        this.appearance = { ...this.appearance, [key]: color };
        buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(colors[i] === color)));
        this.drawPreview();
      });
      return button;
    });
    return el('div', { className: 'swatch-row' }, [
      el('span', { className: 'swatch-label', text: label }),
      el('div', { className: 'swatches', attrs: { role: 'group', 'aria-label': label } }, buttons),
    ]);
  }

  private genderRow(): HTMLElement {
    const buttons = GENDERS.map((gender) => {
      const button = el('button', {
        className: 'option-chip',
        text: GENDER_NAMES[gender],
        attrs: {
          type: 'button',
          'aria-pressed': String((this.appearance.gender ?? 'male') === gender),
        },
      });
      button.addEventListener('click', () => {
        this.appearance = { ...this.appearance, gender };
        buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(GENDERS[i] === gender)));
        this.applyGender();
        this.drawPreview();
      });
      return button;
    });
    return el('div', { className: 'swatch-row' }, [
      el('span', { className: 'swatch-label', text: 'Cuerpo' }),
      el(
        'div',
        { className: 'swatches', attrs: { role: 'group', 'aria-label': 'Cuerpo' } },
        buttons,
      ),
    ]);
  }

  /** Fila con flechas para pasar de una opción a otra. */
  private stepper<T>(
    label: string,
    name: (option: T) => string,
    change: (option: T) => Partial<Appearance>,
  ): Stepper<T> {
    let options: readonly T[] = [];
    let index = 0;
    const text = el('span', { className: 'stepper-value', attrs: { 'aria-live': 'polite' } });
    const arrow = (symbol: string, step: number, hint: string): HTMLButtonElement => {
      const button = el('button', {
        className: 'option-chip stepper-arrow',
        text: symbol,
        attrs: { type: 'button', 'aria-label': `${hint} (${label.toLowerCase()})` },
      });
      button.addEventListener('click', () => {
        if (options.length === 0) return;
        index = (index + step + options.length) % options.length;
        pick();
        this.drawPreview();
      });
      return button;
    };
    const pick = (): void => {
      const option = options[index];
      if (option === undefined) return;
      text.textContent = name(option);
      this.appearance = { ...this.appearance, ...change(option) };
    };
    const row = el('div', { className: 'swatch-row' }, [
      el('span', { className: 'swatch-label', text: label }),
      el('div', { className: 'stepper', attrs: { role: 'group', 'aria-label': label } }, [
        arrow('◀', -1, 'Anterior'),
        text,
        arrow('▶', 1, 'Siguiente'),
      ]),
    ]);
    return {
      row,
      setOptions: (next) => {
        const current = options[index];
        options = next;
        index = Math.max(0, current === undefined ? 0 : options.indexOf(current));
        row.hidden = options.length < 2;
        pick();
      },
    };
  }

  /** Al cambiar de cuerpo, los rostros, peinados y barbas con dibujo para ese cuerpo. */
  private applyGender(): void {
    const gender = this.appearance.gender ?? 'male';
    const faces = portraitFaces(gender);
    this.face.setOptions(Array.from({ length: faces }, (_, i) => i));
    if (faces === 0) this.appearance = { ...this.appearance, face: 0 };
    // Primero los que tienen pelo; pelado al final.
    const styles = portraitHairStyles(gender);
    this.hair.setOptions([...styles.filter((s) => s !== 'bald'), 'bald']);
    if (gender === 'female') {
      this.beard.setOptions([]);
      this.appearance = { ...this.appearance, facialHair: 'none' };
    } else {
      this.beard.setOptions(portraitBeards(gender));
    }
  }

  private drawPreview(): void {
    void drawPaintedPortrait(this.portrait, this.appearance, 'bust');
    drawPortrait(
      this.world,
      this.appearance,
      PREVIEW_DIRECTIONS[this.previewTurn] ?? Direction.SouthEast,
    );
  }
}
