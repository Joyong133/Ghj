extends Node3D
class_name Scenery
## 역과 역 사이의 풍경. 25m 단위 조각을 재활용하며 +Z 방향으로 흘려보낸다.
##  U = 지하 터널, G = 지상(성토), E = 고가, B = 한강 철교
## 그 밖에 지면, 한강 수면, 도시 건물(MultiMesh), 터널 입구를 관리한다.

const CL := 50.0                 # 조각 길이 (침목 0.625m × 80)
const J_AHEAD := 11              # 앞쪽 조각 수
const J_BEHIND := 7              # 뒤쪽 조각 수
const OPP_X := 3.9               # 반대 선로 중심 (+X 쪽, 좌측통행)
const BUILD_CELL := 34.0

var chunks: Array = []           # [{node, variants: {type: MeshInstance3D}}]
var ground_a: MeshInstance3D
var ground_b: MeshInstance3D
var water: MeshInstance3D
var portals: Array = []
var bld_mm: Array = []           # [{mmi, w, h, d}]
var ground_y := -1.75
var env_fn: Callable             # func(z: float) -> String (역 구간은 "S")
var raw_fn: Callable             # func(z: float) -> String (역 구간도 역의 구조 U/G/E)
var portal_fn: Callable          # func() -> Array of {z, u_side}
var bridge_fn: Callable          # func() -> Array of [z_start, z_end]
var night := false


# ------------------------------------------------------------------ 메시 누적기
class Accum:
	var parts := {}               # Material -> SurfaceTool
	var order: Array = []

	func _st(mat: Material) -> SurfaceTool:
		if not parts.has(mat):
			var st := SurfaceTool.new()
			st.begin(Mesh.PRIMITIVE_TRIANGLES)
			parts[mat] = st
			order.append(mat)
		return parts[mat]

	func quad(mat: Material, a: Vector3, b: Vector3, c: Vector3, d: Vector3, n: Vector3, uv_scale := 1.0, uv_offset := Vector2.ZERO) -> void:
		var st := _st(mat)
		var ua := Vector2(0, 0)
		var ub := Vector2((b - a).length(), 0)
		var uc := Vector2((b - a).length(), (c - b).length())
		var ud := Vector2(0, (c - b).length())
		for pair in [[a, ua], [b, ub], [c, uc], [a, ua], [c, uc], [d, ud]]:
			st.set_normal(n)
			st.set_uv(pair[1] * uv_scale + uv_offset)
			st.add_vertex(pair[0])

	func box(mat: Material, c: Vector3, s: Vector3, uv_scale := 0.5) -> void:
		var h := s * 0.5
		var x0 := c.x - h.x
		var x1 := c.x + h.x
		var y0 := c.y - h.y
		var y1 := c.y + h.y
		var z0 := c.z - h.z
		var z1 := c.z + h.z
		# 앞뒤좌우위아래 (반시계 = 앞면)
		quad(mat, Vector3(x0, y1, z1), Vector3(x1, y1, z1), Vector3(x1, y1, z0), Vector3(x0, y1, z0), Vector3.UP, uv_scale)
		quad(mat, Vector3(x0, y0, z0), Vector3(x1, y0, z0), Vector3(x1, y0, z1), Vector3(x0, y0, z1), Vector3.DOWN, uv_scale)
		quad(mat, Vector3(x0, y0, z1), Vector3(x1, y0, z1), Vector3(x1, y1, z1), Vector3(x0, y1, z1), Vector3.BACK, uv_scale)
		quad(mat, Vector3(x1, y0, z0), Vector3(x0, y0, z0), Vector3(x0, y1, z0), Vector3(x1, y1, z0), Vector3.FORWARD, uv_scale)
		quad(mat, Vector3(x1, y0, z1), Vector3(x1, y0, z0), Vector3(x1, y1, z0), Vector3(x1, y1, z1), Vector3.RIGHT, uv_scale)
		quad(mat, Vector3(x0, y0, z0), Vector3(x0, y0, z1), Vector3(x0, y1, z1), Vector3(x0, y1, z0), Vector3.LEFT, uv_scale)

	## 윗면만 있는 평면 (침목 텍스처용, v 방향 = z)
	func top_plane(mat: Material, cx: float, y: float, w: float, z0: float, z1: float, v_per_m: float) -> void:
		var st := _st(mat)
		var x0 := cx - w * 0.5
		var x1 := cx + w * 0.5
		var pts := [[Vector3(x0, y, z1), Vector2(0, 0)], [Vector3(x1, y, z1), Vector2(1, 0)],
			[Vector3(x1, y, z0), Vector2(1, (z1 - z0) * v_per_m)], [Vector3(x0, y, z0), Vector2(0, (z1 - z0) * v_per_m)]]
		for k in [0, 1, 2, 0, 2, 3]:
			st.set_normal(Vector3.UP)
			st.set_uv(pts[k][1])
			st.add_vertex(pts[k][0])

	func commit() -> ArrayMesh:
		var am := ArrayMesh.new()
		for mat in order:
			var st: SurfaceTool = parts[mat]
			st.commit(am)
			am.surface_set_material(am.get_surface_count() - 1, mat)
		return am


