import {
  BUILDING_MATERIALS,
  HOUSE_FLOORS,
  HOUSE_PIECES,
  HOUSE_ROOFS,
  designCell,
  designCost,
  designProblem,
  levelLabel,
  lotLevels,
  lotSide,
  withCell,
  type FloorKind,
  type HouseDesign,
  type Materials,
  type PieceKind,
  type RoofKind,
} from '@fenix/shared/housing/design';
import { HOUSE_PLANS, HOUSE_STYLES, type HouseStyle } from '@fenix/shared/housing/houses';
import { describeItem } from '@fenix/shared/items/item-catalog';
import type { EntityId, HouseSnapshot } from '@fenix/shared/protocol/messages';
import { el } from './dom';
import { GameWindow } from './game-window';

/** Lo que la ventana de diseño le pide al juego. */
export interface HouseDesignCommands {
  confirm(houseId: EntityId, design: HouseDesign, pay: 'gold' | 'materials'): void;
  /** Cuánto lleva de un material en la mochila. */
  carried(kind: (typeof BUILDING_MATERIALS)[number]): number;
  /** Cuánto oro tiene (mochila y banco). */
  gold(): number;
}

/** Lo que pone cada toque en la grilla. */
type Tool =
  | { readonly kind: 'floor'; readonly floor: FloorKind }
  | { readonly kind: 'piece'; readonly piece: PieceKind }
  | { readonly kind: 'erase-piece' }
  | { readonly kind: 'erase-floor' };

const FLOOR_COLORS: Readonly<Record<FloorKind, string>> = {
  wood: '#8a5a2b',
  flagstone: '#8d8b84',
  'stone-tiles': '#6f7378',
  sandstone: '#cdb07a',
  terracotta: '#b5653d',
  marble: '#e2ddd3',
};

const WALL_COLORS: Readonly<Record<HouseStyle, string>> = {
  plank: '#a0703c',
  log: '#6b4423',
  stone: '#a3a3a3',
  basalt: '#3d3d46',
  sandstone: '#dcc48e',
};

const STYLES = Object.keys(HOUSE_STYLES) as HouseStyle[];
const FLOORS = Object.keys(HOUSE_FLOORS) as FloorKind[];

/**
 * La ventana para diseñar una casa a medida, como la de UO: el lote visto
 * desde arriba, planta por planta. Se elige una pieza (piso, pared, ventana,
 * puerta, escalera, cofre) y se pinta sobre la grilla; abajo se ve lo que
 * cuesta en oro o en materiales y si se puede construir. Nada cambia en el
 * mundo hasta confirmar y pagar.
 */
export class HouseDesignWindow {
  readonly window: GameWindow;
  private house: HouseSnapshot | null = null;
  /** El diseño construido y el borrador que se está armando. */
  private base: HouseDesign | null = null;
  private draft: HouseDesign | null = null;
  private history: HouseDesign[] = [];
  private level = 0;
  private style: HouseStyle = 'stone';
  private floor: FloorKind = 'flagstone';
  private tool: Tool = { kind: 'floor', floor: 'flagstone' };
  private painting = false;
  private cells: HTMLElement[] = [];
  private readonly grid = el('div', { className: 'design-grid', attrs: { role: 'grid' } });
  private readonly tools = el('div', { className: 'design-tools' });
  private readonly levels = el('div', { className: 'design-levels' });
  private readonly summary = el('div', { className: 'design-summary' });

  constructor(private readonly commands: HouseDesignCommands) {
    this.window = new GameWindow('diseno-casa', 'Diseñar la casa', { x: 300, y: 60 });
    this.window.element.classList.add('design-window');
    this.grid.addEventListener('pointerdown', (e) => this.startPaint(e));
    this.grid.addEventListener('pointermove', (e) => this.paintAt(e));
    const stop = (): void => {
      this.painting = false;
    };
    this.grid.addEventListener('pointerup', stop);
    this.grid.addEventListener('pointercancel', stop);
    this.grid.addEventListener('lostpointercapture', stop);
  }

  get openHouseId(): EntityId | null {
    return this.window.element.hidden ? null : (this.house?.id ?? null);
  }

  open(house: HouseSnapshot): void {
    if (!house.design) return;
    const same = this.house?.id === house.id && sameDesign(this.base, house.design);
    this.house = house;
    if (!same) this.reset(house.design);
    this.window.setTitle(`Diseñar «${house.name}»`);
    this.render();
    this.window.show();
  }

