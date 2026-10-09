import { PixelImage, shade, type Rgb } from './pixel-art';

/**
 * Motor de volumen: los personajes y criaturas se arman como modelos 3D muy
 * simples (esferas, elipsoides, extremidades y planos), se giran según hacia
 * dónde miran, se proyectan con la inclinación de la vista isométrica y se
 * pintan pixel a pixel con luz, sombras en escalones y contornos. Así las
 * ocho direcciones salen del mismo modelo y la espada queda siempre en la
 * mano derecha.
 */

export type Vec3 = readonly [number, number, number];

export const vec = (x: number, y: number, z: number): Vec3 => [x, y, z];
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => add(a, scale(sub(b, a), t));
export function normalize(a: Vec3): Vec3 {
  const length = Math.hypot(a[0], a[1], a[2]) || 1;
  return scale(a, 1 / length);
}
export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** Gira un vector alrededor del eje X (hacia adelante con ángulo positivo: la pierna avanza). */
export function pitch(v: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c];
}

/** Gira un vector alrededor del eje Y (vertical). */
export function yaw(v: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
}

/**
 * Cómo se proyecta el modelo en la imagen. Las coordenadas de imagen son
 * x hacia la derecha, y hacia abajo y una profundidad que crece hacia quien
 * mira. Toda proyección es lineal (más un origen).
 */
export interface Projection {
  readonly zoom: number;
  /** Punto del modelo → imagen (x, y hacia abajo, profundidad). */
  point(p: Vec3): Vec3;
  /** Parte lineal de `point` aplicada a un vector (para medir extensiones). */
  forward(v: Vec3): Vec3;
  /** Vector dual (inversa transpuesta): para saber si un pixel cae dentro de un volumen. */
  dual(v: Vec3): Vec3;
  /** Gradiente en la imagen → normal en el modelo. */
  modelNormal(gradient: Vec3): Vec3;
  /** Pixel y profundidad → punto del modelo. */
  unproject(x: number, y: number, z: number): Vec3;
  /** Dirección hacia quien mira y hacia la luz, en el modelo. */
  readonly viewDir: Vec3;
  readonly lightDir: Vec3;
}

/**
 * Espacio del modelo: x hacia la derecha del personaje, y hacia arriba, z
 * hacia adelante (hacia donde mira), en pixeles del sprite. El origen está
 * en el suelo, entre los pies.
 *
 * `facing` es hacia dónde mira en pantalla: 0 = hacia la cámara, π/2 = a la
 * derecha, π = de espaldas. `tilt` es cuánto mira la cámara desde arriba.
 */
export class Camera implements Projection {
  private readonly c: number;
  private readonly s: number;
  private readonly ct: number;
  private readonly st: number;

  constructor(
    facing: number,
    readonly originX: number,
    readonly originY: number,
    tilt = 0.42,
    /** Escala del modelo en la imagen (para criaturas más grandes o más chicas). */
    readonly zoom = 1,
  ) {
    this.c = Math.cos(facing);
    this.s = Math.sin(facing);
    this.ct = Math.cos(tilt);
    this.st = Math.sin(tilt);
  }

  /** Dirección del modelo → cámara (x a la derecha de la pantalla, y arriba, z hacia quien mira). */
  direction(v: Vec3): Vec3 {
    const x = -v[0] * this.c + v[2] * this.s;
    const z0 = v[0] * this.s + v[2] * this.c;
    return [x, v[1] * this.ct - z0 * this.st, z0 * this.ct + v[1] * this.st];
  }

  /** Dirección de la cámara → modelo (la inversa de `direction`). */
  toModel(v: Vec3): Vec3 {
    const y = v[1] * this.ct + v[2] * this.st;
    const z0 = -v[1] * this.st + v[2] * this.ct;
    return [-v[0] * this.c + z0 * this.s, y, v[0] * this.s + z0 * this.c];
  }

  /** Punto del modelo → cámara, con el origen del modelo en (originX, originY) de la imagen. */
  point(p: Vec3): Vec3 {
    const d = this.direction(scale(p, this.zoom));
    return [d[0] + this.originX, this.originY - d[1], d[2]];
  }

