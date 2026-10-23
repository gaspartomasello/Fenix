import { NAME_MAX_LENGTH, validateCharacterName } from '@fenix/shared/character/name';
import { PASSWORD_MAX_LENGTH, validatePassword } from '@fenix/shared/character/password';
import { el } from './dom';

export interface LoginRequest {
  readonly account: string;
  readonly password?: string;
  /** Crear la cuenta (si no, entrar a una que ya existe). */
  readonly create: boolean;
}

export interface LoginScreenOptions {
  readonly subtitle: string;
  /** En línea cada cuenta tiene contraseña; el modo solo no la pide. */
  readonly askPassword: boolean;
  readonly onSubmit: (request: LoginRequest) => void;
}

/** Primera pantalla: entrar a la cuenta o crearla. */
export class LoginScreen {
  readonly element: HTMLElement;
  private readonly nameInput: HTMLInputElement;
  private readonly passwordInput: HTMLInputElement | null;
  private readonly errorText: HTMLElement;
  private readonly buttons: HTMLButtonElement[];
  private readonly onSubmit: (request: LoginRequest) => void;

  constructor({ subtitle, askPassword, onSubmit }: LoginScreenOptions) {
    this.onSubmit = onSubmit;
    this.nameInput = el('input', {
      className: 'field',
      attrs: {
        type: 'text',
        maxlength: String(NAME_MAX_LENGTH),
        placeholder: 'Nombre de la cuenta',
        autocomplete: 'username',
        spellcheck: 'false',
        'aria-label': 'Nombre de la cuenta',
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
    const enter = el('button', { className: 'button', text: 'Entrar', attrs: { type: 'submit' } });
    const create = el('button', {
      className: 'button button--quiet',
      text: 'Crear cuenta nueva',
      attrs: { type: 'button' },
    });
    create.addEventListener('click', () => this.submit(true));
    this.buttons = askPassword ? [enter, create] : [enter];

    const form = el('form', { className: 'login-form' }, [
      this.nameInput,
      ...(this.passwordInput ? [this.passwordInput] : []),
      el('p', {
        className: 'login-hint',
        text: askPassword
          ? 'En una cuenta entran hasta cinco personajes. Si es tu primera vez, creá la cuenta.'
          : 'Tu cuenta y tus personajes se guardan en este navegador.',
      }),
      this.errorText,
      ...this.buttons,
    ]);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      // Sin contraseña (modo solo) la cuenta se crea sola la primera vez.
      this.submit(!askPassword);
    });

    this.element = el('div', { className: 'login-screen' }, [
      el('div', { className: 'panel login-panel' }, [
        el('h1', { className: 'title', text: 'Fenix' }),
        el('p', { className: 'subtitle', text: subtitle }),
        form,
      ]),
    ]);
  }

  focus(): void {
    this.nameInput.focus();
  }

  setBusy(busy: boolean): void {
    for (const button of this.buttons) button.disabled = busy;
  }

  showError(message: string): void {
    this.errorText.textContent = message;
    this.setBusy(false);
  }

  destroy(): void {
    this.element.remove();
  }

  private submit(create: boolean): void {
    const validation = validateCharacterName(this.nameInput.value);
    if (!validation.ok) {
      this.showError(validation.reason);
      return;
    }
    const password = this.passwordInput?.value;
    if (password !== undefined && create) {
      const check = validatePassword(password);
      if (!check.ok) {
        this.showError(check.reason);
        return;
      }
    }
    this.errorText.textContent = '';
    this.setBusy(true);
    this.onSubmit({
      account: validation.name,
      create,
      ...(password === undefined ? {} : { password }),
    });
  }
}
