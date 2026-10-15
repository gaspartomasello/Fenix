import { CHAT_MAX_LENGTH } from '@fenix/shared';
import type { LogEntry } from '../core/client-game';
import { el } from './dom';

const MAX_LINES = 60;
const CHANNEL_LABELS = { party: '[Grupo] ', guild: '[Gremio] ' } as const;

/** Registro de mensajes y campo para hablar. Enter abre/envía, Escape cierra. */
export class ChatPanel {
  readonly element: HTMLElement;
  private readonly log: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly abort = new AbortController();

  constructor(private readonly onSay: (text: string) => void) {
    this.log = el('ol', {
      className: 'chat-log',
      attrs: { 'aria-live': 'polite', 'aria-label': 'Mensajes' },
    });
    this.input = el('input', {
      className: 'field chat-input',
      attrs: {
        type: 'text',
        maxlength: String(CHAT_MAX_LENGTH),
        placeholder: 'Enter para hablar',
        autocomplete: 'off',
        'aria-label': 'Mensaje',
      },
    });
    this.element = el('div', { className: 'chat-panel' }, [this.log, this.input]);
    this.input.addEventListener('blur', () => this.element.classList.remove('chat-panel--typing'), {
      signal: this.abort.signal,
    });

    this.input.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          // Que el atajo global de Enter no vuelva a abrir el campo recién enviado.
          e.stopPropagation();
          const text = this.input.value.trim();
          if (text) this.onSay(text);
          this.input.value = '';
          this.input.blur();
        } else if (e.key === 'Escape') {
          this.input.value = '';
          this.input.blur();
        }
      },
      { signal: this.abort.signal },
    );
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Enter' && document.activeElement !== this.input) {
          e.preventDefault();
          this.input.focus();
        }
      },
      { signal: this.abort.signal },
    );
  }

  /** Abre el campo para escribir (en el celular está escondido hasta que se pide). */
  openInput(): void {
    this.element.classList.add('chat-panel--typing');
    this.input.focus();
  }

  append(entry: LogEntry): void {
    const channel = entry.channel && entry.channel !== 'say' ? entry.channel : null;
    const line = el('li', {
      className: `chat-line chat-line--${channel ?? entry.kind}`,
    });
    if (channel)
      line.append(el('span', { className: 'chat-channel', text: CHANNEL_LABELS[channel] }));
    if (entry.author)
      line.append(el('span', { className: 'chat-author', text: `${entry.author}: ` }));
    line.append(document.createTextNode(entry.text));
    this.log.append(line);
    while (this.log.childElementCount > MAX_LINES) this.log.firstElementChild?.remove();
    this.log.scrollTop = this.log.scrollHeight;
  }

  destroy(): void {
    this.abort.abort();
    this.element.remove();
  }
}