# ------------------------------------------------------------------ 재질
var m_rail: Material
var m_slab: Material
var m_sleeper: Material
var m_tunnel: Material
var m_tunnel_light: Material
var m_conc: Material
var m_grass: Material
var m_dark: Material
var m_steel: Material
var m_wire: Material
var m_ballast: Material


func _init_materials() -> void:
	m_rail = Mats.color(Color(0.55, 0.55, 0.57), 0.3, 0.9)
	m_slab = Mats.textured("slab2", Mats.noise_texture(Color(0.40, 0.40, 0.39)), Vector3(1, 1, 1), Color.WHITE, 1.0)
	var sm := StandardMaterial3D.new()
	sm.albedo_texture = Mats.sleeper_texture()
	sm.roughness = 1.0
	sm.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
	m_sleeper = sm
	var tm := StandardMaterial3D.new()
	tm.albedo_texture = Mats.tunnel_texture()
	tm.roughness = 1.0
	tm.uv1_scale = Vector3(0.25, 0.25, 1)
	m_tunnel = tm
	m_tunnel_light = Mats.emissive(Color(1.0, 0.92, 0.75), 2.0)
	m_conc = Mats.textured("conc2", Mats.noise_texture(Color(0.64, 0.64, 0.62), 0.05), Vector3(1, 1, 1), Color.WHITE, 1.0)
	m_grass = Mats.textured("grass", Mats.noise_texture(Color(0.33, 0.45, 0.22), 0.07, 9), Vector3(1, 1, 1), Color.WHITE, 1.0)
	m_dark = Mats.color(Color(0.1, 0.1, 0.1), 1.0)
	m_steel = Mats.color(Color(0.45, 0.48, 0.52), 0.5, 0.6)
	m_wire = Mats.color(Color(0.15, 0.12, 0.1), 0.6, 0.6)
	m_ballast = Mats.textured("ballast", Mats.noise_texture(Color(0.42, 0.40, 0.37), 0.12, 4), Vector3(1, 1, 1), Color.WHITE, 1.0)


func _tracks(a: Accum, ballast: bool) -> void:
	for x in [0.0, OPP_X]:
		if ballast:
			a.top_plane(m_sleeper, x, MetroConst.RAIL_TOP - 0.15, 2.8, -CL * 0.5, CL * 0.5, 1.0 / 0.625)
			a.box(m_ballast, Vector3(x, MetroConst.RAIL_TOP - 0.36, 0), Vector3(3.6, 0.4, CL))
		else:
			a.box(m_slab, Vector3(x, MetroConst.RAIL_TOP - 0.3, 0), Vector3(3.0, 0.3, CL))
			for k in range(int(CL / 0.625)):
				a.box(m_conc, Vector3(x, MetroConst.RAIL_TOP - 0.12, -CL * 0.5 + (k + 0.5) * 0.625), Vector3(2.0, 0.08, 0.22))
		for s in [-1, 1]:
			a.box(m_rail, Vector3(x + s * MetroConst.GAUGE * 0.5, MetroConst.RAIL_TOP - 0.075, 0), Vector3(0.07, 0.15, CL))


