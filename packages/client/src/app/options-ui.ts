import type { ClientGame } from '../core/client-game';
import type { HotbarSlot } from '../core/hotbar';
import {
  comboOf,
  infoChips,
  parseOptions,
  type CommandKey,
  type GameOptions,
  type HotkeyAction,
} from '../core/options';
import type { GameRenderer } from '../rendering/game-renderer';
import type { HudButton } from '../ui/hud-buttons';
import { InfoBar } from '../ui/info-bar';
import { OptionsWindow } from '../ui/options-window';

const STORAGE_KEY = 'fenix.opciones';

/** Cada comando de los atajos, con el botón de pantalla que hace lo mismo. */
const COMMAND_BUTTONS: Partial<Record<CommandKey, string>> = {
  backpack: 'Mochila',
  paperdoll: 'Personaje',
  spellbook: 'Hechizos',
  skills: 'Habilidades',
  map: 'Mapa',
  'war-mode': 'Guerra',
};

export interface OptionsUiDeps {
  readonly game: ClientGame;
  readonly renderer: GameRenderer;
  readonly host: HTMLElement;
  readonly touch: boolean;
  readonly read: (key: string) => string | null;
  readonly write: (key: string, value: string) => void;
  /** Usar un hechizo, objeto o habilidad como desde la barra de atajos (se arma después). */
  readonly useSlot: () => ((slot: HotbarSlot) => void) | null;
  /** Los botones de pantalla (Mochila, Mapa…), para los comandos de los atajos. */
  readonly buttons: () => readonly HudButton[];
}

/**
 * Las opciones del jugador, como un asistente de UO: la ventana para
 * elegirlas, la barra de información de arriba y los atajos de teclado.
 * Todo vive en el navegador; lo que hacen los atajos lo decide el servidor
 * como siempre (son los mismos pedidos que la barra de atajos o los botones).
 */
export class OptionsUi {
  readonly window: OptionsWindow;
  readonly infoBar = new InfoBar();
  private options: GameOptions;

  constructor(private readonly deps: OptionsUiDeps) {
    this.options = parseOptions(deps.read(STORAGE_KEY));
    this.window = new OptionsWindow(this.options, (next) => this.change(next), deps.touch);
    deps.host.append(this.window.window.element);
    deps.game.on('inventoryChanged', () => this.renderInfo());
    deps.game.on('vitalsChanged', () => this.renderInfo());
    if (!deps.touch) {
      window.addEventListener('keydown', (e) => this.onKey(e), { capture: true });
      // Lo que va debajo de la barra superior baja lo que ocupe la barra de información.
      new ResizeObserver(() => {
        const height = this.infoBar.element.hidden ? 0 : this.infoBar.element.offsetHeight;
        document.documentElement.style.setProperty('--info-bar-height', `${height}px`);
      }).observe(this.infoBar.element);
    }
    this.apply();
  }

  /** El botón de pantalla y la tecla (P) que abren la ventana. */
  get button(): HudButton {
    return { label: 'Opciones', key: 'p', onPress: () => this.window.window.toggle() };
  }

  private change(next: GameOptions): void {
    this.options = next;
    this.deps.write(STORAGE_KEY, JSON.stringify(next));
    this.apply();
  }

  /** Aplica lo que se ve: textos sobre las cabezas, mapa chico, barra de atajos e información. */
  private apply(): void {
    const { names, numbers, minimap, hotbar } = this.options;
    this.deps.renderer.setLabels({ names, numbers });
    const root = document.documentElement.classList;
    root.toggle('hide-minimap', !minimap);
    root.toggle('hide-hotbar', !hotbar);
    this.renderInfo();
  }

  private renderInfo(): void {
    const { weight, max } = this.deps.game.load;
    this.infoBar.render(
      infoChips(this.options.info, {
        backpack: this.deps.game.inventory.backpack,
        carried: this.deps.game.inventory.carried,
        vitals: this.deps.game.vitals?.vitals ?? null,
        weight,
        maxWeight: max,
      }),
    );
  }

  /** Un atajo propio gana sobre las teclas del juego (como en un asistente de UO). */
  private onKey(e: KeyboardEvent): void {
    if (e.repeat || isTyping(e.target)) return;
    const combo = comboOf(e);
    if (!combo) return;
    const hotkey = this.options.hotkeys.find((h) => h.combo === combo);
    if (!hotkey) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    this.run(hotkey.action);
  }

  private run(action: HotkeyAction): void {
    if (action.type !== 'command') {
      const use = this.deps.useSlot();
      if (action.type === 'spell') use?.({ type: 'spell', spell: action.spell });
      else if (action.type === 'item') use?.({ type: 'item', kind: action.kind });
      else use?.({ type: 'skill', skill: action.skill });
      return;
    }
    switch (action.command) {
      case 'attack-next':
        this.deps.game.attackNearest(1);
        return;
      case 'attack-previous':
        this.deps.game.attackNearest(-1);
        return;
      case 'options':
        this.window.window.toggle();
        return;
      default: {
        const label = COMMAND_BUTTONS[action.command];
        this.deps
          .buttons()
          .find((b) => b.label === label)
          ?.onPress();
      }
    }
  }
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}
