#!/usr/bin/env python3
"""런처 아이콘 PNG 생성 (초록 배경 + 흰색 'あ' + 작은 빨간 원)."""
import os
import sys
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, "android", "res")
FONT_CANDIDATES = [
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf",
    "/usr/share/fonts/truetype/fonts-japanese-gothic.ttf",
]
SIZES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}


def font(size):
    for f in FONT_CANDIDATES:
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    print("no CJK font found", file=sys.stderr)
    return ImageFont.load_default()


def draw_icon(px, round_shape=False):
    s = px * 4  # supersample
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pad = int(s * 0.04)
    if round_shape:
        d.ellipse([pad, pad, s - pad, s - pad], fill=(88, 204, 2, 255))
    else:
        d.rounded_rectangle([pad, pad, s - pad, s - pad], radius=int(s * 0.22), fill=(88, 204, 2, 255))
    # 아래쪽 그림자 띠
    # 빨간 해(일장기 모티브)
    r = int(s * 0.12)
    cx, cy = int(s * 0.74), int(s * 0.27)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 75, 75, 255))
    f = font(int(s * 0.62))
    text = "あ"
    bbox = d.textbbox((0, 0), text, font=f)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (s - tw) / 2 - bbox[0]
    y = (s - th) / 2 - bbox[1] + s * 0.03
    d.text((x + s * 0.012, y + s * 0.02), text, font=f, fill=(70, 163, 2, 255))
    d.text((x, y), text, font=f, fill=(255, 255, 255, 255))
    return img.resize((px, px), Image.LANCZOS)


def main():
    for dpi, px in SIZES.items():
        out = os.path.join(RES, "mipmap-" + dpi)
        os.makedirs(out, exist_ok=True)
        draw_icon(px).save(os.path.join(out, "ic_launcher.png"))
    # 스플래시용 큰 아이콘
    os.makedirs(os.path.join(RES, "drawable-nodpi"), exist_ok=True)
    draw_icon(288).save(os.path.join(RES, "drawable-nodpi", "splash_logo.png"))
    # 웹 앱용 아이콘
    web = os.path.join(ROOT, "web", "img")
    os.makedirs(web, exist_ok=True)
    draw_icon(192).save(os.path.join(web, "icon-192.png"))
    draw_icon(512).save(os.path.join(web, "icon-512.png"))
    print("icons generated")


if __name__ == "__main__":
    main()
