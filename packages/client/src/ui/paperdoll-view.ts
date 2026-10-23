import { drawPaperdoll, type PixelImage } from '@fenix/art';
import {
  EQUIPMENT_SLOTS,
  NOTORIETY_NAMES,
  SLOT_LABELS,
  describeItem,
  type Appearance,
  type EquipmentLook,
  type EquipmentSlot,
  type ItemKind,
  type Notoriety,
  type NpcRole,
} from '@fenix/shared';
import { toCanvas } from '../platform/canvas';
import { el } from './dom';
import { itemIconUrl } from './item-icons';

/**
 * Casilleros a la izquierda, en dos columnas: la armadura de la cabeza a los
 * pies, y lo que va en las manos y la capa.
 */
const SLOT_ORDER: readonly EquipmentSlot[] = [
  'head',
  'neck',
  'torso',
  'arms',
  'hands',
  'legs',
  'feet',
  'cloak',
  'rightHand',
  'leftHand',
];
/** Dibujo tenue de fondo de cada casillero vacío, para entender qué va ahí. */
const SLOT_HINTS: Readonly<Record<EquipmentSlot, ItemKind>> = {
  head: 'plate-helm',
  neck: 'plate-gorget',
  torso: 'plate-chest',
  arms: 'plate-arms',
  hands: 'plate-gloves',
  legs: 'plate-legs',
  feet: 'boots',
  cloak: 'cloak',
  rightHand: 'longsword',
  leftHand: 'heater-shield',
};

/** Si dos objetos se tapan en el dibujo, se agarra primero el de más arriba. */
const PICK_ORDER: readonly EquipmentSlot[] = [
  'rightHand',
  'leftHand',
  'hands',
  'head',
  'neck',
  'arms',
  'cloak',
  'torso',
  'legs',
  'feet',
];

export interface PaperdollButton {
  readonly label: string;
  readonly onPress: () => void;
  /** Botón que queda presionado (por ejemplo, Guerra). */
  readonly pressed?: () => boolean;
}

export interface PaperdollIdentity {
  readonly name: string;
  /** Título (por fama y karma) u oficio; puede faltar si no se conoce. */
  readonly title: string | null;
  readonly notoriety: Notoriety;
  readonly guildTag: string | null;
}

/** Qué se ve en la ventana: apariencia, ropa de oficio y lo que tiene puesto. */
export interface PaperdollLook {
  readonly appearance: Appearance;
  readonly role: NpcRole | null;
  readonly equipment: Readonly<Partial<Record<EquipmentSlot, ItemKind>>>;
  /** Colores teñidos, por lugar. */
  readonly hues?: Readonly<Partial<Record<EquipmentSlot, number>>>;
}

/** Cómo se interactúa con los casilleros y el dibujo (solo en la ventana propia). */
export interface PaperdollInteraction {
  /** Empezar a arrastrar el objeto puesto en un lugar del cuerpo. */
  readonly grab: (slot: EquipmentSlot, e: PointerEvent) => void;
}

/**
 * Ventana de personaje al estilo de UO: marco de piedra, casilleros a la
 * izquierda con lo que tiene puesto, el personaje grande y de frente en el
 * centro, botones a la derecha y una placa con nombre y título. Sirve para
 * el propio personaje (con botones y arrastrar) o para mirar a otro.
 */
export class PaperdollView {
  readonly element: HTMLElement;
  private readonly figure: HTMLCanvasElement;
  private readonly name: HTMLElement;
  private readonly title: HTMLElement;
  private readonly slots = new Map<EquipmentSlot, HTMLElement>();
  private readonly buttons: { node: HTMLButtonElement; button: PaperdollButton }[] = [];
  private look: PaperdollLook | null = null;
  private masks = new Map<EquipmentSlot, Uint8Array>();
  private artWidth = 0;