  /** La casa cambió en el servidor (se confirmó una obra): el borrador parte de lo nuevo. */
  update(house: HouseSnapshot | undefined): void {
    if (!this.house || this.window.element.hidden) return;
    if (!house?.design) {
      this.window.hide();
      return;
    }
    if (house.id !== this.house.id) return;
    this.house = house;
    // Otros cambios de la casa (el nombre, si es pública) no tocan el borrador.
    if (!sameDesign(house.design, this.base)) this.reset(house.design);
    this.render();
  }

  private reset(design: HouseDesign): void {
    this.base = design;
    this.draft = design;
    this.history = [];
    this.level = Math.min(this.level, design.levels.length - 1);
  }

  private get side(): number {
    return this.house ? lotSide(this.house.kind) : 0;
  }

  private render(): void {
    const house = this.house;
    if (!house) return;
    this.renderLevels();
    this.renderTools();
    this.buildGrid();
    this.paintGrid();
    this.renderSummary();
    const plan = HOUSE_PLANS[house.kind];
    this.window.body.replaceChildren(
      el('p', {
        className: 'window-hint',
        text: `${capitalize(plan.name)} de ${plan.width}×${plan.height}. Elegí una pieza y pintá sobre la grilla (se puede arrastrar). Abajo, del lado de la calle, quedan la entrada y el cartel.`,
      }),
      this.levels,
      this.tools,
      el('div', { className: 'design-board' }, [
        this.grid,
        el('div', { className: 'design-street', text: '▲ calle y cartel' }),
      ]),
      this.summary,
    );
  }

  private renderLevels(): void {
    const house = this.house;
    if (!house) return;
    const buttons: HTMLElement[] = [];
    for (let l = 0; l < lotLevels(house.kind); l++) {
      const button = this.button(capitalize(levelLabel(l)), `Diseñar ${levelLabel(l)}`, () => {
        this.level = l;
        this.render();
      });
      if (l === this.level) button.classList.add('is-active');
      buttons.push(button);
    }
    this.levels.replaceChildren(...buttons);
  }

  private renderTools(): void {
    const tool = (label: string, title: string, next: Tool, swatch?: string): HTMLElement => {
      const button = this.button(label, title, () => {
        this.tool = next;
        if (next.kind === 'floor') this.floor = next.floor;
        this.renderTools();
      });
      if (swatch)
        button.prepend(
          el('span', { className: 'design-swatch', attrs: { style: `background:${swatch}` } }),
        );
      if (sameTool(this.tool, next)) button.classList.add('is-active');
      return button;
    };
    const styleSelect = el(
      'select',
      { className: 'design-select', attrs: { 'aria-label': 'Material de las paredes' } },
      STYLES.map((s) => {
        const option = el('option', { text: HOUSE_STYLES[s].name, attrs: { value: s } });
        option.selected = s === this.style;
        return option;
      }),
    );
    styleSelect.addEventListener('change', () => {
      this.style = styleSelect.value as HouseStyle;
      if (this.tool.kind === 'piece') {
        const group = HOUSE_PIECES[this.tool.piece].group;
        if (group === 'wall' || group === 'window')
          this.tool = { kind: 'piece', piece: `${group}-${this.style}` };
      }
      this.renderTools();
    });
    const roofSelect = el(
      'select',
      { className: 'design-select', attrs: { 'aria-label': 'Techo' } },
      (Object.keys(HOUSE_ROOFS) as RoofKind[]).map((r) => {
        const option = el('option', { text: HOUSE_ROOFS[r].name, attrs: { value: r } });
        option.selected = r === this.draft?.roof;
        return option;
      }),
    );
    roofSelect.addEventListener('change', () => {
      if (!this.draft) return;
      this.commit({ ...this.draft, roof: roofSelect.value as RoofKind });
    });
    const piece = (p: PieceKind): HTMLElement =>
      tool(
        capitalize(HOUSE_PIECES[p].name),
        `Poner ${HOUSE_PIECES[p].name} (${priceText(HOUSE_PIECES[p].gold, HOUSE_PIECES[p].materials)})`,
        { kind: 'piece', piece: p },
      );
    this.tools.replaceChildren(
      group('Piso', [
        ...FLOORS.map((f) =>
          tool(
            capitalize(HOUSE_FLOORS[f].name),
            `Poner ${HOUSE_FLOORS[f].name} (${priceText(HOUSE_FLOORS[f].gold, HOUSE_FLOORS[f].materials)})`,
            { kind: 'floor', floor: f },
            FLOOR_COLORS[f],
          ),
        ),
      ]),
      group('Paredes', [styleSelect, piece(`wall-${this.style}`), piece(`window-${this.style}`)]),
      group('Puertas, escaleras y cofres', [
        piece('door-wood'),
        piece('door-iron'),
        piece('stairs-wood'),
        piece('stairs-stone'),
        piece('chest'),
      ]),
      group('Sacar', [
        tool('Sacar pieza', 'Sacar la pieza (devuelve la mitad de los materiales)', {
          kind: 'erase-piece',
        }),
        tool('Sacar piso', 'Sacar el piso', { kind: 'erase-floor' }),
      ]),
      group('Atajos', [
        this.button('Paredes alrededor', 'Rodear el lote con paredes en esta planta', () =>
          this.surround(),
        ),
        this.button('Piso en todo', 'Poner piso en todo el lote en esta planta', () =>
          this.fillFloor(),
        ),
        roofSelect,
      ]),
    );
  }