func _catenary(a: Accum, base_y: float, x_left: float, x_right: float) -> void:
	# 전차선 (가공 전차선 1500V)
	for x in [0.0, OPP_X]:
		a.box(m_wire, Vector3(x, MetroConst.RAIL_TOP + 5.1, 0), Vector3(0.02, 0.02, CL))
		a.box(m_wire, Vector3(x, MetroConst.RAIL_TOP + 6.0, 0), Vector3(0.015, 0.015, CL))
	for x in [x_left, x_right]:
		a.box(m_steel, Vector3(x, (base_y + MetroConst.RAIL_TOP + 6.8) * 0.5, -CL * 0.5 + 0.2), Vector3(0.3, MetroConst.RAIL_TOP + 6.8 - base_y, 0.3))
	a.box(m_steel, Vector3((x_left + x_right) * 0.5, MetroConst.RAIL_TOP + 6.7, -CL * 0.5 + 0.2), Vector3(x_right - x_left, 0.25, 0.25))


func _build_variant(type: String) -> ArrayMesh:
	var a := Accum.new()
	match type:
		"U":
			_tracks(a, false)
			var floor_y := MetroConst.RAIL_TOP - 0.45
			var x0 := -2.3
			var x1 := OPP_X + 2.3
			var top := MetroConst.RAIL_TOP + 5.3
			a.box(m_tunnel, Vector3(x0 - 0.2, (floor_y + top) * 0.5, 0), Vector3(0.4, top - floor_y, CL))
			a.box(m_tunnel, Vector3(x1 + 0.2, (floor_y + top) * 0.5, 0), Vector3(0.4, top - floor_y, CL))
			a.box(m_tunnel, Vector3((x0 + x1) * 0.5, top + 0.2, 0), Vector3(x1 - x0 + 0.8, 0.4, CL))
			a.box(m_dark, Vector3((x0 + x1) * 0.5, floor_y - 0.1, 0), Vector3(x1 - x0, 0.2, CL))
			# 선로 사이 중앙 기둥
			a.box(m_conc, Vector3(OPP_X * 0.5, (floor_y + top) * 0.5, -CL * 0.25), Vector3(0.5, top - floor_y, 0.5))
			a.box(m_conc, Vector3(OPP_X * 0.5, (floor_y + top) * 0.5, CL * 0.25), Vector3(0.5, top - floor_y, 0.5))
			# 벽 조명 (지나가는 불빛으로 속도감)
			for z in [-CL * 0.375, -CL * 0.125, CL * 0.125, CL * 0.375]:
				a.box(m_tunnel_light, Vector3(x0 + 0.05, MetroConst.RAIL_TOP + 2.6, z), Vector3(0.08, 0.12, 0.9))
				a.box(m_tunnel_light, Vector3(x1 - 0.05, MetroConst.RAIL_TOP + 2.6, z), Vector3(0.08, 0.12, 0.9))
			# 케이블 선반
			for y in [0.4, 0.7, 1.0]:
				a.box(m_dark, Vector3(x0 + 0.15, MetroConst.RAIL_TOP + 1.2 + y, 0), Vector3(0.12, 0.05, CL))
			a.box(m_wire, Vector3(0.0, MetroConst.RAIL_TOP + 4.8, 0), Vector3(0.03, 0.03, CL))
			a.box(m_wire, Vector3(OPP_X, MetroConst.RAIL_TOP + 4.8, 0), Vector3(0.03, 0.03, CL))
		"G":
			_tracks(a, true)
			# 성토와 풀
			a.box(m_grass, Vector3(OPP_X * 0.5, MetroConst.RAIL_TOP - 0.6 - 5.0, 0), Vector3(40.0, 10.0, CL))
			_catenary(a, MetroConst.RAIL_TOP - 0.55, -2.8, OPP_X + 2.8)
			# 방음벽/울타리
			for x in [-6.0, OPP_X + 6.0]:
				a.box(m_steel, Vector3(x, MetroConst.RAIL_TOP + 0.4, 0), Vector3(0.06, 1.8, CL))
		"E":
			_tracks(a, true)
			var deck_y := MetroConst.RAIL_TOP - 1.2
			a.box(m_conc, Vector3(OPP_X * 0.5, deck_y, 0), Vector3(OPP_X + 6.0, 1.4, CL))
			for x in [-2.9, OPP_X + 2.9]:
				a.box(m_conc, Vector3(x, MetroConst.RAIL_TOP + 0.1, 0), Vector3(0.25, 1.4, CL))
			a.box(m_conc, Vector3(OPP_X * 0.5, -6.6, 0), Vector3(2.2, 8.0, 2.2))
			_catenary(a, MetroConst.RAIL_TOP - 0.55, -2.6, OPP_X + 2.6)
		"B":
			_tracks(a, true)
			var deck := MetroConst.RAIL_TOP - 0.9
			a.box(m_steel, Vector3(OPP_X * 0.5, deck, 0), Vector3(OPP_X + 5.0, 0.8, CL))
			# 트러스
			var xs := [-2.7, OPP_X + 2.7]
			for x in xs:
				a.box(m_steel, Vector3(x, MetroConst.RAIL_TOP + 6.0, 0), Vector3(0.35, 0.45, CL))   # 상현재
				a.box(m_steel, Vector3(x, MetroConst.RAIL_TOP + 0.2, 0), Vector3(0.35, 0.5, CL))    # 하현재
				for z in [-CL * 0.5 + 0.2, 0.0]:
					a.box(m_steel, Vector3(x, MetroConst.RAIL_TOP + 3.1, z), Vector3(0.3, 6.0, 0.3))
			for z in [-CL * 0.5 + 0.2, 0.0]:
				a.box(m_steel, Vector3(OPP_X * 0.5, MetroConst.RAIL_TOP + 6.1, z), Vector3(OPP_X + 5.4, 0.25, 0.25))
			# 교각 (긴 경간마다)
			a.box(m_conc, Vector3(OPP_X * 0.5, -8.0, 0), Vector3(4.0, 13.0, 3.0))
	return a.commit()


