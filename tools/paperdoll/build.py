"""Arma los gráficos del retrato (ventana de personaje y creación) desde los dibujos fuente.

Los dibujos se hicieron con IA a partir de descripciones propias (ver CLAUDE.md,
«Referencias sí, copia no») y se acomodaron a mano sobre el cuerpo base. Las
fuentes están en packages/art/sources/paperdoll/ y el resultado va a
packages/client/src/assets/paperdoll/.

  python3 tools/paperdoll/build.py

Necesita Pillow, NumPy y SciPy (pip install pillow numpy scipy).

- Cuerpos: uno por sexo, recoloreado a los cuatro tonos de piel del juego.
- Rostros: cabezas que se ponen encima de la del cuerpo (también por tono de piel).
- Peinados y barbas: cada hoja trae varios; se separan y se ponen en su lugar
  sobre la cabeza (las posiciones de abajo, buscadas a mano y con ajuste
  automático). Por ahora conservan el color con que se pintaron.
"""

from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
SOURCES = ROOT / "packages/art/sources/paperdoll"
OUT = ROOT / "packages/client/src/assets/paperdoll"

# Lienzo de los cuerpos fuente (1024×1536) con margen arriba para los peinados altos.
PAD_TOP = 170
SCALE = 0.4
WIDTH = round(1024 * SCALE)
HEIGHT = round((1536 + PAD_TOP) * SCALE)

# Los tonos de piel del juego (SKIN_TONES en shared/character/appearance.ts).
SKIN_TONES = [0xF1C27D, 0xE0AC69, 0xC68642, 0x8D5524]
# Los dibujos están pintados con el segundo tono; los demás salen en proporción.
BASE_TONE = 1

# Rostros de hombre: las cabezas de la hoja, en orden, van todas en el mismo lugar.
ROSTROS = {"hombre": ("rostros-hombre.png", (432, 29))}

# Peinados (en orden de la hoja: de arriba abajo y de izquierda a derecha):
# (identificador del juego, x, y) en coordenadas del cuerpo fuente, a tamaño real.
PEINADOS_HOMBRE = (
    "peinados-hombre.webp",
    [
        ("mohawk", 418, 13),
        ("long", 352, 16),
        ("buzz", 436, 28),
        ("topknot", 394, -20),
        ("receding", 418, 34),
        ("side-braid", 388, 10),
        ("ponytail", 373, -80),
        ("twin-buns", 391, -56),
        ("braid", 349, 19),
    ],
)

# Los de mujer vienen de una hoja sin acomodar: (identificador, escala, x, y),
# achicados un poco hacia el centro de la cabeza.
PEINADOS_MUJER = (
    "peinados-mujer.webp",
    [
        ("mohawk", 0.99, 404, -56),
        ("long", 0.86, 356, -40),
        ("buzz", 0.8, 416, -16),
        ("bun", 0.8, 400, -84),
        ("side-braid", 0.9, 372, -64),
        ("receding", 0.84, 395, -26),
        ("twin-buns", 0.81, 392, -106),
        ("ponytail", 0.9, 380, -128),
        ("braid", 0.88, 330, -42),
    ],
)
HAIR_SHRINK_MUJER = 0.93
HEAD_CENTER_MUJER = (522, 100)

# Barbas de hombre, por hoja: filas y columnas (dónde cortar) y, por casillero,
# (identificador del juego, x, y).
BARBAS = [
    (
        "barbas-hombre-1.png",
        [300],
        [465, 615, 770],
        [
            ("mustache", 501, 164),
            ("goatee", 515, 162),
            ("beard", 477, 130),
            ("long-beard", 477, 118),
            ("walrus", 476, 140),
            ("mutton-chops", 474, 113),
            ("sideburns", 472, 113),
            ("chin-strap", 479, 125),
        ],
    ),
    (
        "barbas-hombre-2.png",
        [345, 495],
        [430, 580, 730],
        [
            ("braided-beard", 472, 123),
            ("twin-braids", 470, 123),
            ("three-braids", 464, 127),
            ("wild-beard", 460, 120),
            ("full-beard", 455, 132),
            ("curled-beard", 468, 129),
            ("trimmed-beard", 460, 141),
            ("forked-beard", 462, 133),
            ("chin-curtain", 457, 112),
            ("boxed-beard", 470, 120),
            ("chin-braid", 515, 168),
            ("braided-mustache", 459, 124),
        ],
    ),
]

GENDER = {"hombre": "male", "mujer": "female"}


def to_canvas(layer: Image.Image, x: int, y: int) -> Image.Image:
    """Pone una capa (en coordenadas del cuerpo fuente) en el lienzo final."""
    canvas = Image.new("RGBA", (1024, 1536 + PAD_TOP), (0, 0, 0, 0))
    top = y + PAD_TOP
    # Lo que queda afuera del lienzo se recorta.
    cut = layer.crop((max(0, -x), max(0, -top), layer.width, layer.height))
    canvas.alpha_composite(cut, (max(0, x), max(0, top)))
    return canvas.resize((WIDTH, HEIGHT), Image.LANCZOS)


def save(layer: Image.Image, x: int, y: int, name: str) -> None:
    to_canvas(layer, x, y).save(OUT / f"{name}.webp", quality=88, method=6)


def rgb(color: int) -> np.ndarray:
    return np.array([(color >> 16) & 255, (color >> 8) & 255, color & 255], dtype=float)


