# Seoul Metro VR - 역 소품 Blender 모델 생성 스크립트
#
# 사용법 (헤드리스):
#   blender -b --factory-startup -P blender/build_station_props.py -- assets/models
#
# 생성물: station_props.glb (스크린도어 1량분 프레임/문짝, 벤치, 승강장 지붕, 계단)
# 좌표계: Blender X=폭, Y=길이, Z=높이 → Godot X=폭, Y=높이, Z=-길이.

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
    build_props(out_dir)


main()
