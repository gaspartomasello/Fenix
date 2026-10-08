import { drawCharacterFrame, type PixelImage } from '@fenix/art';
import {
  Direction,
  EQUIPMENT_SLOTS,
  NOTORIETY_NAMES,
  describeItem,
  type Appearance,
  type EquipmentLook,
  type EquipmentSlot,
  type EquippedItemSnapshot,
  type Notoriety,
} from '@fenix/shared';
import { toCanvas } from '../platform/canvas';
import { destinationFor, type ItemActions } from './backpack-window';
import { el } from './dom';
import type { DragController } from './drag-controller';
import { GameWindow } from './game-window';
import { itemIconUrl } from './item-icons';

/** El personaje se muestra grande, como en la ventana de personaje de UO. */
const FIGURE_SCALE = 3;
/** Mira hacia adelante y un poco a la izquierda, como en UO. */
const FIGURE_DIRECTION = Direction.South;
/** Si dos objetos se tapan, se agarra primero el de más arriba (armas, casco…). */
const PICK_ORDER: readonly EquipmentSlot[] = [
  'rightHand',
  'leftHand',
  'head',
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

/**
 * Ventana de personaje al estilo de UO: el personaje grande sobre un
 * pergamino con todo lo que tiene puesto. Para ponerse algo se lo suelta
 * sobre el personaje; para sacárselo se lo arrastra desde el cuerpo.
 * Al costado, los botones de las demás ventanas; abajo, nombre y título.
 */
export class EquipmentWindow {
  readonly window: GameWindow;
  private readonly figure: HTMLCanvasElement;
  private readonly name: HTMLElement;
  private readonly title: HTMLElement;
  private readonly buttons: { node: HTMLButtonElement; button: PaperdollButton }[] = [];
  private equipment: readonly EquippedItemSnapshot[] = [];
  /** Qué pixeles del dibujo pertenecen a cada objeto puesto. */
  private masks = new Map<EquipmentSlot, Uint8Array>();
  private artWidth = 0;

  constructor(
    private readonly drag: DragController,
    private readonly actions: ItemActions,
    private readonly appearance: Appearance,
    buttons: readonly PaperdollButton[],
  ) {
    this.window = new GameWindow('equipo', 'Personaje', { x: window.innerWidth - 330, y: 200 });
    this.figure = el('canvas', {
      className: 'paperdoll-figure',
      attrs: { 'data-drop': 'paperdoll', 'aria-label': 'Tu personaje con su equipo' },
    });
    this.name = el('p', { className: 'paperdoll-name' });
    this.title = el('p', { className: 'paperdoll-title' });
    const column = el(
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
    );
    this.window.body.append(
      el('div', { className: 'paperdoll' }, [
        el('div', { className: 'paperdoll-sheet' }, [this.figure, this.name, this.title]),
        column,
      ]),
      el('p', {
        className: 'window-hint',
        text: 'Soltá un objeto sobre el personaje para ponértelo; arrastralo afuera para sacártelo.',
      }),
    );
    this.figure.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.figure.addEventListener('pointermove', (e) => this.onHover(e));
    this.render([]);
  }

  render(equipment: readonly EquippedItemSnapshot[]): void {
    this.equipment = equipment;
    const look = lookOf(equipment);
    const full = drawCharacterFrame(this.appearance, FIGURE_DIRECTION, 'idle', look);
    this.artWidth = full.width;
    this.masks = new Map();
    // La silueta de cada objeto: lo que cambia en el dibujo al sacárselo.
    for (const item of equipment) {
      const without: EquipmentLook = { ...look, [item.slot]: undefined };
      const other = drawCharacterFrame(this.appearance, FIGURE_DIRECTION, 'idle', without);
      this.masks.set(item.slot, difference(full, other));
    }
    const art = toCanvas(full);
    this.figure.width = art.width * FIGURE_SCALE;
    this.figure.height = art.height * FIGURE_SCALE;
    const ctx = this.figure.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(art, 0, 0, this.figure.width, this.figure.height);
  }

  /** Nombre, título por fama y karma, y reputación (que colorea el nombre). */
  setIdentity(name: string, title: string, notoriety: Notoriety): void {
    this.name.textContent = name;
    this.name.dataset.notoriety = notoriety;
    this.title.textContent = `${title} · ${NOTORIETY_NAMES[notoriety]}`;
  }

  refreshButtons(): void {
    for (const { node, button } of this.buttons) {
      if (button.pressed) node.setAttribute('aria-pressed', String(button.pressed()));
    }
  }

  /** El objeto puesto bajo un punto del dibujo. */
  private itemAt(e: PointerEvent): EquippedItemSnapshot | undefined {
    const rect = this.figure.getBoundingClientRect();
    const scale = rect.width / this.artWidth;
    const x = Math.floor((e.clientX - rect.left) / scale);
    const y = Math.floor((e.clientY - rect.top) / scale);
    const slot = PICK_ORDER.find((s) => this.masks.get(s)?.[y * this.artWidth + x]);
    return slot ? this.equipment.find((item) => item.slot === slot) : undefined;
  }

  private onHover(e: PointerEvent): void {
    const item = this.itemAt(e);
    this.figure.title = item ? describeItem(item.kind) : '';
    this.figure.style.cursor = item ? 'grab' : 'default';
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const item = this.itemAt(e);
    if (!item) return;
    e.preventDefault();
    this.drag.begin(
      {
        id: item.id,
        iconUrl: itemIconUrl(item.kind),
        onDrop: (target) => {
          const to = destinationFor(target, this.actions, item.kind);
          if (to) this.actions.moveItem(item.id, to);
        },
        onDoubleTap: () => this.actions.useItem(item.id),
      },
      e,
    );
  }
}

function lookOf(equipment: readonly EquippedItemSnapshot[]): EquipmentLook {
  const look: EquipmentLook = {};
  for (const slot of EQUIPMENT_SLOTS) {
    const item = equipment.find((i) => i.slot === slot);
    if (item) Object.assign(look, { [slot]: item.kind });
  }
  return look;
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
