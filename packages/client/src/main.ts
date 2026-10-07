import { GameSession } from './app/game-session';
import './styles.css';

function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Falta el elemento #${id} en index.html`);
  return element;
}

new GameSession({ game: requireElement('game'), ui: requireElement('ui') }).start();
