import {
  CLOTH_HUES,
  DEFAULT_APPEARANCE,
  Direction,
  FACIAL_HAIR,
  FACIAL_HAIR_NAMES,
  GENDERS,
  GENDER_NAMES,
  HAIR_STYLES,
  HAIR_STYLE_NAMES,
  HAIR_HUES,
  SKIN_TONES,
  type Appearance,
} from '@fenix/shared';
import { drawCharacterFrame } from '@fenix/art';
import { toCanvas } from '../platform/canvas';
import { el, hexColor } from './dom';

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
  const art = toCanvas(drawCharacterFrame(appearance, direction, 'idle'));
  canvas.width = art.width * scale;
  canvas.height = art.height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(art, 0, 0, canvas.width, canvas.height);
}

/** Vista previa que gira y filas para elegir cuerpo, ropa, piel, pelo, peinado y barba. */
export class AppearancePicker {
  readonly preview: HTMLCanvasElement;
  readonly rows: HTMLElement[];
  private appearance: Appearance = DEFAULT_APPEARANCE;
  /** Las mujeres no eligen barba. */
  private readonly beardRow: HTMLElement;
  private readonly peinado: HTMLElement;
  private previewTurn = 0;
  private readonly previewTimer: number;

  constructor() {
    this.preview = el('canvas', { className: 'login-preview', attrs: { 'aria-hidden': 'true' } });
    this.beardRow = this.optionRow('Barba', FACIAL_HAIR, FACIAL_HAIR_NAMES, 'facialHair');
    this.peinado = this.optionRow('Peinado', HAIR_STYLES, HAIR_STYLE_NAMES, 'hairStyle');
    this.rows = [
      this.optionRow('Cuerpo', GENDERS, GENDER_NAMES, 'gender'),
      this.swatchRow('Ropa', CLOTH_HUES, 'clothHue'),
      this.swatchRow('Piel', SKIN_TONES, 'skinTone'),
      this.swatchRow('Pelo', HAIR_HUES, 'hairHue'),
      this.peinado,
      this.beardRow,
    ];
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

  /** Fila de opciones con nombre (peinado, barba). */
  private optionRow<K extends 'gender' | 'hairStyle' | 'facialHair'>(
    label: string,
    options: readonly NonNullable<Appearance[K]>[],
    names: Readonly<Record<NonNullable<Appearance[K]>, string>>,
    key: K,
  ): HTMLElement {
    const current = (): Appearance[K] | undefined => this.appearance[key] ?? options[0];
    const buttons = options.map((option) => {
      const button = el('button', {
        className: 'option-chip',
        text: names[option],
        attrs: { type: 'button', 'aria-pressed': String(current() === option) },
      });
      button.addEventListener('click', () => {
        this.appearance = { ...this.appearance, [key]: option };
        buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i] === option)));
        if (key === 'gender') this.applyGender(option === 'female');
        this.drawPreview();
      });
      return button;
    });
    return el('div', { className: 'swatch-row' }, [
      el('span', { className: 'swatch-label', text: label }),
      el('div', { className: 'swatches', attrs: { role: 'group', 'aria-label': label } }, buttons),
    ]);
  }

  /** Al elegir mujer: sin barba y con pelo largo, si todavía tenía el peinado de hombre. */
  private applyGender(female: boolean): void {
    this.beardRow.hidden = female;
    if (!female) return;
    const hairStyle =
      !this.appearance.hairStyle || this.appearance.hairStyle === 'short'
        ? 'long'
        : this.appearance.hairStyle;
    this.appearance = { ...this.appearance, facialHair: 'none', hairStyle };
    this.peinado
      .querySelectorAll<HTMLButtonElement>('.option-chip')
      .forEach((b) =>
        b.setAttribute('aria-pressed', String(b.textContent === HAIR_STYLE_NAMES[hairStyle])),
      );
  }

  private drawPreview(): void {
    drawPortrait(
      this.preview,
      this.appearance,
      PREVIEW_DIRECTIONS[this.previewTurn] ?? Direction.SouthEast,
    );
  }
}
