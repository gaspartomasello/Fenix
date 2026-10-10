import type { Appearance, EquipmentSlot, EquippedItemSnapshot } from '@fenix/shared';
import { destinationFor, type ItemActions } from './backpack-window';
import { el } from './dom';
import type { DragController } from './drag-controller';
import { GameWindow } from './game-window';
import { itemIconUrl } from './item-icons';
import { PaperdollView, type PaperdollButton, type PaperdollIdentity } from './paperdoll-view';

export type { PaperdollButton };

/**
 * Ventana del propio personaje: para ponerse algo se lo suelta sobre el
 * personaje o en su casillero; para sacárselo se lo arrastra afuera.
 */
export class EquipmentWindow {
  readonly window: GameWindow;
  private readonly view: PaperdollView;
  private equipment: readonly EquippedItemSnapshot[] = [];

  constructor(
    private readonly drag: DragController,
    private readonly actions: ItemActions,
    private readonly appearance: Appearance,
    buttons: readonly PaperdollButton[],
  ) {
    this.window = new GameWindow('equipo', 'Personaje', { x: window.innerWidth - 400, y: 160 });
    this.view = new PaperdollView({ grab: (slot, e) => this.grab(slot, e) }, buttons);
    this.window.body.append(
      this.view.element,
      el('p', {
        className: 'window-hint',
        text: 'Soltá un objeto sobre el personaje para ponértelo; arrastralo afuera para sacártelo.',
      }),
    );
    this.render([]);
  }

  render(equipment: readonly EquippedItemSnapshot[]): void {
    this.equipment = equipment;
    this.paint(equipment);
  }

  /** Dibuja el personaje con lo que tiene puesto (sin lo que se esté arrastrando). */
  private paint(equipment: readonly EquippedItemSnapshot[]): void {
    this.view.render({
      appearance: this.appearance,
      role: null,
      equipment: Object.fromEntries(equipment.map((item) => [item.slot, item.kind])),
    });
  }

  setIdentity(identity: PaperdollIdentity): void {
    this.view.setIdentity(identity);
  }

  refreshButtons(): void {
    this.view.refreshButtons();
  }

  private grab(slot: EquipmentSlot, e: PointerEvent): void {
    const item = this.equipment.find((i) => i.slot === slot);
    if (!item) return;
    this.drag.begin(
      {
        id: item.id,
        iconUrl: itemIconUrl(item.kind),
        // Al arrastrarlo se lo saca de encima del personaje (vuelve si no se suelta en otro lado).
        lift: () => {
          this.paint(this.equipment.filter((other) => other.id !== item.id));
          return () => this.paint(this.equipment);
        },
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
