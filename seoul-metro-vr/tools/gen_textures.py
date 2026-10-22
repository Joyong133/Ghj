#!/usr/bin/env python3
"""실사풍 텍스처 생성기 (외부 이미지 없이 numpy + PIL 로 그린다).

  python3 tools/gen_textures.py [assets/textures]

생성물
  env/      하늘 파노라마(낮/밤), 아파트·사무실·상가·빌라 외벽, 나무, 잔디, 도로, 물, 방음벽, 터널벽
  station/  법랑 벽패널, 화강석 바닥, 알루미늄 천장, 점자블록, 콘크리트, 광고 포스터, 주변지역 안내도
  train/    스테인리스 외판, 실내 패널, 바닥재, 좌석 모켓, 스티커, 광고, 노선도 띠
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "assets/textures")
FONT_DIR = "/usr/share/fonts/truetype/nanum"
HERE = os.path.dirname(os.path.abspath(__file__))
rng = np.random.default_rng(20240601)


def font(size, bold=True, square=False):
    if square:
        name = "NanumSquareB.ttf" if bold else "NanumSquareR.ttf"
    else:
        name = "NanumBarunGothicBold.ttf" if bold else "NanumBarunGothic.ttf"
    return ImageFont.truetype(os.path.join(FONT_DIR, name), size)


def save(img, rel):
    p = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    img.save(p, optimize=True)
    print("  ", rel, img.size)


# ---------------------------------------------------------------- 노이즈
def fbm(h, w, beta=2.0, seed=None):
    """주기적(타일 가능) 1/f^beta 노이즈, 0..1"""
    r = np.random.default_rng(seed) if seed is not None else rng
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.fftfreq(w)[None, :]
    f = np.sqrt(fx * fx + fy * fy)
    f[0, 0] = 1.0
    spec = (r.standard_normal((h, w)) + 1j * r.standard_normal((h, w))) / f ** (beta / 2)
    spec[0, 0] = 0
    n = np.real(np.fft.ifft2(spec))
    n -= n.min()
    n /= n.max() + 1e-9
    return n


def to_img(a):
    a = np.clip(a, 0, 1)
    return Image.fromarray((a * 255).astype(np.uint8))


def colorize(n, c0, c1):
    c0 = np.array(c0, dtype=np.float64)
    c1 = np.array(c1, dtype=np.float64)
    return n[..., None] * (c1 - c0) + c0


def rgb(a):
    return Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8), "RGB")


def rgba(a):
    return Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8), "RGBA")


def speckle(h, w, base, amount, density, colors, seed=1):
    r = np.random.default_rng(seed)
    img = np.ones((h, w, 3)) * np.array(base)
    img += (fbm(h, w, 1.2, seed) - 0.5)[..., None] * amount
    m = r.random((h, w)) < density
    cidx = r.integers(0, len(colors), (h, w))
    for i, c in enumerate(colors):
        sel = m & (cidx == i)
        img[sel] = c
    return img


# ================================================================ 하늘
def ridge(w, scale, rough, seed):
    r = np.random.default_rng(seed)
    x = np.zeros(w)
    amp = 1.0
    for octave in range(7):
        n = 4 * 2 ** octave
        pts = r.random(n + 1)
        pts[-1] = pts[0]
        xs = np.linspace(0, n, w, endpoint=False)
        i = xs.astype(int)
        t = xs - i
        t = t * t * (3 - 2 * t)
        x += amp * (pts[i] * (1 - t) + pts[(i + 1) % (n + 1)] * t)
        amp *= rough
    x -= x.min()
    return x / x.max() * scale


def sky_panorama(w, h, night=False):
    v = np.linspace(0, 1, h)[:, None]            # 0 = 천정, 0.5 = 지평선
    u = np.linspace(0, 1, w, endpoint=False)[None, :]
    alt = (0.5 - v) * 2                          # 1 천정 .. 0 지평선 .. -1 바닥
    if not night:
        zen = np.array([0.24, 0.45, 0.80])
        hor = np.array([0.80, 0.86, 0.92])
    else:
        zen = np.array([0.012, 0.018, 0.05])
        hor = np.array([0.10, 0.09, 0.12])
    t = np.clip(alt, 0, 1) ** 0.45
    sky = hor + (zen - hor) * t[..., None]
    sky = np.broadcast_to(sky, (h, w, 3)).copy()
    # 해 주변 빛
    if not night:
        su, sv = 0.30, 0.30
        du = np.minimum(np.abs(u - su), 1 - np.abs(u - su)) * 2
        dv = v - sv
        d = np.sqrt(du * du + dv * dv * 4)
        sky += (np.exp(-d * 9)[..., None] * np.array([0.35, 0.30, 0.18]))
        sky += (np.exp(-d * 60)[..., None] * np.array([0.6, 0.55, 0.4]))
    # 구름 (원근: 지평선 쪽은 납작하게)
    cl = fbm(h // 2, w, 2.3, 11)
    cl2 = fbm(h // 2, w, 1.6, 12)
    cloud = np.clip((cl * 0.75 + cl2 * 0.25 - 0.52) * 3.2, 0, 1)
    cloud = np.vstack([cloud, np.zeros((h - h // 2, w))])
    fade = np.clip(alt / 0.08, 0, 1) * np.clip((1.0 - alt) / 0.3, 0.25, 1)
    cloud *= fade
    ccol = np.array([0.97, 0.97, 0.98]) if not night else np.array([0.10, 0.10, 0.14])
    shade = 1 - 0.25 * fbm(h, w, 2.0, 13)[..., None]
    sky = sky * (1 - cloud[..., None] * 0.85) + ccol * shade * cloud[..., None] * 0.85
    if night:
        st = rng.random((h, w)) > 0.9985
        st &= alt > 0.15
        sky[st] = [0.8, 0.8, 0.9]

    img = rgb(sky)
    dr = ImageDraw.Draw(img)
    horizon = h // 2
    # 먼 산 (북한산·관악산 느낌의 겹친 능선)
    layers = [
        (0.085, 0.55, 3, (0.58, 0.64, 0.72) if not night else (0.05, 0.05, 0.08)),
        (0.060, 0.58, 4, (0.48, 0.55, 0.62) if not night else (0.035, 0.035, 0.05)),
        (0.035, 0.60, 5, (0.40, 0.46, 0.50) if not night else (0.02, 0.02, 0.03)),
    ]
    for scale, rough, seed, col in layers:
        rg = ridge(w, scale * h, rough, seed)
        rg2 = ridge(w, 1.0, 0.5, seed + 9)
        rg = rg * (0.35 + 0.65 * rg2)
        pts = [(x, horizon - rg[x]) for x in range(w)] + [(w - 1, horizon + 4), (0, horizon + 4)]
        dr.polygon(pts, fill=tuple(int(c * 255) for c in col))
    # 먼 도시 스카이라인
    r = np.random.default_rng(31)
    x = 0
    sk_col = (0.62, 0.66, 0.72) if not night else (0.06, 0.06, 0.08)
    lights = []
    while x < w:
        bw = int(r.integers(4, 18) * w / 4096)
        bh = int(r.choice([6, 10, 14, 18, 26, 34]) * h / 2048 * r.uniform(0.6, 1.4))
        if r.random() < 0.85:
            c = tuple(int(255 * min(1, cc + r.uniform(-0.04, 0.04))) for cc in sk_col)
            dr.rectangle([x, horizon - bh, x + bw, horizon + 2], fill=c)
            if night:
                for _ in range(int(bw * bh / 10)):
                    lx = x + r.integers(0, max(1, bw))
                    ly = horizon - r.integers(0, max(1, bh))
                    lights.append((lx, ly))
        x += bw + int(r.integers(0, 4))
    for lx, ly in lights:
        dr.point((lx, ly), fill=(255, 210, 140))
    # 지평선 아래: 흐린 지면
    below = (0.45, 0.47, 0.46) if not night else (0.03, 0.03, 0.04)
    dr.rectangle([0, horizon + 2, w, h], fill=tuple(int(c * 255) for c in below))
    # 지평선 연무
    a = np.asarray(img).astype(np.float64) / 255
    hz = np.exp(-((v - 0.5) / 0.018) ** 2)[..., None]
    haze = np.array([0.80, 0.84, 0.88]) if not night else np.array([0.20, 0.14, 0.10])
    a = a * (1 - hz * 0.55) + haze * hz * 0.55
    return rgb(a)


# ================================================================ 건물 외벽
def apt_facade():
    """아파트 한 세대 폭(약 5.6m) × 한 층(2.8m) 타일: 256 × 128"""
    w, h = 256, 128
    a = np.ones((h, w, 3)) * np.array([0.93, 0.92, 0.88])
    a += (fbm(h, w, 1.5, 3) - 0.5)[..., None] * 0.05
    img = rgb(a)
    d = ImageDraw.Draw(img)
    # 발코니 창 (확장형 통창) + 난간
    d.rectangle([18, 22, 238, 92], fill=(80, 98, 112))
    for x in range(18, 238, 44):
        d.line([x, 22, x, 92], fill=(200, 205, 205), width=3)
    d.rectangle([18, 22, 238, 30], fill=(170, 185, 195))
    d.rectangle([14, 92, 242, 100], fill=(210, 210, 205))
    for x in range(20, 240, 8):
        d.line([x, 70, x, 92], fill=(150, 150, 150), width=1)
    d.line([18, 70, 238, 70], fill=(140, 140, 140), width=2)
    # 커튼/블라인드 변화
    r = np.random.default_rng(5)
    for x in range(22, 234, 44):
        if r.random() < 0.6:
            c = tuple(int(v) for v in r.integers(150, 230, 3))
            d.rectangle([x + 2, 32, x + 40, 68], fill=c)
    # 세대 사이 벽과 슬래브
    d.rectangle([0, 0, 255, 6], fill=(205, 203, 196))
    d.rectangle([0, 0, 6, 127], fill=(220, 218, 210))
    return img.filter(ImageFilter.SMOOTH)


def apt_gable(num):
    """아파트 측벽: '101동' 큰 숫자와 무늬. 512 × 1024"""
    w, h = 512, 1024
    a = np.ones((h, w, 3)) * np.array([0.92, 0.91, 0.87])
    a += (fbm(h, w, 1.5, num) - 0.5)[..., None] * 0.05
    img = rgb(a)
    d = ImageDraw.Draw(img)
    # 상단 장식 띠와 로고
    d.rectangle([0, 60, w, 120], fill=(46, 104, 160))
    d.rectangle([0, 128, w, 140], fill=(120, 180, 90))
    f = font(150, square=True)
    txt = f"{num}동"
    tw = d.textlength(txt, font=f)
    d.text(((w - tw) / 2, 170), txt, font=f, fill=(46, 104, 160))
    # 작은 창
    for y in range(400, 1000, 70):
        d.rectangle([220, y, 292, y + 34], fill=(90, 105, 115))
    return img


def office_facade():
    """유리 커튼월: 한 칸 3m × 한 층 3.6m, 128 × 160"""
    w, h = 128, 160
    g = np.ones((h, w, 3)) * np.array([0.33, 0.47, 0.55])
    grad = np.linspace(0.15, -0.05, h)[:, None, None]
    g += grad
    g += (fbm(h, w, 2.5, 7) - 0.5)[..., None] * 0.08
    img = rgb(g)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, w, 10], fill=(150, 160, 165))
    d.rectangle([0, 0, 5, h], fill=(170, 175, 178))
    d.line([64, 10, 64, h], fill=(150, 160, 165), width=2)
    return img


def shop_facade():
    """상가 건물 (4층, 약 16m × 14m) 정면 하나: 512 × 448"""
    w, h = 512, 448
    img = Image.new("RGB", (w, h), (200, 188, 170))
    d = ImageDraw.Draw(img)
    r = np.random.default_rng(9)
    floor_h = h // 4
    signs = [("편의점", (0, 120, 70)), ("약국", (20, 90, 170)), ("치킨", (220, 60, 30)), ("부동산", (60, 60, 160)),
             ("카페", (110, 70, 40)), ("영어학원", (230, 120, 20)), ("치과", (20, 140, 160)), ("PC방", (40, 40, 40)),
             ("분식", (220, 40, 80)), ("세탁소", (80, 140, 60)), ("미용실", (180, 60, 140)), ("태권도", (200, 30, 30))]
    for fl in range(4):
        y0 = h - (fl + 1) * floor_h
        # 창
        d.rectangle([12, y0 + 34, w - 12, y0 + floor_h - 10], fill=(95, 110, 120) if fl else (60, 70, 75))
        for x in range(12, w - 12, 62):
            d.line([x, y0 + 34, x, y0 + floor_h - 10], fill=(180, 180, 175), width=3)
        # 간판
        name, col = signs[int(r.integers(0, len(signs)))]
        d.rectangle([8, y0 + 4, w - 8, y0 + 32], fill=col)
        f = font(24)
        tw = d.textlength(name, font=f)
        d.text(((w - tw) / 2, y0 + 5), name, font=f, fill=(255, 255, 255))
    # 1층 출입구
    d.rectangle([200, h - 72, 312, h], fill=(40, 45, 50))
    return img


def villa_facade():
    """다세대 빌라 (붉은 벽돌, 4층) 512 × 448"""
    w, h = 512, 448
    a = np.ones((h, w, 3)) * np.array([0.60, 0.35, 0.28])
    yy, xx = np.mgrid[0:h, 0:w]
    mortar = ((yy % 8) < 1) | (((xx + (yy // 8 % 2) * 8) % 16) < 1)
    a[mortar] = [0.75, 0.72, 0.66]
    a += (fbm(h, w, 1.0, 21) - 0.5)[..., None] * 0.12
    img = rgb(a)
    d = ImageDraw.Draw(img)
    fh = h // 4
    for fl in range(4):
        y0 = h - (fl + 1) * fh
        for x in (40, 200, 360):
            d.rectangle([x, y0 + 22, x + 110, y0 + 82], fill=(70, 85, 95))
            d.line([x + 55, y0 + 22, x + 55, y0 + 82], fill=(200, 200, 200), width=3)
            d.rectangle([x - 4, y0 + 82, x + 114, y0 + 88], fill=(220, 215, 205))
    d.rectangle([0, 0, w, 10], fill=(110, 110, 105))
    return img


def roof_texture():
    a = speckle(256, 256, [0.55, 0.56, 0.55], 0.10, 0.004, [[0.4, 0.4, 0.4]], 4)
    img = rgb(a)
    d = ImageDraw.Draw(img)
    d.rectangle([150, 40, 220, 110], fill=(70, 120, 160))    # 물탱크
    d.rectangle([30, 160, 90, 200], fill=(150, 150, 145))
    return img


def tree_sprite(kind=0):
    """가로수 스프라이트 (RGBA 256 × 512)"""
    w, h = 256, 512
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = np.random.default_rng(40 + kind)
    d.rectangle([122, 300, 134, 512], fill=(85, 62, 45, 255))
    base = [(52, 92, 40), (70, 110, 45), (40, 78, 35), (88, 125, 55)]
    if kind == 1:   # 은행나무 (노란빛 섞인 원뿔형)
        base = [(90, 130, 40), (120, 150, 50), (70, 110, 35), (150, 160, 60)]
    for _ in range(420):
        if kind == 1:
            y = r.uniform(30, 360)
            spread = 20 + (y - 30) * 0.28
        else:
            y = r.uniform(40, 340)
            spread = 105 * math.sin(min(math.pi, (y - 20) / 330 * math.pi)) + 10
        x = 128 + r.normal(0, spread * 0.5)
        rad = r.uniform(8, 20)
        c = base[int(r.integers(0, len(base)))]
        k = r.uniform(0.8, 1.15)
        d.ellipse([x - rad, y - rad, x + rad, y + rad], fill=(int(c[0] * k), int(c[1] * k), int(c[2] * k), 255))
    return img


def grass_texture():
    n = fbm(512, 512, 1.4, 50) * 0.6 + fbm(512, 512, 2.6, 51) * 0.4
    a = colorize(n, [0.25, 0.36, 0.15], [0.45, 0.55, 0.26])
    dots = rng.random((512, 512)) < 0.03
    a[dots] *= 0.8
    return rgb(a)


def road_texture():
    """왕복 4차로 도로 (폭 14m) 한 구간: 가로 512 = 14m, 세로 512 = 14m"""
    a = speckle(512, 512, [0.30, 0.30, 0.31], 0.08, 0.02, [[0.38, 0.38, 0.38], [0.22, 0.22, 0.22]], 60)
    img = rgb(a)
    d = ImageDraw.Draw(img)
    ppm = 512 / 14
    # 중앙 이중 황색선
    for off in (-0.12, 0.12):
        x = 256 + off * ppm
        d.line([x, 0, x, 512], fill=(220, 180, 40), width=3)
    # 차선 점선
    for lane in (-3.5, 3.5):
        x = 256 + lane * ppm
        for y in range(0, 512, 128):
            d.line([x, y, x, y + 64], fill=(230, 230, 230), width=3)
    # 가장자리 실선
    for edge in (-6.6, 6.6):
        x = 256 + edge * ppm
        d.line([x, 0, x, 512], fill=(230, 230, 230), width=3)
    return img


def water_texture():
    n = fbm(512, 512, 2.2, 70)
    streak = fbm(64, 512, 1.8, 71)
    streak = np.repeat(streak, 8, axis=0)
    a = colorize(n * 0.6 + streak * 0.4, [0.13, 0.25, 0.30], [0.35, 0.48, 0.52])
    return rgb(a)


def noise_barrier():
    """방음벽 패널 RGBA 256 × 256 (아래 금속 흡음판, 위 투명판)"""
    w, h = 256, 256
    a = np.zeros((h, w, 4))
    a[..., :3] = [0.55, 0.62, 0.66]
    a[..., 3] = 1.0
    top = h // 2
    a[:top, :, :3] = [0.75, 0.85, 0.90]
    a[:top, :, 3] = 0.28
    yy, xx = np.mgrid[0:h, 0:w]
    rib = (yy >= top) & ((yy % 16) < 3)
    a[rib, :3] = [0.42, 0.48, 0.52]
    post = (xx % 128) < 8
    a[post, :3] = [0.35, 0.38, 0.40]
    a[post, 3] = 1.0
    dots = (yy < top) & ((yy % 12) < 2) & ((xx % 12) < 2)
    a[dots, :3] = [0.3, 0.3, 0.3]
    a[dots, 3] = 0.8
    return rgba(a)


def tunnel_wall():
    """콘크리트 박스 터널 벽: 가로 512 = 10m(이음매 1개), 세로 256 = 5m"""
    w, h = 512, 256
    n = fbm(h, w, 1.8, 80)
    a = colorize(n, [0.30, 0.30, 0.29], [0.46, 0.46, 0.44])
    stain = fbm(h, w, 1.2, 81)
    a *= (0.85 + 0.15 * stain)[..., None]
    # 물 얼룩 (세로 흐름)
    flow = np.repeat(fbm(1, w, 1.0, 82), h, axis=0)
    a *= (1 - 0.12 * (flow > 0.7) * np.linspace(0.3, 1, h)[:, None])[..., None]
    img = rgb(a)
    d = ImageDraw.Draw(img)
    d.line([0, 0, 0, h], fill=(40, 40, 40), width=4)        # 시공 이음매
    # 케이블 다발
    for y, c in ((110, (30, 30, 30)), (122, (55, 40, 35)), (134, (30, 30, 30))):
        d.line([0, y, w, y], fill=c, width=5)
    for x in range(40, w, 128):
        d.rectangle([x, 100, x + 6, 146], fill=(80, 80, 82))
    return img


# ================================================================ 역
def enamel_panel():
    """법랑 벽패널: 1.2m × 0.6m 판 2×4 장 = 2.4m × 2.4m 가 512²"""
    w = h = 512
    a = np.ones((h, w, 3)) * np.array([0.90, 0.90, 0.87])
    a += (fbm(h, w, 2.0, 90) - 0.5)[..., None] * 0.035
    img = rgb(a)
    d = ImageDraw.Draw(img)
    for x in (0, 256):
        d.line([x, 0, x, h], fill=(150, 150, 148), width=3)
    for y in range(0, h, 128):
        d.line([0, y, w, y], fill=(160, 160, 158), width=2)
    return img


def granite_floor():
    """광택 화강석 바닥 0.6m 타일, 512² = 2.4m"""
    w = h = 512
    a = speckle(h, w, [0.66, 0.65, 0.63], 0.10, 0.08,
                [[0.35, 0.34, 0.33], [0.82, 0.80, 0.78], [0.50, 0.46, 0.44], [0.25, 0.25, 0.26]], 91)
    img = rgb(a).filter(ImageFilter.GaussianBlur(0.6))
    d = ImageDraw.Draw(img)
    for i in range(0, 512, 128):
        d.line([i, 0, i, h], fill=(110, 108, 105), width=2)
        d.line([0, i, w, i], fill=(110, 108, 105), width=2)
    return img


def ceiling_slats():
    """알루미늄 띠 천장: 가로(선로 방향) 512 = 2m, 세로 512 = 2m, 띠 폭 15cm"""
    w = h = 512
    a = np.ones((h, w, 3)) * np.array([0.80, 0.81, 0.82])
    yy = np.arange(h)[:, None]
    gap = (yy % 64) < 5
    a[np.broadcast_to(gap, (h, w))] = [0.42, 0.42, 0.44]
    a += (np.sin(yy / 64 * math.pi) * 0.04)[..., None]
    return rgb(a)


def tactile():
    """점자블록 (30cm, 노란 점형) 256² = 0.6m"""
    w = h = 256
    a = np.ones((h, w, 3)) * np.array([0.95, 0.76, 0.08])
    img = rgb(a)
    d = ImageDraw.Draw(img)
    for gx in range(2):
        for gy in range(2):
            ox, oy = gx * 128, gy * 128
            d.rectangle([ox, oy, ox + 127, oy + 127], outline=(190, 150, 10), width=2)
            for i in range(5):
                for j in range(5):
                    cx, cy = ox + 14 + i * 25, oy + 14 + j * 25
                    d.ellipse([cx - 8, cy - 8, cx + 8, cy + 8], fill=(250, 205, 40), outline=(200, 160, 20))
    return img


def tactile_line():
    """선형 점자블록 (방향 유도)"""
    w = h = 256
    img = Image.new("RGB", (w, h), (242, 194, 20))
    d = ImageDraw.Draw(img)
    for gx in range(2):
        for gy in range(2):
            ox, oy = gx * 128, gy * 128
            d.rectangle([ox, oy, ox + 127, oy + 127], outline=(190, 150, 10), width=2)
            for i in range(4):
                x = ox + 16 + i * 32
                d.rounded_rectangle([x - 5, oy + 10, x + 5, oy + 118], 5, fill=(252, 210, 45), outline=(200, 160, 20))
    return img


def concrete(seed=100, base=(0.62, 0.62, 0.60)):
    n = fbm(512, 512, 1.8, seed)
    a = colorize(n, np.array(base) * 0.85, np.array(base) * 1.08)
    a *= (0.92 + 0.08 * fbm(512, 512, 3.0, seed + 1))[..., None]
    return rgb(a)


ADS = [
    ("지하철 에티켓", "내리는 사람이 먼저\n타는 사람은 나중에", (0, 120, 190), "서울교통공사"),
    ("임산부 배려석", "내일의 주인공을 위한\n자리입니다", (232, 90, 140), "보건복지부"),
    ("에스컬레이터 안전", "두 줄 서기, 걷거나 뛰지 마세요", (240, 150, 20), "한국승강기안전공단"),
    ("서울 여행", "한강에서 만나는\n서울의 밤", (30, 40, 90), "서울특별시"),
    ("휴대폰 소리는 작게", "통화는 짧고 조용하게", (90, 170, 80), "서울교통공사"),
    ("헌혈의 집", "생명을 나누는 따뜻한 손길", (200, 30, 40), "대한적십자사"),
    ("교통카드", "한 장으로 수도권 어디든", (20, 150, 140), "티머니"),
    ("안전한 지하철", "비상시 출입문 비상코크를\n함부로 조작하지 마세요", (230, 60, 20), "서울교통공사"),
]


def poster(title, body, col, sponsor, w=512, h=724, seed=0):
    """광고 포스터 (세로 A 규격 비율)"""
    r = np.random.default_rng(300 + seed)
    top = np.array(col) / 255
    a = np.ones((h, w, 3)) * top
    grad = np.linspace(0, 0.35, h)[:, None, None]
    a = a * (1 - grad) + grad * np.array([1, 1, 1])
    a += (fbm(h, w, 2.0, 300 + seed) - 0.5)[..., None] * 0.08
    img = rgb(a)
    d = ImageDraw.Draw(img)
    # 장식 도형
    for _ in range(5):
        cx, cy, rr = r.integers(0, w), r.integers(h // 3, h), r.integers(40, 140)
        c = tuple(int(min(255, v + 40)) for v in col)
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], outline=c, width=6)
    d.text((40, 60), title, font=font(58), fill=(255, 255, 255))
    d.multiline_text((40, 170), body, font=font(36, bold=False), fill=(255, 255, 255), spacing=14)
    d.rectangle([0, h - 70, w, h], fill=(255, 255, 255))
    d.text((40, h - 56), sponsor, font=font(30), fill=col)
    return img


def station_area_map():
    """주변지역 안내도 512 × 384"""
    w, h = 512, 384
    img = Image.new("RGB", (w, h), (246, 244, 236))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, w, 44], fill=(20, 40, 90))
    d.text((16, 6), "주변지역 안내도  Area Map", font=font(28), fill=(255, 255, 255))
    r = np.random.default_rng(77)
    for _ in range(14):
        x0, y0 = r.integers(20, w - 80), r.integers(60, h - 60)
        d.rectangle([x0, y0, x0 + r.integers(40, 110), y0 + r.integers(25, 60)], fill=(225, 222, 210), outline=(200, 196, 185))
    for y in (110, 220, 320):
        d.line([0, y, w, y], fill=(255, 255, 255), width=10)
    for x in (120, 300, 430):
        d.line([x, 44, x, h], fill=(255, 255, 255), width=10)
    d.ellipse([280, 200, 320, 240], fill=(220, 40, 40))
    d.text((330, 204), "현위치", font=font(22), fill=(220, 40, 40))
    for i, (x, y) in enumerate([(110, 100), (300, 100), (120, 300), (420, 300)]):
        d.rectangle([x, y, x + 26, y + 26], fill=(250, 200, 0))
        d.text((x + 7, y + 1), str(i + 1), font=font(20), fill=(0, 0, 0))
    return img


# ================================================================ 열차
def stainless_ext():
    """주름진 스테인리스 외판: 가로(차량 길이 방향) 512 = 2m, 세로 512 = 2m"""
    w = h = 512
    n = fbm(h, w, 1.0, 120)
    brushed = np.repeat(fbm(h, 8, 1.0, 121)[:, :1], w, axis=1) * 0.5 + n * 0.5
    a = colorize(brushed, [0.66, 0.68, 0.70], [0.80, 0.82, 0.84])
    yy = np.arange(h)[:, None]
    corr = (np.sin(yy / 10.0 * math.pi) * 0.035)
    a += corr[..., None]
    return rgb(a)


def interior_panel():
    a = np.ones((512, 512, 3)) * np.array([0.92, 0.92, 0.90])
    a += (fbm(512, 512, 1.6, 130) - 0.5)[..., None] * 0.03
    return rgb(a)


def vinyl_floor():
    """회색 바탕에 색 점이 박힌 전동차 바닥재: 512² = 1m"""
    a = speckle(512, 512, [0.45, 0.46, 0.48], 0.05, 0.05,
                [[0.65, 0.66, 0.68], [0.30, 0.31, 0.33], [0.55, 0.50, 0.45], [0.40, 0.45, 0.52]], 140)
    return rgb(a).filter(ImageFilter.GaussianBlur(0.5))


def moquette(base, accent, seed):
    """좌석 모켓 무늬: 256² = 0.5m (좌석 하나)"""
    w = h = 256
    a = np.ones((h, w, 3)) * (np.array(base) / 255)
    n = fbm(h, w, 2.8, seed)
    a *= (0.85 + 0.3 * n)[..., None]
    img = rgb(a)
    d = ImageDraw.Draw(img)
    r = np.random.default_rng(seed)
    for _ in range(60):
        x, y = r.integers(0, w), r.integers(0, h)
        s = r.integers(4, 12)
        d.rectangle([x, y, x + s, y + 2], fill=tuple(accent))
    # 좌석 경계 박음질
    d.rectangle([2, 2, w - 3, h - 3], outline=tuple(int(v * 0.6) for v in base), width=4)
    return img


def sticker_priority():
    """노약자석 표지 512 × 160"""
    img = Image.new("RGB", (512, 160), (255, 200, 30))
    d = ImageDraw.Draw(img)
    d.text((24, 18), "노약자 · 장애인 · 임산부석", font=font(40), fill=(40, 30, 0))
    d.text((24, 92), "Priority Seats for the Elderly, Disabled & Pregnant", font=font(20, bold=False), fill=(40, 30, 0))
    return img


def sticker_pink():
    """임산부 배려석 표지 512 × 256"""
    img = Image.new("RGB", (512, 256), (238, 100, 150))
    d = ImageDraw.Draw(img)
    d.ellipse([20, 40, 190, 210], fill=(255, 255, 255))
    d.ellipse([80, 62, 130, 112], fill=(238, 100, 150))
    d.ellipse([62, 112, 150, 200], fill=(238, 100, 150))
    d.text((210, 46), "임산부 배려석", font=font(44), fill=(255, 255, 255))
    d.multiline_text((210, 118), "내일의 주인공을 위한\n자리입니다", font=font(28, bold=False), fill=(255, 255, 255), spacing=8)
    return img


def sticker_door():
    """출입문 경고 스티커 256 × 384 (RGBA)"""
    img = Image.new("RGBA", (256, 384), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([8, 8, 248, 180], 18, fill=(250, 210, 30, 255))
    d.text((24, 24), "기대지", font=font(48), fill=(30, 30, 30, 255))
    d.text((24, 86), "마세요", font=font(48), fill=(30, 30, 30, 255))
    d.text((24, 146), "Do not lean on door", font=font(18, bold=False), fill=(30, 30, 30, 255))
    d.rounded_rectangle([8, 200, 248, 376], 18, fill=(230, 50, 40, 255))
    d.text((24, 214), "손 끼임", font=font(46), fill=(255, 255, 255, 255))
    d.text((24, 276), "주의", font=font(46), fill=(255, 255, 255, 255))
    d.text((24, 336), "Watch your hands", font=font(18, bold=False), fill=(255, 255, 255, 255))
    return img


def ad_landscape(title, body, col, sponsor, seed):
    """객차 창 위 광고 (가로형 2:1) 512 × 256"""
    w, h = 512, 256
    a = np.ones((h, w, 3)) * (np.array(col) / 255)
    grad = np.linspace(0, 0.30, w)[None, :, None]
    a = a * (1 - grad) + grad
    a += (fbm(h, w, 2.0, 400 + seed) - 0.5)[..., None] * 0.06
    img = rgb(a)
    d = ImageDraw.Draw(img)
    r = np.random.default_rng(410 + seed)
    for _ in range(3):
        cx, cy, rr = r.integers(300, 512), r.integers(0, 256), r.integers(40, 110)
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], outline=tuple(min(255, v + 50) for v in col), width=5)
    d.text((26, 22), title, font=font(46), fill=(255, 255, 255))
    d.multiline_text((26, 92), body, font=font(26, bold=False), fill=(255, 255, 255), spacing=8)
    d.rectangle([0, h - 44, w, h], fill=(255, 255, 255))
    d.text((26, h - 38), sponsor, font=font(24), fill=col)
    d.rectangle([0, 0, w - 1, h - 1], outline=(220, 220, 220), width=4)
    return img


def ad_strip():
    """창 위 광고 8개 (2048 × 512 = 4 × 2 장, 각 512 × 256)"""
    img = Image.new("RGB", (2048, 512), (240, 240, 240))
    for i, (t, b, c, s) in enumerate(ADS):
        img.paste(ad_landscape(t, b, c, s, i), ((i % 4) * 512, (i // 4) * 256))
    return img


def route_strip(names, color, line_label):
    """좌석 위 노선도 띠 (4096 × 320). 실제 크기 약 3.2m × 0.25m. 긴 역명은 두 줄로."""
    w, h = 4096, 320
    img = Image.new("RGB", (w, h), (250, 250, 250))
    d = ImageDraw.Draw(img)
    col = tuple(int(color[i:i + 2], 16) for i in (0, 2, 4))
    d.rectangle([0, 0, 330, h], fill=col)
    lf = font(64)
    d.text(((330 - d.textlength(line_label, font=lf)) / 2, 120), line_label, font=lf, fill=(255, 255, 255))
    y = 168
    d.line([370, y, w - 40, y], fill=col, width=22)
    n = len(names)
    step = (w - 440) / max(1, n - 1)
    for i, nm in enumerate(names):
        x = 400 + i * step
        d.ellipse([x - 18, y - 18, x + 18, y + 18], fill=(255, 255, 255), outline=col, width=9)
        lines = [nm] if len(nm) <= 4 else [nm[: (len(nm) + 1) // 2], nm[(len(nm) + 1) // 2:]]
        f = font(44 if len(lines) == 1 else 38)
        lh = 46 if len(lines) == 1 else 40
        if i % 2 == 0:
            ty = y - 34 - lh * len(lines)
        else:
            ty = y + 30
        for k, ln in enumerate(lines):
            tw = d.textlength(ln, font=f)
            d.text((x - tw / 2, ty + k * lh), ln, font=f, fill=(25, 25, 25))
    d.rectangle([0, 0, w - 1, h - 1], outline=(200, 200, 200), width=5)
    return img


def main():
    print("텍스처 생성 →", OUT)
    save(sky_panorama(4096, 2048), "env/sky_day.png")
    save(sky_panorama(2048, 1024, night=True), "env/sky_night.png")
    save(apt_facade(), "env/apt_facade.png")
    for n in (101, 102, 103, 104):
        save(apt_gable(n), f"env/apt_gable_{n}.png")
    save(office_facade(), "env/office_facade.png")
    save(shop_facade(), "env/shop_facade.png")
    save(villa_facade(), "env/villa_facade.png")
    save(roof_texture(), "env/roof.png")
    save(tree_sprite(0), "env/tree_0.png")
    save(tree_sprite(1), "env/tree_1.png")
    save(grass_texture(), "env/grass.png")
    save(road_texture(), "env/road.png")
    save(water_texture(), "env/water.png")
    save(noise_barrier(), "env/noise_barrier.png")
    save(tunnel_wall(), "env/tunnel_wall.png")
    save(concrete(150, (0.64, 0.64, 0.62)), "env/concrete.png")

    save(enamel_panel(), "station/enamel_panel.png")
    save(granite_floor(), "station/granite_floor.png")
    save(ceiling_slats(), "station/ceiling_slats.png")
    save(tactile(), "station/tactile_dot.png")
    save(tactile_line(), "station/tactile_line.png")
    save(concrete(160), "station/concrete.png")
    save(station_area_map(), "station/area_map.png")
    for i, (t, b, c, s) in enumerate(ADS):
        save(poster(t, b, c, s, seed=i), f"station/poster_{i}.png")

    save(stainless_ext(), "train/stainless.png")
    save(interior_panel(), "train/interior_panel.png")
    save(vinyl_floor(), "train/floor.png")
    save(moquette((40, 70, 140), (90, 130, 200), 150), "train/seat_blue.png")
    save(moquette((200, 80, 40), (240, 150, 80), 151), "train/seat_priority.png")
    save(moquette((230, 110, 160), (250, 170, 200), 152), "train/seat_pink.png")
    save(sticker_priority(), "train/sticker_priority.png")
    save(sticker_pink(), "train/sticker_pink.png")
    save(sticker_door(), "train/sticker_door.png")
    save(ad_strip(), "train/ads.png")

    routes_json = os.path.join(HERE, "..", "build", "routes.json")
    if len(sys.argv) > 2:
        routes_json = sys.argv[2]
    if os.path.exists(routes_json):
        routes = json.load(open(routes_json, encoding="utf-8"))
        main_routes = {2: "L2_LOOP", 1: "L1_GB", 100: "SB"}
        labels = {2: "2호선", 1: "1호선", 100: "수인분당"}
        colors = {2: "00A84D", 1: "0052A4", 100: "F5A200"}
        for r in routes:
            for line, rid in main_routes.items():
                if r["id"] == rid:
                    names = [s["ko"] for s in r["stations"]]
                    if len(names) > 44:
                        names = names[::2]
                    save(route_strip(names, colors[line], labels[line]), f"train/route_strip_{line}.png")


if __name__ == "__main__":
    main()
