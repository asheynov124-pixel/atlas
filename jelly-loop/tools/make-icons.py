# python3 tools/make-icons.py  - writes the app icons as tiny palette PNGs (pixel art, no anti-aliasing).
import os
from PIL import Image

ART = [
    "IIIIIIIIIIIIIIII",
    "IIIIIIIIIIIIIIII",
    "IIIIINNNNNNIIIII",
    "IIIINNNNNNNNIIII",
    "IIINNHNNNNNNNIII",
    "IIINHNNNNNNNNIII",
    "IIINNWWNNWWNNIII",
    "IIINNWKNNWKNNIII",
    "IIINNNNNNNNNNIII",
    "IIINNNNNNNNNNIII",
    "IIIIIIIIIIIIIIII",
    "IIIRRIIYYIIBBIII",
    "IIIRRIIYYIIBBIII",
    "IIIIIIIIIIIIIIII",
    "IIIIIIIIIIIIIIII",
    "IIIIIIIIIIIIIIII",
]
COLORS = {"I": (67, 56, 202), "N": (244, 114, 182), "H": (251, 207, 232), "W": (248, 250, 252),
          "K": (15, 23, 42), "R": (239, 68, 68), "Y": (250, 204, 21), "B": (59, 130, 246)}
keys = list(COLORS)
here = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "icons")
for size in (192, 512):
    scale = size // 16
    img = Image.new("P", (size, size))
    img.putpalette([v for k in keys for v in COLORS[k]])
    px = img.load()
    for y in range(size):
        for x in range(size):
            px[x, y] = keys.index(ART[y // scale][x // scale])
    out = os.path.join(here, "icon-%d.png" % size)
    img.save(out, optimize=True, bits=4)
    print(out, os.path.getsize(out), "bytes")
