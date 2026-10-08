import { SPELLS, SPELL_KEYS, formatGameTime, type SpellKey } from '@fenix/shared';
import { ClientGame } from '../core/client-game';
import { InputController } from '../input/input-controller';
import { createGateway, IS_SOLO } from '../network/create-gateway';
import type { GameGateway } from '../network/game-gateway';
import { GameRenderer } from '../rendering/game-renderer';
import { BackpackWindow } from '../ui/backpack-window';
import { ChatPanel } from '../ui/chat-panel';
import { DragController } from '../ui/drag-controller';
import { EquipmentWindow } from '../ui/equipment-window';
import { HudButtons } from '../ui/hud-buttons';
import { WorldTooltip } from '../ui/world-tooltip';
import { GhostBanner } from '../ui/ghost-banner';
import { SkillsWindow } from '../ui/skills-window';
import { SpellbookWindow } from '../ui/spellbook-window';
import { TargetingBanner } from '../ui/targeting-banner';
import { VitalsPanel } from '../ui/vitals-panel';
import { WorldCombat } from './world-combat';
import { WorldItems } from './world-items';
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
  private readonly gateway: GameGateway;
  private readonly login: LoginScreen;
  private inWorld = false;
  /** Botones de pantalla que agregan otros módulos (hechizos, habilidades…). */
  private readonly hudExtras: { label: string; key: string; onPress: () => void }[] = [];

  constructor(private readonly hosts: GameSessionHosts) {
    this.gateway = createGateway({
      onMessage: (message) => this.game.apply(message),
      onStatus: (status) => {
        if (status === 'closed') this.onDisconnected();
      },
    });
    this.game = new ClientGame(this.gateway, clock);
    this.login = new LoginScreen({
      subtitle: IS_SOLO ? 'Modo solo · creá tu personaje' : 'Creá tu personaje',
      onSubmit: (request) => void this.enter(request),
    });
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
    const drag = new DragController(this.hosts.ui);
    const tooltip = new WorldTooltip();
    // El combate se registra primero: un clic sobre una criatura ataca antes que agarrar un objeto.
    const worldCombat = new WorldCombat(this.game, renderer, tooltip);
    const worldItems = new WorldItems(this.game, renderer, drag, tooltip);
    const input = new InputController({
      surface: renderer.canvas,
      selfScreenPosition: () => renderer.selfScreenPosition(),
      onZoom: (delta) => renderer.stepZoom(delta),
      canSteerFrom: (point) => !worldItems.hasItemAt(point) && !worldCombat.hasCreatureAt(point),
    });
    const spellbook = this.setUpMagic(worldCombat);
    this.setUpInventory(drag, worldItems, tooltip, spellbook);
    this.setUpVitals();
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
        const time = this.game.worldTime();
        status.update({
          name: self.name,
          region: this.game.currentRegion()?.name ?? 'Tierras salvajes',
          time: time ? formatGameTime(time.dayProgress) : '--:--',
          x: self.position.x,
          y: self.position.y,
          visible: this.game.visibleCount,
        });
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  /** Barras de vida, maná y energía, y el aviso de fantasma. */
  private setUpVitals(): void {
    const panel = new VitalsPanel();
    const ghost = new GhostBanner();
    this.hosts.ui.append(panel.element, ghost.element);
    const render = (): void => {
      const state = this.game.vitals;
      if (!state) return;
      panel.update(state.vitals);
      ghost.setVisible(state.dead);
    };
    this.game.on('vitalsChanged', render);
    render();
  }

  /** Libro de hechizos, habilidades, elegir objetivo y atajos 1–5. Devuelve el libro. */
  private setUpMagic(worldCombat: WorldCombat): SpellbookWindow {
    const banner = new TargetingBanner();
    const cast = (spell: SpellKey): void => {
      const definition = SPELLS[spell];
      if (definition.target === 'self') {
        this.game.castSpell(spell);
        return;
      }
      // Con un objetivo de combate elegido, se usa ese; si no, se elige con un clic.
      const target = this.game.targetId;
      if (target) {
        this.game.castSpell(spell, target);
        return;
      }
      banner.show(
        `${definition.name}: tocá la criatura a la que se lo querés lanzar (Escape cancela).`,
      );
      worldCombat.pickCreature(
        (id) => {
          banner.hide();
          this.game.castSpell(spell, id);
        },
        () => banner.hide(),
      );
    };

    const spellbook = new SpellbookWindow(cast);
    const skills = new SkillsWindow();
    this.hosts.ui.append(spellbook.window.element, skills.window.element, banner.element);
    const render = (): void => {
      const values = this.game.skills;
      spellbook.render(values);
      if (values) skills.render(values);
    };
    this.game.on('skillsChanged', render);
    render();

    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey || e.altKey) return;
      const spell = SPELL_KEYS[Number(e.key) - 1];
      if (spell) {
        e.preventDefault();
        cast(spell);
      }
    });
    this.hudExtras.push(
      { label: 'Hechizos', key: 'l', onPress: () => spellbook.window.toggle() },
      { label: 'Habilidades', key: 'k', onPress: () => skills.window.toggle() },
    );
    return spellbook;
  }

  /** Ventanas de mochila y equipo, sus botones y la sincronización con el estado. */
  private setUpInventory(
    drag: DragController,
    worldItems: WorldItems,
    tooltip: WorldTooltip,
    spellbook: SpellbookWindow,
  ): void {
    const self = this.game.self;
    if (!self) return;
    // Doble clic sobre el libro de hechizos: se abre la ventana en vez de avisar al servidor.
    const actions = {
      ...worldItems.actions,
      useItem: (itemId: string) => {
        const item = this.game.findItem(itemId);
        if (item?.kind === 'spellbook') spellbook.window.show();
        else worldItems.actions.useItem(itemId);
      },
    };
    const backpack = new BackpackWindow(drag, actions);
    const equipment = new EquipmentWindow(drag, actions, self.appearance);
    const buttons = new HudButtons([
      { label: 'Mochila', key: 'b', onPress: () => backpack.window.toggle() },
      { label: 'Equipo', key: 'c', onPress: () => equipment.window.toggle() },
      ...this.hudExtras,
    ]);
    this.hosts.ui.append(
      backpack.window.element,
      equipment.window.element,
      buttons.element,
      tooltip.element,
    );

    const render = (): void => {
      backpack.render(this.game.inventory.backpack);
      equipment.render(this.game.inventory.equipment);
    };
    this.game.on('inventoryChanged', render);
    render();
  }

  private onDisconnected(): void {
    if (!this.inWorld) return;
    showOverlay(this.hosts.ui, 'Conexión perdida', 'Se cortó la conexión con el servidor.');
  }
}
