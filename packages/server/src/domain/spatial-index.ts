import type { Position } from '@fenix/shared';

/** Lado de cada celda del índice, en tiles. */
const CELL = 16;

interface Entry {
  cell: number;
  /** Orden de llegada: las consultas devuelven en el mismo orden siempre. */
  readonly order: number;
}

/**
 * Índice espacial por celdas: qué hay cerca de un punto sin recorrer todo el
 * mundo. Cada cosa se reubica cuando se mueve (`update`), así las consultas
 * miran solo las celdas alrededor. Con un mapa grande y cientos de criaturas
 * es la diferencia entre revisar todas y revisar unas pocas.
 */
export class SpatialIndex<T extends { readonly position: Position }> {
  private readonly cells = new Map<number, Set<T>>();
  private readonly entries = new Map<T, Entry>();
  private nextOrder = 0;

  /** Agrega o reubica según su posición actual. */
  update(item: T): void {
    const cell = cellOf(item.position);
    const entry = this.entries.get(item);
    if (entry) {
      if (entry.cell === cell) return;
      this.cells.get(entry.cell)?.delete(item);
      entry.cell = cell;
    } else {
      this.entries.set(item, { cell, order: this.nextOrder++ });
    }
    let set = this.cells.get(cell);
    if (!set) this.cells.set(cell, (set = new Set()));
    set.add(item);
  }

  remove(item: T): void {
    const entry = this.entries.get(item);
    if (!entry) return;
    this.cells.get(entry.cell)?.delete(item);
    this.entries.delete(item);
  }

  /** Lo que está en las celdas que tocan el cuadrado de lado 2·`range` alrededor de `at`. */
  near(at: Position, range: number): T[] {
    const out: T[] = [];
    const x0 = Math.floor((at.x - range) / CELL);
    const x1 = Math.floor((at.x + range) / CELL);
    const y0 = Math.floor((at.y - range) / CELL);
    const y1 = Math.floor((at.y + range) / CELL);
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++) {
        const set = this.cells.get(key(cx, cy));
        if (set) for (const item of set) out.push(item);
      }
    return out.sort(
      (a, b) => (this.entries.get(a)?.order ?? 0) - (this.entries.get(b)?.order ?? 0),
    );
  }
}

function cellOf(p: Position): number {
  return key(Math.floor(p.x / CELL), Math.floor(p.y / CELL));
}

/** Clave numérica de una celda (admite coordenadas negativas). */
function key(cx: number, cy: number): number {
  return (cy + 4096) * 8192 + (cx + 4096);
}
