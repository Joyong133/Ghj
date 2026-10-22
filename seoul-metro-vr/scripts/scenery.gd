extends Node3D
class_name Scenery
## 역과 역 사이의 풍경. 50m 단위 조각을 재활용하며 +Z 방향으로 흘려보낸다.
##  U = 지하 터널, G = 지상(성토), E = 고가, B = 한강 철교
## 그 밖에 지면·도로(텍스처 스크롤), 한강 수면, 도시 건물·가로수·가로등(MultiMesh), 터널 입구를 관리한다.
## 건물/나무 배치는 주행거리(odo)로 정해지는 셀 단위라 조각이 돌아도 튀지 않는다.

const CL := 50.0                 # 조각 길이 (침목 0.625m × 80)
const J_AHEAD := 11              # 앞쪽 조각 수
const J_BEHIND := 7              # 뒤쪽 조각 수
const OPP_X := 3.9               # 반대 선로 중심 (+X 쪽, 좌측통행)
const CELL := 40.0               # 건물 배치 셀
const TEX := "res://assets/textures/env/"

var chunks: Array = []           # [{node, v: {type: MeshInstance3D}, j}]
var ground_a: MeshInstance3D
var ground_b: MeshInstance3D
var road: MeshInstance3D
var water: MeshInstance3D
var portals: Array = []
var bld: Array = []              # [{mm, mmi, proto}]
var trees: Array = []            # [{mm, mmi}]
var lamps: MultiMeshInstance3D
var ground_y := -3.135
var env_fn: Callable             # func(z: float) -> String (역 구간은 "S")
var raw_fn: Callable             # func(z: float) -> String (역 구간도 역의 구조 U/G/E)
var portal_fn: Callable          # func() -> Array of {z, u_side}
var bridge_fn: Callable          # func() -> Array of [z_start, z_end]
var _bld_mats: Array = []
var _day := 1.0


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

	## p0 에서 u 방향 w, v 방향(위) h 인 사각형. u × v 가 바깥 법선.
	## tile: 텍스처 한 장이 덮는 크기(m). 0 이하이면 면 전체에 한 장.
	func face(mat: Material, p0: Vector3, u: Vector3, v: Vector3, w: float, h: float, tile := Vector2(1, 1), nrm := Vector3.ZERO, uv0 := Vector2.ZERO) -> void:
		var st := _st(mat)
		var n := nrm if nrm != Vector3.ZERO else u.cross(v).normalized()
		var tu := w / tile.x if tile.x > 0.0 else 1.0
		var tv := h / tile.y if tile.y > 0.0 else 1.0
		var pa := p0
		var pb := p0 + u * w
		var pc := p0 + u * w + v * h
		var pd := p0 + v * h
		var ua := uv0 + Vector2(0, tv)
		var ub := uv0 + Vector2(tu, tv)
		var uc := uv0 + Vector2(tu, 0)
		var ud := uv0 + Vector2(0, 0)
		# Godot 는 시계방향이 앞면
		for pr in [[pa, ua], [pc, uc], [pb, ub], [pa, ua], [pd, ud], [pc, uc]]:
			st.set_normal(n)
			st.set_uv(pr[1])
			st.add_vertex(pr[0])

	## 상자: 옆면은 tile 크기로 텍스처 반복
	func box(mat: Material, c: Vector3, s: Vector3, tile := Vector2(2, 2), top_mat: Material = null) -> void:
		var h := s * 0.5
		var x0 := c.x - h.x
		var x1 := c.x + h.x
		var y0 := c.y - h.y
		var y1 := c.y + h.y
		var z0 := c.z - h.z
		var z1 := c.z + h.z
		var tm := top_mat if top_mat != null else mat
		face(mat, Vector3(x0, y0, z1), Vector3.RIGHT, Vector3.UP, s.x, s.y, tile)          # +z
		face(mat, Vector3(x1, y0, z0), Vector3.LEFT, Vector3.UP, s.x, s.y, tile)           # -z
		face(mat, Vector3(x1, y0, z1), Vector3.FORWARD, Vector3.UP, s.z, s.y, tile)        # +x
		face(mat, Vector3(x0, y0, z0), Vector3.BACK, Vector3.UP, s.z, s.y, tile)           # -x
		face(tm, Vector3(x0, y1, z1), Vector3.RIGHT, Vector3.FORWARD, s.x, s.z, tile)      # 위
		face(mat, Vector3(x0, y0, z0), Vector3.RIGHT, Vector3.BACK, s.x, s.z, tile)        # 아래

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
var m_tunnel_floor: Material
var m_tunnel_light: Material
var m_conc: Material
var m_grass: Material
var m_dark: Material
var m_steel: Material
var m_wire: Material
var m_ballast: Material
var m_barrier: Material
var m_sig_red: Material
var m_sig_green: Material
var m_exit: Material
var m_marker: Material