## 대각 부재는 별도 메시로 (회전)
func _diag_mesh() -> ArrayMesh:
	var a := Accum.new()
	a.box(m_steel, Vector3.ZERO, Vector3(0.25, 0.25, 1.0))
	return a.commit()


func _ready() -> void:
	_init_materials()
	var variants := {}
	for t in ["U", "G", "E", "B"]:
		variants[t] = _build_variant(t)
	var diag := _diag_mesh()
	for j in range(-J_AHEAD, J_BEHIND + 1):
		var holder := Node3D.new()
		add_child(holder)
		var vs := {}
		for t in variants:
			var mi := MeshInstance3D.new()
			mi.mesh = variants[t]
			mi.visible = false
			holder.add_child(mi)
			vs[t] = mi
		# 철교 대각재
		var dg := Node3D.new()
		vs["B"].add_child(dg)
		for x in [-2.7, OPP_X + 2.7]:
			for k in range(2):
				var d := MeshInstance3D.new()
				d.mesh = diag
				var zc := -CL * 0.5 + 0.2 + (k + 0.5) * CL * 0.5 - 0.1
				d.position = Vector3(x, MetroConst.RAIL_TOP + 3.1, zc)
				var ang := atan2(6.0, CL * 0.5)
				d.rotation.x = ang if k % 2 == 0 else -ang
				d.scale = Vector3(1, 1, sqrt(36.0 + CL * CL * 0.25))
				dg.add_child(d)
		chunks.append({"node": holder, "v": vs, "j": j})

	# 지면 두 장 (철교 구간에서는 한강을 보이게 나눔)
	ground_a = _ground_plane()
	ground_b = _ground_plane()
	water = MeshInstance3D.new()
	var wm := PlaneMesh.new()
	wm.size = Vector2(1400, 1800)
	water.mesh = wm
	var wmat := StandardMaterial3D.new()
	wmat.albedo_color = Color(0.18, 0.32, 0.42)
	wmat.metallic = 0.3
	wmat.roughness = 0.15
	water.material_override = wmat
	water.position.y = -14.0
	water.visible = false
	add_child(water)

	# 터널 입구 3개
	for k in range(3):
		portals.append(_build_portal())

	# 건물
	_build_buildings()


