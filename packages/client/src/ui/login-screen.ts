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
  NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  SKIN_TONES,
  validateCharacterName,
  validatePassword,
  type Appearance,
} from '@fenix/shared';
import { ART_DETAIL, drawCharacterFrame } from '@fenix/art';
import { toCanvas } from '../platform/canvas';
import { el, hexColor } from './dom';

export interface LoginRequest {
  readonly name: string;
  readonly appearance: Appearance;
  readonly password?: string;
}

export interface LoginScreenOptions {
  readonly subtitle: string;
  /** En línea cada personaje tiene contraseña; el modo solo no la pide. */
  readonly askPassword: boolean;
  readonly onSubmit: (request: LoginRequest) => void;
}

const PREVIEW_SCALE = 2;
const PREVIEW_DIRECTIONS = [
  Direction.SouthEast,
  Direction.East,
  Direction.NorthEast,
  Direction.North,
];

/** Pantalla de creación de personaje e ingreso al mundo. */
export class LoginScreen {
  readonly element: HTMLElement;
  private appearance: Appearance = DEFAULT_APPEARANCE;
  private readonly nameInput: HTMLInputElement;
  private readonly passwordInput: HTMLInputElement | null;
  private readonly errorText: HTMLElement;
  private readonly submitButton: HTMLButtonElement;
  private readonly preview: HTMLCanvasElement;
  /** Las mujeres no eligen barba. */
  private readonly beardRow: HTMLElement;
  private previewTurn = 0;
  private readonly previewTimer: number;

  private readonly onSubmit: (request: LoginRequest) => void;

  constructor({ subtitle, askPassword, onSubmit }: LoginScreenOptions) {
    this.onSubmit = onSubmit;
    this.nameInput = el('input', {
      className: 'field',
      attrs: {
        type: 'text',
        maxlength: String(NAME_MAX_LENGTH),
        placeholder: 'Nombre del personaje',
        autocomplete: 'off',
        spellcheck: 'false',
        'aria-label': 'Nombre del personaje',
      },
    });
    this.passwordInput = askPassword
      ? el('input', {
          className: 'field',
          attrs: {
            type: 'password',
            maxlength: String(PASSWORD_MAX_LENGTH),
            placeholder: 'Contraseña',
            autocomplete: 'current-password',
            'aria-label': 'Contraseña',
          },
        })
      : null;
    this.errorText = el('p', { className: 'login-error', attrs: { role: 'alert' } });
    this.submitButton = el('button', {
      className: 'button',
      text: 'Entrar al mundo',
      attrs: { type: 'submit' },
    });
    this.beardRow = this.optionRow('Barba', FACIAL_HAIR, FACIAL_HAIR_NAMES, 'facialHair');
    this.preview = el('canvas', { className: 'login-preview', attrs: { 'aria-hidden': 'true' } });

    const form = el('form', { className: 'login-form' }, [
      this.preview,
      this.nameInput,
      ...(this.passwordInput ? [this.passwordInput] : []),
      el('p', {
        className: 'login-hint',
        text: askPassword
          ? 'Si el personaje ya existe, entrás con su contraseña; si no, se crea con la apariencia que elijas.'
          : 'Tu personaje se guarda en este navegador. Si ya existe, se usa su apariencia guardada.',
      }),
      this.optionRow('Cuerpo', GENDERS, GENDER_NAMES, 'gender'),
      this.swatchRow('Ropa', CLOTH_HUES, 'clothHue'),
      this.swatchRow('Piel', SKIN_TONES, 'skinTone'),
      this.swatchRow('Pelo', HAIR_HUES, 'hairHue'),
      this.optionRow('Peinado', HAIR_STYLES, HAIR_STYLE_NAMES, 'hairStyle'),
      this.beardRow,
      this.errorText,
      this.submitButton,
    ]);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submit();
    });

    this.element = el('div', { className: 'login-screen' }, [
      el('div', { className: 'panel login-panel' }, [
        el('h1', { className: 'title', text: 'Fenix' }),
        el('p', { className: 'subtitle', text: subtitle }),
        form,
      ]),
    ]);

    this.drawPreview();
    this.previewTimer = window.setInterval(() => {
      this.previewTurn = (this.previewTurn + 1) % PREVIEW_DIRECTIONS.length;
      this.drawPreview();
    }, 1200);
  }

  focus(): void {
    this.nameInput.focus();
  }

  setBusy(busy: boolean): void {
    this.submitButton.disabled = busy;
    this.submitButton.textContent = busy ? 'Conectando…' : 'Entrar al mundo';
  }

  showError(message: string): void {
    this.errorText.textContent = message;
    this.setBusy(false);
  }

  destroy(): void {
    window.clearInterval(this.previewTimer);
    this.element.remove();
  }

  private submit(): void {
    const validation = validateCharacterName(this.nameInput.value);
    if (!validation.ok) {
      this.showError(validation.reason);
      return;
    }
    const password = this.passwordInput?.value;
    if (password !== undefined) {
      const check = validatePassword(password);
      if (!check.ok) {
        this.showError(check.reason);
        return;
      }
    }
    this.errorText.textContent = '';
    this.setBusy(true);
    this.onSubmit({
      name: validation.name,
      appearance: this.appearance,
      ...(password === undefined ? {} : { password }),
    });
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
    this.element
      .querySelectorAll<HTMLButtonElement>('[aria-label="Peinado"] .option-chip')
      .forEach((b) =>
        b.setAttribute('aria-pressed', String(b.textContent === HAIR_STYLE_NAMES[hairStyle])),
      );
  }

  private drawPreview(): void {
    const direction = PREVIEW_DIRECTIONS[this.previewTurn] ?? Direction.SouthEast;
    const art = toCanvas(drawCharacterFrame(this.appearance, direction, 'idle'));
    this.preview.width = (art.width * PREVIEW_SCALE) / ART_DETAIL;
    this.preview.height = (art.height * PREVIEW_SCALE) / ART_DETAIL;
    const ctx = this.preview.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.clearRect(0, 0, this.preview.width, this.preview.height);
    ctx.drawImage(art, 0, 0, this.preview.width, this.preview.height);
  }
}