  constructor(
    private readonly interaction: PaperdollInteraction | null,
    buttons: readonly PaperdollButton[] = [],
  ) {
    this.figure = el('canvas', {
      className: 'paperdoll-figure',
      attrs: interaction
        ? { 'data-drop': 'paperdoll', 'aria-label': 'Tu personaje con su equipo' }
        : { 'aria-label': 'Personaje con su equipo' },
    });
    this.name = el('p', { className: 'paperdoll-name' });
    this.title = el('p', { className: 'paperdoll-title' });

    const slotColumn = el(
      'div',
      { className: 'paperdoll-slots' },
      SLOT_ORDER.map((slot) => {
        const box = el('div', {
          className: 'paperdoll-slot',
          attrs: interaction
            ? { 'data-drop': 'slot', 'data-slot': slot, title: SLOT_LABELS[slot] }
            : { title: SLOT_LABELS[slot] },
        });
        if (interaction) {
          box.addEventListener('pointerdown', (e) => {
            if (!box.firstChild || (e.pointerType === 'mouse' && e.button !== 0)) return;
            e.preventDefault();
            interaction.grab(slot, e);
          });
        }
        this.slots.set(slot, box);
        return box;
      }),
    );

    const columns = [slotColumn, el('div', { className: 'paperdoll-sheet' }, [this.figure])];
    if (buttons.length > 0) {
      columns.push(
        el(
          'div',
          { className: 'paperdoll-buttons' },
          buttons.map((button) => {
            const node = el('button', {
              className: 'paperdoll-button',
              text: button.label,
              attrs: { type: 'button' },
            });
            node.addEventListener('click', () => {
              button.onPress();
              this.refreshButtons();
            });
            this.buttons.push({ node, button });
            return node;
          }),
        ),
      );
    }
    this.element = el('div', { className: 'paperdoll' }, [
      el('div', { className: 'paperdoll-frame' }, columns),
      el('div', { className: 'paperdoll-plate' }, [this.name, this.title]),
    ]);

    if (interaction) {
      this.figure.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        const slot = this.slotAt(e);
        if (!slot) return;
        e.preventDefault();
        interaction.grab(slot, e);
      });
    }
    this.figure.addEventListener('pointermove', (e) => {
      const slot = this.slotAt(e);
      const kind = slot ? this.look?.equipment[slot] : undefined;
      this.figure.title = kind ? describeItem(kind) : '';
      this.figure.style.cursor = kind && interaction ? 'grab' : 'default';
    });
  }

  render(look: PaperdollLook): void {
    this.look = look;
    const equipment: EquipmentLook = { ...look.equipment };
    const hues = look.hues ?? {};
    // El dibujo grande y con detalle (no el sprite del mundo agrandado).
    const art = toCanvas(drawPaperdoll(look.appearance, equipment, look.role, hues));
    this.figure.width = art.width;
    this.figure.height = art.height;
    this.figure.getContext('2d')?.drawImage(art, 0, 0);
    // La silueta de cada objeto, para agarrarlo del dibujo: lo que cambia al
    // sacárselo, en un dibujo chico (mucho más rápido) de la misma pose.
    const small = (e: EquipmentLook): PixelImage =>
      drawPaperdoll(look.appearance, e, look.role, hues, 1);
    const full = small(equipment);
    this.artWidth = full.width;
    this.masks = new Map();
    for (const slot of EQUIPMENT_SLOTS) {
      if (!look.equipment[slot]) continue;
      this.masks.set(slot, difference(full, small({ ...equipment, [slot]: undefined })));
    }

    for (const [slot, box] of this.slots) {
      const kind = look.equipment[slot];
      box.replaceChildren();
      box.title = kind ? `${SLOT_LABELS[slot]}: ${describeItem(kind)}` : SLOT_LABELS[slot];
      box.classList.toggle('paperdoll-slot--filled', kind !== undefined);
      if (kind) {
        const src = itemIconUrl(kind, 1, look.hues?.[slot]);
        box.append(el('img', { attrs: { src, alt: '', draggable: 'false' } }));
      } else {
        box.append(
          el('img', {
            className: 'paperdoll-slot-hint',
            attrs: { src: itemIconUrl(SLOT_HINTS[slot]), alt: '', draggable: 'false' },
          }),
        );
      }
    }
  }

  setIdentity({ name, title, notoriety, guildTag }: PaperdollIdentity): void {
    this.name.textContent = guildTag ? `${name} [${guildTag}]` : name;
    this.name.dataset.notoriety = notoriety;
    this.title.textContent = [title, NOTORIETY_NAMES[notoriety]].filter(Boolean).join(' · ');
  }

  refreshButtons(): void {
    for (const { node, button } of this.buttons) {
      if (button.pressed) node.setAttribute('aria-pressed', String(button.pressed()));
    }
  }

  /** El lugar del cuerpo cuyo objeto está bajo el puntero, en el dibujo. */
  private slotAt(e: PointerEvent): EquipmentSlot | undefined {
    if (this.artWidth === 0) return undefined;
    const rect = this.figure.getBoundingClientRect();
    const scale = rect.width / this.artWidth;
    const x = Math.floor((e.clientX - rect.left) / scale);
    const y = Math.floor((e.clientY - rect.top) / scale);
    return PICK_ORDER.find((s) => this.masks.get(s)?.[y * this.artWidth + x]);
  }
}

/** Pixeles que cambian entre dos dibujos del mismo tamaño. */
function difference(a: PixelImage, b: PixelImage): Uint8Array {
  const mask = new Uint8Array(a.width * a.height);
  for (let i = 0; i < mask.length; i++) {
    for (let c = 0; c < 4; c++) {
      if (a.data[i * 4 + c] !== b.data[i * 4 + c]) {
        mask[i] = 1;
        break;
      }
    }
  }
  return mask;
}
