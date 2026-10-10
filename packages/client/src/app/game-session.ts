import { SPELLS, formatGameTime, isCraftSkill, type SpellKey } from '@fenix/shared';
import { ClientGame } from '../core/client-game';
import { InputController } from '../input/input-controller';
import { createGateway, IS_SOLO } from '../network/create-gateway';
import type { GameGateway } from '../network/game-gateway';
import { GameRenderer } from '../rendering/game-renderer';
import { BackpackWindow } from '../ui/backpack-window';
import { ChatPanel } from '../ui/chat-panel';
import { DragController } from '../ui/drag-controller';
import { EquipmentWindow } from '../ui/equipment-window';
import { PaperdollViewer } from '../ui/paperdoll-viewer';
import { WorldPaperdolls } from './world-paperdolls';
import { HudButtons, type HudButton } from '../ui/hud-buttons';
import { SocialWindow } from '../ui/social-window';
import { WorldTooltip } from '../ui/world-tooltip';
import { WorldSigns } from './world-signs';
import { GhostBanner } from '../ui/ghost-banner';
import { SkillsWindow } from '../ui/skills-window';
import { SpellbookWindow } from '../ui/spellbook-window';
import { TargetingBanner } from '../ui/targeting-banner';
import { VitalsPanel } from '../ui/vitals-panel';
import { EffectsBar } from '../ui/effects-bar';
import { ITEMS, VENDORS, VENDOR_RANGE, reputationTitle, type NpcRole } from '@fenix/shared';
import type { ItemActions } from '../ui/backpack-window';
import { BankWindow } from '../ui/bank-window';
import { CorpseWindow } from '../ui/corpse-window';
import { StableWindow } from '../ui/stable-window';
import { CraftingWindow } from '../ui/crafting-window';
import { ShopWindow } from '../ui/shop-window';
import { TilePicker } from './tile-picker';
import { WorldCombat } from './world-combat';
import { WorldCorpses } from './world-corpses';
import { WorldMounts } from './world-mounts';
import { WorldNpcs } from './world-npcs';
import { WorldItems } from './world-items';
import { LoginScreen, type LoginRequest } from '../ui/login-screen';
import { showOverlay } from '../ui/overlay';
import { StatusBar } from '../ui/status-bar';

/** Lo que hace falta para pedirle al jugador un objetivo: una persona, criatura o lugar. */
interface Targeting {
  readonly banner: TargetingBanner;
  readonly worldCombat: WorldCombat;
  readonly tilePicker: TilePicker;
}

/** El libro de hechizos y cómo lanzar uno (desde el libro o desde un pergamino). */
interface Magic {
  readonly spellbook: SpellbookWindow;
  readonly cast: (spell: SpellKey, scrollId?: string) => void;
}

