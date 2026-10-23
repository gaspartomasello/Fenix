import {
  ITEMS,
  armorOf,
  describeWeight,
  encumbrance,
  weaponOf,
  type Attributes,
  type EquipmentLook,
  type Vitals,
} from '@fenix/shared';
import { el } from './dom';
import { GameWindow } from './game-window';

/** Lo que muestra el panel de estado. */
export interface StatusInfo {
  readonly name: string;
  readonly attributes: Attributes | null;
  readonly vitals: Vitals | null;
  readonly equipment: EquipmentLook;
  readonly weight: number;
  /** Lo máximo que puede llevar (null: sin límite). */
  readonly maxWeight: number | null;
  readonly gold: number;
}

/**
 * Panel de estado, como el de UO (doble clic sobre las barras de vida):
 * atributos, vida, maná y energía, defensa de lo que tiene puesto, el arma
 * con su daño y velocidad, el peso que lleva y el oro de la mochila.
 */
export class StatusWindow {
  readonly window: GameWindow;
  private readonly rows: HTMLElement;
  private readonly weightBar: HTMLElement;
  private readonly weightFill: HTMLElement;

  constructor() {
    this.window = new GameWindow('estado', 'Estado', { x: 260, y: 90 });
    this.rows = el('dl', { className: 'status-rows' });
    this.weightFill = el('div', { className: 'status-weight-fill' });
    this.weightBar = el('div', { className: 'status-weight', attrs: { role: 'meter' } }, [
      this.weightFill,
    ]);
    this.window.body.append(
      this.rows,
      this.weightBar,
      el('p', {
        className: 'window-hint',
        text: 'Lo que podés llevar depende de tu Fuerza. Con más peso no podés correr y cada paso cansa.',
      }),
    );
  }

  get visible(): boolean {
    return this.window.visible;
  }

  open(info: StatusInfo): void {
    this.render(info);
    this.window.show();
  }

  render(info: StatusInfo): void {
    const { attributes, vitals, equipment } = info;
    const weapon = weaponOf(equipment);
    const weaponName = equipment.rightHand ? ITEMS[equipment.rightHand].name : weapon.name;
    const load = info.maxWeight === null ? null : encumbrance(info.weight, info.maxWeight);
    const entries: [string, string][] = [
      ['Nombre', info.name],
      ['Fuerza', attributes ? String(attributes.strength) : '—'],
      ['Destreza', attributes ? String(attributes.dexterity) : '—'],
      ['Inteligencia', attributes ? String(attributes.intelligence) : '—'],
      ['Vida', vitals ? `${vitals.hits} / ${vitals.maxHits}` : '—'],
      ['Maná', vitals ? `${vitals.mana} / ${vitals.maxMana}` : '—'],
      ['Energía', vitals ? `${vitals.stamina} / ${vitals.maxStamina}` : '—'],
      ['Defensa', String(armorOf(equipment))],
      ['Arma', weaponName],
      [
        'Daño',
        `${weapon.minDamage}–${weapon.maxDamage} · un golpe cada ${(weapon.swingMs / 1000).toLocaleString('es-AR')} s`,
      ],
      ['Peso', describeWeight(info.weight, info.maxWeight)],
      ['Oro', info.gold.toLocaleString('es-AR')],
    ];
    this.rows.replaceChildren(
      ...entries.flatMap(([label, value]) => [
        el('dt', { text: label }),
        el('dd', { text: value }),
      ]),
    );
    const ratio = info.maxWeight === null ? 0 : Math.min(1, info.weight / info.maxWeight);
    this.weightFill.style.width = `${Math.round(ratio * 100)}%`;
    this.weightBar.classList.toggle('status-weight--over', load !== null && !load.canRun);
    this.weightBar.setAttribute(
      'aria-label',
      `Peso: ${describeWeight(info.weight, info.maxWeight)}`,
    );
    this.weightBar.hidden = info.maxWeight === null;
  }
}