func _tex(name: String) -> Texture2D:
	return load(TEX + name) as Texture2D


func _mat(tex: String, rough := 0.95, tint := Color.WHITE) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_texture = _tex(tex)
	m.albedo_color = tint
	m.roughness = rough
	m.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
	return m


func _init_materials() -> void:
	m_rail = Mats.color(Color(0.62, 0.62, 0.64), 0.25, 0.9)
	m_slab = _mat("concrete.png", 1.0, Color(0.72, 0.72, 0.72))
	var sm := StandardMaterial3D.new()
	sm.albedo_texture = Mats.sleeper_texture()
	sm.roughness = 1.0
	sm.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
	m_sleeper = sm
	m_tunnel = _mat("tunnel_wall.png", 1.0)
	m_tunnel_floor = _mat("concrete.png", 1.0, Color(0.45, 0.45, 0.45))
	m_tunnel_light = Mats.emissive(Color(1.0, 0.94, 0.80), 2.2)
	m_conc = _mat("concrete.png", 0.95)
	m_grass = _mat("grass.png", 1.0)
	m_dark = Mats.color(Color(0.1, 0.1, 0.1), 1.0)
	m_steel = Mats.color(Color(0.50, 0.53, 0.56), 0.5, 0.5)
	m_wire = Mats.color(Color(0.15, 0.12, 0.1), 0.6, 0.6)
	m_ballast = Mats.textured("ballast", Mats.noise_texture(Color(0.45, 0.43, 0.40), 0.14, 4), Vector3(1, 1, 1), Color.WHITE, 1.0)
	var bm := _mat("noise_barrier.png", 0.4)
	bm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA_DEPTH_PRE_PASS
	bm.cull_mode = BaseMaterial3D.CULL_DISABLED
	m_barrier = bm
	m_sig_red = Mats.emissive(Color(1.0, 0.1, 0.05), 2.5)
	m_sig_green = Mats.emissive(Color(0.1, 1.0, 0.4), 2.5)
	m_exit = Mats.emissive(Color(0.1, 0.75, 0.35), 1.6)
	m_marker = Mats.color(Color(0.95, 0.95, 0.92), 0.6)


func _tracks(a: Accum, ballast: bool) -> void:
	for x in [0.0, OPP_X]:
		if ballast:
			var y := MetroConst.RAIL_TOP - 0.15
			a.face(m_sleeper, Vector3(x - 1.4, y, CL * 0.5), Vector3.RIGHT, Vector3.FORWARD, 2.8, CL, Vector2(2.8, 0.625))
			a.box(m_ballast, Vector3(x, MetroConst.RAIL_TOP - 0.36, 0), Vector3(3.6, 0.4, CL))
		else:
			a.box(m_slab, Vector3(x, MetroConst.RAIL_TOP - 0.3, 0), Vector3(3.0, 0.3, CL), Vector2(3, 3))
			for k in range(int(CL / 0.625)):
				a.box(m_conc, Vector3(x, MetroConst.RAIL_TOP - 0.12, -CL * 0.5 + (k + 0.5) * 0.625), Vector3(2.0, 0.08, 0.22))
		for s in [-1, 1]:
			a.box(m_rail, Vector3(x + s * MetroConst.GAUGE * 0.5, MetroConst.RAIL_TOP - 0.075, 0), Vector3(0.07, 0.15, CL))


