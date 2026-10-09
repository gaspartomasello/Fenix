import {
  CLOTH_HUES,
  DEFAULT_APPEARANCE,
  Direction,
  HAIR_HUES,
  NAME_MAX_LENGTH,
  SKIN_TONES,
  validateCharacterName,
  type Appearance,
} from '@fenix/shared';
import { drawCharacterFrame } from '../assets/character-art';
import { el, hexColor } from './dom';

export interface LoginRequest {
  readonly name: string;
  readonly appearance: Appearance;
}

export interface LoginScreenOptions {
  readonly subtitle: string;
  readonly onSubmit: (request: LoginRequest) => void;
}

const PREVIEW_SCALE = 4;
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
  private readonly errorText: HTMLElement;
  private readonly submitButton: HTMLButtonElement;
  private readonly preview: HTMLCanvasElement;
  private previewTurn = 0;
  private readonly previewTimer: number;

  private readonly onSubmit: (request: LoginRequest) => void;

  constructor({ subtitle, onSubmit }: LoginScreenOptions) {
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
    this.errorText = el('p', { className: 'login-error', attrs: { role: 'alert' } });
    this.submitButton = el('button', {
      className: 'button',
      text: 'Entrar al mundo',
      attrs: { type: 'submit' },
    });
    this.preview = el('canvas', { className: 'login-preview', attrs: { 'aria-hidden': 'true' } });

    const form = el('form', { className: 'login-form' }, [
      this.preview,
      this.nameInput,
      this.swatchRow('Ropa', CLOTH_HUES, 'clothHue'),
      this.swatchRow('Piel', SKIN_TONES, 'skinTone'),
      this.swatchRow('Pelo', HAIR_HUES, 'hairHue'),
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
    this.errorText.textContent = '';
    this.setBusy(true);
    this.onSubmit({ name: validation.name, appearance: this.appearance });
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

  private drawPreview(): void {
    const direction = PREVIEW_DIRECTIONS[this.previewTurn] ?? Direction.SouthEast;
    const art = drawCharacterFrame(this.appearance, direction, 'idle');
    this.preview.width = art.width * PREVIEW_SCALE;
    this.preview.height = art.height * PREVIEW_SCALE;
    const ctx = this.preview.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, this.preview.width, this.preview.height);
    ctx.drawImage(art, 0, 0, this.preview.width, this.preview.height);
  }
}