/** Ventanas de la economía que otras partes de la sesión necesitan abrir o actualizar. */
interface EconomyUi {
  readonly crafting: CraftingWindow;
  readonly setItemActions: (actions: ItemActions) => void;
  readonly openNpc: (id: string, role: NpcRole) => void;
  readonly renderInventory: () => void;
}

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
  /** Salida pedida por el jugador: no es una conexión perdida. */
  private loggingOut = false;
  /** Botones de pantalla que agregan otros módulos (hechizos, habilidades…). */
  private readonly hudExtras: HudButton[] = [];
  private hud: HudButtons | null = null;

  constructor(private readonly hosts: GameSessionHosts) {
    this.gateway = createGateway({
      onMessage: (message) => this.game.apply(message),
      onStatus: (status) => {
        if (status === 'closed') this.onDisconnected();
      },
    });
    this.game = new ClientGame(this.gateway, clock);
    this.login = new LoginScreen({
      subtitle: IS_SOLO ? 'Modo solo' : 'Entrá o creá tu personaje',
      askPassword: !IS_SOLO,
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
      this.gateway.send({
        type: 'join',
        name: request.name,
        appearance: request.appearance,
        ...(request.password === undefined ? {} : { password: request.password }),
      });
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
    // Orden de prioridad de un toque en el mundo: elegir lugar, personajes del pueblo,
    // criaturas (atacar) y por último objetos del suelo.
    const tilePicker = new TilePicker(renderer);
    const economy = this.setUpEconomy(drag);
    const worldNpcs = new WorldNpcs(this.game, renderer, tooltip, (id, role) =>
      economy.openNpc(id, role),
    );
    const worldCombat = new WorldCombat(this.game, renderer, tooltip);
    const worldCorpses = new WorldCorpses(this.game, renderer, tooltip);
    const worldMounts = new WorldMounts(this.game, renderer, tooltip);
    new WorldSigns(renderer, tooltip);
    const worldItems = new WorldItems(this.game, renderer, drag, tooltip);
    const input = new InputController({
      surface: renderer.canvas,
      selfScreenPosition: () => renderer.selfScreenPosition(),
      onZoom: (delta) => renderer.stepZoom(delta),
      canSteerFrom: (point) =>
        !tilePicker.isPicking &&
        !worldItems.hasItemAt(point) &&
        !worldCombat.hasTargetAt(point) &&
        !worldCorpses.hasCorpseAt(point) &&
        !worldMounts.hasPetAt(point) &&
        !worldNpcs.hasNpcAt(point),
    });
    const banner = new TargetingBanner();
    this.hosts.ui.append(banner.element);
    const targeting: Targeting = { banner, worldCombat, tilePicker };
    const magic = this.setUpMagic(targeting);
    this.setUpSocial();
    this.setUpInventory(drag, worldItems, tooltip, magic, economy, targeting, renderer);
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

  /** Tienda, banco y herrería. */
  private setUpEconomy(drag: DragController): EconomyUi {
    const shop = new ShopWindow({
      buy: (vendorId, kind, amount) => this.game.buy(vendorId, kind, amount),
      sell: (vendorId, itemId) => this.game.sell(vendorId, itemId),
    });
    const crafting = new CraftingWindow((recipe) => this.game.craft(recipe));
    const stable = new StableWindow((vendorId, mount) => this.game.buyMount(vendorId, mount));
    let bank: BankWindow | null = null;
    this.hosts.ui.append(shop.window.element, crafting.window.element, stable.window.element);

    const ui: EconomyUi = {
      crafting,
      setItemActions: (actions) => {
        bank = new BankWindow(drag, actions);
        this.hosts.ui.append(bank.window.element);
      },
      openNpc: (id, role) => {
        if (!this.game.isNear(id, VENDOR_RANGE)) {
          this.game.notify(
            `Acercate a ${VENDORS[role].name} para ${role === 'banker' ? 'usar el banco' : 'comerciar'}.`,
          );
          return;
        }
        if (role === 'banker') {
          bank?.render(this.game.inventory.bank);
          bank?.window.show();
        } else if (role === 'stablemaster') {
          stable.update(this.game.inventory.backpack);
          stable.open(id);
        } else {
          shop.open(id, role);
          shop.update(this.game.inventory.backpack);
        }
      },
      renderInventory: () => {
        shop.update(this.game.inventory.backpack);
        stable.update(this.game.inventory.backpack);
        bank?.render(this.game.inventory.bank);
      },
    };
    this.game.on('skillsChanged', (values) => crafting.render(values));
    return ui;
  }

  /** Barras de vida, maná y energía, y el aviso de fantasma. */
  private setUpVitals(): void {
    const panel = new VitalsPanel();
    const ghost = new GhostBanner();
    const effects = new EffectsBar(clock);
    this.hosts.ui.append(panel.element, effects.element, ghost.element);
    this.game.on('effectsChanged', (state) => effects.update(state));
    const render = (): void => {
      const state = this.game.vitals;
      if (!state) return;
      panel.update(state.vitals);
      ghost.setVisible(state.dead);
    };
    this.game.on('vitalsChanged', render);
    render();
  }

  /** Ventana social y modo guerra. */
  private setUpSocial(): void {
    const social = new SocialWindow((command, name, tag) =>
      this.game.socialCommand(command, name, tag),
    );
    this.hosts.ui.append(social.window.element);
    const render = (): void => {
      const state = this.game.social;
      if (state) social.render(state, this.game.selfId);
    };
    let shownInvites = '';
    this.game.on('socialChanged', (state) => {
      render();
      // Una invitación nueva abre la ventana para poder responderla.
      const invites = `${state.invites.party ?? ''}|${state.invites.guild ?? ''}`;
      if (invites !== shownInvites && invites !== '|') social.window.show();
      shownInvites = invites;
    });
    this.game.on('warModeChanged', () => this.hud?.refresh());
    render();
    this.hudExtras.push(
      { label: 'Social', key: 'o', onPress: () => social.window.toggle() },
      {
        label: 'Guerra',
        key: 'Tab',
        onPress: () => this.game.toggleWarMode(),
        pressed: () => this.game.warMode,
      },
    );
  }

  /**
   * Libro de hechizos, habilidades y atajos 1–8. Cada hechizo pide su
   * objetivo: nada (a uno mismo), alguien (para ayudar o dañar) o un lugar.
   */
  private setUpMagic({ banner, worldCombat, tilePicker }: Targeting): Magic {
    const cast = (spell: SpellKey, scrollId?: string): void => {
      const definition = SPELLS[spell];
      const from = scrollId ? { scrollId } : {};
      const done = (): void => banner.hide();
      switch (definition.target) {
        case 'self':
          this.game.castSpell(spell, from);
          return;
        case 'location':
          banner.show(`${definition.name}: tocá el lugar al que querés ir (Escape cancela).`);
          tilePicker.pick((position) => {
            done();
            this.game.castSpell(spell, { ...from, position });
          }, done);
          return;
        case 'harmful': {
          // Con un objetivo de combate elegido, se usa ese; si no, se elige con un clic.
          const target = this.game.targetId;
          if (target) {
            this.game.castSpell(spell, { ...from, targetId: target });
            return;
          }
          banner.show(`${definition.name}: tocá a quién se lo querés lanzar (Escape cancela).`);
          worldCombat.pickMobile(
            (targetId) => {
              done();
              this.game.castSpell(spell, { ...from, targetId });
            },
            done,
            { people: true, self: false },
          );
          return;
        }
        case 'beneficial':
          banner.show(
            `${definition.name}: tocá a quién se lo querés lanzar, o a vos (Escape cancela).`,
          );
          worldCombat.pickMobile(
            (targetId) => {
              done();
              this.game.castSpell(spell, { ...from, targetId });
            },
            done,
            { people: true, self: true },
          );
      }
    };

    const spellbook = new SpellbookWindow((spell) => cast(spell));
    const skills = new SkillsWindow();
    this.hosts.ui.append(spellbook.window.element, skills.window.element);
    const render = (): void => {
      const values = this.game.skills;
      spellbook.render(values);
      if (values) skills.render(values);
    };
    this.game.on('skillsChanged', render);
    this.game.on('effectsChanged', (state) => skills.renderAttributes(state.attributes));
    render();

    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey || e.altKey) return;
      const index = Number(e.key) - 1;
      const spell = index >= 0 && index < 8 ? spellbook.spellAt(index) : undefined;
      if (spell) {
        e.preventDefault();
        cast(spell);
      }
    });
    this.hudExtras.push(
      { label: 'Hechizos', key: 'l', onPress: () => spellbook.window.toggle() },
      { label: 'Habilidades', key: 'k', onPress: () => skills.window.toggle() },
    );
    return { spellbook, cast };
  }

  /** Ventanas de mochila y equipo, sus botones y la sincronización con el estado. */
  private setUpInventory(
    drag: DragController,
    worldItems: WorldItems,
    tooltip: WorldTooltip,
    magic: Magic,
    economy: EconomyUi,
    { banner, tilePicker, worldCombat }: Targeting,
    renderer: GameRenderer,
  ): void {
    const self = this.game.self;
    if (!self) return;
    const done = (): void => banner.hide();
    // Doble clic: algunos objetos abren ventanas o piden elegir un objetivo en vez de avisar al servidor.
    const actions = {
      ...worldItems.actions,
      useItem: (itemId: string) => {
        const item = this.game.findItem(itemId);
        const definition = item ? ITEMS[item.kind] : undefined;
        switch (definition?.use) {
          case 'spellbook':
            magic.spellbook.window.show();
            return;
          case 'craft':
            if (definition.crafts && isCraftSkill(definition.crafts))
              economy.crafting.open(definition.crafts);
            return;
          case 'scroll':
            if (definition.spell) magic.cast(definition.spell, itemId);
            return;
          case 'bandage':
            banner.show('Tocá a quién querés vendar, o a vos (Escape cancela).');
            worldCombat.pickMobile(
              (targetId) => {
                done();
                this.game.useOn(itemId, targetId);
              },
              done,
              { people: true, self: true },
            );
            return;
          case 'tool':
            banner.show(
              item?.kind === 'fishing-pole'
                ? 'Tocá el agua, a unos pasos, para pescar (Escape cancela).'
                : 'Tocá un árbol o una roca al lado tuyo (Escape cancela).',
            );
            tilePicker.pick((tile) => {
              done();
              this.game.gather(itemId, tile);
            }, done);
            return;
          default:
            worldItems.actions.useItem(itemId);
        }
      },
    };
    economy.setItemActions(actions);
    const backpack = new BackpackWindow(drag, actions);
    // Como en UO, la ventana de personaje tiene a mano las demás ventanas.
    const equipment = new EquipmentWindow(drag, actions, self.appearance, [
      { label: 'Mochila', onPress: () => backpack.window.toggle() },
      ...this.hudExtras.map((b) => ({
        label: b.label,
        onPress: b.onPress,
        ...(b.pressed ? { pressed: b.pressed } : {}),
      })),
      { label: 'Salir', onPress: () => this.logout() },
    ]);
    this.game.on('logoutRequested', () => this.logout());
    const buttons = (this.hud = new HudButtons([
      { label: 'Mochila', key: 'b', onPress: () => backpack.window.toggle() },
      { label: 'Personaje', key: 'c', onPress: () => equipment.window.toggle() },
      ...this.hudExtras,
    ]));
    buttons.refresh();
    equipment.refreshButtons();
    this.game.on('warModeChanged', () => equipment.refreshButtons());
    const identity = (): void => {
      const social = this.game.social;
      equipment.setIdentity({
        name: self.name,
        title: reputationTitle(social?.fame ?? 0, social?.karma ?? 0),
        notoriety: social?.notoriety ?? 'innocent',
        guildTag: social?.guild?.tag ?? null,
      });
    };
    this.game.on('socialChanged', identity);
    identity();
    // Doble clic sobre una persona: su ventana de personaje (la propia, con botones).
    const viewer = new PaperdollViewer();
    this.hosts.ui.append(viewer.window.element);
    new WorldPaperdolls(this.game, renderer, viewer, () => equipment.window.show());
    // Cuerpos que se revisan: la ventana se abre con el doble clic y se
    // actualiza cuando alguien saca algo.
    const corpse = new CorpseWindow(drag, actions, (id) => this.game.lootAll(id));
    this.hosts.ui.append(corpse.window.element);
    this.game.on('corpseChanged', ({ corpse: contents, opened }) => {
      if (!contents) {
        corpse.window.hide();
        return;
      }
      corpse.render(contents);
      if (opened) corpse.window.show();
    });
    this.hosts.ui.append(
      backpack.window.element,
      equipment.window.element,
      buttons.element,
      tooltip.element,
    );

    const render = (): void => {
      backpack.render(this.game.inventory.backpack);
      equipment.render(this.game.inventory.equipment);
      economy.renderInventory();
    };
    this.game.on('inventoryChanged', render);
    render();
  }

  /**
   * Salir del juego, como el botón de UO: se cierra la conexión (el
   * servidor guarda el personaje al soltarlo) y se vuelve a la pantalla de ingreso.
   */
  private logout(): void {
    if (this.loggingOut) return;
    this.loggingOut = true;
    this.game.notify('Saliendo… tu personaje queda guardado.');
    this.gateway.close();
    // Un momento para que el cierre llegue al servidor antes de recargar.
    window.setTimeout(() => window.location.reload(), 300);
  }

  private onDisconnected(): void {
    if (!this.inWorld || this.loggingOut) return;
    showOverlay(this.hosts.ui, 'Conexión perdida', 'Se cortó la conexión con el servidor.');
  }
}