func _catenary(a: Accum, base_y: float, x_left: float, x_right: float) -> void:
	# 가공 전차선 (조가선 + 전차선 + 드로퍼)
	for x in [0.0, OPP_X]:
		a.box(m_wire, Vector3(x, MetroConst.RAIL_TOP + 5.1, 0), Vector3(0.02, 0.02, CL))
		a.box(m_wire, Vector3(x, MetroConst.RAIL_TOP + 6.0, 0), Vector3(0.015, 0.015, CL))
		for k in range(5):
			a.box(m_wire, Vector3(x, MetroConst.RAIL_TOP + 5.55, -CL * 0.5 + 5.0 + k * 10.0), Vector3(0.01, 0.9, 0.01))
	for x in [x_left, x_right]:
		a.box(m_steel, Vector3(x, (base_y + MetroConst.RAIL_TOP + 6.8) * 0.5, -CL * 0.5 + 0.2), Vector3(0.3, MetroConst.RAIL_TOP + 6.8 - base_y, 0.3))
	a.box(m_steel, Vector3((x_left + x_right) * 0.5, MetroConst.RAIL_TOP + 6.7, -CL * 0.5 + 0.2), Vector3(x_right - x_left, 0.25, 0.25))
	for x in [0.0, OPP_X]:
		a.box(m_steel, Vector3(x, MetroConst.RAIL_TOP + 6.35, -CL * 0.5 + 0.2), Vector3(0.06, 0.7, 0.06))