  /** Punto de la cámara (pixel x, y de la imagen y profundidad z) → modelo. */
  unproject(x: number, y: number, z: number): Vec3 {
    return scale(this.toModel([x - this.originX, this.originY - y, z]), 1 / this.zoom);
  }

  forward(v: Vec3): Vec3 {
    const d = this.direction(v);
    return [d[0], -d[1], d[2]];
  }

  /** Rotación pura: el dual es el mismo vector. */
  dual(v: Vec3): Vec3 {
    return this.forward(v);
  }

  modelNormal(gradient: Vec3): Vec3 {
    return this.toModel(normalize([gradient[0], -gradient[1], gradient[2]]));
  }

  get viewDir(): Vec3 {
    return this.toModel([0, 0, 1]);
  }

  get lightDir(): Vec3 {
    return this.toModel(LIGHT);
  }
}

/**
 * Proyección de UO para el mundo (terreno y objetos fijos): el suelo se ve
 * como el rombo del tile, sin achatarse, y la altura sube derecho en la
 * pantalla. Modelo: x a lo largo del eje x del mapa (abajo a la derecha en
 * pantalla), z a lo largo del eje y del mapa (abajo a la izquierda), y hacia
 * arriba; todo en pixeles (un paso de 1 en x se ve de largo 1 en diagonal).
 */
export class WorldProjection implements Projection {
  readonly zoom = 1;
  private static readonly A = Math.SQRT1_2;
  /** Hacia quien mira: de frente-abajo y desde arriba. */
  readonly viewDir: Vec3 = normalize([1, 2 * WorldProjection.A, 1]);
  /** Luz desde arriba y de la izquierda de la pantalla, como en UO. */
  readonly lightDir: Vec3 = normalize([0.1, 1, 0.75]);
  private readonly inverse: readonly Vec3[];

  constructor(
    readonly originX: number,
    readonly originY: number,
  ) {
    this.inverse = invert3(this.row(0), this.row(1), this.row(2));
  }

  private row(i: 0 | 1 | 2): Vec3 {
    const a = WorldProjection.A;
    if (i === 0) return [a, 0, -a];
    if (i === 1) return [a, -1, a];
    return this.viewDir;
  }

  forward(v: Vec3): Vec3 {
    return [dot(this.row(0), v), dot(this.row(1), v), dot(this.row(2), v)];
  }

  point(p: Vec3): Vec3 {
    const f = this.forward(p);
    return [f[0] + this.originX, f[1] + this.originY, f[2]];
  }

  dual(v: Vec3): Vec3 {
    // Inversa transpuesta: columnas de la inversa.
    const m = this.inverse;
    return [dot(col(m, 0), v), dot(col(m, 1), v), dot(col(m, 2), v)];
  }

  modelNormal(gradient: Vec3): Vec3 {
    // La normal en el modelo es la transpuesta de la proyección aplicada al gradiente.
    const r = [this.row(0), this.row(1), this.row(2)];
    return normalize([
      (r[0]?.[0] ?? 0) * gradient[0] +
        (r[1]?.[0] ?? 0) * gradient[1] +
        (r[2]?.[0] ?? 0) * gradient[2],
      (r[0]?.[1] ?? 0) * gradient[0] +
        (r[1]?.[1] ?? 0) * gradient[1] +
        (r[2]?.[1] ?? 0) * gradient[2],
      (r[0]?.[2] ?? 0) * gradient[0] +
        (r[1]?.[2] ?? 0) * gradient[1] +
        (r[2]?.[2] ?? 0) * gradient[2],
    ]);
  }

  unproject(x: number, y: number, z: number): Vec3 {
    const q: Vec3 = [x - this.originX, y - this.originY, z];
    const m = this.inverse;
    return [dot(m[0] ?? q, q), dot(m[1] ?? q, q), dot(m[2] ?? q, q)];
  }
}

function col(m: readonly Vec3[], i: 0 | 1 | 2): Vec3 {
  return [m[0]?.[i] ?? 0, m[1]?.[i] ?? 0, m[2]?.[i] ?? 0];
}