def skin_tones(a: np.ndarray) -> list[Image.Image]:
    """La misma imagen en los cuatro tonos de piel (solo cambia la piel)."""
    color = a[..., :3].astype(float) / 255
    mx, mn = color.max(-1), color.min(-1)
    sat = (mx - mn) / np.maximum(mx, 1e-6)
    # La piel: tonos cálidos y saturados (no la ropa interior, ni los ojos).
    skin = (a[..., 3] > 128) & (sat > 0.28) & (color[..., 0] > color[..., 2])
    skin = ndimage.binary_opening(skin, iterations=1)
    soft = ndimage.gaussian_filter(skin.astype(float), 1.2)[..., None]
    out = []
    for tone in SKIN_TONES:
        ratio = rgb(tone) / rgb(SKIN_TONES[BASE_TONE])
        b = a.astype(float).copy()
        b[..., :3] = np.clip(b[..., :3] * (1 - soft + soft * ratio), 0, 255)
        out.append(Image.fromarray(b.astype(np.uint8)))
    return out


def components(sheet: str, min_px: int = 3000) -> list[np.ndarray]:
    """Las piezas sueltas de una hoja (los pedacitos chicos van con la pieza más cercana)."""
    a = np.array(Image.open(SOURCES / sheet).convert("RGBA"))
    solid = a[..., 3] > 20
    labels, count = ndimage.label(solid)
    sizes = ndimage.sum(solid, labels, range(1, count + 1))
    big = [i + 1 for i, size in enumerate(sizes) if size >= min_px]
    dist, (iy, ix) = ndimage.distance_transform_edt(~np.isin(labels, big), return_indices=True)
    owner = labels[iy, ix]
    found = []
    for b in big:
        m = (owner == b) & solid & ((labels == b) | (dist < 25))
        ys, xs = np.where(m)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        crop = a[y0:y1, x0:x1].copy()
        crop[~m[y0:y1, x0:x1]] = 0
        found.append((y0 // 200, x0, crop))
    return [crop for _, _, crop in sorted(found, key=lambda f: (f[0], f[1]))]


def cells(sheet: str, rows: list[int], cols: list[int]) -> list[np.ndarray]:
    """Las piezas de una hoja en grilla: lo de cada casillero junto (las patillas son dos)."""
    a = np.array(Image.open(SOURCES / sheet).convert("RGBA"))
    solid = a[..., 3] > 20
    labels, count = ndimage.label(ndimage.binary_dilation(solid, iterations=1))
    boxes = ndimage.find_objects(labels)
    sizes = ndimage.sum(solid, labels, range(1, count + 1))
    grid: dict[tuple[int, int], list[int]] = {}
    for i, (box, size) in enumerate(zip(boxes, sizes)):
        if size < 200:
            continue
        cy = (box[0].start + box[0].stop) / 2
        cx = (box[1].start + box[1].stop) / 2
        key = (sum(cy > r for r in rows), sum(cx > c for c in cols))
        grid.setdefault(key, []).append(i + 1)
    out = []
    for key in sorted(grid):
        m = np.isin(labels, grid[key]) & solid
        ys, xs = np.where(m)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        crop = a[y0:y1, x0:x1].copy()
        crop[~m[y0:y1, x0:x1]] = 0
        out.append(crop)
    return out


def without_thin_lines(piece: np.ndarray) -> np.ndarray:
    """Saca líneas finas sueltas (un trazo que quedó en el dibujo de las entradas)."""
    solid = piece[..., 3] > 20
    thick = ndimage.binary_dilation(ndimage.binary_erosion(solid, iterations=2), iterations=3)
    out = piece.copy()
    out[~thick] = 0
    return out


def bodies() -> None:
    for name, gender in GENDER.items():
        a = np.array(Image.open(SOURCES / f"cuerpo-{name}.webp").convert("RGBA"))
        for i, layer in enumerate(skin_tones(a)):
            save(layer, 0, 0, f"body-{gender}-{i}")


def faces() -> None:
    for name, (sheet, (x, y)) in ROSTROS.items():
        for k, face in enumerate(components(sheet)):
            # El corte del cuello se esfuma para que se funda con el del cuerpo.
            fade = np.clip((face.shape[0] - np.arange(face.shape[0])) / 30, 0, 1)
            face = face.copy()
            face[..., 3] = (face[..., 3] * fade[:, None]).astype(np.uint8)
            for i, layer in enumerate(skin_tones(face)):
                save(layer, x, y, f"face-{GENDER[name]}-{k}-{i}")


def hairs() -> None:
    sheet, styles = PEINADOS_HOMBRE
    found = components(sheet)
    assert len(found) == len(styles), f"{sheet}: {len(found)} peinados, se esperaban {len(styles)}"
    for piece, (style, x, y) in zip(found, styles):
        if style == "receding":
            piece = without_thin_lines(piece)
        save(Image.fromarray(piece), x, y, f"hair-male-{style}")

    sheet, styles = PEINADOS_MUJER
    found = components(sheet, min_px=1500)
    assert len(found) == len(styles), f"{sheet}: {len(found)} peinados, se esperaban {len(styles)}"
    cx, cy = HEAD_CENTER_MUJER
    for piece, (style, scale, x, y) in zip(found, styles):
        k = HAIR_SHRINK_MUJER
        scale *= k
        x, y = round(cx + (x - cx) * k), round(cy + (y - cy) * k)
        im = Image.fromarray(piece)
        im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
        save(im, x, y, f"hair-female-{style}")


def beards() -> None:
    for sheet, rows, cols, styles in BARBAS:
        found = cells(sheet, rows, cols)
        assert len(found) == len(styles), f"{sheet}: {len(found)} barbas, se esperaban {len(styles)}"
        for piece, (style, x, y) in zip(found, styles):
            save(Image.fromarray(piece), x, y, f"beard-male-{style}")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.webp"):
        old.unlink()
    bodies()
    faces()
    hairs()
    beards()
    print(f"Listo: {len(list(OUT.glob('*.webp')))} gráficos en {OUT.relative_to(ROOT)}")