func _build_variant(type: String) -> ArrayMesh:
	var a := Accum.new()
	match type:
		"U":
			_tracks(a, false)
			var floor_y := MetroConst.RAIL_TOP - 0.45
			var x0 := -2.3
			var x1 := OPP_X + 2.3
			var top := MetroConst.RAIL_TOP + 5.3
			var hgt := top - floor_y
			# 벽 (텍스처: 10m 마다 시공 이음매, 케이블)
			a.face(m_tunnel, Vector3(x0, floor_y, CL * 0.5), Vector3.FORWARD, Vector3.UP, CL, hgt, Vector2(10, hgt))
			a.face(m_tunnel, Vector3(x1, floor_y, -CL * 0.5), Vector3.BACK, Vector3.UP, CL, hgt, Vector2(10, hgt))
			a.face(m_tunnel_floor, Vector3(x0, top, -CL * 0.5), Vector3.RIGHT, Vector3.BACK, x1 - x0, CL, Vector2(4, 4))
			a.box(m_tunnel_floor, Vector3((x0 + x1) * 0.5, floor_y - 0.1, 0), Vector3(x1 - x0, 0.2, CL), Vector2(4, 4))
			# 선로 사이 중앙 기둥
			for z in [-CL * 0.375, -CL * 0.125, CL * 0.125, CL * 0.375]:
				a.box(m_conc, Vector3(OPP_X * 0.5, (floor_y + top) * 0.5, z), Vector3(0.45, hgt, 0.45), Vector2(2, 2))
			# 벽 조명 (지나가는 불빛으로 속도감)
			for z in [-CL * 0.375, -CL * 0.125, CL * 0.125, CL * 0.375]:
				a.box(m_dark, Vector3(x0 + 0.06, MetroConst.RAIL_TOP + 2.7, z), Vector3(0.1, 0.16, 1.25))
				a.box(m_tunnel_light, Vector3(x0 + 0.12, MetroConst.RAIL_TOP + 2.7, z), Vector3(0.02, 0.10, 1.15))
				a.box(m_dark, Vector3(x1 - 0.06, MetroConst.RAIL_TOP + 2.7, z), Vector3(0.1, 0.16, 1.25))
				a.box(m_tunnel_light, Vector3(x1 - 0.12, MetroConst.RAIL_TOP + 2.7, z), Vector3(0.02, 0.10, 1.15))
			# 케이블 선반과 배관
			for y in [0.9, 1.15, 1.4]:
				a.box(m_dark, Vector3(x0 + 0.18, MetroConst.RAIL_TOP + 1.2 + y, 0), Vector3(0.25, 0.04, CL))
			a.box(Mats.color(Color(0.55, 0.15, 0.12), 0.6), Vector3(x1 - 0.2, MetroConst.RAIL_TOP + 0.6, 0), Vector3(0.18, 0.18, CL))
			# 신호기 (빨강/초록), 비상구 유도등, 거리표
			a.box(m_dark, Vector3(x0 + 0.25, MetroConst.RAIL_TOP + 3.3, -CL * 0.5 + 3.0), Vector3(0.3, 0.7, 0.2))
			a.box(m_sig_green, Vector3(x0 + 0.41, MetroConst.RAIL_TOP + 3.45, -CL * 0.5 + 3.0), Vector3(0.02, 0.12, 0.12))
			a.box(m_sig_red, Vector3(x0 + 0.41, MetroConst.RAIL_TOP + 3.2, -CL * 0.5 + 3.0), Vector3(0.02, 0.12, 0.12))
			a.box(m_exit, Vector3(x0 + 0.05, MetroConst.RAIL_TOP + 2.2, CL * 0.25), Vector3(0.04, 0.25, 0.6))
			a.box(m_marker, Vector3(x0 + 0.03, MetroConst.RAIL_TOP + 1.6, 0.0), Vector3(0.03, 0.35, 0.25))
			# 전차선 (지하 강체 전차선)
			for x in [0.0, OPP_X]:
				a.box(m_steel, Vector3(x, MetroConst.RAIL_TOP + 4.8, 0), Vector3(0.12, 0.08, CL))
		"G", "N":
			_tracks(a, true)
			# 낮은 성토(약 1.5m)와 풀 비탈
			var top_y := MetroConst.RAIL_TOP - 0.56
			var gnd := MetroConst.RAIL_TOP - 2.05
			a.box(m_grass, Vector3(OPP_X * 0.5, (top_y + gnd) * 0.5, 0), Vector3(16.0, top_y - gnd, CL), Vector2(8, 8))
			for sd in [-1, 1]:
				var xe: float = OPP_X * 0.5 + sd * 8.0
				var p_top := Vector3(xe, top_y, 0)
				var p_bot := Vector3(xe + sd * 4.0, gnd - 0.05, 0)
				var dir := p_bot - p_top
				if sd < 0:
					a.face(m_grass, p_top + Vector3(0, 0, -CL * 0.5), dir.normalized(), Vector3.BACK, dir.length(), CL, Vector2(8, 8))
				else:
					a.face(m_grass, p_top + Vector3(0, 0, CL * 0.5), dir.normalized(), Vector3.FORWARD, dir.length(), CL, Vector2(8, 8))
			_catenary(a, MetroConst.RAIL_TOP - 0.55, -2.8, OPP_X + 2.8)
			if type == "N":
				# 방음벽 (아래 흡음판, 위 투명판)
				a.face(m_barrier, Vector3(-4.6, MetroConst.RAIL_TOP - 0.5, CL * 0.5), Vector3.FORWARD, Vector3.UP, CL, 4.0, Vector2(4, 4))
				a.face(m_barrier, Vector3(OPP_X + 4.6, MetroConst.RAIL_TOP - 0.5, -CL * 0.5), Vector3.BACK, Vector3.UP, CL, 4.0, Vector2(4, 4))
			else:
				for x in [-6.0, OPP_X + 6.0]:
					a.box(m_steel, Vector3(x, MetroConst.RAIL_TOP + 0.3, 0), Vector3(0.05, 1.6, CL))
		"E":
			_tracks(a, true)
			var deck_y := MetroConst.RAIL_TOP - 1.2
			a.box(m_conc, Vector3(OPP_X * 0.5, deck_y, 0), Vector3(OPP_X + 6.0, 1.4, CL), Vector2(4, 4))
			a.box(m_conc, Vector3(OPP_X * 0.5, deck_y - 1.4, 0), Vector3(OPP_X + 2.0, 1.6, CL), Vector2(4, 4))
			for x in [-2.9, OPP_X + 2.9]:
				a.box(m_conc, Vector3(x, MetroConst.RAIL_TOP + 0.1, 0), Vector3(0.25, 1.4, CL), Vector2(4, 4))
			a.box(m_conc, Vector3(OPP_X * 0.5, -6.6, 0), Vector3(2.4, 8.0, 2.4), Vector2(4, 4))
			a.box(m_conc, Vector3(OPP_X * 0.5, -2.9, 0), Vector3(OPP_X + 4.0, 1.0, 2.6), Vector2(4, 4))
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
				for z in [-CL * 0.5 + 0.2, -CL * 0.25, 0.0, CL * 0.25]:
					a.box(m_steel, Vector3(x, MetroConst.RAIL_TOP + 3.1, z), Vector3(0.3, 6.0, 0.3))
			for z in [-CL * 0.5 + 0.2, -CL * 0.25, 0.0, CL * 0.25]:
				a.box(m_steel, Vector3(OPP_X * 0.5, MetroConst.RAIL_TOP + 6.1, z), Vector3(OPP_X + 5.4, 0.25, 0.25))
			# 교각
			a.box(m_conc, Vector3(OPP_X * 0.5, -8.0, 0), Vector3(4.0, 13.0, 3.0), Vector2(4, 4))
	return a.commit()


