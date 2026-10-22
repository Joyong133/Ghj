# Seoul Metro VR - 전동차 Blender 모델 생성 스크립트
#
# 사용법 (헤드리스):
#   blender -b --factory-startup -P blender/build_models.py -- assets/models
#
# 생성물:
#   train_car.glb      : 플레이어가 타는 객차 (실내 상세: 좌석 모켓, 원형 손잡이, 광고, 노선도, 스티커)
#   train_car_lod.glb  : 나머지 객차 (외형 동일, 실내 간략화)
#   train_cab.glb      : 선두부 (경사진 앞유리, 전조등, 행선표시기, 배장기)
# 텍스처는 tools/gen_textures.py 가 만든 assets/textures/train/*.png 를 GLB 에 넣는다.
#
# 좌표계: Blender X=폭, Y=길이, Z=높이. glTF로 내보내면 Godot에서는
#   X=폭, Y=높이, Z=-길이 가 된다. 객차 바닥 윗면 = 승강장 높이 = 0.
# Godot 쪽 상수(scripts/metro_const.gd)와 치수가 맞아야 한다.

import bpy
import bmesh
import math
import os
import sys

# ---------------------------------------------------------------- 치수 상수
CAR_LEN = 19.5          # 차체 길이
HW = 1.56               # 외판 반폭
IW = 1.45               # 실내 반폭
WALL_TOP = 2.15         # 실내 측벽 윗단 (여기서 천장 곡면 시작)
CEIL = 2.32             # 천장 중앙 높이
ROOF0 = 2.34            # 지붕 시작
WIN_LO, WIN_HI = 0.86, 1.74
DOOR_H = 1.86
DOOR_W = 1.3
DOOR_Y = [-7.5, -2.5, 2.5, 7.5]
LEAF_X = 1.505          # 문짝이 들어가는 외판-내판 사이 틈
RAIL_Z = -1.135         # 레일 윗면 (승강장 높이 1135mm)

TEX_DIR = ""


