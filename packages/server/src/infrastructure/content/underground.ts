import { Terrain, type CreatureKind, type Position, type StaticPlacement } from '@fenix/shared';
import { SeededRandom } from '../system/seeded-random';

/** Un lugar bajo tierra: se entra por una bajada del pueblo y se sale por la escalera. */
export interface Underground {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly terrain: readonly Terrain[];
  readonly statics: readonly StaticPlacement[];
  /** La escalera que vuelve a la superficie. */
  readonly ladder: Position;
  /** Dónde aparece quien baja (dos pasos delante de la escalera). */
  readonly arrival: Position;
  readonly lairs: readonly { readonly kind: CreatureKind; readonly position: Position }[];
}

/** Quién vive en la cripta según el tamaño de la ciudad, y quién la gobierna al fondo. */
const CRYPT_DWELLERS: Readonly<
  Record<'large' | 'medium' | 'small', { niches: readonly CreatureKind[]; boss: CreatureKind[] }>
> = {
  large: {
    niches: ['skeleton', 'zombie', 'ghoul', 'skeleton', 'wraith', 'zombie', 'skeleton-mage'],
    boss: ['lich', 'skeleton-mage', 'wraith'],
  },
  medium: {
    niches: ['skeleton', 'zombie', 'ghoul', 'skeleton', 'zombie'],
    boss: ['skeleton-mage', 'wraith'],
  },
  small: { niches: ['skeleton', 'zombie', 'skeleton'], boss: ['ghoul', 'skeleton-mage'] },
};

/** Un plano vacío de roca, con ayudas para cavar y amueblar. */
class Grid {
  readonly terrain: Terrain[];
  readonly statics: StaticPlacement[] = [];
  readonly lairs: { kind: CreatureKind; position: Position }[] = [];
  private readonly taken = new Set<string>();

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.terrain = new Array<Terrain>(width * height).fill(Terrain.Rock);
  }

  floor(x: number, y: number): boolean {
    const t = this.terrain[y * this.width + x];
    return t !== undefined && t !== Terrain.Rock && t !== Terrain.Water;
  }

  dig(x0: number, y0: number, x1: number, y1: number, ground: Terrain): void {
    for (let y = Math.max(1, y0); y <= Math.min(this.height - 2, y1); y++)
      for (let x = Math.max(1, x0); x <= Math.min(this.width - 2, x1); x++)
        this.terrain[y * this.width + x] = ground;
  }

  put(kind: StaticPlacement['kind'], x: number, y: number): boolean {
    const key = `${x},${y}`;
    if (this.taken.has(key) || !this.floor(x, y)) return false;
    this.taken.add(key);
    this.statics.push({ kind, x, y });
    return true;
  }

  free(x: number, y: number): boolean {
    return this.floor(x, y) && !this.taken.has(`${x},${y}`);
  }

  live(kind: CreatureKind, x: number, y: number): void {
    if (!this.free(x, y)) return;
    this.taken.add(`${x},${y}`);
    this.lairs.push({ kind, position: { x, y } });
  }

  /** La roca que toca el suelo se vuelve pared. */
  walls(): void {
    for (let y = 0; y < this.height; y++)
      for (let x = 0; x < this.width; x++) {
        if (this.floor(x, y) || this.terrain[y * this.width + x] === Terrain.Water) continue;
        let touches = false;
        for (let dy = -1; dy <= 1 && !touches; dy++)
          for (let dx = -1; dx <= 1 && !touches; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < this.width && ny < this.height && this.floor(nx, ny))
              touches = true;
          }
        if (touches) this.statics.push({ kind: 'cave-wall', x, y });
      }
  }
}

/**
 * La cripta debajo del cementerio: una escalera baja a un pasillo largo de
 * baldosas oscuras con nichos a los dos lados (cada uno con su sarcófago y
 * un muerto que se levanta) y, al fondo, la sala del señor de la cripta con
 * un cofre. Los braseros alumbran el pasillo; los nichos quedan en penumbra.
 */