## 대각 부재는 별도 메시로 (회전)
func _diag_mesh() -> ArrayMesh:
	var a := Accum.new()
	a.box(m_steel, Vector3.ZERO, Vector3(0.25, 0.25, 1.0))
	return a.commit()


func _ready() -> void:
	_init_materials()
	var variants := {}
	for t in ["U", "G", "N", "E", "B"]:
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
		# 철교 대각재 (12.5m 패널마다 X 자)
		var dg := Node3D.new()
		vs["B"].add_child(dg)
		var panel := CL * 0.25
		for x in [-2.7, OPP_X + 2.7]:
			for k in range(4):
				var d := MeshInstance3D.new()
				d.mesh = diag
				var zc := -CL * 0.5 + 0.2 + (k + 0.5) * panel
				d.position = Vector3(x, MetroConst.RAIL_TOP + 3.1, zc)
				var ang := atan2(5.8, panel)
				d.rotation.x = ang if k % 2 == 0 else -ang
				d.scale = Vector3(1, 1, sqrt(5.8 * 5.8 + panel * panel))
				dg.add_child(d)
		chunks.append({"node": holder, "v": vs, "j": j})

	# 지면 두 장 (철교 구간에서는 한강을 보이게 나눔) — 텍스처를 주행거리만큼 흘려 속도감을 준다
	ground_a = _ground_plane()
	ground_b = _ground_plane()
	ground_b.material_override = ground_a.material_override
	road = MeshInstance3D.new()
	var rm := PlaneMesh.new()
	rm.size = Vector2(14.0, 1400.0)
	road.mesh = rm
	var rmat := _mat("road.png", 0.9)
	rmat.uv1_scale = Vector3(1, 1400.0 / 14.0, 1)
	road.material_override = rmat
	add_child(road)
	water = MeshInstance3D.new()
	var wm := PlaneMesh.new()
	wm.size = Vector2(1600, 1800)
	water.mesh = wm
	var wmat := _mat("water.png", 0.12, Color(0.85, 0.92, 0.95))
	wmat.metallic = 0.25
	wmat.uv1_scale = Vector3(40, 45, 1)
	water.material_override = wmat
	water.position.y = -14.0
	water.visible = false
	add_child(water)

	# 터널 입구 3개
	for k in range(3):
		portals.append(_build_portal())

	_build_buildings()
	_build_trees()
	_build_lamps()


func _ground_plane() -> MeshInstance3D:
	var g := MeshInstance3D.new()
	var pm := PlaneMesh.new()
	pm.size = Vector2(2400, 2000)
	g.mesh = pm
	var m := _mat("grass.png", 1.0, Color(0.92, 0.95, 0.88))
	m.uv1_scale = Vector3(2400.0 / 9.0, 2000.0 / 9.0, 1)
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
	var a := Accum.new()
	# 정면 벽 (개구부 주변) + 위 난간
	a.box(conc, Vector3(cx - w * 0.5 - 10.0, by + 4.0, 0), Vector3(20.0, 14.0, 1.0), Vector2(4, 4))
	a.box(conc, Vector3(cx + w * 0.5 + 10.0, by + 4.0, 0), Vector3(20.0, 14.0, 1.0), Vector2(4, 4))
	a.box(conc, Vector3(cx, top + 4.0, 0), Vector3(w, 8.0, 1.0), Vector2(4, 4))
	a.box(Mats.color(Color(0.5, 0.5, 0.5)), Vector3(cx, top + 8.2, 0), Vector3(w + 40.0, 0.6, 1.2))
	a.box(m_grass, Vector3(cx, top + 6.0, 12.0), Vector3(w + 40.0, 4.0, 22.0), Vector2(8, 8))
	var mi := MeshInstance3D.new()
	mi.mesh = a.commit()
	n.add_child(mi)
	# 옆 옹벽 (바깥쪽으로 40m) — 방향에 따라 뒤집는다
	var wing := Node3D.new()
	wing.name = "Wing"
	n.add_child(wing)
	var wa := Accum.new()
	for x in [cx - w * 0.5 - 0.3, cx + w * 0.5 + 0.3]:
		wa.box(conc, Vector3(x, by + 2.5, -20.5), Vector3(0.6, 6.0, 40.0), Vector2(4, 4))
	var wmi := MeshInstance3D.new()
	wmi.mesh = wa.commit()
	wing.add_child(wmi)
	n.visible = false
	add_child(n)
	return n


