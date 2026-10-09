import { el } from './dom';

/** Aviso a pantalla completa (por ejemplo, conexión perdida). */
export function showOverlay(host: HTMLElement, title: string, message: string): void {
  const button = el('button', {
    className: 'button',
    text: 'Volver a entrar',
    attrs: { type: 'button' },
  });
  button.addEventListener('click', () => window.location.reload());
  host.append(
    el('div', { className: 'overlay', attrs: { role: 'alertdialog', 'aria-label': title } }, [
      el('div', { className: 'panel overlay-panel' }, [
        el('h2', { className: 'title title--small', text: title }),
        el('p', { text: message }),
        button,
      ]),
    ]),
  );
}
