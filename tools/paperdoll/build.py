"""Arma los gráficos del retrato (ventana de personaje y creación) desde los dibujos fuente.

Los dibujos se hicieron con IA a partir de descripciones propias (ver CLAUDE.md,
«Referencias sí, copia no»). Fuentes en packages/art/sources/paperdoll/; el
resultado va a packages/client/src/assets/paperdoll/.

  python3 tools/paperdoll/build.py

Necesita Pillow, NumPy y SciPy (pip install pillow numpy scipy).

- Cuerpos: uno por sexo, recoloreado a los cuatro tonos de piel del juego.
- Peinados: cada hoja trae varios; se separan, se calzan sobre la cabeza del
  cuerpo (escala y posición en PEINADOS, buscadas con fit.py) y se pasan a gris
  para teñirlos en el juego con el color de pelo elegido.
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
# El cuerpo fuente está pintado con el segundo tono; los demás salen en proporción.
BASE_TONE = 1

# Peinados de cada hoja, en orden (de arriba abajo y de izquierda a derecha):
# (identificador del juego, escala, x, y) en coordenadas del cuerpo fuente.
PEINADOS = {
    ("hombre", "peinados-hombre-1.webp"): [
        ("mohawk", 0.895, 406, -12),
        ("long", 0.82, 328, -12),
        ("buzz", 0.915, 404, -12),
        ("topknot", 0.895, 364, -76),
        ("side-braid", 0.89, 352, -34),
        ("receding", 0.92, 388, -6),
        ("ponytail", 0.905, 336, -140),
        ("twin-buns", 0.865, 364, -108),
        ("braid", 0.87, 312, -20),
    ],
    ("mujer", "peinados-mujer-1.webp"): [
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
}

GENDER = {"hombre": "male", "mujer": "female"}

# Los peinados se achican un poco hacia el centro de la cabeza para que calcen mejor.
HAIR_SHRINK = 0.93
HEAD_CENTER = {"hombre": (512, 115), "mujer": (522, 100)}

def to_canvas(layer: Image.Image, x: int, y: int) -> Image.Image:
    """Pone una capa (en coordenadas del cuerpo fuente) en el lienzo final."""
    canvas = Image.new("RGBA", (1024, 1536 + PAD_TOP), (0, 0, 0, 0))
    top = y + PAD_TOP
    # Lo que queda afuera del lienzo se recorta.
    cut = layer.crop((max(0, -x), max(0, -top), layer.width, layer.height))
    canvas.alpha_composite(cut, (max(0, x), max(0, top)))
    return canvas.resize((WIDTH, HEIGHT), Image.LANCZOS)


def rgb(color: int) -> np.ndarray:
    return np.array([(color >> 16) & 255, (color >> 8) & 255, color & 255], dtype=float)


def bodies() -> None:
    for name, gender in GENDER.items():
        a = np.array(Image.open(SOURCES / f"cuerpo-{name}.webp").convert("RGBA")).astype(float)
        color = a[..., :3] / 255
        mx, mn = color.max(-1), color.min(-1)
        sat = (mx - mn) / np.maximum(mx, 1e-6)
        # La piel: tonos cálidos y saturados (no la ropa interior, ni los ojos).
        skin = (a[..., 3] > 128) & (sat > 0.28) & (color[..., 0] > color[..., 2])
        skin = ndimage.binary_opening(skin, iterations=1)
        soft = ndimage.gaussian_filter(skin.astype(float), 1.2)[..., None]
        for i, tone in enumerate(SKIN_TONES):
            ratio = rgb(tone) / rgb(SKIN_TONES[BASE_TONE])
            out = a.copy()
            out[..., :3] = np.clip(a[..., :3] * (1 - soft + soft * ratio), 0, 255)
            layer = Image.fromarray(out.astype(np.uint8))
            to_canvas(layer, 0, 0).save(OUT / f"body-{gender}-{i}.webp", quality=88, method=6)


def pieces(sheet: Path) -> list[np.ndarray]:
    a = np.array(Image.open(sheet).convert("RGBA"))
    solid = a[..., 3] > 20
    labels, count = ndimage.label(ndimage.binary_dilation(solid, iterations=2))
    boxes = ndimage.find_objects(labels)
    sizes = ndimage.sum(solid, labels, range(1, count + 1))
    found = sorted(
        (box[0].start, box[1].start, box, i + 1)
        for i, (box, size) in enumerate(zip(boxes, sizes))
        if size > 1500
    )
    out = []
    for _, _, box, label in found:
        crop = a[box].copy()
        crop[labels[box] != label] = 0
        out.append(crop)
    return out


def gray(piece: np.ndarray) -> np.ndarray:
    """El pelo en gris (con su luz y su sombra), estirado para teñirlo bien de cualquier color."""
    color = piece[..., :3].astype(float)
    lum = color @ np.array([0.299, 0.587, 0.114])
    hair = piece[..., 3] > 60
    lo, hi = np.percentile(lum[hair], [3, 99])
    g = np.clip(0.4 + 0.6 * (lum - lo) / max(hi - lo, 1), 0, 1) * 255
    out = piece.copy()
    out[..., 0] = out[..., 1] = out[..., 2] = g.astype(np.uint8)
    return out


def hairs() -> None:
    for (name, sheet), styles in PEINADOS.items():
        found = pieces(SOURCES / sheet)
        assert len(found) == len(styles), f"{sheet}: {len(found)} peinados, se esperaban {len(styles)}"
        cx, cy = HEAD_CENTER[name]
        for piece, (style, scale, x, y) in zip(found, styles):
            scale *= HAIR_SHRINK
            x = round(cx + (x - cx) * HAIR_SHRINK)
            y = round(cy + (y - cy) * HAIR_SHRINK)
            im = Image.fromarray(gray(piece))
            im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
            to_canvas(im, x, y).save(OUT / f"hair-{GENDER[name]}-{style}.webp", quality=88, method=6)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    bodies()
    hairs()
    print(f"Listo: {len(list(OUT.glob('*.webp')))} gráficos en {OUT.relative_to(ROOT)}")
