import { ClientGame } from '../core/client-game';
import { InputController } from '../input/input-controller';
import { WebSocketGateway } from '../network/websocket-gateway';
import { GameRenderer } from '../rendering/game-renderer';
import { ChatPanel } from '../ui/chat-panel';
import { LoginScreen, type LoginRequest } from '../ui/login-screen';
import { showOverlay } from '../ui/overlay';
import { StatusBar } from '../ui/status-bar';

export interface GameSessionHosts {
  /** Contenedor del canvas del juego. */
  readonly game: HTMLElement;
  /** Contenedor de la interfaz HTML. */
  readonly ui: HTMLElement;
}

const clock = (): number => performance.now();

/**
 * Orquesta el ciclo de vida del cliente: login → conexión → juego.
 * Conecta las piezas, pero no contiene reglas del juego ni de dibujo.
 */
export class GameSession {
  private readonly game: ClientGame;
  private readonly gateway: WebSocketGateway;
  private readonly login: LoginScreen;
  private inWorld = false;

  constructor(private readonly hosts: GameSessionHosts) {
    this.gateway = new WebSocketGateway(WebSocketGateway.defaultUrl(), {
      onMessage: (message) => this.game.apply(message),
      onStatus: (status) => {
        if (status === 'closed') this.onDisconnected();
      },
    });
    this.game = new ClientGame(this.gateway, clock);
    this.login = new LoginScreen((request) => void this.enter(request));
  }

  start(): void {
    this.hosts.ui.append(this.login.element);
    this.login.focus();
  }

  private async enter(request: LoginRequest): Promise<void> {
    const offRejected = this.game.on('joinRejected', ({ reason }) => {
      this.login.showError(reason);
      this.gateway.close();
    });
    const offReady = this.game.on('ready', () => {
      offRejected();
      offReady();
      void this.startWorld();
    });

    try {
      await this.gateway.connect();
      this.gateway.send({ type: 'join', name: request.name, appearance: request.appearance });
    } catch (error) {
      offRejected();
      offReady();
      this.login.showError(error instanceof Error ? error.message : 'Error de conexión');
    }
  }

  private async startWorld(): Promise<void> {
    this.inWorld = true;
    this.login.destroy();

    const renderer = await GameRenderer.create(this.hosts.game, this.game);
    const input = new InputController({
      surface: renderer.canvas,
      selfScreenPosition: () => renderer.selfScreenPosition(),
      onZoom: (delta) => renderer.stepZoom(delta),
    });
    const chat = new ChatPanel((text) => this.game.say(text));
    const status = new StatusBar();
    this.hosts.ui.append(status.element, chat.element);
    this.game.on('log', (entry) => chat.append(entry));
    chat.append({ kind: 'system', text: 'Bienvenido a Fenix.' });

    const frame = (): void => {
      const intent = input.movementIntent();
      if (intent) this.game.requestStep(intent.direction, intent.mode);
      this.game.update();
      renderer.render(clock());

      const self = this.game.self;
      if (self) {
        status.update({
          name: self.name,
          x: self.position.x,
          y: self.position.y,
          online: this.game.playerCount,
        });
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  private onDisconnected(): void {
    if (!this.inWorld) return;
    showOverlay(this.hosts.ui, 'Conexión perdida', 'Se cortó la conexión con el servidor.');
  }
}