# ------------------------------------------------------------------ 건물
## [이름, 폭(z), 깊이(x), 높이, 정면 텍스처, 정면 타일(m), 측면 텍스처, 측면 타일]
const PROTOS := [
	["apt_a", 60.0, 13.0, 42.0, "apt_facade.png", Vector2(5.6, 2.8), "apt_gable_101.png", Vector2(0, 0)],
	["apt_b", 45.0, 13.0, 64.0, "apt_facade.png", Vector2(5.6, 2.8), "apt_gable_103.png", Vector2(0, 0)],
	["apt_c", 36.0, 13.0, 33.0, "apt_facade.png", Vector2(5.6, 2.8), "apt_gable_102.png", Vector2(0, 0)],
	["office", 26.0, 26.0, 78.0, "office_facade.png", Vector2(3.0, 3.6), "office_facade.png", Vector2(3.0, 3.6)],
	["shop", 16.0, 12.0, 14.0, "shop_facade.png", Vector2(0, 0), "villa_facade.png", Vector2(0, 0)],
	["villa", 14.0, 12.0, 12.0, "villa_facade.png", Vector2(0, 0), "villa_facade.png", Vector2(0, 0)],
]


func _building_mesh(p: Array) -> ArrayMesh:
	var a := Accum.new()
	var w: float = p[1]
	var d: float = p[2]
	var h: float = p[3]
	var front := _mat(p[4], 0.85)
	var side := front if p[6] == p[4] else _mat(p[6], 0.85)
	var roof := _mat("roof.png", 1.0)
	for m in [front, side]:
		if not (m in _bld_mats):
			_bld_mats.append(m)
	var x0 := -d * 0.5
	var x1 := d * 0.5
	var z0 := -w * 0.5
	var z1 := w * 0.5
	# 긴 면(±x)이 정면, 짧은 면(±z)이 측벽
	a.face(front, Vector3(x1, 0, z1), Vector3.FORWARD, Vector3.UP, w, h, p[5])
	a.face(front, Vector3(x0, 0, z0), Vector3.BACK, Vector3.UP, w, h, p[5])
	a.face(side, Vector3(x0, 0, z1), Vector3.RIGHT, Vector3.UP, d, h, p[7])
	a.face(side, Vector3(x1, 0, z0), Vector3.LEFT, Vector3.UP, d, h, p[7])
	a.face(roof, Vector3(x0, h, z1), Vector3.RIGHT, Vector3.FORWARD, d, w, Vector2(d, w))
	# 옥상 기계실
	if h > 25.0:
		a.box(Mats.color(Color(0.82, 0.82, 0.80), 0.9), Vector3(0, h + 2.0, 0), Vector3(d * 0.4, 4.0, minf(w * 0.3, 12.0)))
	return a.commit()


func _build_buildings() -> void:
	for p in PROTOS:
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.mesh = _building_mesh(p)
		mm.instance_count = 48
		mm.visible_instance_count = 0
		var mmi := MultiMeshInstance3D.new()
		mmi.multimesh = mm
		add_child(mmi)
		bld.append({"mm": mm, "mmi": mmi, "proto": p})