export function generateCrypt(
  town: string,
  size: 'large' | 'medium' | 'small',
  seed: number,
): Underground {
  const random = new SeededRandom(seed);
  const niches = size === 'large' ? 5 : size === 'medium' ? 4 : 3;
  const width = 27;
  const height = 10 + niches * 5 + 10;
  const g = new Grid(width, height);
  const cx = Math.floor(width / 2);
  const hall = Terrain.MarbleDark;
  // Sala de la escalera y pasillo central.
  g.dig(cx - 3, 2, cx + 3, 6, hall);
  const hallEnd = 7 + niches * 5;
  g.dig(cx - 1, 6, cx + 1, hallEnd, hall);
  const ladder = { x: cx, y: 2 };
  g.put('ladder', ladder.x, ladder.y);
  const arrival = { x: cx + 1, y: 4 };
  g.put('brazier', cx - 3, 3);
  g.put('brazier', cx + 3, 3);
  g.put('cobweb', cx - 3, 6);

  // Nichos a los lados, con sarcófago y un no-muerto.
  const dwellers = CRYPT_DWELLERS[size];
  let n = 0;
  for (let i = 0; i < niches; i++) {
    const y = 9 + i * 5;
    for (const side of [-1, 1] as const) {
      const x0 = side < 0 ? cx - 8 : cx + 2;
      const x1 = side < 0 ? cx - 2 : cx + 8;
      g.dig(x0, y - 1, x1, y + 1, hall);
      const far = side < 0 ? x0 : x1;
      g.put('sarcophagus', far, y);
      if (random.next() < 0.6) g.put('bones', far - side * 2, y + (random.next() < 0.5 ? 1 : -1));
      if (random.next() < 0.4) g.put('cobweb', far, y - 1);
      const kind = dwellers.niches[n++ % dwellers.niches.length] ?? 'skeleton';
      g.live(kind, far - side * 3, y);
    }
    g.put('brazier', cx + (i % 2 === 0 ? -1 : 1), y + 2);
  }

  // La sala del fondo: el señor de la cripta, su guardia y el cofre.
  const top = hallEnd + 1;
  g.dig(cx - 7, top, cx + 7, top + 6, hall);
  g.put('chest', cx, top + 6);
  g.put('sarcophagus', cx - 5, top + 5);
  g.put('sarcophagus', cx + 5, top + 5);
  for (const x of [cx - 7, cx + 7]) g.put('candelabra', x, top);
  g.put('bones', cx - 3, top + 3);
  g.put('bones', cx + 4, top + 2);
  const [boss, ...guards] = dwellers.boss;
  if (boss) g.live(boss, cx, top + 4);
  guards.forEach((kind, i) => g.live(kind, cx + (i % 2 === 0 ? -3 : 3), top + 3));

  g.walls();
  return {
    name: `Cripta de ${town}`,
    width,
    height,
    terrain: g.terrain,
    statics: g.statics,
    ladder,
    arrival,
    lairs: g.lairs,
  };
}

/**
 * Las alcantarillas de la capital: una red de canales de agua sucia con
 * veredas de piedra a los costados y puentes de tablas para cruzar. Entre
 * los canales hay cuartos: nidos de ratas, una guarida con un cofre y unas
 * ruinas viejas donde algo se mueve en la oscuridad.
 */