/** Inversa de una matriz de 3×3 dada por filas. */
function invert3(a: Vec3, b: Vec3, c: Vec3): Vec3[] {
  const det = dot(a, cross(b, c));
  const r0 = scale(cross(b, c), 1 / det);
  const r1 = scale(cross(c, a), 1 / det);
  const r2 = scale(cross(a, b), 1 / det);
  // Columnas de la inversa = r0, r1, r2; se devuelve por filas.
  return [
    [r0[0], r1[0], r2[0]],
    [r0[1], r1[1], r2[1]],
    [r0[2], r1[2], r2[2]],
  ];
}

/** Lo que sabe un material sobre el pixel que pinta. */
export interface Sample {
  /** Pixel de la imagen. */
  readonly x: number;
  readonly y: number;
  /** Punto y normal en el espacio del modelo. */
  readonly p: Vec3;
  readonly n: Vec3;
  /** Luz que recibe, de 0 (sombra) a 1 (de frente a la luz). */
  readonly light: number;
}

/** Color de un pixel, o null para dejarlo sin pintar (por ejemplo, fuera del pelo). */
export type Material = (sample: Sample) => Rgb | null;

/** Luz desde arriba a la izquierda y un poco de frente, como en UO. */
const LIGHT: Vec3 = normalize([-0.5, 0.65, 0.8]);
const AMBIENT = 0.3;

/** Escala de 5 tonos con sombras frías y luces cálidas (técnica clásica de pixel art). */
export type Ramp = readonly [Rgb, Rgb, Rgb, Rgb, Rgb];

export function ramp(base: Rgb): Ramp {
  const tint = (color: Rgb, [r, g, b]: Rgb, amount: number): Rgb => [
    Math.round(color[0] + (r - color[0]) * amount),
    Math.round(color[1] + (g - color[1]) * amount),
    Math.round(color[2] + (b - color[2]) * amount),
  ];
  return [
    tint(shade(base, 0.45), [40, 30, 70], 0.25),
    tint(shade(base, 0.68), [50, 45, 90], 0.15),
    base,
    tint(shade(base, 1.18), [255, 240, 200], 0.1),
    tint(shade(base, 1.38), [255, 245, 215], 0.25),
  ];
}

/**
 * Tono de la escala según la luz; `bias` corre uno o más escalones. Entre
 * dos tonos de la escala se pasa en degradé (sombreado suave, como los
 * sprites renderizados de UO), sin escalones marcados.
 */