  private buildGrid(): void {
    const side = this.side;
    if (this.cells.length === side * side) return;
    this.grid.style.gridTemplateColumns = `repeat(${side}, var(--design-cell))`;
    this.cells = Array.from({ length: side * side }, (_, i) =>
      el('div', {
        className: 'design-cell',
        attrs: {
          role: 'gridcell',
          'data-x': String(i % side),
          'data-y': String(Math.floor(i / side)),
        },
      }),
    );
    this.grid.replaceChildren(...this.cells);
  }

  private paintGrid(): void {
    const draft = this.draft;
    if (!draft) return;
    const side = this.side;
    for (let y = 0; y < side; y++)
      for (let x = 0; x < side; x++) {
        const node = this.cells[y * side + x];
        if (!node) continue;
        const cell = designCell(draft, this.level, x, y, side);
        const below = this.level > 0 ? designCell(draft, this.level - 1, x, y, side) : null;
        node.className = 'design-cell';
        node.textContent = '';
        node.style.background = cell.floor ? FLOOR_COLORS[cell.floor] : '';
        if (!cell.floor && below && (below.floor || below.piece)) node.classList.add('is-below');
        const names: string[] = [];
        if (cell.piece) {
          const def = HOUSE_PIECES[cell.piece];
          names.push(def.name);
          const mark = el('span', { className: `design-piece design-piece--${def.group}` });
          if (def.style) mark.style.setProperty('--piece', WALL_COLORS[def.style]);
          if (cell.piece === 'door-iron') mark.style.setProperty('--piece', '#6d7177');
          if (cell.piece === 'stairs-stone') mark.style.setProperty('--piece', '#9a9a9a');
          node.append(mark);
        }
        if (cell.floor) names.push(HOUSE_FLOORS[cell.floor].name);
        node.title = names.length ? capitalize(names.join(' sobre ')) : 'Vacío';
      }
  }

  private renderSummary(): void {
    const house = this.house;
    const draft = this.draft;
    const base = this.base;
    if (!house || !draft || !base) return;
    const cost = designCost(house.kind, base, draft);
    const problem = designProblem(house.kind, draft);
    const lines: HTMLElement[] = [];
    if (problem) lines.push(el('p', { className: 'design-problem', text: problem }));
    if (cost.changes === 0) {
      lines.push(el('p', { className: 'window-hint', text: 'Sin cambios todavía.' }));
    } else {
      lines.push(
        el('p', {
          className: 'house-summary',
          text: `Cuesta ${cost.gold} monedas (tenés ${this.commands.gold()}), o con materiales:`,
        }),
        el(
          'ul',
          { className: 'design-materials' },
          materialLines(cost.materials).map(([kind, amount]) => {
            const have = this.commands.carried(kind);
            return el('li', {
              className: have >= amount ? '' : 'is-short',
              text: `${describeItem(kind, amount)} (en la mochila: ${have})`,
            });
          }),
        ),
      );
      const back = materialLines(cost.refund);
      if (back.length)
        lines.push(
          el('p', {
            className: 'window-hint',
            text: `Por lo que sacás te devuelven ${back.map(([k, n]) => describeItem(k, n)).join(', ')}.`,
          }),
        );
    }
    const ready = !problem && cost.changes > 0;
    const gold = this.button(
      `Pagar con oro (${cost.gold})`,
      'Confirmar la obra pagando con oro',
      () => this.confirm('gold'),
    );
    const materials = this.button(
      'Pagar con materiales',
      'Confirmar la obra con los materiales de la mochila y de los cofres de la casa',
      () => this.confirm('materials'),
    );
    gold.disabled = !ready;
    materials.disabled = !ready;
    const undo = this.button('Deshacer', 'Deshacer el último cambio', () => {
      const last = this.history.pop();
      if (last) this.apply(last);
    });
    undo.disabled = this.history.length === 0;
    const restart = this.button('Volver a como está', 'Descartar los cambios', () => {
      if (this.base) this.reset(this.base);
      this.render();
    });
    restart.disabled = cost.changes === 0;
    lines.push(
      el('p', {
        className: 'window-hint',
        text: 'Los materiales se toman de la mochila y de los cofres de la casa.',
      }),
      el('div', { className: 'house-row' }, [gold, materials]),
      el('div', { className: 'house-row' }, [undo, restart]),
    );
    this.summary.replaceChildren(...lines);
  }