export function generateSewer(town: string, seed: number): Underground {
  const random = new SeededRandom(seed);
  const width = 58;
  const height = 46;
  const g = new Grid(width, height);
  const walk = Terrain.StoneTiles;
  // Canales: dos de este a oeste y tres de norte a sur, con vereda a cada lado.
  const rows = [10, 24, 38];
  const cols = [8, 29, 50];
  for (const y of rows) {
    g.dig(3, y - 2, width - 4, y + 2, walk);
    for (let x = 3; x <= width - 4; x++) g.terrain[y * width + x] = Terrain.ShallowWater;
  }
  for (const x of cols) {
    g.dig(x - 2, 3, x + 2, height - 4, walk);
    for (let y = 3; y <= height - 4; y++) g.terrain[y * width + x] = Terrain.ShallowWater;
  }
  // Puentes de tablas sobre los canales, cada tanto.
  for (const y of rows)
    for (let x = 6; x < width - 6; x += 7)
      if (!cols.includes(x)) g.terrain[y * width + x] = Terrain.Wood;
  for (const x of cols)
    for (let y = 6; y < height - 6; y += 7)
      if (!rows.includes(y)) g.terrain[y * width + x] = Terrain.Wood;

  // La escalera, en una salita al norte del primer cruce.
  const ladder = { x: 18, y: 3 };
  g.dig(15, 2, 21, 6, walk);
  g.dig(17, 6, 19, 8, walk);
  g.put('ladder', ladder.x, ladder.y);
  const arrival = { x: 19, y: 5 };

  // Cuartos entre los canales.
  const rooms = [
    { x0: 12, y0: 14, x1: 24, y1: 20, kind: 'nest' as const },
    { x0: 34, y0: 14, x1: 45, y1: 20, kind: 'hideout' as const },
    { x0: 12, y0: 28, x1: 24, y1: 34, kind: 'ruins' as const },
    { x0: 34, y0: 28, x1: 45, y1: 34, kind: 'nest' as const },
  ];
  for (const r of rooms) {
    g.dig(r.x0, r.y0, r.x1, r.y1, r.kind === 'ruins' ? Terrain.Ruins : walk);
    // Una puerta (hueco) hacia la vereda de arriba.
    const door = Math.floor((r.x0 + r.x1) / 2);
    g.dig(door, r.y0 - 2, door, r.y0 - 1, walk);
    g.put('brazier', r.x0, r.y0);
    if (r.kind === 'nest') {
      for (let i = 0; i < 5; i++)
        g.live(
          'rat',
          r.x0 + 2 + Math.floor(random.next() * (r.x1 - r.x0 - 3)),
          r.y0 + 2 + Math.floor(random.next() * (r.y1 - r.y0 - 3)),
        );
      g.put('bones', r.x1 - 1, r.y1 - 1);
      g.put('cobweb', r.x1, r.y0);
      g.live('giant-spider', r.x1 - 2, r.y0 + 2);
    } else if (r.kind === 'hideout') {
      // Guarida de contrabandistas: cajones, barriles y un cofre con lo robado.
      g.put('chest', r.x1, r.y1);
      g.put('crate', r.x1 - 1, r.y1);
      g.put('crate', r.x0 + 1, r.y1);
      g.put('barrel', r.x0, r.y1);
      g.put('keg', r.x0, r.y1 - 1);
      g.put('table', r.x0 + 4, r.y0 + 3);
      g.live('orc', r.x0 + 6, r.y0 + 4);
      g.live('orc', r.x1 - 3, r.y0 + 3);
    } else {
      // Ruinas viejas bajo la ciudad: columnas caídas y un necrófago.
      g.put('column', r.x0 + 2, r.y0 + 2);
      g.put('column', r.x1 - 2, r.y0 + 2);
      g.put('fallen-column', r.x0 + 3, r.y1 - 2);
      g.put('rubble', r.x1 - 3, r.y1 - 1);
      g.put('sarcophagus', Math.floor((r.x0 + r.x1) / 2), r.y1);
      g.live('ghoul', Math.floor((r.x0 + r.x1) / 2), r.y0 + 4);
      g.live('zombie', r.x0 + 4, r.y0 + 4);
    }
  }
  // Ratas sueltas por las veredas, luces y telarañas.
  for (let i = 0; i < 14; i++) {
    const vertical = random.next() < 0.5;
    const line = vertical
      ? (cols[Math.floor(random.next() * cols.length)] ?? 8)
      : (rows[Math.floor(random.next() * rows.length)] ?? 10);
    const along = 5 + Math.floor(random.next() * ((vertical ? height : width) - 10));
    const off = random.next() < 0.5 ? -2 : 2;
    if (vertical) g.live('rat', line + off, along);
    else g.live('rat', along, line + off);
  }
  for (const y of rows)
    for (const x of cols) {
      g.put('brazier', x - 2, y - 2);
      if (random.next() < 0.5) g.put('cobweb', x + 2, y + 2);
    }

  g.walls();
  return {
    name: `Alcantarillas de ${town}`,
    width,
    height,
    terrain: g.terrain,
    statics: g.statics,
    ladder,
    arrival,
    lairs: g.lairs,
  };
}