func _build_trees() -> void:
	for k in range(2):
		var a := Accum.new()
		var m := _mat("tree_%d.png" % k, 1.0)
		m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA_SCISSOR
		m.alpha_scissor_threshold = 0.5
		m.cull_mode = BaseMaterial3D.CULL_DISABLED
		if not (m in _bld_mats):
			_bld_mats.append(m)
		# 십자 모양 두 장 (법선은 위로 → 고르게 밝게)
		var tw := 6.0
		var th := 12.0
		a.face(m, Vector3(-tw * 0.5, 0, 0), Vector3.RIGHT, Vector3.UP, tw, th, Vector2(0, 0), Vector3.UP)
		a.face(m, Vector3(0, 0, tw * 0.5), Vector3.FORWARD, Vector3.UP, tw, th, Vector2(0, 0), Vector3.UP)
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.mesh = a.commit()
		mm.instance_count = 220
		mm.visible_instance_count = 0
		var mmi := MultiMeshInstance3D.new()
		mmi.multimesh = mm
		add_child(mmi)
		trees.append({"mm": mm, "mmi": mmi})


func _build_lamps() -> void:
	var a := Accum.new()
	var pole := Mats.color(Color(0.35, 0.37, 0.40), 0.5, 0.6)
	a.box(pole, Vector3(0, 4.5, 0), Vector3(0.18, 9.0, 0.18))
	a.box(pole, Vector3(1.0, 8.9, 0), Vector3(2.0, 0.12, 0.12))
	a.box(Mats.emissive(Color(1.0, 0.95, 0.85), 1.2), Vector3(1.9, 8.8, 0), Vector3(0.6, 0.12, 0.3))
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = a.commit()
	mm.instance_count = 60
	mm.visible_instance_count = 0
	lamps = MultiMeshInstance3D.new()
	lamps.multimesh = mm
	add_child(lamps)


static func _hash(i: int, salt: int) -> float:
	var h := (i * 73856093) ^ (salt * 19349663)
	h = (h ^ (h >> 13)) * 1274126177
	h = h ^ (h >> 16)
	return float(h & 0xFFFF) / 65535.0


## 낮 정도(0 밤 ~ 1 낮)에 맞춰 건물/나무 밝기 조절
func set_daylight(day: float) -> void:
	_day = day
	var k := lerpf(0.35, 1.0, day)
	for m in _bld_mats:
		(m as StandardMaterial3D).albedo_color = Color(k, k, k)


## 매 프레임: odo = 누적 주행거리(m)
func update_world(odo: float, outdoor_here: bool) -> void:
	var shift := fposmod(odo, CL)
	var base := MetroConst.train_center_z
	var k0 := int(floor(odo / CL))
	for c in chunks:
		var z: float = base + c["j"] * CL + shift
		var node: Node3D = c["node"]
		node.position.z = z
		var t: String = env_fn.call(z)
		if t == "G":
			# 같은 조각(주행거리 기준 번호)에는 항상 같은 모양: 방음벽 구간을 묶어서
			var kk: int = k0 - c["j"]
			if _hash(int(floor(kk / 6.0)), 77) < 0.45:
				t = "N"
		for k in c["v"]:
			c["v"][k].visible = (k == t)

	# 지면 높이: 기차 주변 환경에 따라
	var t_here: String = raw_fn.call(base)
	var target := MetroConst.RAIL_TOP - 2.0
	if t_here == "E" or t_here == "B":
		target = -10.2
	ground_y = target
	var bridges: Array = bridge_fn.call()
	var show_ground := outdoor_here
	ground_a.visible = show_ground
	ground_b.visible = show_ground
	water.visible = false
	(ground_a.material_override as StandardMaterial3D).uv1_offset = Vector3(0, -odo / 9.0, 0)
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
	# 선로 옆 도로 (철교 위에서는 숨김)
	road.visible = show_ground and t_here != "B" and t_here != "U"
	road.position = Vector3(-30.0, ground_y + 0.03, base)
	(road.material_override as StandardMaterial3D).uv1_offset = Vector3(0, -odo / 14.0, 0)

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

	_update_city(odo)


## 동네 성격 (주행거리 400m 단위): 0 아파트 단지, 1 도심(빌딩·상가), 2 저층 주택가, 3 녹지
func _district(u: float, side: int) -> int:
	var h := _hash(int(floor(u / 400.0)), 500 + side)
	if h < 0.42:
		return 0
	if h < 0.62:
		return 1
	if h < 0.86:
		return 2
	return 3