func _ground_plane() -> MeshInstance3D:
	var g := MeshInstance3D.new()
	var pm := PlaneMesh.new()
	pm.size = Vector2(2400, 2000)
	g.mesh = pm
	var m := StandardMaterial3D.new()
	m.albedo_texture = Mats.noise_texture(Color(0.40, 0.42, 0.36), 0.06, 13)
	m.uv1_scale = Vector3(200, 200, 1)
	m.roughness = 1.0
	g.material_override = m
	add_child(g)
	return g


func _build_portal() -> Node3D:
	var n := Node3D.new()
	var conc := m_conc
	var w := OPP_X + 4.6
	var cx := OPP_X * 0.5
	var top := MetroConst.RAIL_TOP + 5.3
	var by := MetroConst.RAIL_TOP - 0.5
	# 정면 벽 (개구부 주변)
	Mats.box(n, Vector3(20.0, 14.0, 1.0), Vector3(cx - w * 0.5 - 10.0, by + 7.0 - 3.0, 0), conc)
	Mats.box(n, Vector3(20.0, 14.0, 1.0), Vector3(cx + w * 0.5 + 10.0, by + 7.0 - 3.0, 0), conc)
	Mats.box(n, Vector3(w, 8.0, 1.0), Vector3(cx, top + 4.0, 0), conc)
	# 옆 옹벽 (바깥쪽으로 40m) — 자식 노드에 두고 방향에 따라 뒤집는다
	var wing := Node3D.new()
	wing.name = "Wing"
	n.add_child(wing)
	for x in [cx - w * 0.5 - 0.3, cx + w * 0.5 + 0.3]:
		Mats.box(wing, Vector3(0.6, 5.0, 40.0), Vector3(x, by + 2.0, -20.5), conc)
	Mats.box(n, Vector3(w + 1.0, 0.6, 1.2), Vector3(cx, top + 8.2, 0), Mats.color(Color(0.5, 0.5, 0.5)))
	n.visible = false
	add_child(n)
	return n


const BLD_TYPES := [
	[14.0, 32.0, 12.0], [22.0, 48.0, 16.0], [16.0, 16.0, 26.0], [50.0, 42.0, 13.0], [30.0, 10.0, 30.0], [12.0, 70.0, 12.0],
]


func _build_buildings() -> void:
	var tex := Mats.window_texture(false)
	for bt in BLD_TYPES:
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.use_colors = true
		var a := Accum.new()
		var m := StandardMaterial3D.new()
		m.albedo_texture = tex
		m.vertex_color_use_as_albedo = true
		m.roughness = 0.8
		a.box(m, Vector3(0, bt[1] * 0.5, 0), Vector3(bt[0], bt[1], bt[2]), 1.0 / 8.0)
		mm.mesh = a.commit()
		mm.instance_count = 60
		mm.visible_instance_count = 0
		var mmi := MultiMeshInstance3D.new()
		mmi.multimesh = mm
		add_child(mmi)
		bld_mm.append({"mmi": mmi, "mm": mm, "dims": bt})


static func _hash(i: int, salt: int) -> float:
	var h := (i * 73856093) ^ (salt * 19349663)
	h = (h ^ (h >> 13)) * 1274126177
	h = h ^ (h >> 16)
	return float(h & 0xFFFF) / 65535.0