# ---------------------------------------------------------------- 재질
def make_mat(name, rgb, metal=0.0, rough=0.6, emit=None, emit_str=1.0, alpha=1.0, tex=None, clip=False):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Roughness"].default_value = rough
    if tex:
        path = os.path.join(TEX_DIR, tex)
        img = bpy.data.images.load(path, check_existing=True)
        tn = nt.nodes.new("ShaderNodeTexImage")
        tn.image = img
        nt.links.new(tn.outputs["Color"], bsdf.inputs["Base Color"])
        if clip:
            nt.links.new(tn.outputs["Alpha"], bsdf.inputs["Alpha"])
            m.blend_method = "CLIP"
            m.alpha_threshold = 0.5
    if emit is not None:
        bsdf.inputs["Emission Color"].default_value = (*emit, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emit_str
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
        m.blend_method = "BLEND"
    return m


def materials():
    return {
        "Steel": make_mat("Steel", (1, 1, 1), metal=0.3, rough=0.35, tex="stainless.png"),
        "SteelPlain": make_mat("SteelPlain", (0.80, 0.82, 0.84), metal=0.3, rough=0.3),
        "LineColor": make_mat("LineColor", (0.0, 0.66, 0.30), rough=0.4),
        "WallInner": make_mat("WallInner", (1, 1, 1), rough=0.5, tex="interior_panel.png"),
        "Ceiling": make_mat("Ceiling", (0.96, 0.96, 0.96), rough=0.6),
        "LightStrip": make_mat("LightStrip", (1, 1, 1), emit=(1.0, 0.98, 0.94), emit_str=3.5),
        "Floor": make_mat("Floor", (1, 1, 1), rough=0.8, tex="floor.png"),
        "FloorLine": make_mat("FloorLine", (0.92, 0.75, 0.08), rough=0.7),
        "Seat": make_mat("Seat", (1, 1, 1), rough=0.9, tex="seat_blue.png"),
        "SeatPriority": make_mat("SeatPriority", (1, 1, 1), rough=0.9, tex="seat_priority.png"),
        "SeatPink": make_mat("SeatPink", (1, 1, 1), rough=0.9, tex="seat_pink.png"),
        "SeatFrame": make_mat("SeatFrame", (0.82, 0.83, 0.85), metal=0.3, rough=0.3),
        "Pole": make_mat("Pole", (0.90, 0.91, 0.93), metal=0.35, rough=0.15),
        "Strap": make_mat("Strap", (0.96, 0.96, 0.96), rough=0.45),
        "StrapPriority": make_mat("StrapPriority", (0.98, 0.78, 0.10), rough=0.45),
        "StrapBand": make_mat("StrapBand", (0.25, 0.27, 0.30), rough=0.6),
        "Glass": make_mat("Glass", (0.22, 0.30, 0.34), rough=0.05, alpha=0.30),
        "Dark": make_mat("Dark", (0.07, 0.07, 0.08), rough=0.9),
        "Rubber": make_mat("Rubber", (0.03, 0.03, 0.03), rough=0.9),
        "Wheel": make_mat("Wheel", (0.30, 0.30, 0.30), metal=0.8, rough=0.4),
        "Screen": make_mat("Screen", (0.02, 0.02, 0.03), rough=0.2, emit=(0.02, 0.03, 0.05), emit_str=1.0),
        "HeadLight": make_mat("HeadLight", (1, 1, 1), emit=(1.0, 0.97, 0.85), emit_str=6.0),
        "TailLight": make_mat("TailLight", (1, 0, 0), emit=(1.0, 0.05, 0.02), emit_str=4.0),
        "Ads": make_mat("Ads", (1, 1, 1), rough=0.3, tex="ads.png"),
        "RouteStrip": make_mat("RouteStrip", (1, 1, 1), rough=0.3, tex="route_strip_2.png"),
        "StickerPink": make_mat("StickerPink", (1, 1, 1), rough=0.4, tex="sticker_pink.png"),
        "StickerPriority": make_mat("StickerPriority", (1, 1, 1), rough=0.4, tex="sticker_priority.png"),
        "StickerDoor": make_mat("StickerDoor", (1, 1, 1), rough=0.4, tex="sticker_door.png", clip=True),
        "Vent": make_mat("Vent", (0.55, 0.57, 0.60), metal=0.4, rough=0.5),
        "Red": make_mat("Red", (0.8, 0.08, 0.06), rough=0.5),
        "Roof": make_mat("Roof", (0.52, 0.55, 0.58), metal=0.4, rough=0.5),
        "Insulator": make_mat("Insulator", (0.55, 0.30, 0.15), rough=0.4),
    }


# ---------------------------------------------------------------- 메시 빌더
class MB:
    """여러 박스/원기둥/사각형을 재질별 슬롯으로 하나의 메시에 모은다. UV 포함."""

    def __init__(self, mats, tiles=None):
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")
        self.mats = mats
        self.slots = []
        self.tiles = tiles or {}
        self.cyl_faces = []

    def _slot(self, mat):
        if mat not in self.slots:
            self.slots.append(mat)
        return self.slots.index(mat)

    def box(self, x0, x1, y0, y1, z0, z1, mat, unit=False):
        """축 정렬 상자. 기본 UV 는 실제 크기(m)/타일. unit=True 이면 각 면에 텍스처 한 장."""
        if x0 > x1: x0, x1 = x1, x0
        if y0 > y1: y0, y1 = y1, y0
        if z0 > z1: z0, z1 = z1, z0
        bm = self.bm
        p = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
             (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
        v = [bm.verts.new(q) for q in p]
        idx = self._slot(mat)
        tile = self.tiles.get(mat, 1.0)
        size = (x1 - x0, y1 - y0, z1 - z0)
        lo = (x0, y0, z0)
        # (꼭짓점 순서, u축, v축)
        for f, ua, va in (((0, 3, 2, 1), 0, 1), ((4, 5, 6, 7), 0, 1), ((0, 1, 5, 4), 0, 2),
                          ((1, 2, 6, 5), 1, 2), ((2, 3, 7, 6), 0, 2), ((3, 0, 4, 7), 1, 2)):
            face = bm.faces.new([v[i] for i in f])
            face.material_index = idx
            face.smooth = False
            for loop, i in zip(face.loops, f):
                c = p[i]
                if unit:
                    u = (c[ua] - lo[ua]) / max(size[ua], 1e-6)
                    vv = (c[va] - lo[va]) / max(size[va], 1e-6)
                else:
                    u, vv = c[ua] / tile, c[va] / tile
                loop[self.uv].uv = (u, vv)

    def quad(self, p0, u, v, w, h, mat, uv_rect=(0, 0, 1, 1)):
        """p0 에서 u 방향 w, v 방향 h 사각형. 법선 = u × v. uv_rect = (u0, v0, u1, v1)"""
        bm = self.bm
        pts = [p0,
               tuple(p0[k] + u[k] * w for k in range(3)),
               tuple(p0[k] + u[k] * w + v[k] * h for k in range(3)),
               tuple(p0[k] + v[k] * h for k in range(3))]
        uvs = [(uv_rect[0], uv_rect[1]), (uv_rect[2], uv_rect[1]), (uv_rect[2], uv_rect[3]), (uv_rect[0], uv_rect[3])]
        vs = [bm.verts.new(q) for q in pts]
        face = bm.faces.new(vs)
        face.material_index = self._slot(mat)
        for loop, uv in zip(face.loops, uvs):
            loop[self.uv].uv = uv

    def poly(self, pts, mat):
        """임의의 볼록 다각형 (꼭짓점 순서대로, 반시계 = 앞면)"""
        vs = [self.bm.verts.new(q) for q in pts]
        face = self.bm.faces.new(vs)
        face.material_index = self._slot(mat)
        tile = self.tiles.get(mat, 1.0)
        for loop, q in zip(face.loops, pts):
            loop[self.uv].uv = (q[1] / tile, q[2] / tile)

    def cyl(self, cx, cy, cz, r, h, axis, mat, segs=12):
        bm = self.bm
        idx = self._slot(mat)
        top, bot = [], []
        for i in range(segs):
            a = 2 * math.pi * i / segs
            u, w = r * math.cos(a), r * math.sin(a)
            if axis == "z":
                p0, p1 = (cx + u, cy + w, cz - h / 2), (cx + u, cy + w, cz + h / 2)
            elif axis == "y":
                p0, p1 = (cx + u, cy - h / 2, cz + w), (cx + u, cy + h / 2, cz + w)
            else:
                p0, p1 = (cx - h / 2, cy + u, cz + w), (cx + h / 2, cy + u, cz + w)
            bot.append(bm.verts.new(p0))
            top.append(bm.verts.new(p1))
        faces = []
        for i in range(segs):
            j = (i + 1) % segs
            f = bm.faces.new((bot[i], bot[j], top[j], top[i]))
            f.material_index = idx
            f.smooth = True
            faces.append(f)
        f = bm.faces.new(list(reversed(bot))); f.material_index = idx; faces.append(f)
        f = bm.faces.new(top); f.material_index = idx; faces.append(f)
        for f in faces:
            for loop in f.loops:
                loop[self.uv].uv = (0.5, 0.5)
        self.cyl_faces.extend(faces)

    def torus_yz(self, cx, cy, cz, R, r, mat, seg=12, rseg=6):
        """y-z 평면에 놓인 고리 (손잡이)"""
        bm = self.bm
        idx = self._slot(mat)
        rings = []
        for i in range(seg):
            a = 2 * math.pi * i / seg
            ring = []
            for j in range(rseg):
                b = 2 * math.pi * j / rseg
                rr = R + r * math.cos(b)
                ring.append(bm.verts.new((cx + r * math.sin(b), cy + rr * math.cos(a), cz + rr * math.sin(a))))
            rings.append(ring)
        faces = []
        for i in range(seg):
            for j in range(rseg):
                i2, j2 = (i + 1) % seg, (j + 1) % rseg
                f = bm.faces.new((rings[i][j], rings[i2][j], rings[i2][j2], rings[i][j2]))
                f.material_index = idx
                f.smooth = True
                faces.append(f)
        for f in faces:
            for loop in f.loops:
                loop[self.uv].uv = (0.5, 0.5)
        self.cyl_faces.extend(faces)

    def build(self, name, location=(0, 0, 0), parent=None):
        me = bpy.data.meshes.new(name)
        if self.cyl_faces:
            bmesh.ops.recalc_face_normals(self.bm, faces=[f for f in self.cyl_faces if f.is_valid])
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.slots:
            me.materials.append(self.mats[m])
        ob = bpy.data.objects.new(name, me)
        ob.location = location
        bpy.context.scene.collection.objects.link(ob)
        if parent is not None:
            ob.parent = parent
        return ob


TILES = {"Steel": 2.0, "WallInner": 1.0, "Floor": 1.0, "Ceiling": 1.0}


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def export(path, objects):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects:
        o.select_set(True)
        for c in o.children_recursive:
            c.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_image_format="AUTO",
    )
    print("exported", path)


# ---------------------------------------------------------------- 객차
def wall_side(mb, s, y0, y1, detail):
    """출입문 사이 측벽 한 구간 (창문 포함)."""
    xo0, xo1 = s * (HW - 0.03), s * HW            # 외판
    xi0, xi1 = s * IW, s * (IW + 0.03)            # 내판
    mb.box(xo0, xo1, y0, y1, 0.0, WIN_LO, "Steel")
    mb.box(xo0, xo1, y0, y1, WIN_HI, ROOF0, "Steel")
    mb.box(xi0, xi1, y0, y1, 0.0, WIN_LO, "WallInner")
    mb.box(xi0, xi1, y0, y1, WIN_HI, WALL_TOP, "WallInner")
    # 창틀 기둥과 유리 (큰 창 + 위쪽 작은 여닫이창 느낌의 가로대)
    length = y1 - y0
    n = max(1, int(round(length / 1.75)))
    pier = 0.16
    pane = (length - pier * (n + 1)) / n
    y = y0
    for i in range(n + 1):
        mb.box(xo0, xo1, y, y + pier, WIN_LO, WIN_HI, "Steel")
        mb.box(xi0, xi1, y, y + pier, WIN_LO, WIN_HI, "WallInner")
        if i < n:
            gy0, gy1 = y + pier, y + pier + pane
            mb.box(s * (IW + 0.045), s * (IW + 0.055), gy0, gy1, WIN_LO, WIN_HI, "Glass")
            # 창 테두리 (검은 고무)와 가로대
            for zz in (WIN_LO, WIN_HI - 0.03):
                mb.box(xi0 - s * 0.012, xi0, gy0, gy1, zz, zz + 0.03, "Rubber")
            for yy in (gy0, gy1 - 0.03):
                mb.box(xi0 - s * 0.012, xi0, yy, yy + 0.03, WIN_LO, WIN_HI, "Rubber")
            mb.box(s * (IW + 0.03), s * (IW + 0.045), gy0, gy1, 1.52, 1.55, "SteelPlain")
            # 바깥쪽 검은 창틀 (테두리만)
            xf0, xf1 = s * (HW - 0.002), s * (HW + 0.004)
            mb.box(xf0, xf1, gy0, gy1, WIN_LO, WIN_LO + 0.035, "Dark")
            mb.box(xf0, xf1, gy0, gy1, WIN_HI - 0.035, WIN_HI, "Dark")
            mb.box(xf0, xf1, gy0, gy0 + 0.035, WIN_LO, WIN_HI, "Dark")
            mb.box(xf0, xf1, gy1 - 0.035, gy1, WIN_LO, WIN_HI, "Dark")
        y += pier + pane
    # 외부 노선색 띠 (창 아래 / 지붕선)
    mb.box(s * HW, s * (HW + 0.006), y0, y1, 0.66, 0.78, "LineColor")
    mb.box(s * HW, s * (HW + 0.006), y0, y1, 2.10, 2.18, "LineColor")


def door_leaf(mats, name, side, y_center, leaf_sign):
    """출입문 한 짝. 원점이 문짝 중심인 별도 오브젝트 (Godot에서 슬라이드)."""
    mb = MB(mats, TILES)
    w, t = DOOR_W / 2, 0.035
    h = DOOR_H
    x0, x1 = -t / 2, t / 2
    gz0, gz1 = -h / 2 + 0.92, h / 2 - 0.16
    mb.box(x0, x1, -w / 2, w / 2, -h / 2, gz0, "SteelPlain")
    mb.box(x0, x1, -w / 2, w / 2, gz1, h / 2, "SteelPlain")
    mb.box(x0, x1, -w / 2, -w / 2 + 0.09, gz0, gz1, "SteelPlain")
    mb.box(x0, x1, w / 2 - 0.09, w / 2, gz0, gz1, "SteelPlain")
    mb.box(-0.004, 0.004, -w / 2 + 0.09, w / 2 - 0.09, gz0, gz1, "Glass")
    # 맞닿는 쪽 고무
    edge = -leaf_sign * w / 2
    mb.box(x0 - 0.004, x1 + 0.004, edge - 0.02, edge + 0.02, -h / 2, h / 2, "Rubber")
    # 바깥면 노선색 세로띠
    mb.box(x1 * side, x1 * side + 0.004 * side, edge - leaf_sign * 0.07, edge - leaf_sign * 0.025,
           -h / 2, h / 2, "LineColor")
    # 실내 쪽 경고 스티커 ("기대지 마세요", "손 끼임 주의")
    xin = -side * (t / 2 + 0.002)
    sw, sh = 0.24, 0.36
    yc = -leaf_sign * (w / 2 - 0.20)
    if side < 0:     # 왼쪽 벽 문: 실내(+X)를 보는 면, u = +y
        mb.quad((xin, yc - sw / 2, -0.50), (0, 1, 0), (0, 0, 1), sw, sh, "StickerDoor")
    else:            # 오른쪽 벽 문: 실내(-X)를 보는 면, u = -y
        mb.quad((xin, yc + sw / 2, -0.50), (0, -1, 0), (0, 0, 1), sw, sh, "StickerDoor")
    loc = (side * LEAF_X, y_center + leaf_sign * w / 2, h / 2)
    return mb.build(name, location=loc)


def seat_unit(mb, s, ya, yb, mat, detail):
    """좌석 하나: 방석 + 앞 둥근 모서리 + 등받이 (모켓 텍스처 한 장씩)"""
    d = 0.46
    xin = s * (IW - d + 0.01)
    mb.box(xin, s * (IW - 0.04), ya, yb, 0.40, 0.47, mat, unit=True)
    mb.box(s * (IW - 0.15), s * (IW - 0.04), ya, yb, 0.47, 0.98, mat, unit=True)
    if detail:
        mb.cyl(s * (IW - d + 0.03), (ya + yb) / 2, 0.435, 0.035, yb - ya, "y", mat, 8)
        mb.cyl(s * (IW - 0.095), (ya + yb) / 2, 0.98, 0.055, yb - ya, "y", mat, 8)


def build_car(out_dir, detail=True, filename="train_car.glb"):
    clear_scene()
    mats = materials()
    root = bpy.data.objects.new("TrainCar", None)
    bpy.context.scene.collection.objects.link(root)

    body = MB(mats, TILES)
    L2 = CAR_LEN / 2

    # 바닥, 하부
    body.box(-IW, IW, -L2 + 0.05, L2 - 0.05, -0.02, 0.0, "Floor")
    body.box(-HW, HW, -L2, L2, -0.16, -0.02, "Steel")
    body.box(-HW + 0.12, HW - 0.12, -L2 + 0.4, L2 - 0.4, -0.80, -0.16, "Dark")       # 하부 기기
    for s in (-1, 1):
        for (a, b) in ((-L2 + 1.8, -L2 + 4.9), (-3.6, -0.9), (0.9, 3.6), (L2 - 4.9, L2 - 1.8)):
            body.box(s * (HW - 0.32), s * (HW - 0.08), a, b, -0.70, -0.16, "Dark")      # 기기 상자
        body.box(s * (HW - 0.12), s * (HW - 0.10), -L2 + 0.4, L2 - 0.4, -0.30, -0.16, "SteelPlain")
    # 출입문 앞 노란 바닥 표시
    for s in (-1, 1):
        for dy in DOOR_Y:
            body.box(s * (IW - 0.34), s * (IW - 0.28), dy - DOOR_W / 2, dy + DOOR_W / 2, 0.0, 0.003, "FloorLine")
            body.box(s * IW, s * (IW + 0.12), dy - DOOR_W / 2, dy + DOOR_W / 2, -0.02, 0.0, "Dark")   # 문턱

    # 측벽: 출입문 개구부를 피해 구간별로
    edges = [-L2]
    for dy in DOOR_Y:
        edges += [dy - DOOR_W / 2, dy + DOOR_W / 2]
    edges.append(L2)
    for s in (-1, 1):
        for i in range(0, len(edges), 2):
            wall_side(body, s, edges[i], edges[i + 1], detail)
        for dy in DOOR_Y:
            # 문 위 상인방
            body.box(s * (HW - 0.03), s * HW, dy - DOOR_W / 2, dy + DOOR_W / 2, DOOR_H, ROOF0, "Steel")
            body.box(s * IW, s * (IW + 0.03), dy - DOOR_W / 2, dy + DOOR_W / 2, DOOR_H, WALL_TOP, "WallInner")
            # 문틀 (실내 쪽 스테인리스 기둥)
            for e in (-1, 1):
                ye = dy + e * (DOOR_W / 2 + 0.03)
                body.box(s * (IW - 0.04), s * (IW + 0.03), ye - 0.03, ye + 0.03, 0.0, DOOR_H, "SteelPlain")
            # 문 위 LCD 안내기 (Godot 에서 글자를 덧씌움)
            body.box(s * (IW - 0.06), s * (IW - 0.01), dy - 0.42, dy + 0.42, 1.90, 2.13, "Dark")
            body.box(s * (IW - 0.065), s * (IW - 0.06), dy - 0.39, dy + 0.39, 1.92, 2.11, "Screen")
            # 외부 문 옆 노선색 띠
            for e in (-1, 1):
                ye = dy + e * (DOOR_W / 2 + 0.05)
                body.box(s * HW, s * (HW + 0.006), ye - 0.04, ye + 0.04, 0.0, DOOR_H, "LineColor")

    # 천장: 측벽 위에서 곡면처럼 기울어진 판 + 평평한 중앙 + 조명 + 송풍구
    for s in (-1, 1):
        steps = 3
        for k in range(steps):
            a0 = k / steps
            a1 = (k + 1) / steps
            x0 = IW - (IW - 0.95) * (1 - math.cos(a0 * math.pi / 2))
            x1 = IW - (IW - 0.95) * (1 - math.cos(a1 * math.pi / 2))
            z0 = WALL_TOP + (CEIL - WALL_TOP) * math.sin(a0 * math.pi / 2)
            z1 = WALL_TOP + (CEIL - WALL_TOP) * math.sin(a1 * math.pi / 2)
            if s < 0:
                pts = [(-x0, -L2 + 0.05, z0), (-x0, L2 - 0.05, z0), (-x1, L2 - 0.05, z1), (-x1, -L2 + 0.05, z1)]
            else:
                pts = [(x0, L2 - 0.05, z0), (x0, -L2 + 0.05, z0), (x1, -L2 + 0.05, z1), (x1, L2 - 0.05, z1)]
            body.poly(pts, "Ceiling")
        # 조명 띠 (곡면 위쪽)
        body.box(s * 0.80, s * 0.95, -L2 + 0.4, L2 - 0.4, CEIL - 0.035, CEIL - 0.01, "LightStrip")
    body.box(-0.95, 0.95, -L2 + 0.05, L2 - 0.05, CEIL, CEIL + 0.02, "Ceiling")
    for y in range(-8, 9, 2):
        body.box(-0.25, 0.25, y - 0.45, y + 0.45, CEIL - 0.015, CEIL, "Vent")
        for k in range(5):
            body.box(-0.22 + k * 0.11, -0.19 + k * 0.11, y - 0.42, y + 0.42, CEIL - 0.018, CEIL - 0.014, "Dark")
    # CCTV 돔과 비상 인터폰
    for y in (-5.0, 5.0):
        body.cyl(0.0, y, CEIL - 0.05, 0.06, 0.08, "z", "Dark", 10)
    for s in (-1, 1):
        body.box(s * (IW - 0.02), s * IW, DOOR_Y[1] + DOOR_W / 2 + 0.06, DOOR_Y[1] + DOOR_W / 2 + 0.22, 1.25, 1.45, "Red")

    # 지붕 (외부)
    body.box(-HW + 0.02, HW - 0.02, -L2, L2, ROOF0, ROOF0 + 0.22, "Roof")
    body.box(-HW + 0.12, HW - 0.12, -L2 + 0.2, L2 - 0.2, ROOF0 + 0.22, ROOF0 + 0.30, "Roof")
    for yy in (-5.0, 5.0):
        body.box(-1.05, 1.05, yy - 1.7, yy + 1.7, ROOF0 + 0.30, ROOF0 + 0.62, "SteelPlain")    # 냉방장치
        for k in range(6):
            body.box(-0.9, 0.9, yy - 1.5 + k * 0.6, yy - 1.4 + k * 0.6, ROOF0 + 0.62, ROOF0 + 0.64, "Dark")

    # 양 끝 벽 + 관통문
    for e in (-1, 1):
        y_in = e * (L2 - 0.05)
        y_out = e * L2
        body.box(-IW, -0.48, y_in, y_out, 0.0, CEIL, "WallInner")
        body.box(0.48, IW, y_in, y_out, 0.0, CEIL, "WallInner")
        body.box(-0.48, 0.48, y_in, y_out, 1.95, CEIL, "WallInner")
        yd = e * (L2 - 0.03)
        body.box(-0.45, 0.45, yd - 0.015, yd + 0.015, 0.0, 1.0, "SteelPlain")
        body.box(-0.45, 0.45, yd - 0.015, yd + 0.015, 1.75, 1.95, "SteelPlain")
        body.box(-0.45, -0.33, yd - 0.015, yd + 0.015, 1.0, 1.75, "SteelPlain")
        body.box(0.33, 0.45, yd - 0.015, yd + 0.015, 1.0, 1.75, "SteelPlain")
        body.box(-0.33, 0.33, yd - 0.004, yd + 0.004, 1.0, 1.75, "Glass")
        body.box(-0.2, -0.05, yd - 0.03, yd + 0.03, 0.95, 1.0, "Dark")              # 문 손잡이
        # 외부 끝면 / 연결막
        body.box(-HW, HW, y_out - e * 0.01, y_out, -0.16, ROOF0 + 0.2, "Steel")
        body.box(-0.75, 0.75, y_out, y_out + e * 0.26, -0.05, 2.05, "Rubber")
        # 소화기함
        body.box(-IW + 0.02, -IW + 0.28, y_in - e * 0.12, y_in, 0.05, 0.6, "Red")

    # 좌석, 칸막이, 손잡이, 선반, 광고/노선도
    benches = []   # (y0, y1, kind)
    benches.append((-L2 + 0.12, DOOR_Y[0] - DOOR_W / 2 - 0.12, "SeatPriority"))
    for i in range(3):
        benches.append((DOOR_Y[i] + DOOR_W / 2 + 0.14, DOOR_Y[i + 1] - DOOR_W / 2 - 0.14, "Seat"))
    benches.append((DOOR_Y[3] + DOOR_W / 2 + 0.12, L2 - 0.12, "SeatPriority"))
    for s in (-1, 1):
        for bi, (y0, y1, kind) in enumerate(benches):
            depth = 0.46
            body.box(s * (IW - depth + 0.02), s * IW, y0, y1, 0.08, 0.40, "SeatFrame")       # 좌석 받침(스테인리스)
            body.box(s * (IW - depth + 0.05), s * (IW - 0.02), y0, y1, 0.0, 0.08, "Dark")
            nseat = 3 if kind == "SeatPriority" else 7
            sw = (y1 - y0) / nseat
            for k in range(nseat):
                mat = kind
                pink = kind == "Seat" and bi == 2 and ((s < 0 and k == 0) or (s > 0 and k == nseat - 1))
                if pink:
                    mat = "SeatPink"
                ya, yb = y0 + k * sw + 0.012, y0 + (k + 1) * sw - 0.012
                seat_unit(body, s, ya, yb, mat, detail)
                if pink:
                    # 임산부 배려석 표지 (등받이 앞면)
                    x = s * (IW - 0.15) - s * 0.002
                    sw = yb - ya - 0.08
                    if s < 0:
                        body.quad((x, ya + 0.04, 0.66), (0, 1, 0), (0, 0, 1), sw, sw / 2, "StickerPink")
                    else:
                        body.quad((x, yb - 0.04, 0.66), (0, -1, 0), (0, 0, 1), sw, sw / 2, "StickerPink")
            # 칸막이 (유리+스틸)
            for ye in (y0 - 0.04, y1 + 0.04):
                body.box(s * (IW - 0.55), s * IW, ye - 0.015, ye + 0.015, 0.25, 0.95, "SeatFrame")
                body.box(s * (IW - 0.55), s * IW, ye - 0.006, ye + 0.006, 0.95, 1.50, "Glass")
                body.cyl(s * (IW - 0.56), ye, 1.08, 0.019, 2.16, "z", "Pole", 10)               # 세로 손잡이 봉
            # 가로 손잡이 봉 + 원형 손잡이
            xp = s * (IW - 0.58)
            body.cyl(xp, (y0 + y1) / 2, 1.90, 0.016, (y1 - y0) + 0.1, "y", "Pole", 8)
            n = max(2, int((y1 - y0) / 0.30))
            for k in range(n):
                yy = y0 + (k + 0.5) * (y1 - y0) / n
                strap = "StrapPriority" if kind == "SeatPriority" else "Strap"
                body.box(xp - 0.008, xp + 0.008, yy - 0.014, yy + 0.014, 1.62, 1.89, "StrapBand")
                if detail:
                    body.torus_yz(xp, yy, 1.55, 0.062, 0.011, strap, 12, 5)
                else:
                    body.box(xp - 0.01, xp + 0.01, yy - 0.06, yy + 0.06, 1.50, 1.62, strap)
            # 선반 (그물 무늬 대신 봉 여러 개)
            for k in range(5):
                xx = s * (IW - 0.05 - k * 0.07)
                body.box(xx - 0.006, xx + 0.006, y0, y1, 1.76, 1.772, "Pole")
            for yy in (y0 + 0.1, y1 - 0.1):
                body.box(s * (IW - 0.34), s * (IW - 0.02), yy - 0.01, yy + 0.01, 1.66, 1.78, "Pole")
            # 창 위 노선도(일반석 구간) / 광고(노약자석 구간)
            ztop, zbot = 2.11, 1.84
            if detail:
                xw = s * (IW - 0.002)
                length = y1 - y0
                if kind == "Seat":
                    hh = 0.25
                    ww = min(length - 0.2, hh * 12.8)
                    yc = (y0 + y1) / 2
                    if s < 0:
                        body.quad((xw, yc - ww / 2, 1.86), (0, 1, 0), (0, 0, 1), ww, hh, "RouteStrip")
                    else:
                        body.quad((xw, yc + ww / 2, 1.86), (0, -1, 0), (0, 0, 1), ww, hh, "RouteStrip")
                else:
                    aw, ah = 0.50, 0.25
                    for k in range(2):
                        ad = (bi * 2 + k + (0 if s < 0 else 3)) % 8
                        u0, v0 = (ad % 4) / 4, 1 - (ad // 4 + 1) / 2
                        rect = (u0, v0, u0 + 0.25, v0 + 0.5)
                        yc = y0 + (k + 0.5) * length / 2
                        if s < 0:
                            body.quad((xw, yc - aw / 2, 1.86), (0, 1, 0), (0, 0, 1), aw, ah, "Ads", rect)
                        else:
                            body.quad((xw, yc + aw / 2, 1.86), (0, -1, 0), (0, 0, 1), aw, ah, "Ads", rect)
                    # 노약자석 표지 (창 위, 광고 아래)
                    ww, hh = 0.56, 0.175
                    yc = (y0 + y1) / 2
                    zz = WIN_HI - hh - 0.02
                    if s < 0:
                        body.quad((s * (IW + 0.04), yc - ww / 2, zz), (0, 1, 0), (0, 0, 1), ww, hh, "StickerPriority")
                    else:
                        body.quad((s * (IW + 0.04), yc + ww / 2, zz), (0, -1, 0), (0, 0, 1), ww, hh, "StickerPriority")
    # 출입문 사이 천장 손잡이 (중앙 가로봉 + 세로봉)
    for dy in DOOR_Y:
        body.cyl(0.0, dy, 1.95, 0.016, DOOR_W + 0.4, "y", "Pole", 8)
        body.cyl(0.0, dy, 2.12, 0.012, 0.35, "z", "Pole", 6)

    # 대차와 바퀴
    for by in (-6.9, 6.9):
        body.box(-1.15, 1.15, by - 1.35, by + 1.35, -0.95, -0.62, "Dark")
        body.box(-0.25, 0.25, by - 0.25, by + 0.25, -0.62, -0.16, "Dark")
        for s in (-1, 1):
            body.cyl(s * 1.05, by, -0.75, 0.12, 0.30, "z", "Rubber", 10)               # 공기스프링
            body.box(s * 1.05, s * 1.25, by - 1.2, by + 1.2, -0.92, -0.80, "SteelPlain")
        for wy in (-1.05, 1.05):
            body.cyl(0.0, by + wy, RAIL_Z + 0.43, 0.10, 1.70, "x", "Wheel", 10)          # 차축
            for wx in (-0.75, 0.75):
                body.cyl(wx, by + wy, RAIL_Z + 0.43, 0.43, 0.13, "x", "Wheel", 16)

    body.build("CarBody", parent=root)

    # 팬터그래프 (Godot 에서 일부 객차만 남긴다)
    pg = MB(mats, TILES)
    py = -6.0
    for s in (-1, 1):
        pg.cyl(s * 0.5, py, ROOF0 + 0.35, 0.05, 0.12, "z", "Insulator", 8)
    pg.box(-0.6, 0.6, py - 0.5, py + 0.5, ROOF0 + 0.41, ROOF0 + 0.47, "Dark")
    for (a, b) in ((ROOF0 + 0.47, ROOF0 + 1.15), (ROOF0 + 1.15, ROOF0 + 1.75)):
        sgn = 1 if a < ROOF0 + 1.0 else -1
        for s in (-1, 1):
            pg.box(s * 0.35 - 0.02, s * 0.35 + 0.02, py - 0.02 + sgn * 0.0, py + 0.02, a, b, "Dark")
    pg.box(-0.85, 0.85, py - 0.06, py + 0.06, ROOF0 + 1.75, ROOF0 + 1.82, "SteelPlain")
    pg.build("Pantograph", parent=root)

    # 출입문 16짝 (L=-X 쪽, R=+X 쪽)
    for s, sn in ((-1, "L"), (1, "R")):
        for i, dy in enumerate(DOOR_Y):
            for leaf_sign, ln in ((-1, "a"), (1, "b")):
                o = door_leaf(mats, "Door%s%d%s" % (sn, i, ln), s, dy, leaf_sign)
                o.parent = root

    export(os.path.join(out_dir, filename), [root])


# ---------------------------------------------------------------- 선두부
def build_cab(out_dir):
    clear_scene()
    mats = materials()
    root = bpy.data.objects.new("TrainCab", None)
    bpy.context.scene.collection.objects.link(root)
    mb = MB(mats, TILES)
    # 차량 앞(-Y 방향 바깥)으로 붙는 선두부. y=0 이 객차 끝면.
    d = 0.95                       # 앞으로 튀어나온 길이 (아래쪽)
    dt = 0.55                      # 위쪽 (앞유리가 뒤로 기울어짐)
    zb, zw0, zw1, zt = -0.30, 0.98, 2.02, ROOF0 + 0.2
    # 옆면 (스테인리스, 앞유리 경사에 맞춘 사다리꼴)
    for s in (-1, 1):
        x = s * HW
        pts = [(x, 0.0, zb), (x, -d, zb), (x, -d, zw0), (x, -dt, zw1), (x, -0.25, zt), (x, 0.0, zt)]
        if s > 0:
            pts = list(reversed(pts))
        mb.poly(pts, "Steel")
        mb.box(s * HW, s * (HW + 0.006), -d, 0.0, 0.66, 0.78, "LineColor")
    # 아래 앞판 (노선색 마스크)
    mb.quad((-HW, -d, zb), (1, 0, 0), (0, 0, 1), 2 * HW, zw0 - zb, "LineColor")
    # 앞유리 (기울어짐) - 검은 테두리 + 유리
    p0 = (-HW, -d, zw0)
    up = (0, (d - dt) / math.hypot(d - dt, zw1 - zw0), (zw1 - zw0) / math.hypot(d - dt, zw1 - zw0))
    L = math.hypot(d - dt, zw1 - zw0)
    mb.quad(p0, (1, 0, 0), up, 2 * HW, L, "Dark")
    mb.quad((-HW + 0.12, -d - 0.004 + 0.06 * up[1], zw0 + 0.06 * up[2]), (1, 0, 0), up, 2 * HW - 0.24, L - 0.14, "Glass")
    # 지붕 앞부분 (경사)
    up2 = (0, (dt - 0.25) / math.hypot(dt - 0.25, zt - zw1), (zt - zw1) / math.hypot(dt - 0.25, zt - zw1))
    mb.quad((-HW, -dt, zw1), (1, 0, 0), up2, 2 * HW, math.hypot(dt - 0.25, zt - zw1), "Steel")
    mb.box(-HW, HW, -0.25, 0.0, zt - 0.05, zt, "Roof")
    # 행선표시기 (앞유리 위쪽 안)
    mb.quad((-0.85, -dt - 0.02, zw1 - 0.27), (1, 0, 0), (0, 0, 1), 1.7, 0.22, "Screen")
    # 전조등/후미등 (마스크 위)
    for s in (-1, 1):
        mb.box(s * 0.95, s * 1.35, -d - 0.015, -d, 0.55, 0.72, "HeadLight")
        mb.box(s * 0.95, s * 1.35, -d - 0.015, -d, 0.36, 0.48, "TailLight")
    # 비상 관통문 윤곽
    mb.box(-0.40, -0.37, -d - 0.008, -d, zb + 0.3, zw0, "Dark")
    mb.box(0.37, 0.40, -d - 0.008, -d, zb + 0.3, zw0, "Dark")
    # 연결기와 배장기
    mb.box(-0.15, 0.15, -d - 0.45, -d, -0.62, -0.45, "Dark")
    mb.box(-1.3, 1.3, -d - 0.08, -d + 0.3, -0.85, zb, "Dark")
    mb.build("CabBody", parent=root)
    export(os.path.join(out_dir, "train_cab.glb"), [root])


def main():
    global TEX_DIR
    argv = sys.argv
    out_dir = argv[argv.index("--") + 1] if "--" in argv else "assets/models"
    out_dir = os.path.abspath(out_dir)
    TEX_DIR = os.path.join(os.path.dirname(out_dir), "textures", "train")
    os.makedirs(out_dir, exist_ok=True)
    build_car(out_dir, True, "train_car.glb")
    build_car(out_dir, False, "train_car_lod.glb")
    build_cab(out_dir)


main()