export function tone(colors: Ramp, light: number, bias = 0): Rgb {
  const at = Math.max(0, Math.min(4, light * 4.6 - 0.7 + bias));
  const low = Math.floor(at);
  const a = colors[low] ?? colors[2];
  const b = colors[Math.min(4, low + 1)] ?? a;
  const t = at - low;
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/** Material liso de un color. */
export const solid =
  (colors: Ramp, bias = 0): Material =>
  (s) =>
    tone(colors, s.light, bias);

/** Material metálico: más contraste y un brillo puntual. */
export const metal =
  (colors: Ramp): Material =>
  (s) =>
    s.light > 0.92 ? [250, 250, 245] : tone(colors, s.light * 1.15 - 0.08);

/** Materiales que pueden dejar un pixel sin pintar (devuelven null): se resuelven en el momento. */
const CLIPPING = new WeakSet<Material>();

/** Marca un material que puede devolver null (máscaras de pelo, telas con huecos). */
export function clipping(material: Material): Material {
  CLIPPING.add(material);
  return material;
}

/** Hash determinístico de una posición, para texturas (pelaje, tela). */
export function noise(x: number, y: number, z = 0): number {
  const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return h - Math.floor(h);
}

/**
 * Lienzo con profundidad: cada pixel guarda su color y qué tan cerca de la
 * cámara está, así las piezas se tapan bien entre sí sin ordenarlas a mano.
 */
export class VolumeCanvas {
  private readonly depth: Float32Array;
  private readonly colors: (Rgb | null)[];
  /**
   * Sombreado diferido: cada pixel guarda la cara más cercana (normal y
   * material) y recién al final se calcula su color, una sola vez, aunque
   * muchas piezas se hayan pisado encima.
   */
  private readonly pending: Int32Array;
  private readonly normals: Float32Array;
  private readonly materials: Material[] = [];
  private readonly materialIndex = new Map<Material, number>();

  constructor(
    readonly width: number,
    readonly height: number,
    readonly camera: Projection,
  ) {
    this.depth = new Float32Array(width * height).fill(-Infinity);
    this.colors = new Array<Rgb | null>(width * height).fill(null);
    this.pending = new Int32Array(width * height).fill(-1);
    this.normals = new Float32Array(width * height * 3);
  }

  /** Elipsoide con centro y ejes (ortonormales) en el espacio del modelo. */
  ellipsoid(
    center: Vec3,
    axes: readonly [Vec3, Vec3, Vec3],
    modelRadii: Vec3,
    material: Material,
  ): void {
    this.rasterize(center, axes, modelRadii, (x, y, t, normal) =>
      this.paint(x, y, t, normal, material),
    );
  }

  /**
   * Recorre los pixeles que cubre un elipsoide y llama a `hit` con la
   * profundidad y la normal (en la cámara) de los que quedan adelante de lo
   * ya pintado. Cuentas planas, sin crear vectores por pixel: es el corazón
   * del dibujo y se llama millones de veces.
   */
  private rasterize(
    center: Vec3,
    axes: readonly [Vec3, Vec3, Vec3],
    modelRadii: Vec3,
    hit: (x: number, y: number, t: number, normal: Vec3) => void,
  ): void {
    const c = this.camera.point(center);
    const zoom = this.camera.zoom;
    // Por eje: el dual (para saber si un punto cae adentro), su radio y su extensión en la imagen.
    let ax0 = 0,
      ay0 = 0,
      az0 = 0,
      ax1 = 0,
      ay1 = 0,
      az1 = 0,
      ax2 = 0,
      ay2 = 0,
      az2 = 0;
    let extentX = 0;
    let extentY = 0;
    const r0 = (modelRadii[0] ?? 1) * zoom;
    const r1 = (modelRadii[1] ?? 1) * zoom;
    const r2 = (modelRadii[2] ?? 1) * zoom;
    for (let i = 0; i < 3; i++) {
      const axis = axes[i] ?? [0, 0, 1];
      const dual = this.camera.dual(axis);
      const image = this.camera.forward(axis);
      const r = i === 0 ? r0 : i === 1 ? r1 : r2;
      extentX += (image[0] * r) ** 2;
      extentY += (image[1] * r) ** 2;
      if (i === 0) [ax0, ay0, az0] = dual;
      else if (i === 1) [ax1, ay1, az1] = dual;
      else [ax2, ay2, az2] = dual;
    }
    extentX = Math.sqrt(extentX);
    extentY = Math.sqrt(extentY);
    const minX = Math.max(0, Math.floor(c[0] - extentX));
    const maxX = Math.min(this.width - 1, Math.ceil(c[0] + extentX));
    const minY = Math.max(0, Math.floor(c[1] - extentY));
    const maxY = Math.min(this.height - 1, Math.ceil(c[1] + extentY));
    // a_i = axis_z / r (constante); b_i = (d · axis) / r, lineal en x e y.
    const a0 = az0 / r0;
    const a1 = az1 / r1;
    const a2 = az2 / r2;
    const qa = a0 * a0 + a1 * a1 + a2 * a2;
    const dz = -c[2];
    const depth = this.depth;
    const width = this.width;

    for (let y = minY; y <= maxY; y++) {
      const dy = y + 0.5 - c[1];
      for (let x = minX; x <= maxX; x++) {
        const dx = x + 0.5 - c[0];
        const b0 = (dx * ax0 + dy * ay0 + dz * az0) / r0;
        const b1 = (dx * ax1 + dy * ay1 + dz * az1) / r1;
        const b2 = (dx * ax2 + dy * ay2 + dz * az2) / r2;
        const qb = 2 * (a0 * b0 + a1 * b1 + a2 * b2);
        const qc = b0 * b0 + b1 * b1 + b2 * b2 - 1;
        const disc = qb * qb - 4 * qa * qc;
        if (disc < 0) continue;
        const t = (-qb + Math.sqrt(disc)) / (2 * qa);
        if (t <= (depth[y * width + x] ?? Infinity)) continue;
        // Normal: gradiente de la ecuación del elipsoide.
        const lz = t - c[2];
        const k0 = (dx * ax0 + dy * ay0 + lz * az0) / (r0 * r0);
        const k1 = (dx * ax1 + dy * ay1 + lz * az1) / (r1 * r1);
        const k2 = (dx * ax2 + dy * ay2 + lz * az2) / (r2 * r2);
        hit(
          x,
          y,
          t,
          this.camera.modelNormal([
            ax0 * k0 + ax1 * k1 + ax2 * k2,
            ay0 * k0 + ay1 * k1 + ay2 * k2,
            az0 * k0 + az1 * k1 + az2 * k2,
          ]),
        );
      }
    }
  }

  sphere(center: Vec3, radius: number, material: Material): void {
    this.ellipsoid(center, IDENTITY, [radius, radius, radius], material);
  }

  /**
   * Extremidad redondeada de `a` a `b`, que se afina de `ra` a `rb`: la
   * superficie que barre una esfera al recorrer el eje (un "tubo" liso).
   * Para cada pixel se busca el punto del eje cuya esfera queda más
   * adelante; de ahí salen la profundidad y la normal.
   */
  limb(a: Vec3, b: Vec3, ra: number, rb: number, material: Material): void {
    const zoom = this.camera.zoom;
    const ca = this.camera.point(a);
    const cb = this.camera.point(b);
    const r0 = ra * zoom;
    const r1 = rb * zoom;
    const reach = Math.max(r0, r1);
    const minX = Math.max(0, Math.floor(Math.min(ca[0], cb[0]) - reach));
    const maxX = Math.min(this.width - 1, Math.ceil(Math.max(ca[0], cb[0]) + reach));
    const minY = Math.max(0, Math.floor(Math.min(ca[1], cb[1]) - reach));
    const maxY = Math.min(this.height - 1, Math.ceil(Math.max(ca[1], cb[1]) + reach));
    const ex = cb[0] - ca[0];
    const ey = cb[1] - ca[1];
    const ez = cb[2] - ca[2];
    const er = r1 - r0;
    const depth = this.depth;
    const width = this.width;

    const axis2 = ex * ex + ey * ey;
    const endOn = axis2 < (reach * 2) ** 2;
    const band = endOn ? 1 : (reach * 1.05) / Math.sqrt(axis2);
    const cz = ca[2];
    // Altura de la esfera en el punto k del eje sobre (px, py), o -∞ si no lo cubre.
    let px = 0;
    let py = 0;
    const front = (k: number): number => {
      const dx = px - (ca[0] + ex * k);
      const dy = py - (ca[1] + ey * k);
      const r = r0 + er * k;
      const h = r * r - dx * dx - dy * dy;
      return h < 0 ? -Infinity : cz + ez * k + Math.sqrt(h);
    };

    for (let y = minY; y <= maxY; y++) {
      py = y + 0.5;
      for (let x = minX; x <= maxX; x++) {
        px = x + 0.5;
        // Descarte rápido: lejos del eje en la imagen no hay nada.
        const along =
          axis2 > 0 ? Math.max(0, Math.min(1, ((px - ca[0]) * ex + (py - ca[1]) * ey) / axis2)) : 0;
        const gx = px - (ca[0] + ex * along);
        const gy = py - (ca[1] + ey * along);
        if (gx * gx + gy * gy > reach * reach) continue;
        // La altura es cóncava en k: búsqueda ternaria cerca de la proyección, y los extremos.
        // Solo puede cubrir este pixel la parte del eje a menos de un radio de la
        // proyección (si apunta casi hacia la cámara, se busca en todo el eje).
        let lo = endOn ? 0 : Math.max(0, along - band);
        let hi = endOn ? 1 : Math.min(1, along + band);
        for (let i = 0; i < 9; i++) {
          const m1 = lo + (hi - lo) / 3;
          const m2 = hi - (hi - lo) / 3;
          if (front(m1) < front(m2)) lo = m1;
          else hi = m2;
        }
        let k = (lo + hi) / 2;
        let z = front(k);
        const z0 = front(0);
        if (z0 > z) {
          k = 0;
          z = z0;
        }
        const z1 = front(1);
        if (z1 > z) {
          k = 1;
          z = z1;
        }
        if (z === -Infinity || z <= (depth[y * width + x] ?? Infinity)) continue;
        const normal = this.camera.modelNormal([
          px - (ca[0] + ex * k),
          py - (ca[1] + ey * k),
          z - (cz + ez * k),
        ]);
        this.paint(x, y, z, normal, material);
      }
    }
  }

  /** Caja con centro, ejes y medias medidas (libros, lingotes, cabezas de martillo). */
  box(center: Vec3, axes: readonly [Vec3, Vec3, Vec3], half: Vec3, material: Material): void {
    const [ax, ay, az] = axes;
    const corner = (sx: number, sy: number, sz: number): Vec3 =>
      add(
        center,
        add(add(scale(ax, sx * half[0]), scale(ay, sy * half[1])), scale(az, sz * half[2])),
      );
    const faces: [number, number, number][][] = [
      [
        [-1, 1, -1],
        [1, 1, -1],
        [1, 1, 1],
        [-1, 1, 1],
      ],
      [
        [-1, -1, -1],
        [1, -1, -1],
        [1, -1, 1],
        [-1, -1, 1],
      ],
      [
        [-1, -1, 1],
        [1, -1, 1],
        [1, 1, 1],
        [-1, 1, 1],
      ],
      [
        [-1, -1, -1],
        [1, -1, -1],
        [1, 1, -1],
        [-1, 1, -1],
      ],
      [
        [1, -1, -1],
        [1, -1, 1],
        [1, 1, 1],
        [1, 1, -1],
      ],
      [
        [-1, -1, -1],
        [-1, -1, 1],
        [-1, 1, 1],
        [-1, 1, -1],
      ],
    ];
    for (const face of faces)
      this.polygon(
        face.map(([x, y, z]) => corner(x, y, z)),
        material,
      );
  }

  /** Polígono plano (capa, delantal, hoja de un arma…), visible de los dos lados. */
  polygon(points: readonly Vec3[], material: Material): void {
    const [p0, p1, p2] = points;
    if (!p0 || !p1 || !p2) return;
    // Normal en el modelo, siempre hacia quien mira.
    let normal = normalize(cross(sub(p1, p0), sub(p2, p0)));
    if (dot(normal, this.camera.viewDir) < 0) normal = scale(normal, -1);
    const [first, ...rest] = points.map((p) => this.camera.point(p));
    if (!first) return;
    for (let i = 0; i + 1 < rest.length; i++) {
      const b = rest[i];
      const c = rest[i + 1];
      if (b && c) this.triangle(first, b, c, normal, material);
    }
  }

  private triangle(a: Vec3, b: Vec3, c: Vec3, normal: Vec3, material: Material): void {
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
    if (Math.abs(area) < 1e-6) return;

    const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
    const maxX = Math.min(this.width - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
    const maxY = Math.min(this.height - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        const w0 = ((b[0] - px) * (c[1] - py) - (c[0] - px) * (b[1] - py)) / area;
        const w1 = ((c[0] - px) * (a[1] - py) - (a[0] - px) * (c[1] - py)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * a[2] + w1 * b[2] + w2 * c[2];
        if (z <= this.depthAt(x, y)) continue;
        this.paint(x, y, z, normal, material);
      }
    }
  }

  /**
   * Pinta un detalle (ojo, boca, botón) sobre una superficie ya dibujada:
   * solo si esa cara mira a la cámara y nada lo tapa.
   */
  decal(point: Vec3, normal: Vec3, color: Rgb, width = 1, height = 1): void {
    if (dot(normalize(normal), this.camera.viewDir) < 0.2) return;
    this.resolve();
    const [cx, cy, cz] = this.camera.point(point);
    const left = Math.round(cx - width / 2);
    const top = Math.round(cy - height / 2);
    for (let y = top; y < top + height; y++) {
      for (let x = left; x < left + width; x++) {
        if (x < 0 || y < 0 || x >= this.width || y >= this.height) continue;
        const i = y * this.width + x;
        if (this.colors[i] && Math.abs((this.depth[i] ?? 0) - cz) < 1.6) this.colors[i] = color;
      }
    }
  }

  private depthAt(x: number, y: number): number {
    return this.depth[y * this.width + x] ?? Infinity;
  }

  private paint(x: number, y: number, z: number, modelNormal: Vec3, material: Material): void {
    const i = y * this.width + x;
    if (CLIPPING.has(material)) {
      // Puede dejar el pixel sin pintar (máscaras): se resuelve ya.
      const color = this.shade(x, y, z, modelNormal, material);
      if (!color) return;
      this.depth[i] = z;
      this.colors[i] = color;
      this.pending[i] = -1;
      return;
    }
    let index = this.materialIndex.get(material);
    if (index === undefined) {
      index = this.materials.length;
      this.materials.push(material);
      this.materialIndex.set(material, index);
    }
    this.depth[i] = z;
    this.pending[i] = index;
    this.normals[i * 3] = modelNormal[0];
    this.normals[i * 3 + 1] = modelNormal[1];
    this.normals[i * 3 + 2] = modelNormal[2];
  }

  private shade(
    x: number,
    y: number,
    z: number,
    modelNormal: Vec3,
    material: Material,
  ): Rgb | null {
    const n = normalize(modelNormal);
    const light = AMBIENT + (1 - AMBIENT) * Math.max(0, dot(n, this.camera.lightDir));
    return material({ x, y, p: this.camera.unproject(x + 0.5, y + 0.5, z), n, light });
  }

  /** Calcula el color de los pixeles que quedaron pendientes. */
  private resolve(): void {
    for (let i = 0; i < this.pending.length; i++) {
      const index = this.pending[i] ?? -1;
      if (index < 0) continue;
      this.pending[i] = -1;
      const material = this.materials[index];
      if (!material) continue;
      const x = i % this.width;
      const y = (i - x) / this.width;
      const normal: Vec3 = [
        this.normals[i * 3] ?? 0,
        this.normals[i * 3 + 1] ?? 0,
        this.normals[i * 3 + 2] ?? 1,
      ];
      const color = this.shade(x, y, this.depth[i] ?? 0, normal, material);
      if (color) this.colors[i] = color;
      else this.depth[i] = -Infinity;
    }
  }

  /**
   * Pasa a imagen: marca con una línea oscura donde una pieza tapa a otra
   * (diferencia grande de profundidad) y agrega el contorno exterior.
   */
  toImage(outline: Rgb): PixelImage {
    this.resolve();
    const image = new PixelImage(this.width, this.height);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const i = y * this.width + x;
        const color = this.colors[i];
        if (!color) continue;
        const z = this.depth[i] ?? 0;
        const closer = (nx: number, ny: number): boolean =>
          nx >= 0 &&
          ny >= 0 &&
          nx < this.width &&
          ny < this.height &&
          (this.depth[ny * this.width + nx] ?? -Infinity) > z + EDGE_DEPTH;
        const covered =
          closer(x - 1, y) || closer(x + 1, y) || closer(x, y - 1) || closer(x, y + 1);
        image.set(x, y, covered ? shade(color, 0.62) : color);
      }
    }
    image.outline(outline, 0.95);
    return image;
  }
}

const IDENTITY: readonly [Vec3, Vec3, Vec3] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

/** Diferencia de profundidad a partir de la cual se dibuja una línea interna. */
const EDGE_DEPTH = 2.2;

/** Ejes de un elipsoide alargado en la dirección `forward` (con "arriba" aproximado). */
export function axesAlong(forward: Vec3, up: Vec3 = [0, 1, 0]): readonly [Vec3, Vec3, Vec3] {
  const f = normalize(forward);
  const side = normalize(cross(up, f));
  const realUp = cross(f, side);
  return [side, realUp, f];
}