  private confirm(pay: 'gold' | 'materials'): void {
    if (this.house && this.draft) this.commands.confirm(this.house.id, this.draft, pay);
  }

  // ── Pintar ─────────────────────────────────────────────────────────

  private startPaint(e: PointerEvent): void {
    if (e.button !== 0 || !this.draft) return;
    e.preventDefault();
    this.painting = true;
    this.history.push(this.draft);
    this.grid.setPointerCapture(e.pointerId);
    this.paintAt(e);
  }

  private paintAt(e: PointerEvent): void {
    if (!this.painting || !this.draft) return;
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.design-cell');
    if (!(target instanceof HTMLElement) || !this.grid.contains(target)) return;
    const x = Number(target.dataset.x);
    const y = Number(target.dataset.y);
    const next = this.paint(this.draft, x, y);
    if (next !== this.draft) this.apply(next);
  }

  private paint(design: HouseDesign, x: number, y: number): HouseDesign {
    const side = this.side;
    const l = this.level;
    switch (this.tool.kind) {
      case 'floor':
        return withCell(design, l, x, y, side, { floor: this.tool.floor });
      case 'erase-floor':
        return withCell(design, l, x, y, side, { floor: null });
      case 'erase-piece':
        return withCell(design, l, x, y, side, { piece: null });
      case 'piece': {
        const group = HOUSE_PIECES[this.tool.piece].group;
        // Las escaleras y los cofres van sobre un piso: si falta, se pone.
        const needsFloor = group === 'stairs' || group === 'chest';
        const floor = designCell(design, l, x, y, side).floor;
        return withCell(design, l, x, y, side, {
          piece: this.tool.piece,
          ...(needsFloor && !floor ? { floor: this.floor } : {}),
        });
      }
    }
  }

  /** Cambia el borrador guardando el anterior para deshacer. */
  private commit(next: HouseDesign): void {
    if (!this.draft || next === this.draft) return;
    this.history.push(this.draft);
    this.apply(next);
  }

  private apply(next: HouseDesign): void {
    this.draft = next;
    this.paintGrid();
    this.renderSummary();
  }

  private surround(): void {
    if (!this.draft) return;
    const side = this.side;
    let next = this.draft;
    for (let y = 0; y < side; y++)
      for (let x = 0; x < side; x++)
        if (x === 0 || y === 0 || x === side - 1 || y === side - 1)
          next = withCell(next, this.level, x, y, side, { piece: `wall-${this.style}` });
    this.commit(next);
  }

  private fillFloor(): void {
    if (!this.draft) return;
    const side = this.side;
    let next = this.draft;
    // El piso va de la pared del norte y del oeste hasta la última fila de adentro.
    for (let y = 0; y < side - 1; y++)
      for (let x = 0; x < side - 1; x++)
        next = withCell(next, this.level, x, y, side, { floor: this.floor });
    this.commit(next);
  }

  private button(text: string, label: string, onClick: () => void): HTMLButtonElement {
    const button = el('button', {
      className: 'button button--small',
      text,
      attrs: { type: 'button', 'aria-label': label, title: label },
    });
    button.addEventListener('click', onClick);
    return button;
  }
}

function group(title: string, children: HTMLElement[]): HTMLElement {
  return el('div', { className: 'design-group' }, [
    el('span', { className: 'design-group-title', text: title }),
    el('div', { className: 'design-group-items' }, children),
  ]);
}

function sameDesign(a: HouseDesign | null, b: HouseDesign | null): boolean {
  if (!a || !b) return a === b;
  return (
    a.roof === b.roof &&
    a.levels.length === b.levels.length &&
    a.levels.every((row, i) => row === b.levels[i])
  );
}

function sameTool(a: Tool, b: Tool): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'floor' && b.kind === 'floor') return a.floor === b.floor;
  if (a.kind === 'piece' && b.kind === 'piece') return a.piece === b.piece;
  return true;
}

function materialLines(materials: Materials): [(typeof BUILDING_MATERIALS)[number], number][] {
  return BUILDING_MATERIALS.flatMap((kind) => {
    const amount = materials[kind] ?? 0;
    return amount > 0 ? [[kind, amount] as [(typeof BUILDING_MATERIALS)[number], number]] : [];
  });
}

function priceText(gold: number, materials: Materials): string {
  const list = materialLines(materials).map(([k, n]) => describeItem(k, n));
  return `${gold} monedas o ${list.join(' y ')}`;
}

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
