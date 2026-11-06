"""
Genera los iconos de la app a partir de design/logo.png
(un cuadrado con esquinas redondeadas sobre fondo blanco).

Uso, desde la raíz del repositorio:
    python3 design/make-icons.py

Necesita Pillow y NumPy (pip install pillow numpy).
"""
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

src = sys.argv[1] if len(sys.argv) > 1 else 'design/logo.png'
out = sys.argv[2] if len(sys.argv) > 2 else 'public/icons'
logo = Image.open(src).convert('RGB')
W = logo.size[0]
arr = np.array(logo).astype(np.float32)

# 1) Máscara del cuadrado redondeado (supermuestreada), un poco hacia dentro para evitar el halo blanco.
S = 4
inset, radius = 3, 200
big = Image.new('L', (W * S, W * S), 0)
ImageDraw.Draw(big).rounded_rectangle((inset * S, inset * S, (W - inset) * S - 1, (W - inset) * S - 1), radius=radius * S, fill=255)
mask = big.resize((W, W), Image.LANCZOS)
rounded = logo.copy()
rounded.putalpha(mask)

# 2) Fondo: degradado ajustado al fondo azul del logo (modelo cuadrático en x, y),
#    con muestras de una franja cerca del borde, fuera del dibujo blanco.
ys, xs = np.mgrid[0:W, 0:W]
band = np.zeros((W, W), bool)
b0, b1 = 25, 90
band[b0:W - b0, b0:W - b0] = True
band[b1:W - b1, b1:W - b1] = False
inside = np.array(mask) > 250
lum = arr.mean(axis=2)
sel = band & inside & (lum < 140)
# deja fuera el texto «Moxetas Invest» (abajo a la derecha)
sel &= ~((ys > W * 0.85) & (xs > W * 0.6))
X = xs[sel] / W
Y = ys[sel] / W

def design(x, y):
    return np.stack([np.ones_like(x), x, y, x * x, y * y, x * y], axis=-1)

coef, *_ = np.linalg.lstsq(design(X, Y), arr[sel], rcond=None)

def gradient(size, scale, offset):
    g = np.mgrid[0:size, 0:size].astype(np.float32)
    y = (g[0] - offset) / scale
    x = (g[1] - offset) / scale
    return (design(x, y) @ coef).clip(0, 255)

# 3) Versión a sangre (iOS): esquinas rellenas con el degradado.
m = (np.array(mask).astype(np.float32) / 255.0)[..., None]
full = arr * m + gradient(W, W, 0) * (1 - m)
full_img = Image.fromarray(full.clip(0, 255).astype(np.uint8))

# 4) Maskable (Android): logo al 82 % sobre el mismo degradado prolongado; el borde del
#    logo se funde con el fondo para que no se vea un cuadrado dentro del icono.
inner = int(W * 0.8)
off = (W - inner) / 2
bg = gradient(W, inner, off)
small = np.array(full_img.resize((inner, inner), Image.LANCZOS)).astype(np.float32)
fmask = Image.new('L', (inner, inner), 0)
f = int(inner * 0.022)
ImageDraw.Draw(fmask).rounded_rectangle((f, f, inner - f, inner - f), radius=int(radius * inner / W), fill=255)
fmask = np.array(fmask.filter(ImageFilter.GaussianBlur(f * 0.6))).astype(np.float32)[..., None] / 255.0
o = int(off)
region = bg[o:o + inner, o:o + inner]
bg[o:o + inner, o:o + inner] = small * fmask + region * (1 - fmask)
maskable = Image.fromarray(bg.clip(0, 255).astype(np.uint8))

def save(img, size, name):
    img.resize((size, size), Image.LANCZOS).save(f'{out}/{name}', optimize=True)

save(rounded, 512, 'icon-512.png')
save(rounded, 192, 'icon-192.png')
save(rounded, 64, 'icon-64.png')
save(full_img, 180, 'apple-touch-icon.png')
save(maskable, 512, 'icon-maskable-512.png')
print('ok')