## 매 프레임: odo = 누적 주행거리(m)
func update_world(odo: float, outdoor_here: bool) -> void:
	var shift := fposmod(odo, CL)
	var base := MetroConst.train_center_z
	for c in chunks:
		var z: float = base + c["j"] * CL + shift
		var node: Node3D = c["node"]
		node.position.z = z
		var t: String = env_fn.call(z)
		for k in c["v"]:
			c["v"][k].visible = (k == t)

	# 지면 높이: 기차 주변 환경에 따라
	var t_here: String = raw_fn.call(base)
	var target := -1.75
	if t_here == "E" or t_here == "B":
		target = -10.2
	ground_y = target
	var bridges: Array = bridge_fn.call()
	var show_ground := outdoor_here
	ground_a.visible = show_ground
	ground_b.visible = show_ground
	water.visible = false
	if bridges.is_empty():
		ground_a.position = Vector3(0, ground_y, base)
		ground_b.position = Vector3(0, ground_y, base + 4000)
	else:
		var zs: float = bridges[0][0]   # 앞쪽 끝 (더 작은 z)
		var ze: float = bridges[0][1]   # 뒤쪽 끝
		ground_b.position = Vector3(0, ground_y, zs - 1000.0)
		ground_a.position = Vector3(0, ground_y, ze + 1000.0)
		water.visible = show_ground
		water.position = Vector3(0, -14.0, (zs + ze) * 0.5)

	# 터널 입구
	var ps: Array = portal_fn.call()
	for k in range(portals.size()):
		var pn: Node3D = portals[k]
		if k < ps.size() and absf(ps[k]["z"] - base) < 600.0:
			pn.visible = true
			pn.position.z = ps[k]["z"]
			# 터널이 +z 쪽(뒤)에 있으면 바깥은 -z → 옹벽은 -z 로 뻗음 (기본값)
			var wing: Node3D = pn.get_node("Wing")
			wing.rotation.y = 0.0 if ps[k]["u_side"] > 0 else PI
			wing.position.x = OPP_X if ps[k]["u_side"] < 0 else 0.0
		else:
			pn.visible = false

	_update_buildings(odo)


func _update_buildings(odo: float) -> void:
	var base := MetroConst.train_center_z
	var counts: Array = []
	for b in bld_mm:
		counts.append(0)
	var c0 := int(floor((odo - 420.0) / BUILD_CELL))
	var c1 := int(floor((odo + 750.0) / BUILD_CELL))
	for cell in range(c0, c1 + 1):
		var u := cell * BUILD_CELL
		var z := base - (u - odo)
		var t: String = raw_fn.call(z)
		if t == "U" or t == "B":
			continue
		for side in [-1, 1]:
			for row in range(2):
				var r := _hash(cell, side * 10 + row)
				if r < 0.35:
					continue
				var bi := int(_hash(cell, side * 7 + row * 3 + 1) * BLD_TYPES.size()) % BLD_TYPES.size()
				var b: Dictionary = bld_mm[bi]
				if counts[bi] >= b["mm"].instance_count:
					continue
				var dims: Array = b["dims"]
				var dist: float = 24.0 + dims[0] * 0.5 + row * 55.0 + _hash(cell, 99 + side) * 25.0
				var x: float = (OPP_X * 0.5) + side * (dist + (OPP_X * 0.5 if side > 0 else 0.0))
				var yaw := 0.0 if _hash(cell, 5 + side) < 0.7 else PI / 2
				var tr := Transform3D(Basis(Vector3.UP, yaw), Vector3(x, ground_y, z))
				var col := Color.from_hsv(_hash(cell, 31 + side + row) * 0.12 + 0.05, 0.08 + _hash(cell, 41) * 0.15, 0.75 + _hash(cell, 51 + row) * 0.22)
				b["mm"].set_instance_transform(counts[bi], tr)
				b["mm"].set_instance_color(counts[bi], col)
				counts[bi] += 1
	for i in range(bld_mm.size()):
		bld_mm[i]["mm"].visible_instance_count = counts[i]
		bld_mm[i]["mmi"].visible = counts[i] > 0
