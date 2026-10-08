import { drawCharacterFrame } from '@fenix/art';
import {
  Direction,
  EQUIPMENT_SLOTS,
  SLOT_LABELS,
  describeItem,
  type Appearance,
  type EquipmentLook,
  type EquipmentSlot,
  type EquippedItemSnapshot,
  type ItemKind,
} from '@fenix/shared';
import { toCanvas } from '../platform/canvas';
import { destinationFor, type ItemActions } from './backpack-window';
import { el } from './dom';
import type { DragController } from './drag-controller';
import { GameWindow } from './game-window';
import { itemIconUrl } from './item-icons';

const PREVIEW_SCALE = 2;
const LEFT_SLOTS: readonly EquipmentSlot[] = ['head', 'cloak', 'torso', 'legs'];
const RIGHT_SLOTS: readonly EquipmentSlot[] = ['rightHand', 'leftHand', 'feet'];

/** Ventana de equipo: el personaje con lo que tiene puesto y un casillero por lugar del cuerpo. */
export class EquipmentWindow {
  readonly window: GameWindow;
  private readonly preview: HTMLCanvasElement;
  private readonly slots = new Map<EquipmentSlot, HTMLElement>();

  constructor(
    private readonly drag: DragController,
    private readonly actions: ItemActions,
    private readonly appearance: Appearance,
  ) {
    this.window = new GameWindow('equipo', 'Equipo', { x: window.innerWidth - 300, y: 330 });
    this.preview = el('canvas', {
      className: 'equipment-preview',
      attrs: { 'aria-hidden': 'true' },
    });
    const column = (slots: readonly EquipmentSlot[]): HTMLElement =>
      el(
        'div',
        { className: 'equipment-column' },
        slots.map((slot) => this.slot(slot)),
      );
    this.window.body.append(
      el('div', { className: 'equipment-layout' }, [
        column(LEFT_SLOTS),
        this.preview,
        column(RIGHT_SLOTS),
      ]),
      el('p', {
        className: 'window-hint',
        text: 'Arrastrá objetos a los casilleros para ponértelos',
      }),
    );
    this.render([]);
  }

  render(equipment: readonly EquippedItemSnapshot[]): void {
    const look: Partial<Record<EquipmentSlot, ItemKind>> = {};
    for (const item of equipment) look[item.slot] = item.kind;
    for (const slot of EQUIPMENT_SLOTS) {
      const item = equipment.find((i) => i.slot === slot);
      this.fillSlot(slot, item);
    }
    this.drawPreview(look);
  }

  private slot(slot: EquipmentSlot): HTMLElement {
    const box = el('div', {
      className: 'equipment-slot',
      attrs: { 'data-drop': 'slot', 'data-slot': slot, title: SLOT_LABELS[slot] },
    });
    this.slots.set(slot, box);
    return el('div', { className: 'equipment-slot-wrap' }, [
      box,
      el('span', { className: 'equipment-slot-label', text: SLOT_LABELS[slot] }),
    ]);
  }

  private fillSlot(slot: EquipmentSlot, item: EquippedItemSnapshot | undefined): void {
    const box = this.slots.get(slot);
    if (!box) return;
    box.replaceChildren();
    if (!item) return;
    const label = describeItem(item.kind);
    const icon = el(
      'button',
      {
        className: 'item-icon item-icon--slot',
        attrs: { type: 'button', title: label, 'aria-label': label },
      },
      [el('img', { attrs: { src: itemIconUrl(item.kind), alt: '', draggable: 'false' } })],
    );
    icon.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      this.drag.begin(
        {
          id: item.id,
          iconUrl: itemIconUrl(item.kind),
          onDrop: (target) => {
            const to = destinationFor(target, this.actions);
            if (to) this.actions.moveItem(item.id, to);
          },
          onDoubleTap: () => this.actions.useItem(item.id),
        },
        e,
      );
    });
    box.append(icon);
  }

  private drawPreview(look: EquipmentLook): void {
    const art = toCanvas(drawCharacterFrame(this.appearance, Direction.SouthEast, 'idle', look));
    this.preview.width = art.width * PREVIEW_SCALE;
    this.preview.height = art.height * PREVIEW_SCALE;
    const ctx = this.preview.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(art, 0, 0, this.preview.width, this.preview.height);
  }
}
