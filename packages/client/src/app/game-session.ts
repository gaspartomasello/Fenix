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
import { Minimap } from '../ui/minimap';
import { WorldMap } from '../ui/world-map';
import { GhostBanner } from '../ui/ghost-banner';
import { SkillsWindow } from '../ui/skills-window';
import { SpellbookWindow } from '../ui/spellbook-window';
import { TargetingBanner } from '../ui/targeting-banner';
import { VitalsPanel } from '../ui/vitals-panel';
import { EffectsBar } from '../ui/effects-bar';
import {
  ITEMS,
  NPC_CHATTER,
  SKILL_NAMES,
  VENDORS,
  VENDOR_RANGE,
  isMerchant,
  reputationTitle,
  skillNeedsTarget,
  type ActiveSkill,
  type ItemSnapshot,
  type NpcRole,
  type EquipmentLook,
} from '@fenix/shared';
import type { ItemActions } from '../ui/backpack-window';
import { BankWindow } from '../ui/bank-window';
import { BookWindow } from '../ui/book-window';
import { TreasureMapWindow } from '../ui/treasure-map-window';
import { ShipWindow } from '../ui/ship-window';
import { WorldShips } from './world-ships';
import { DyeWindow } from '../ui/dye-window';
import { ItemCatalogWindow } from '../ui/item-catalog-window';
import { TrackingArrow, TrackingWindow } from '../ui/tracking-window';
import { StatusWindow, type StatusInfo } from '../ui/status-window';
import { QuestJournal, QuestOfferWindow } from '../ui/quest-windows';
import { ContainerWindow } from '../ui/container-window';
import { CorpseWindow } from '../ui/corpse-window';
import { StableWindow } from '../ui/stable-window';
import { CraftingWindow } from '../ui/crafting-window';
import { ShopWindow } from '../ui/shop-window';
import { TilePicker } from './tile-picker';
import { HotbarBar, type HotbarOptions } from '../ui/hotbar-bar';
import { RunePicker } from '../ui/rune-picker';
import { Joystick } from '../input/joystick';
import { TouchHud, enterFullscreen, prefersTouch } from '../ui/touch-hud';
import {
  ATTACK_RING_SIZE,
  HOTBAR_SIZE,
  addToHotbar,
  defaultAttackRing,
  defaultHotbar,
  findInBackpack,
  parseHotbar,
  type HotbarSlot,
} from '../core/hotbar';
import { WorldCombat } from './world-combat';
import { WorldCorpses } from './world-corpses';
import { WorldContainers } from './world-containers';
import { WorldDoors } from './world-doors';
import { WorldMounts } from './world-mounts';
import { WorldNpcs } from './world-npcs';
import { WorldItems } from './world-items';
import { LoginScreen, type LoginRequest } from '../ui/login-screen';
import { CharacterListScreen } from '../ui/character-list-screen';
import { CreationScreen } from '../ui/creation-screen';
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
  /** Usar una habilidad: fisgonear y robar piden elegir a la persona de al lado. */
  readonly useSkill: (skill: ActiveSkill) => void;
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
  private readonly characterList: CharacterListScreen;
  /** La pantalla de creación (se arma de nuevo cada vez). */
  private creation: CreationScreen | null = null;
  /** Qué pantalla de antes del mundo está a la vista. */
  private screen: 'login' | 'list' | 'create' = 'login';
  private inWorld = false;
  /** Salida pedida por el jugador: no es una conexión perdida. */
  private loggingOut = false;
  /** Los atajos alrededor de Atacar (solo con el dedo). */
  private attackRing: HTMLElement | null = null;
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
    // En ninguna parte del juego aparece el menú del navegador con el clic
    // derecho (en el mundo, el clic derecho mueve al personaje). Solo en los
    // campos de texto, para poder copiar y pegar.
    document.addEventListener('contextmenu', (e) => {
      if (!isEditable(e.target)) e.preventDefault();
    });
    this.login = new LoginScreen({
      subtitle: IS_SOLO ? 'Modo solo' : 'Entrá a tu cuenta',
      askPassword: !IS_SOLO,
      onSubmit: (request) => void this.enter(request),
    });
    this.characterList = new CharacterListScreen({
      onPlay: (name) => this.gateway.send({ type: 'play', name }),
      onDelete: (name) => this.gateway.send({ type: 'deleteCharacter', name }),
      onCreate: () => this.showCreation(),
    });
    this.game.on('account', (account) => {
      this.characterList.show(account);
      this.showScreen('list');
    });
    this.game.on('joinRejected', ({ reason }) => {
      if (this.screen === 'create') this.creation?.showError(reason);
      else if (this.screen === 'list') this.characterList.showError(reason);
      else {
        this.login.showError(reason);
        this.gateway.close();
      }
    });
    const offReady = this.game.on('ready', () => {
      offReady();
      void this.startWorld();
    });
  }

  start(): void {
    this.hosts.ui.append(this.login.element);
    this.login.focus();
  }

  /** Muestra una de las pantallas de antes del mundo (cuenta, personajes, creación). */
  private showScreen(screen: 'login' | 'list' | 'create'): void {
    this.screen = screen;
    this.login.element.remove();
    this.characterList.element.remove();
    if (screen !== 'create') {
      this.creation?.destroy();
      this.creation = null;
    }
    if (screen === 'login') {
      this.hosts.ui.append(this.login.element);
      this.login.focus();
    } else if (screen === 'list') this.hosts.ui.append(this.characterList.element);
  }

  private showCreation(): void {
    this.creation?.destroy();
    this.creation = new CreationScreen({
      onCreate: (creation) => this.gateway.send({ type: 'createCharacter', creation }),
      onBack: () => this.showScreen('list'),
    });
    this.showScreen('create');
    this.hosts.ui.append(this.creation.element);
    this.creation.focus();
  }

  private async enter(request: LoginRequest): Promise<void> {
    try {
      await this.gateway.connect();
      this.gateway.send({
        type: 'login',
        account: request.account,
        create: request.create,
        ...(request.password === undefined ? {} : { password: request.password }),
      });
    } catch (error) {
      this.login.showError(error instanceof Error ? error.message : 'Error de conexión');
    }
  }

  private async startWorld(): Promise<void> {
    this.inWorld = true;
    this.login.destroy();
    this.characterList.destroy();
    this.creation?.destroy();
    this.creation = null;

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
    worldNpcs.busy = () => worldCombat.isPicking;
    const worldCorpses = new WorldCorpses(this.game, renderer, tooltip);
    const worldDoors = new WorldDoors(this.game, renderer, tooltip);
    const worldContainers = new WorldContainers(this.game, renderer, tooltip);
    const worldMounts = new WorldMounts(this.game, renderer, tooltip);
    new WorldSigns(renderer, tooltip);
    new WorldShips(this.game, renderer, tooltip);
    const worldItems = new WorldItems(this.game, renderer, drag, tooltip);
    // Con el dedo: joystick para caminar y los controles táctiles (ver setUpTouch).
    const touch = prefersTouch();
    const joystick = touch ? new Joystick() : null;
    if (touch) {
      document.documentElement.classList.add('touch-ui');
      if (joystick) this.hosts.ui.append(joystick.element);
    }
    const input = new InputController({
      extraIntent: () => joystick?.intent() ?? null,
      surface: renderer.canvas,
      selfScreenPosition: () => renderer.selfScreenPosition(),
      onZoom: (delta) => renderer.stepZoom(delta),
      canSteerFrom: (point) =>
        !tilePicker.isPicking &&
        !worldItems.hasItemAt(point) &&
        !worldCombat.hasTargetAt(point) &&
        !worldCorpses.hasCorpseAt(point) &&
        !worldDoors.hasDoorAt(point) &&
        !worldContainers.hasContainerAt(point) &&
        !worldMounts.hasPetAt(point) &&
        !worldNpcs.hasNpcAt(point),
    });
    const banner = new TargetingBanner();
    this.hosts.ui.append(banner.element, banner.cancelButton);
    const targeting: Targeting = { banner, worldCombat, tilePicker };
    const magic = this.setUpMagic(targeting);
    this.setUpSocial();
    this.setUpQuests();
    const chat = new ChatPanel((text) => this.game.say(text));
    // Rastrear: la ventana para elegir qué buscar y la flecha hacia el rastro que se sigue.
    const trackingArrow = new TrackingArrow();
    const trackingWindow = new TrackingWindow(
      (category) => this.game.track(category),
      (sighting) => {
        trackingArrow.follow(sighting.id, sighting.name);
        this.game.followTrack(sighting.id);
      },
    );
    this.hosts.ui.append(trackingWindow.window.element, trackingArrow.element);
    this.game.on('trackingRequested', () => trackingWindow.open());
    this.game.on('trackingFound', ({ category, found }) => trackingWindow.show(category, found));
    this.game.on('trackPoint', (point) => {
      if ('lost' in point) {
        if (trackingArrow.followingId === point.targetId) {
          trackingArrow.lose();
          chat.append({ kind: 'system', text: 'Perdiste el rastro.' });
        }
      } else trackingArrow.point(point.targetId, point.name, { x: point.x, y: point.y });
    });
    const menu = this.setUpInventory(
      drag,
      worldItems,
      tooltip,
      magic,
      economy,
      targeting,
      renderer,
    );
    if (touch) this.setUpTouch(menu, chat);
    this.setUpVitals();
    const status = new StatusBar();
    if (this.hud) status.dock(this.hud.element);
    this.hosts.ui.append(status.element, chat.element);
    this.game.on('log', (entry) => chat.append(entry));
    chat.append({ kind: 'system', text: 'Bienvenido a Fenix.' });

    const frame = (): void => {
      const intent = input.movementIntent();
      if (intent) this.game.requestStep(intent.direction, intent.mode);
      this.game.update();
      renderer.render(clock());
      const bounds = renderer.canvas.getBoundingClientRect();
      const center = renderer.selfScreenPosition();
      trackingArrow.update(this.game.self?.position ?? null, {
        x: bounds.left + center.x,
        y: bounds.top + center.y,
      });

      const self = this.game.self;
      if (self) {
        const time = this.game.worldTime();
        status.update({
          name: self.name,
          region: this.game.currentRegion()?.name ?? 'Tierras salvajes',
          time: time ? formatGameTime(time.dayProgress) : '--:--',
          x: (this.game.selfSeenAt() ?? self.position).x,
          y: (this.game.selfSeenAt() ?? self.position).y,
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
        // Los vecinos cuentan lo que les pasa (y a veces piden ayuda): lo decide el servidor.
        if (role === 'townsfolk') {
          this.game.talkNpc(id);
          return;
        }
        // Con los guardias se charla: dicen una frase.
        if (!isMerchant(role)) {
          const lines = NPC_CHATTER[role] ?? [VENDORS[role].greeting];
          const line = lines[Math.floor(Math.random() * lines.length)] ?? VENDORS[role].greeting;
          this.game.notify(`${this.game.entity(id)?.name ?? VENDORS[role].name}: ${line}`);
          return;
        }
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
    // Escondido: un aviso chico (uno mismo, además, se ve translúcido).
    const hiddenBadge = document.createElement('div');
    hiddenBadge.className = 'hidden-badge';
    hiddenBadge.textContent = 'Escondido';
    hiddenBadge.hidden = true;
    this.game.on('hiddenChanged', (hidden) => (hiddenBadge.hidden = !hidden));
    this.hosts.ui.append(panel.element, effects.element, ghost.element, hiddenBadge);
    this.game.on('effectsChanged', (state) => effects.update(state));
    const render = (): void => {
      const state = this.game.vitals;
      if (!state) return;
      panel.update(state.vitals);
      ghost.setVisible(state.dead);
    };
    this.game.on('vitalsChanged', render);
    render();

    // Doble clic (o doble toque) sobre las barras: el panel de estado, como en UO.
    const status = new StatusWindow();
    this.hosts.ui.append(status.window.element);
    const info = (): StatusInfo => {
      const { backpack, equipment } = this.game.inventory;
      const look: EquipmentLook = Object.fromEntries(equipment.map((i) => [i.slot, i.kind]));
      const { weight, max } = this.game.load;
      return {
        name: this.game.self?.name ?? '',
        attributes: this.game.effects?.attributes ?? null,
        vitals: this.game.vitals?.vitals ?? null,
        equipment: look,
        weight,
        maxWeight: max,
        gold: backpack.filter((i) => i.kind === 'gold').reduce((sum, i) => sum + i.amount, 0),
      };
    };
    let lastTap = 0;
    panel.element.addEventListener('pointerup', () => {
      const now = performance.now();
      if (now - lastTap < 400) {
        lastTap = 0;
        status.open(info());
      } else lastTap = now;
    });
    panel.element.title = 'Doble clic: estado del personaje';
    const refresh = (): void => {
      if (status.visible) status.render(info());
    };
    this.game.on('vitalsChanged', refresh);
    this.game.on('inventoryChanged', refresh);
    this.game.on('effectsChanged', refresh);
  }

  /** Ventana social y modo guerra. */
  /** Misiones de los vecinos: la oferta al hablarles y el diario (tecla J). */
  private setUpQuests(): void {
    const offer = new QuestOfferWindow((npcId) => this.game.acceptQuest(npcId));
    const journal = new QuestJournal((giver) => this.game.abandonQuest(giver));
    this.game.on('questOffered', ({ npcId, quest }) => offer.open(npcId, quest));
    this.game.on('questsChanged', (quests) => journal.render(quests));
    this.game.on('legendsChanged', (legends) => journal.renderLegends(legends));
    this.hosts.ui.append(offer.window.element, journal.window.element);
    this.hudExtras.push({ label: 'Misiones', key: 'j', onPress: () => journal.window.toggle() });
  }

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
    const runes = new RunePicker((spell, runeId, scrollId) =>
      this.game.castSpell(spell, { runeId, ...(scrollId ? { scrollId } : {}) }),
    );
    this.hosts.ui.append(runes.window.element);
    const cast = (spell: SpellKey, scrollId?: string): void => {
      const definition = SPELLS[spell];
      const from = scrollId ? { scrollId } : {};
      const done = (): void => banner.hide();
      switch (definition.target) {
        case 'rune': {
          // Viajes: se elige la runa en una ventana (también leyendo un pergamino).
          const warning = runes.open(spell, this.game.inventory.backpack, scrollId);
          if (warning) this.game.notify(warning);
          return;
        }
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
    const useSkill = (skill: ActiveSkill): void => {
      if (!skillNeedsTarget(skill)) return this.game.useSkill(skill);
      banner.show(`${SKILL_NAMES[skill]}: tocá a la persona que tenés al lado (Escape cancela).`);
      worldCombat.pickMobile(
        (targetId) => {
          banner.hide();
          this.game.useSkill(skill, targetId);
        },
        () => banner.hide(),
        { people: true, self: false, npcs: true },
      );
    };
    const skills = new SkillsWindow(useSkill);
    this.hosts.ui.append(spellbook.window.element, skills.window.element);
    const render = (): void => {
      const values = this.game.skills;
      spellbook.render(values);
      if (values) skills.render(values);
    };
    this.game.on('skillsChanged', render);
    this.game.on('effectsChanged', (state) => skills.renderAttributes(state.attributes));
    render();

    // Con el libro abierto, las teclas 1 a 8 lanzan los hechizos de su página;
    // si no, los números son de la barra de atajos.
    window.addEventListener('keydown', (e) => {
      const typing =
        e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (!spellbook.window.visible) return;
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
    return { spellbook, cast, useSkill };
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
  ): HudButton[] {
    const self = this.game.self;
    if (!self) return [];
    const done = (): void => banner.hide();
    const dyeWindow = new DyeWindow((itemId, hue) => this.game.dye(itemId, hue));
    this.hosts.ui.append(dyeWindow.window.element);
    const carried = (): { items: ItemSnapshot[]; dyes: number } => {
      const { backpack, equipment } = this.game.inventory;
      const dyes = backpack.filter((i) => i.kind === 'dyes').reduce((n, i) => n + i.amount, 0);
      return { items: [...equipment, ...backpack], dyes };
    };
    this.game.on('inventoryChanged', () => {
      if (!dyeWindow.window.visible) return;
      const { items, dyes } = carried();
      dyeWindow.update(items, dyes);
    });
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
          case 'dye': {
            const { items, dyes } = carried();
            dyeWindow.open(items, dyes);
            return;
          }
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
          case 'lockpick':
            banner.show('Tocá el cofre que querés forzar, al lado tuyo (Escape cancela).');
            tilePicker.pick((tile) => {
              done();
              this.game.pickLock(itemId, tile);
            }, done);
            return;
          case 'dig':
            banner.show('Tocá dónde querés cavar, al lado tuyo (Escape cancela).');
            tilePicker.pick((tile) => {
              done();
              this.game.dig(itemId, tile);
            }, done);
            return;
          default:
            worldItems.actions.useItem(itemId);
        }
      },
    };
    economy.setItemActions(actions);
    // Administrador: la ventana de todos los objetos (`/objetos`) y borrar con `/eliminar`.
    const catalog = new ItemCatalogWindow((kind, amount) => this.game.createItem(kind, amount));
    this.hosts.ui.append(catalog.window.element);
    this.game.on('itemCatalogOpened', () => catalog.open());
    this.game.on('deletePickRequested', () => {
      banner.show('Tocá el objeto de tu mochila que querés eliminar (Escape cancela).');
      drag.pickItem((itemId) => {
        done();
        this.game.deleteItem(itemId);
      }, done);
    });
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
    const minimap = new Minimap(this.game, () => buttons.refresh());
    const worldMap = new WorldMap(this.game, () => buttons.refresh());
    const hudList: HudButton[] = [
      { label: 'Mochila', key: 'b', onPress: () => backpack.window.toggle() },
      { label: 'Personaje', key: 'c', onPress: () => equipment.window.toggle() },
      ...this.hudExtras,
      {
        label: 'Mapa',
        key: 'm',
        // Cerrado → minimapa → mapa del mundo → cerrado.
        onPress: () => {
          if (worldMap.open) worldMap.show(false);
          else if (minimap.open) {
            minimap.show(false);
            worldMap.show(true);
          } else minimap.show(true);
          buttons.refresh();
        },
        pressed: () => minimap.open || worldMap.open,
      },
    ];
    const buttons = (this.hud = new HudButtons(hudList));
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
    // Recipientes abiertos (bolsas, cofres, barriles…): una ventana por cada uno.
    const book = new BookWindow((itemId, title, page, text) =>
      this.game.writeBook(itemId, title, page, text),
    );
    this.game.on('bookOpened', (contents) => book.open(contents));
    this.hosts.ui.append(book.window.element);
    const treasureMap = new TreasureMapWindow(
      () => this.game.map,
      () => this.game.selfSeenAt(),
    );
    this.game.on('treasureMapOpened', (contents) => treasureMap.open(contents));
    this.hosts.ui.append(treasureMap.window.element);
    const shipWindow = new ShipWindow({
      order: (id, order) => this.game.shipOrder(id, order),
      action: (id, action) => this.game.shipAction(id, action),
      security: (id, change) => this.game.shipSecurity(id, change),
    });
    this.game.on('shipPanelOpened', ({ shipId, level, security }) =>
      shipWindow.open(
        shipId,
        level,
        security,
        this.game.ships.find((s) => s.id === shipId),
      ),
    );
    this.game.on('shipsChanged', (ships) => shipWindow.update(ships));
    this.hosts.ui.append(shipWindow.window.element);
    const containers = new Map<string, ContainerWindow>();
    let opened = 0;
    this.game.on('containerChanged', ({ containerId, container, opened: requested }) => {
      let window = containers.get(containerId);
      if (!container) {
        window?.window.hide();
        return;
      }
      if (!window) {
        window = new ContainerWindow(containerId, drag, actions, opened++);
        containers.set(containerId, window);
        this.hosts.ui.append(window.window.element);
      }
      window.render(container);
      if (requested) window.window.show();
    });
    this.hosts.ui.append(
      backpack.window.element,
      equipment.window.element,
      buttons.element,
      tooltip.element,
      minimap.element,
      worldMap.element,
    );

    const hotbar = this.setUpHotbar(actions, magic);
    const render = (): void => {
      backpack.render(this.game.inventory.backpack);
      equipment.render(this.game.inventory.equipment);
      economy.renderInventory();
      hotbar();
    };
    this.game.on('inventoryChanged', render);
    render();
    return [...hudList, { label: 'Salir', key: '', onPress: () => this.logout() }];
  }

  /**
   * Celular: botón de atacar al más cercano, un par de botones arriba y el
   * resto en un menú; el chat queda plegado hasta que se pide hablar.
   */
  private setUpTouch(buttons: readonly HudButton[], chat: ChatPanel): void {
    const pick = (label: string): HudButton | undefined => buttons.find((b) => b.label === label);
    const quick = ['Mochila', 'Mapa'].flatMap((label) => pick(label) ?? []);
    const rest = buttons.filter((b) => !quick.includes(b) && b.label !== 'Salir');
    const hud = new TouchHud({
      attack: () => this.game.attackNearest(),
      nextTarget: () => this.game.attackNearest(true),
      stopAttack: () => this.game.stopAttack(),
      hasTarget: () => this.game.targetId !== null,
      quick,
      ring: this.attackRing,
      menu: [
        ...rest,
        { label: 'Hablar', onPress: () => chat.openInput() },
        { label: 'Pantalla completa', onPress: () => void enterFullscreen() },
        ...buttons.filter((b) => b.label === 'Salir'),
      ],
    });
    this.hosts.ui.append(hud.actions, hud.top, hud.sheet, hud.rotateHint);
    chat.tapToType();
    keepViewport();
    this.game.on('targetChanged', () => hud.refresh());
    this.game.on('warModeChanged', () => hud.refresh());
  }

  /**
   * Barra de atajos: vendas, pociones y hechizos a un toque (o con las
   * teclas 1 a 0). Las vendas y los hechizos de ayuda van a uno mismo, sin
   * tener que elegir: es lo que se quiere casi siempre en medio de una pelea.
   * Devuelve con qué volver a dibujarla.
   */
  private setUpHotbar(actions: ItemActions, magic: Magic): () => void {
    const use = (slot: HotbarSlot): void => {
      const selfId = this.game.selfId;
      if (!slot || !selfId) return;
      if (slot.type === 'skill') {
        magic.useSkill(slot.skill);
        return;
      }
      if (slot.type === 'spell') {
        if (SPELLS[slot.spell].target === 'beneficial')
          this.game.castSpell(slot.spell, { targetId: selfId });
        else magic.cast(slot.spell);
        return;
      }
      const item = findInBackpack(this.game.inventory.backpack, slot.kind);
      if (!item) {
        this.game.notify(`No te quedan ${ITEMS[slot.kind].plural} en la mochila.`);
        return;
      }
      if (ITEMS[slot.kind].use === 'bandage') this.game.useOn(item.id, selfId);
      else actions.useItem(item.id);
    };
    const main = this.hotbar(HOTBAR_STORAGE_KEY, HOTBAR_SIZE, defaultHotbar, use);
    magic.spellbook.onPin((spell) => {
      main.add({ type: 'spell', spell });
      this.game.notify(`${SPELLS[spell].name} quedó en la barra de atajos.`);
    });
    // Con el dedo, cuatro atajos más alrededor del botón de atacar.
    const ring = document.documentElement.classList.contains('touch-ui')
      ? this.hotbar(ATTACK_RING_STORAGE_KEY, ATTACK_RING_SIZE, defaultAttackRing, use, {
          className: 'attack-ring',
          label: 'Atajos alrededor de Atacar',
          keys: false,
          editorId: 'atajo-atacar',
        })
      : null;
    this.attackRing = ring?.element ?? null;
    const render = (): void => {
      main.render();
      ring?.render();
    };
    this.game.on('skillsChanged', render);
    return render;
  }

  /** Una barra de atajos guardada en el navegador con su propia clave. */
  private hotbar(
    storageKey: string,
    size: number,
    defaults: () => HotbarSlot[],
    use: (slot: HotbarSlot) => void,
    options: HotbarOptions = {},
  ): { element: HTMLElement; render: () => void; add: (slot: NonNullable<HotbarSlot>) => void } {
    let slots = parseHotbar(readStorage(storageKey), size, defaults);
    const save = (next: HotbarSlot[]): void => {
      slots = next;
      writeStorage(storageKey, JSON.stringify(slots));
      render();
    };
    const bar = new HotbarBar(
      {
        onUse: (index) => {
          bar.flash(index);
          use(slots[index] ?? null);
        },
        onAssign: (index, slot) => save(slots.map((s, i) => (i === index ? slot : s))),
      },
      { ...options, size },
    );
    this.hosts.ui.append(bar.editor.element);
    if (options.className === undefined) this.hosts.ui.append(bar.element);
    const render = (): void => bar.render(slots, this.game.inventory.backpack, this.game.skills);
    return { element: bar.element, render, add: (slot) => save(addToHotbar(slots, slot)) };
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
    if (this.loggingOut) return;
    if (!this.inWorld) {
      // Antes de entrar al mundo: de vuelta a la cuenta.
      if (this.screen !== 'login') {
        this.showScreen('login');
        this.login.showError('Se cortó la conexión con el servidor.');
      }
      return;
    }
    showOverlay(this.hosts.ui, 'Conexión perdida', 'Se cortó la conexión con el servidor.');
  }
}

/**
 * El celular no tiene que quedar acercado: al girarlo (o al cerrar el
 * teclado) algunos navegadores dejan la página ampliada y solo se arreglaba
 * tocando dos veces. Se frena el acercar del navegador (pellizcar y doble
 * toque; el del juego va por su cuenta) y, al girar, se vuelve a escala 1.
 */
function keepViewport(): void {
  const stop = (e: Event): void => e.preventDefault();
  // Safari: gestos de pellizcar de la página.
  for (const type of ['gesturestart', 'gesturechange', 'gestureend'])
    document.addEventListener(type, stop, { passive: false });
  // Dos dedos sobre la página (fuera del juego, que usa eventos de puntero).
  document.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches.length > 1) e.preventDefault();
    },
    { passive: false },
  );
  document.addEventListener('dblclick', stop, { passive: false });
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  const reset = (): void => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.matches('input, textarea')) active.blur();
    if (meta) {
      // Cambiar la etiqueta obliga al navegador a volver a aplicarla.
      const content = meta.content;
      meta.content = 'width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0';
      window.requestAnimationFrame(() => (meta.content = content));
    }
    window.scrollTo(0, 0);
  };
  screen.orientation?.addEventListener('change', reset);
  window.addEventListener('orientationchange', reset);
}

const HOTBAR_STORAGE_KEY = 'fenix.atajos';
const ATTACK_RING_STORAGE_KEY = 'fenix.atajos-atacar';

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Sin almacenamiento (ventana privada): los atajos duran hasta recargar.
  }
}

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}
