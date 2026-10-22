# Seoul Metro VR - Blender 모델 생성 스크립트
#
# 사용법 (헤드리스):
#   blender -b --factory-startup -P blender/build_models.py -- assets/models
#
# 생성물:
#   train_car.glb  : 객차 1량 (외판/실내/좌석/손잡이/출입문 16짝/대차)
#   train_cab.glb  : 선두부 (운전실 앞면, 전조등, 행선표시기)
#   station_props.glb : 스크린도어 1량분 프레임/문짝, 벤치, 승강장 지붕, 계단
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
CEIL = 2.2              # 천장 높이
WIN_LO, WIN_HI = 0.86, 1.74
DOOR_H = 1.86
DOOR_W = 1.3
DOOR_Y = [-7.5, -2.5, 2.5, 7.5]
LEAF_X = 1.505          # 문짝이 들어가는 외판-내판 사이 틈
RAIL_Z = -1.135         # 레일 윗면 (승강장 높이 1135mm)


# ---------------------------------------------------------------- 재질
def make_mat(name, rgb, metal=0.0, rough=0.6, emit=None, emit_str=1.0, alpha=1.0):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Roughness"].default_value = rough
    if emit is not None:
        bsdf.inputs["Emission Color"].default_value = (*emit, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emit_str
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
        m.blend_method = "BLEND"
    return m


def materials():
    return {
        "Steel": make_mat("Steel", (0.72, 0.74, 0.76), metal=0.6, rough=0.35),
        "LineColor": make_mat("LineColor", (0.0, 0.66, 0.30), rough=0.4),
        "WallInner": make_mat("WallInner", (0.90, 0.90, 0.88), rough=0.5),
        "Ceiling": make_mat("Ceiling", (0.95, 0.95, 0.95), rough=0.6),
        "LightStrip": make_mat("LightStrip", (1, 1, 1), emit=(1.0, 0.98, 0.93), emit_str=3.0),
        "Floor": make_mat("Floor", (0.42, 0.43, 0.45), rough=0.8),
        "FloorLine": make_mat("FloorLine", (0.85, 0.70, 0.10), rough=0.7),
        "Seat": make_mat("Seat", (0.16, 0.30, 0.60), rough=0.8),
        "SeatPriority": make_mat("SeatPriority", (0.86, 0.42, 0.10), rough=0.8),
        "SeatPink": make_mat("SeatPink", (0.93, 0.42, 0.62), rough=0.8),
        "Pole": make_mat("Pole", (0.85, 0.86, 0.88), metal=0.9, rough=0.2),
        "Strap": make_mat("Strap", (0.95, 0.95, 0.95), rough=0.5),
        "StrapPriority": make_mat("StrapPriority", (0.95, 0.75, 0.10), rough=0.5),
        "Glass": make_mat("Glass", (0.35, 0.45, 0.50), rough=0.05, alpha=0.28),
        "Dark": make_mat("Dark", (0.08, 0.08, 0.09), rough=0.9),
        "Rubber": make_mat("Rubber", (0.03, 0.03, 0.03), rough=0.9),
        "Wheel": make_mat("Wheel", (0.30, 0.30, 0.30), metal=0.8, rough=0.4),
        "Screen": make_mat("Screen", (0.02, 0.02, 0.03), rough=0.2, emit=(0.02, 0.03, 0.05), emit_str=1.0),
        "HeadLight": make_mat("HeadLight", (1, 1, 1), emit=(1.0, 0.97, 0.85), emit_str=6.0),
        "TailLight": make_mat("TailLight", (1, 0, 0), emit=(1.0, 0.05, 0.02), emit_str=4.0),
        "Yellow": make_mat("Yellow", (0.95, 0.78, 0.05), rough=0.6),
        "Concrete": make_mat("Concrete", (0.62, 0.62, 0.60), rough=0.95),
        "Tile": make_mat("Tile", (0.80, 0.80, 0.78), rough=0.4),
        "Wood": make_mat("Wood", (0.55, 0.38, 0.22), rough=0.7),
        "Roof": make_mat("Roof", (0.55, 0.58, 0.62), metal=0.4, rough=0.5),
    }


# ---------------------------------------------------------------- 메시 빌더
class MB:
    """여러 박스/원기둥을 재질별 슬롯으로 하나의 메시에 모은다."""

    def __init__(self, mats):
        self.bm = bmesh.new()
        self.mats = mats
        self.slots = []

    def _slot(self, mat):
        if mat not in self.slots:
            self.slots.append(mat)
        return self.slots.index(mat)

    def box(self, x0, x1, y0, y1, z0, z1, mat):
        if x0 > x1: x0, x1 = x1, x0
        if y0 > y1: y0, y1 = y1, y0
        if z0 > z1: z0, z1 = z1, z0
        bm = self.bm
        v = [bm.verts.new(p) for p in (
            (x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
            (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1))]
        idx = self._slot(mat)
        for f in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
            face = bm.faces.new([v[i] for i in f])
            face.material_index = idx
            face.smooth = False

    def boxc(self, cx, cy, cz, sx, sy, sz, mat):
        self.box(cx - sx / 2, cx + sx / 2, cy - sy / 2, cy + sy / 2, cz - sz / 2, cz + sz / 2, mat)

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
        for i in range(segs):
            j = (i + 1) % segs
            f = bm.faces.new((bot[i], bot[j], top[j], top[i]))
            f.material_index = idx
            f.smooth = True
        f = bm.faces.new(list(reversed(bot))); f.material_index = idx
        f = bm.faces.new(top); f.material_index = idx

    def build(self, name, location=(0, 0, 0), parent=None):
        me = bpy.data.meshes.new(name)
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
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
    )
    print("exported", path)


# ---------------------------------------------------------------- 객차
def wall_side(mb, s, y0, y1):
    """출입문 사이 측벽 한 구간 (창문 포함)."""
    xo0, xo1 = s * (HW - 0.03), s * HW            # 외판
    xi0, xi1 = s * IW, s * (IW + 0.03)            # 내판
    for (a, b, mat) in ((xo0, xo1, "Steel"), (xi0, xi1, "WallInner")):
        mb.box(a, b, y0, y1, 0.0, WIN_LO, mat)
        mb.box(a, b, y0, y1, WIN_HI, CEIL + 0.05, mat)
    # 창틀 기둥과 유리
    length = y1 - y0
    n = max(1, int(round(length / 1.7)))
    pier = 0.14
    pane = (length - pier * (n + 1)) / n
    y = y0
    for i in range(n + 1):
        for (a, b, mat) in ((xo0, xo1, "Steel"), (xi0, xi1, "WallInner")):
            mb.box(a, b, y, y + pier, WIN_LO, WIN_HI, mat)
        if i < n:
            mb.box(s * (IW + 0.045), s * (IW + 0.055), y + pier, y + pier + pane, WIN_LO, WIN_HI, "Glass")
            # 창문 실내 테두리 (검은 고무)
            mb.box(xi0 - s * 0.005, xi0, y + pier, y + pier + pane, WIN_LO, WIN_LO + 0.03, "Rubber")
        y += pier + pane
    # 외부 노선색 띠 (창 아래 / 지붕선)
    mb.box(s * HW, s * (HW + 0.006), y0, y1, 0.66, 0.78, "LineColor")
    mb.box(s * HW, s * (HW + 0.006), y0, y1, 2.02, 2.10, "LineColor")


def door_leaf(mats, name, side, y_center, leaf_sign):
    """출입문 한 짝. 원점이 문짝 중심인 별도 오브젝트 (Godot에서 슬라이드)."""
    mb = MB(mats)
    w, t = DOOR_W / 2, 0.035
    h = DOOR_H
    x0, x1 = -t / 2, t / 2
    # 문짝 프레임 (유리창 주변)
    mb.box(x0, x1, -w / 2, w / 2, -h / 2, -h / 2 + 0.92, "Steel")              # 아래
    mb.box(x0, x1, -w / 2, w / 2, h / 2 - 0.16, h / 2, "Steel")                # 위
    mb.box(x0, x1, -w / 2, -w / 2 + 0.09, -h / 2 + 0.92, h / 2 - 0.16, "Steel")  # 바깥쪽 세로
    mb.box(x0, x1, w / 2 - 0.09, w / 2, -h / 2 + 0.92, h / 2 - 0.16, "Steel")
    mb.box(-0.004, 0.004, -w / 2 + 0.09, w / 2 - 0.09, -h / 2 + 0.92, h / 2 - 0.16, "Glass")
    # 맞닿는 쪽 고무
    edge = -leaf_sign * w / 2
    mb.box(x0 - 0.004, x1 + 0.004, edge - 0.02, edge + 0.02, -h / 2, h / 2, "Rubber")
    # 바깥면 노선색 세로띠
    mb.box(x1 * side, x1 * side + 0.004 * side, edge - leaf_sign * 0.06, edge - leaf_sign * 0.02,
           -h / 2, h / 2, "LineColor")
    loc = (side * LEAF_X, y_center + leaf_sign * w / 2, h / 2)
    return mb.build(name, location=loc)


def build_car(mats, out_dir):
    clear_scene()
    mats = materials()
    root = bpy.data.objects.new("TrainCar", None)
    bpy.context.scene.collection.objects.link(root)

    body = MB(mats)
    L2 = CAR_LEN / 2

    # 바닥, 하부
    body.box(-IW, IW, -L2 + 0.05, L2 - 0.05, -0.02, 0.0, "Floor")
    body.box(-HW, HW, -L2, L2, -0.16, -0.02, "Steel")
    body.box(-HW + 0.12, HW - 0.12, -L2 + 0.4, L2 - 0.4, -0.80, -0.16, "Dark")       # 하부 기기
    for s in (-1, 1):                                                                 # 스커트
        body.box(s * (HW - 0.10), s * (HW - 0.05), -L2 + 2.0, -L2 + 5.4, -0.62, -0.16, "Dark")
        body.box(s * (HW - 0.10), s * (HW - 0.05), L2 - 5.4, L2 - 2.0, -0.62, -0.16, "Dark")
    # 출입문 앞 노란 바닥 표시
    for s in (-1, 1):
        for dy in DOOR_Y:
            body.box(s * (IW - 0.32), s * (IW - 0.26), dy - DOOR_W / 2, dy + DOOR_W / 2, 0.0, 0.003, "FloorLine")

    # 측벽: 출입문 개구부를 피해 구간별로
    edges = [-L2]
    for dy in DOOR_Y:
        edges += [dy - DOOR_W / 2, dy + DOOR_W / 2]
    edges.append(L2)
    for s in (-1, 1):
        for i in range(0, len(edges), 2):
            wall_side(body, s, edges[i], edges[i + 1])
        for dy in DOOR_Y:
            # 문 위 상인방
            for (a, b, mat) in ((s * (HW - 0.03), s * HW, "Steel"), (s * IW, s * (IW + 0.03), "WallInner")):
                body.box(a, b, dy - DOOR_W / 2, dy + DOOR_W / 2, DOOR_H, CEIL + 0.05, mat)
            # 문틀 (실내 쪽 회색 기둥)
            for e in (-1, 1):
                ye = dy + e * (DOOR_W / 2 + 0.03)
                body.box(s * (IW - 0.04), s * (IW + 0.03), ye - 0.03, ye + 0.03, 0.0, DOOR_H, "Steel")
            # 문 위 LCD 안내기 (Godot에서 글자를 덧씌움)
            body.box(s * (IW - 0.06), s * (IW - 0.01), dy - 0.42, dy + 0.42, 1.90, 2.13, "Dark")
            body.box(s * (IW - 0.065), s * (IW - 0.06), dy - 0.39, dy + 0.39, 1.92, 2.11, "Screen")
            # 외부 문 옆 노선색 띠
            for e in (-1, 1):
                ye = dy + e * (DOOR_W / 2 + 0.05)
                body.box(s * HW, s * (HW + 0.006), ye - 0.04, ye + 0.04, 0.0, DOOR_H, "LineColor")

    # 천장, 조명, 에어컨 덕트
    body.box(-IW, IW, -L2 + 0.05, L2 - 0.05, CEIL, CEIL + 0.04, "Ceiling")
    body.box(-0.42, 0.42, -L2 + 0.3, L2 - 0.3, CEIL - 0.10, CEIL, "Ceiling")
    for s in (-1, 1):
        body.box(s * 0.48, s * 0.66, -L2 + 0.4, L2 - 0.4, CEIL - 0.02, CEIL, "LightStrip")
        body.box(s * 0.66, s * (IW - 0.02), -L2 + 0.05, L2 - 0.05, CEIL - 0.05, CEIL - 0.02, "Ceiling")
    # 지붕 (외부)
    body.box(-HW + 0.02, HW - 0.02, -L2, L2, CEIL + 0.05, CEIL + 0.30, "Roof")
    body.box(-HW + 0.10, HW - 0.10, -L2 + 0.2, L2 - 0.2, CEIL + 0.30, CEIL + 0.38, "Roof")
    for yy in (-5.0, 5.0):
        body.box(-1.0, 1.0, yy - 1.6, yy + 1.6, CEIL + 0.38, CEIL + 0.66, "Steel")       # 냉방장치
        body.box(-0.8, 0.8, yy - 1.4, yy + 1.4, CEIL + 0.66, CEIL + 0.68, "Dark")

    # 양 끝 벽 + 관통문
    for e in (-1, 1):
        y_in = e * (L2 - 0.05)
        y_out = e * L2
        body.box(-IW, -0.48, y_in, y_out, 0.0, CEIL, "WallInner")
        body.box(0.48, IW, y_in, y_out, 0.0, CEIL, "WallInner")
        body.box(-0.48, 0.48, y_in, y_out, 1.95, CEIL, "WallInner")
        # 관통문 (닫힌 상태, 창 포함)
        yd = e * (L2 - 0.03)
        body.box(-0.45, 0.45, yd - 0.015, yd + 0.015, 0.0, 1.0, "Steel")
        body.box(-0.45, 0.45, yd - 0.015, yd + 0.015, 1.75, 1.95, "Steel")
        body.box(-0.45, -0.33, yd - 0.015, yd + 0.015, 1.0, 1.75, "Steel")
        body.box(0.33, 0.45, yd - 0.015, yd + 0.015, 1.0, 1.75, "Steel")
        body.box(-0.33, 0.33, yd - 0.004, yd + 0.004, 1.0, 1.75, "Glass")
        # 외부 끝면 / 연결막
        body.box(-HW, HW, y_out - e * 0.01, y_out, -0.16, CEIL + 0.3, "Steel")
        body.box(-0.7, 0.7, y_out, y_out + e * 0.26, -0.05, 2.05, "Rubber")

    # 좌석, 칸막이, 손잡이, 선반
    benches = []   # (y0, y1, kind)
    benches.append((-L2 + 0.12, DOOR_Y[0] - DOOR_W / 2 - 0.12, "SeatPriority"))
    for i in range(3):
        benches.append((DOOR_Y[i] + DOOR_W / 2 + 0.14, DOOR_Y[i + 1] - DOOR_W / 2 - 0.14, "Seat"))
    benches.append((DOOR_Y[3] + DOOR_W / 2 + 0.12, L2 - 0.12, "SeatPriority"))
    for s in (-1, 1):
        for bi, (y0, y1, kind) in enumerate(benches):
            depth = 0.46
            xb0, xb1 = s * (IW - depth), s * IW
            body.box(xb0, xb1, y0, y1, 0.0, 0.40, "Steel")                 # 좌석 받침
            body.box(s * (IW - depth + 0.02), s * (IW - 0.02), y0, y1, 0.0, 0.08, "Dark")
            nseat = 3 if kind == "SeatPriority" else 7
            sw = (y1 - y0) / nseat
            for k in range(nseat):
                mat = kind
                # 중앙 일반석 양 끝의 임산부 배려석
                if kind == "Seat" and bi == 2 and ((s < 0 and k == 0) or (s > 0 and k == nseat - 1)):
                    mat = "SeatPink"
                ya, yb = y0 + k * sw + 0.012, y0 + (k + 1) * sw - 0.012
                body.box(s * (IW - depth + 0.01), s * (IW - 0.03), ya, yb, 0.40, 0.47, mat)     # 방석
                body.box(s * (IW - 0.13), s * (IW - 0.03), ya, yb, 0.47, 0.98, mat)              # 등받이
            # 칸막이 (유리+스틸)
            for ye in (y0 - 0.04, y1 + 0.04):
                body.box(s * (IW - 0.55), s * IW, ye - 0.015, ye + 0.015, 0.25, 0.95, "Steel")
                body.box(s * (IW - 0.55), s * IW, ye - 0.006, ye + 0.006, 0.95, 1.50, "Glass")
                body.cyl(s * (IW - 0.56), ye, 1.08, 0.019, 2.16, "z", "Pole", 10)               # 세로 손잡이 봉
            # 가로 손잡이 봉 + 손잡이
            xp = s * (IW - 0.58)
            body.cyl(xp, (y0 + y1) / 2, 1.90, 0.016, (y1 - y0) + 0.1, "y", "Pole", 8)
            n = max(2, int((y1 - y0) / 0.32))
            for k in range(n):
                yy = y0 + (k + 0.5) * (y1 - y0) / n
                strap = "StrapPriority" if kind == "SeatPriority" else "Strap"
                body.box(xp - 0.012, xp + 0.012, yy - 0.015, yy + 0.015, 1.62, 1.89, strap)
                body.box(xp - 0.012, xp + 0.012, yy - 0.06, yy + 0.06, 1.55, 1.58, strap)
                body.box(xp - 0.012, xp + 0.012, yy - 0.06, yy - 0.045, 1.55, 1.66, strap)
                body.box(xp - 0.012, xp + 0.012, yy + 0.045, yy + 0.06, 1.55, 1.66, strap)
            # 선반
            body.box(s * (IW - 0.34), s * (IW - 0.02), y0, y1, 1.76, 1.78, "Pole")
            for yy in (y0 + 0.1, y1 - 0.1):
                body.box(s * (IW - 0.34), s * (IW - 0.02), yy - 0.01, yy + 0.01, 1.66, 1.78, "Pole")
        # 출입문 사이 천장 손잡이 (중앙 가로봉)
    for dy in DOOR_Y:
        body.cyl(0.0, dy, 1.95, 0.016, DOOR_W + 0.4, "y", "Pole", 8)
        body.cyl(0.0, dy, 2.08, 0.012, 0.25, "z", "Pole", 6)

    # 대차와 바퀴
    for by in (-6.9, 6.9):
        body.box(-1.15, 1.15, by - 1.35, by + 1.35, -0.95, -0.62, "Dark")
        body.box(-0.25, 0.25, by - 0.25, by + 0.25, -0.62, -0.16, "Dark")
        for wy in (-1.05, 1.05):
            body.cyl(0.0, by + wy, RAIL_Z + 0.43, 0.10, 1.70, "x", "Wheel", 10)          # 차축
            for wx in (-0.75, 0.75):
                body.cyl(wx, by + wy, RAIL_Z + 0.43, 0.43, 0.13, "x", "Wheel", 16)

    b = body.build("CarBody", parent=root)

    # 출입문 16짝 (L=-X 쪽, R=+X 쪽)
    for s, sn in ((-1, "L"), (1, "R")):
        for i, dy in enumerate(DOOR_Y):
            for leaf_sign, ln in ((-1, "a"), (1, "b")):
                o = door_leaf(mats, "Door%s%d%s" % (sn, i, ln), s, dy, leaf_sign)
                o.parent = root

    export(os.path.join(out_dir, "train_car.glb"), [root])


# ---------------------------------------------------------------- 선두부
def build_cab(out_dir):
    clear_scene()
    mats = materials()
    root = bpy.data.objects.new("TrainCab", None)
    bpy.context.scene.collection.objects.link(root)
    mb = MB(mats)
    # 차량 앞(-Y 방향 바깥)으로 붙는 선두부. y=0 이 객차 끝면.
    d = 0.75
    mb.box(-HW, HW, -d, 0.0, -0.16, 0.95, "Steel")                       # 하부 앞판
    mb.box(-HW + 0.05, HW - 0.05, -d + 0.08, 0.0, 0.95, 2.0, "Dark")       # 운전실 창 뒤
    mb.box(-HW + 0.06, HW - 0.06, -d + 0.07, -d + 0.09, 1.0, 1.95, "Glass")
    mb.box(-HW, HW, -d + 0.12, 0.0, 2.0, CEIL + 0.30, "Steel")            # 상부
    mb.box(-HW, HW, -d - 0.005, -d + 0.02, 0.62, 0.86, "LineColor")       # 노선색 띠
    mb.box(-0.06, 0.06, -d - 0.01, -d, -0.16, 0.95, "LineColor")
    mb.box(-HW, HW, -d + 0.1, -d + 0.12, 2.0, 2.12, "LineColor")
    # 관통문 (비상문)
    mb.box(-0.38, 0.38, -d - 0.01, -d + 0.02, 0.0, 1.9, "Steel")
    mb.box(-0.30, 0.30, -d - 0.02, -d - 0.01, 1.0, 1.75, "Glass")
    # 행선표시기
    mb.box(-0.95, 0.95, -d + 0.06, -d + 0.1, 1.97, 2.20, "Dark")
    mb.box(-0.92, 0.92, -d + 0.055, -d + 0.06, 1.99, 2.18, "Screen")
    # 전조등/후미등
    for s in (-1, 1):
        mb.box(s * 1.05, s * 1.35, -d - 0.02, -d, 0.30, 0.48, "HeadLight")
        mb.box(s * 1.05, s * 1.35, -d - 0.02, -d, 0.10, 0.24, "TailLight")
    # 연결기와 배장기
    mb.box(-0.15, 0.15, -d - 0.45, -d, -0.62, -0.45, "Dark")
    mb.box(-1.2, 1.2, -d - 0.05, -d + 0.3, -0.85, -0.16, "Dark")
    mb.build("CabBody", parent=root)
    export(os.path.join(out_dir, "train_cab.glb"), [root])


# ---------------------------------------------------------------- 역 소품
def build_props(out_dir):
    clear_scene()
    mats = materials()
    objs = []

    # 스크린도어 고정부 (객차 1량 = 20m). x=0 이 승강장 끝선, -X 쪽이 선로.
    psd = MB(mats)
    H = 2.15
    openings = [(dy - 1.05, dy + 1.05) for dy in DOOR_Y]
    edges = [-10.0]
    for a, b in openings:
        edges += [a, b]
    edges.append(10.0)
    for i in range(0, len(edges), 2):
        y0, y1 = edges[i], edges[i + 1]
        if y1 - y0 < 0.05:
            continue
        psd.box(-0.04, 0.04, y0, y0 + 0.08, 0.0, H, "Steel")
        psd.box(-0.04, 0.04, y1 - 0.08, y1, 0.0, H, "Steel")
        psd.box(-0.006, 0.006, y0 + 0.08, y1 - 0.08, 0.12, H - 0.05, "Glass")
        psd.box(-0.05, 0.05, y0, y1, 0.0, 0.12, "Steel")
    for a, b in openings:
        psd.box(-0.07, 0.07, a - 0.12, a, 0.0, H, "Steel")       # 문 기둥 (전동기 케이스)
        psd.box(-0.07, 0.07, b, b + 0.12, 0.0, H, "Steel")
        psd.box(-0.03, 0.03, a, b, -0.004, 0.004, "Yellow")      # 문턱
    psd.box(-0.14, 0.14, -10.0, 10.0, H, H + 0.42, "Steel")      # 상부 하우징
    psd.box(0.14, 0.145, -10.0, 10.0, H + 0.03, H + 0.09, "LineColor")
    psd.box(-0.145, -0.14, -10.0, 10.0, H + 0.03, H + 0.09, "LineColor")
    objs.append(psd.build("PSDFrame"))

    leaf = MB(mats)
    lw = 1.05
    leaf.box(-0.025, 0.025, -lw / 2, lw / 2, -H / 2 + 0.0, -H / 2 + 0.10, "Steel")
    leaf.box(-0.025, 0.025, -lw / 2, lw / 2, H / 2 - 0.08, H / 2, "Steel")
    leaf.box(-0.025, 0.025, -lw / 2, -lw / 2 + 0.06, -H / 2, H / 2, "Steel")
    leaf.box(-0.025, 0.025, lw / 2 - 0.06, lw / 2, -H / 2, H / 2, "Steel")
    leaf.box(-0.005, 0.005, -lw / 2 + 0.06, lw / 2 - 0.06, -H / 2 + 0.10, H / 2 - 0.08, "Glass")
    leaf.box(0.026, 0.03, -lw / 2 + 0.1, lw / 2 - 0.1, 0.05, 0.25, "Yellow")       # 경고 스티커
    o = leaf.build("PSDLeaf", location=(0, 0, H / 2))
    objs.append(o)

    # 벤치
    bench = MB(mats)
    for k in range(4):
        y = -0.72 + k * 0.48
        bench.box(-0.22, 0.22, y - 0.21, y + 0.21, 0.42, 0.46, "Steel")
        bench.box(0.16, 0.22, y - 0.21, y + 0.21, 0.46, 0.85, "Steel")
    for y in (-0.8, 0.8):
        bench.box(-0.2, 0.2, y - 0.03, y + 0.03, 0.0, 0.42, "Dark")
    objs.append(bench.build("Bench"))

    # 지상역 지붕 한 칸 (10m)
    can = MB(mats)
    can.cyl(0.0, 0.0, 1.8, 0.12, 3.6, "z", "Steel", 10)
    can.box(-0.15, 0.15, -0.15, 0.15, 3.6, 3.8, "Steel")
    can.box(-4.2, 4.2, -5.0, 5.0, 3.8, 3.95, "Roof")
    can.box(-4.25, 4.25, -5.0, 5.0, 3.95, 4.05, "Roof")
    for s in (-1, 1):
        can.box(s * 1.2, s * 1.4, -4.8, 4.8, 3.76, 3.8, "LightStrip")
    objs.append(can.build("Canopy"))

    # 계단 (아래로 내려가는 출입구, 길이 6m)
    st = MB(mats)
    n = 18
    for k in range(n):
        z = -k * 0.17
        st.box(-1.2, 1.2, k * 0.30, (k + 1) * 0.30 + 0.2, z - 0.17, z, "Concrete")
        st.box(-1.2, 1.2, k * 0.30, k * 0.30 + 0.04, z - 0.005, z, "Yellow")
    for s in (-1, 1):
        st.box(s * 1.2, s * 1.35, 0.0, n * 0.30, -n * 0.17, 1.0, "Tile")
        st.cyl(s * 1.1, n * 0.15, 0.9 - n * 0.085, 0.025, n * 0.30, "y", "Pole", 8)
    st.box(-1.35, 1.35, -0.05, 0.0, 0.0, 1.0, "Glass")
    objs.append(st.build("Stair"))

    export(os.path.join(out_dir, "station_props.glb"), objs)


def main():
    argv = sys.argv
    out_dir = argv[argv.index("--") + 1] if "--" in argv else "assets/models"
    out_dir = os.path.abspath(out_dir)
    os.makedirs(out_dir, exist_ok=True)
    build_car(None, out_dir)
    build_cab(out_dir)
    build_props(out_dir)


main()
