"""Raster image conversion: everything becomes a baseline grayscale (or colour) JPEG."""

import io
from dataclasses import dataclass

from PIL import Image, ImageOps

RASTER_TYPES = {
    "image/jpeg", "image/jpg", "image/pjpeg", "image/png", "image/gif",
    "image/webp", "image/bmp", "image/x-ms-bmp", "image/tiff",
}


@dataclass
class ImageOptions:
    width: int = 480
    height: int = 800
    quality: int = 85
    levels: int = 256
    dither: bool = True
    color: bool = False
    rotate_landscape: bool = False


@dataclass
class ConvertedImage:
    data: bytes
    size_before: tuple
    size_after: tuple


def _flatten_on_white(im):
    has_alpha = im.mode in ("RGBA", "LA", "PA", "RGBa", "La") or "transparency" in im.info
    if has_alpha:
        rgba = im.convert("RGBA")
        bg = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
        bg.alpha_composite(rgba)
        return bg.convert("RGB")
    if im.mode.startswith("I;16") or im.mode == "I":
        return im.point(lambda v: v * (1 / 256)).convert("L")
    return im.convert("RGB") if im.mode not in ("L", "RGB") else im


def _quantize_gray(im, levels, dither):
    vals = [round(i * 255 / (levels - 1)) for i in range(levels)]
    palette = []
    for v in vals:
        palette += [v, v, v]
    pal = Image.new("P", (1, 1))
    pal.putpalette(palette)
    mode = Image.Dither.FLOYDSTEINBERG if dither else Image.Dither.NONE
    return im.convert("RGB").quantize(palette=pal, dither=mode).convert("L")


def convert_image(data, opts):
    """Return a ConvertedImage; raises on undecodable input."""
    with Image.open(io.BytesIO(data)) as src:
        src.seek(0)
        src.load()
        before = src.size
        im = ImageOps.exif_transpose(src)
    im = _flatten_on_white(im)
    im = im.convert("RGB" if opts.color else "L")
    if not opts.color:
        im = ImageOps.autocontrast(im, cutoff=0.5)
    if opts.rotate_landscape and im.width > im.height and im.width > opts.width:
        im = im.transpose(Image.Transpose.ROTATE_270)
    scale = min(opts.width / im.width, opts.height / im.height, 1.0)
    if scale < 1.0:
        size = (max(1, round(im.width * scale)), max(1, round(im.height * scale)))
        im = im.resize(size, Image.Resampling.LANCZOS)
    if not opts.color and opts.levels < 256:
        im = _quantize_gray(im, opts.levels, opts.dither)
    out = io.BytesIO()
    im.save(out, "JPEG", quality=opts.quality, optimize=True, progressive=False)
    return ConvertedImage(out.getvalue(), before, im.size)