func _update_city(odo: float) -> void:
	var base := MetroConst.train_center_z
	var counts: Array = []
	for b in bld:
		counts.append(0)
	var tcounts := [0, 0]
	var lcount := 0
	var c0 := int(floor((odo - 380.0) / CELL))
	var c1 := int(floor((odo + 700.0) / CELL))
	var lamp_mm: MultiMesh = lamps.multimesh
	for cell in range(c0, c1 + 1):
		var u := cell * CELL
		var z := base - (u - odo)
		var t: String = raw_fn.call(z)
		if t == "U" or t == "B":
			continue
		for side in [-1, 1]:
			var dist_kind := _district(u, side)
			var edge: float = (-9.0 if side < 0 else OPP_X + 9.0)
			# 가로수 (선로 가까이)
			for k in range(2):
				if _hash(cell * 2 + k, 600 + side) < (0.75 if dist_kind == 3 else 0.45):
					var ti := int(_hash(cell * 2 + k, 610 + side) * 2.0) % 2
					if tcounts[ti] < trees[ti]["mm"].instance_count:
						var tx: float = edge + side * (3.0 + _hash(cell * 2 + k, 620) * 10.0)
						var tz: float = z - k * CELL * 0.5 - _hash(cell, 630 + k) * 8.0
						var s := 0.8 + _hash(cell * 2 + k, 640) * 0.6
						var trf := Transform3D(Basis(Vector3.UP, _hash(cell, 650 + k) * TAU).scaled(Vector3(s, s, s)), Vector3(tx, ground_y, tz))
						trees[ti]["mm"].set_instance_transform(tcounts[ti], trf)
						tcounts[ti] += 1
			# 건물 줄: 0 = 도로변(가까움), 1 = 중간, 2 = 먼 줄
			for row in range(3):
				var r := _hash(cell, side * 10 + row)
				var pi_ := -1
				match dist_kind:
					0:
						if row == 0:
							pi_ = 4 if r < 0.35 else -1
						elif r < 0.75 and cell % 2 == 0:
							pi_ = int(_hash(cell, 700 + row) * 3.0) % 3
					1:
						if row == 0:
							pi_ = 4 if r < 0.8 else -1
						elif r < 0.7:
							pi_ = 3 if _hash(cell, 710 + row) < 0.6 else 1
					2:
						if r < (0.85 if row < 2 else 0.4):
							pi_ = 5 if _hash(cell, 720 + row) < 0.65 else 4
					3:
						if row == 2 and r < 0.4:
							pi_ = int(_hash(cell, 730) * 3.0) % 3
				if pi_ < 0:
					continue
				var b: Dictionary = bld[pi_]
				if counts[pi_] >= b["mm"].instance_count:
					continue
				var p: Array = b["proto"]
				var dist: float = [26.0, 62.0, 120.0][row] + p[2] * 0.5 + _hash(cell, 99 + side * 3 + row) * 14.0
				if side < 0 and row == 0:
					dist += 14.0      # 왼쪽은 도로 건너편
				var x: float = (edge if side < 0 else OPP_X) + side * dist
				var yaw := 0.0
				if pi_ <= 2 and _hash(cell, 5 + side + row) < 0.3:
					yaw = PI / 2      # 측벽(동 번호)이 선로를 보는 배치
				var tr := Transform3D(Basis(Vector3.UP, yaw), Vector3(x, ground_y, z))
				b["mm"].set_instance_transform(counts[pi_], tr)
				counts[pi_] += 1
		# 가로등 (도로변, 30m 간격 근사)
		if lcount < lamp_mm.instance_count:
			lamp_mm.set_instance_transform(lcount, Transform3D(Basis(Vector3.UP, PI), Vector3(-21.5, ground_y, z)))
			lcount += 1
	for i in range(bld.size()):
		bld[i]["mm"].visible_instance_count = counts[i]
		bld[i]["mmi"].visible = counts[i] > 0
	for i in range(trees.size()):
		trees[i]["mm"].visible_instance_count = tcounts[i]
		trees[i]["mmi"].visible = tcounts[i] > 0
	lamp_mm.visible_instance_count = lcount
	lamps.visible = lcount > 0
