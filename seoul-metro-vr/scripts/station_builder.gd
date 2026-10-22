class_name StationBuilder
## 역 하나를 코드로 조립한다. Blender에서 만든 소품(스크린도어, 벤치, 지붕, 계단)을 사용.
##
## 로컬 좌표: 우리 열차의 선로 중심 x=0, 승강장 중앙 z=0, 승강장 윗면 y=0.
## 열차 진행 방향은 -Z. p = +1 이면 승강장이 오른쪽(+X), -1 이면 왼쪽.

## 승강장 길이는 노선 편성에 따라 다르다 (build 에서 MetroConst 값으로 설정)
static var PL := 210.0
static var HALF := 105.0
const EDGE := MetroConst.PLATFORM_EDGE_X

static var _props: Node3D


static func _prop(name: String) -> MeshInstance3D:
	if _props == null:
		_props = (load("res://assets/models/station_props.glb") as PackedScene).instantiate()
	var n := _props.find_child(name, true, false) as MeshInstance3D
	var d := n.duplicate() as MeshInstance3D
	d.transform = Transform3D.IDENTITY
	return d


static func apply_line_color(root: Node, col: Color) -> void:
	var lm := Mats.color(col, 0.4)
	for mi in root.find_children("*", "MeshInstance3D", true, false):
		var m := mi as MeshInstance3D
		if m.mesh == null:
			continue
		for i in range(m.mesh.get_surface_count()):
			var sm := m.mesh.surface_get_material(i)
			if sm != null and sm.resource_name == "LineColor":
				m.set_surface_override_material(i, lm)
	if root is MeshInstance3D:
		var m2 := root as MeshInstance3D
		for i in range(m2.mesh.get_surface_count()):
			var sm2 := m2.mesh.surface_get_material(i)
			if sm2 != null and sm2.resource_name == "LineColor":
				m2.set_surface_override_material(i, lm)


## route: MetroData 노선, idx: 역 인덱스, dir: 진행 방향(+1/-1)
static func build(route: Dictionary, idx: int, dir: int) -> Node3D:
	var st: Dictionary = route["stations"][idx]
	var line: int = route["line"]
	var lc: Color = MetroConst.LINE_COLORS[line]
	var n: int = route["stations"].size()
	var prev_i := idx - dir
	var next_i := idx + dir
	if route["loop"]:
		prev_i = posmod(prev_i, n)
		next_i = posmod(next_i, n)
	var prev_name: String = route["stations"][prev_i]["ko"] if prev_i >= 0 and prev_i < n else ""
	var next_name: String = route["stations"][next_i]["ko"] if next_i >= 0 and next_i < n else ""

	PL = MetroConst.platform_len
	HALF = PL * 0.5
	var root := Node3D.new()
	root.name = "Station_" + st["ko"]
	var p := 1 if st["kind"] == "I" else -1
	var type: String = st["type"]
	var has_psd := line == 2 or type == "U"
	var ctx := {
		"root": root, "st": st, "p": p, "lc": lc, "line": line, "type": type,
		"prev": prev_name, "next": next_name, "psd": has_psd,
		"leaves": [], "boards": [],
	}
	if type == "U":
		_build_underground(ctx)
	else:
		_build_open(ctx)
	root.set_meta("boards", ctx["boards"])
	root.set_meta("side", p)
	root.set_meta("W", ctx.get("W", 5.0))
	# 움직이는 스크린도어 문짝은 (열리는 방향별로) 두 덩어리로, 나머지는 하나로 합친다
	var groups := {-1: [], 1: []}
	for l in ctx["leaves"]:
		groups[l["sign"]].append(l["node"])
	var merged_leaves: Array = []
	for sgn in groups:
		if groups[sgn].is_empty():
			continue
		var mi := Mats.merge_nodes(groups[sgn], root, "PSDLeaves%d" % sgn)
		merged_leaves.append({"node": mi, "base": 0.0, "sign": sgn, "travel": 1.0})
	root.set_meta("leaves", merged_leaves)
	var keep: Array = []
	for l in merged_leaves:
		keep.append(l["node"])
	Mats.merge_static(root, keep, "StationStatic")
	return root


# ------------------------------------------------------------------ 공통
static func _track(root: Node3D, x: float, z0: float, z1: float, ballast: bool) -> void:
	var length := z1 - z0
	var zc := (z0 + z1) * 0.5
	var bed_mat: Material
	if ballast:
		bed_mat = Mats.textured("sleeper", Mats.sleeper_texture(), Vector3(1, 1, 1))
		var bed := MeshInstance3D.new()
		var pm := PlaneMesh.new()
		pm.size = Vector2(2.8, length)
		bed.mesh = pm
		var m := StandardMaterial3D.new()
		m.albedo_texture = Mats.sleeper_texture()
		m.uv1_scale = Vector3(1, length / 0.6, 1)
		m.roughness = 0.95
		bed.material_override = m
		bed.position = Vector3(x, MetroConst.RAIL_TOP - 0.17, zc)
		root.add_child(bed)
		Mats.box(root, Vector3(4.0, 0.3, length), Vector3(x, MetroConst.RAIL_TOP - 0.33, zc),
			Mats.color(Color(0.36, 0.35, 0.33), 1.0))
	else:
		Mats.box(root, Vector3(3.2, 0.3, length), Vector3(x, MetroConst.RAIL_TOP - 0.32, zc),
			Mats.textured("slab", Mats.noise_texture(Color(0.45, 0.45, 0.44)), Vector3(1, 1, 1), Color.WHITE, 1.0))
	var rail := Mats.color(Color(0.55, 0.55, 0.57), 0.3, 0.9)
	for s in [-1, 1]:
		Mats.box(root, Vector3(0.07, 0.15, length), Vector3(x + s * MetroConst.GAUGE * 0.5, MetroConst.RAIL_TOP - 0.075, zc), rail)


static func _rot_for_side(dir_x: int) -> float:
	# Label3D 는 +Z 를 바라본다. +X 를 보게 하려면 +90도.
	return PI / 2 if dir_x > 0 else -PI / 2


## 역명판 (흰 바탕, 하단 노선색 띠에 이전/다음역)
static func _name_board(ctx: Dictionary, parent: Node3D, pos: Vector3, face_x: int, w := 3.2, h := 0.86) -> void:
	var st: Dictionary = ctx["st"]
	var lc: Color = ctx["lc"]
	var b := Node3D.new()
	b.position = pos
	b.rotation.y = _rot_for_side(face_x)
	parent.add_child(b)
	Mats.box(b, Vector3(w, h, 0.05), Vector3(0, 0, -0.03), Mats.unshaded(Color(0.97, 0.97, 0.97)))
	Mats.box(b, Vector3(w, 0.22, 0.01), Vector3(0, -h * 0.5 + 0.11, 0.0), Mats.unshaded(lc))
	Mats.box(b, Vector3(w + 0.06, h + 0.06, 0.03), Vector3(0, 0, -0.06), Mats.color(Color(0.3, 0.3, 0.32), 0.5, 0.5))
	var name_len: int = st["ko"].length()
	var fs := 120 if name_len <= 4 else (96 if name_len <= 6 else 64)
	Mats.label(b, st["ko"], Vector3(0.12, 0.13, 0.002), fs, 0.0032, Color(0.08, 0.08, 0.1))
	Mats.label(b, st["en"], Vector3(0.12, -0.12, 0.002), 34, 0.0032, Color(0.25, 0.25, 0.28), false)
	# 역번호 원
	var no: String = st["no"]
	if no != "":
		var nx := -0.95 if name_len <= 4 else -1.25
		var c := MeshInstance3D.new()
		var cm := CylinderMesh.new()
		cm.top_radius = 0.17
		cm.bottom_radius = 0.17
		cm.height = 0.01
		c.mesh = cm
		c.rotation.x = PI / 2
		c.position = Vector3(nx, 0.1, 0.0)
		c.material_override = Mats.unshaded(lc)
		b.add_child(c)
		Mats.label(b, no, Vector3(nx, 0.1, 0.008), 40 if no.length() <= 3 else 26, 0.0032, Color.WHITE)
	# 하단 띠: ◀ 이전역 | 다음역 ▶   (진행방향 -Z 기준으로 화살표 방향 결정)
	var left_name: String
	var right_name: String
	# 판이 +X 를 보면 관찰자 기준 오른쪽이 -Z(진행 방향)
	if face_x > 0:
		left_name = ctx["prev"]
		right_name = ctx["next"]
	else:
		left_name = ctx["next"]
		right_name = ctx["prev"]
	if left_name != "":
		var ll := Mats.label(b, "◀ " + left_name, Vector3(-w * 0.5 + 0.12, -h * 0.5 + 0.11, 0.008), 40, 0.0032, Color.WHITE)
		ll.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	if right_name != "":
		var lr := Mats.label(b, right_name + " ▶", Vector3(w * 0.5 - 0.12, -h * 0.5 + 0.11, 0.008), 40, 0.0032, Color.WHITE)
		lr.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	# 환승 노선
	var tr: Array = st["tr"]
	var bx := w * 0.5 - 0.22
	for k in range(tr.size()):
		Mats.line_badge(b, tr[k], Vector3(bx - k * 0.3, h * 0.5 - 0.2, 0.004), 0.12)


## 천장에 매다는 안내판 (남색 바탕, 양면)
static func _hanging_sign(ctx: Dictionary, parent: Node3D, pos: Vector3, along_x := true) -> void:
	var b := Node3D.new()
	b.position = pos
	if along_x:
		b.rotation.y = 0.0
	parent.add_child(b)
	Mats.box(b, Vector3(2.6, 0.42, 0.08), Vector3.ZERO, Mats.unshaded(Color(0.10, 0.16, 0.32)))
	for c in [-0.9, 0.9]:
		Mats.box(b, Vector3(0.03, 0.8, 0.03), Vector3(c, 0.6, 0), Mats.color(Color(0.4, 0.4, 0.42)))
	var dest: String = ctx["next"]
	for face in [1, -1]:
		var f := Node3D.new()
		f.position = Vector3(0, 0, 0.045 * face)
		f.rotation.y = 0.0 if face > 0 else PI
		b.add_child(f)
		Mats.label(f, "나가는곳 Exit", Vector3(-0.62, 0.0, 0.0), 44, 0.0034, Color(1.0, 0.82, 0.1))
		if dest != "":
			Mats.label(f, dest + " 방면", Vector3(0.62, 0.0, 0.0), 44, 0.0034, Color.WHITE)


## LED 전광판 (도착 안내). main 이 텍스트를 갱신한다.
static func _info_board(ctx: Dictionary, parent: Node3D, pos: Vector3, face_x: int) -> void:
	var b := Node3D.new()
	b.position = pos
	b.rotation.y = _rot_for_side(face_x)
	parent.add_child(b)
	Mats.box(b, Vector3(2.0, 0.5, 0.12), Vector3(0, 0, -0.06), Mats.unshaded(Color(0.03, 0.03, 0.03)))
	Mats.box(b, Vector3(0.04, 0.7, 0.04), Vector3(-0.8, 0.6, -0.06), Mats.color(Color(0.4, 0.4, 0.42)))
	Mats.box(b, Vector3(0.04, 0.7, 0.04), Vector3(0.8, 0.6, -0.06), Mats.color(Color(0.4, 0.4, 0.42)))
	var l := Mats.label(b, "", Vector3(0, 0, 0.002), 40, 0.0032, Color(1.0, 0.55, 0.05), false)
	l.name = "InfoText"
	l.width = 560
	l.autowrap_mode = TextServer.AUTOWRAP_OFF
	ctx["boards"].append(l)


## 스크린도어 한 줄 (10량). x = 선로쪽 끝선, face = 선로 쪽 방향(-p)
static func _psd_row(ctx: Dictionary, x: float, face: int, ours: bool) -> void:
	var root: Node3D = ctx["root"]
	var lc: Color = ctx["lc"]
	var st: Dictionary = ctx["st"]
	for i in range(MetroConst.num_cars):
		var zc := MetroConst.car_center_z(i) - MetroConst.train_center_z
		var fr := _prop("PSDFrame")
		fr.position = Vector3(x, 0, zc)
		apply_line_color(fr, lc)
		root.add_child(fr)
		for d in range(4):
			var dz: float = MetroConst.DOOR_Z[d] + zc
			for sgn in [-1, 1]:
				var leaf := _prop("PSDLeaf")
				leaf.position = Vector3(x - face * 0.02, 1.075, dz + sgn * 0.525)
				root.add_child(leaf)
				if ours:
					ctx["leaves"].append({"node": leaf, "base": leaf.position.z, "sign": sgn, "travel": 1.05})
			if not ours:
				continue
			# 문 번호 (예: 4-2) — 선로 쪽에서 보이게
			var car_no := i + 1
			var door_no := 4 - d
			Mats.label(root, "%d-%d" % [car_no, door_no], Vector3(x + face * 0.15, 2.36, dz), 48, 0.003,
				Color.WHITE, true, _rot_for_side(face))
		# 고정 유리면의 역명 스티커 (객차 가운데 기둥 부분)
		if not ours:
			continue
		for zoff in [0.0, -5.0]:
			Mats.label(root, st["ko"] + "\n" + st["en"], Vector3(x + face * 0.012, 1.45, zc + zoff),
				48, 0.0028, Color(0.1, 0.1, 0.12), true, _rot_for_side(face))
			Mats.box(root, Vector3(0.006, 0.36, 0.95), Vector3(x + face * 0.008, 1.45, zc + zoff),
				Mats.unshaded(Color(0.96, 0.96, 0.96)))


## 노란 안전선 + 점자블록 (스크린도어가 없는 지상역)
static func _edge_safety(root: Node3D, x0: float, inward: int) -> void:
	Mats.box(root, Vector3(0.12, 0.01, PL), Vector3(x0 + inward * 0.06, 0.003, 0), Mats.color(Color(0.95, 0.8, 0.1)))
	Mats.box(root, Vector3(0.3, 0.012, PL), Vector3(x0 + inward * 0.75, 0.004, 0), Mats.textured("tactile",
		Mats.tile_texture(Color(0.95, 0.78, 0.08), Color(0.8, 0.62, 0.05), 6), Vector3(4, 4, 4)))


# ------------------------------------------------------------------ 지하역
static func _build_underground(ctx: Dictionary) -> void:
	var root: Node3D = ctx["root"]
	var p: int = ctx["p"]
	var lc: Color = ctx["lc"]
	var island: bool = p > 0
	var W := 10.0 if island else 5.0
	ctx["W"] = W
	var ceil_y := 4.4
	var floor_mat := Mats.textured("pf_floor", Mats.tile_texture(Color(0.62, 0.62, 0.6), Color(0.5, 0.5, 0.5), 2), Vector3(0.5, 0.5, 0.5))
	var wall_mat := Mats.textured("pf_wall", Mats.tile_texture(Color(0.86, 0.86, 0.83), Color(0.7, 0.7, 0.7), 4), Vector3(0.7, 0.7, 0.7))
	var ceil_mat := Mats.color(Color(0.78, 0.79, 0.8), 0.6, 0.3)
	var light_mat := Mats.emissive(Color(1.0, 0.98, 0.92), 1.4)
	var accent := Mats.color(lc.lerp(Color.WHITE, 0.15), 0.5)

	# 우리 선로
	_track(root, 0.0, -HALF - 20, HALF + 20, false)
	var x_opp: float
	var x_min: float
	var x_max: float
	if island:
		x_opp = p * (EDGE * 2 + W)
		_track(root, x_opp, -HALF - 20, HALF + 20, false)
		Mats.box(root, Vector3(W, 1.4, PL), Vector3(p * (EDGE + W * 0.5), -0.7, 0), floor_mat)
		x_min = -p * 2.2
		x_max = x_opp + p * 2.2
	else:
		x_opp = -p * 3.9
		_track(root, x_opp, -HALF - 20, HALF + 20, false)
		Mats.box(root, Vector3(W, 1.4, PL), Vector3(p * (EDGE + W * 0.5), -0.7, 0), floor_mat)
		Mats.box(root, Vector3(W, 1.4, PL), Vector3(x_opp - p * (EDGE + W * 0.5), -0.7, 0), floor_mat)
		x_min = p * (EDGE + W)
		x_max = x_opp - p * (EDGE + W)
	var xa := minf(x_min, x_max)
	var xb := maxf(x_min, x_max)
	var hall_w := xb - xa
	var hall_cx := (xa + xb) * 0.5
	var floor_y := MetroConst.RAIL_TOP - 0.47

	# 바닥(선로 밑), 벽, 천장
	Mats.box(root, Vector3(hall_w, 0.2, PL + 40), Vector3(hall_cx, floor_y - 0.1, 0), Mats.color(Color(0.25, 0.25, 0.25), 1.0))
	for xw in [xa, xb]:
		var inward := 1 if xw == xa else -1
		Mats.box(root, Vector3(0.3, ceil_y - floor_y + 1.0, PL + 40), Vector3(xw - inward * 0.15, (ceil_y + floor_y) * 0.5, 0), wall_mat)
		# 벽 아래 노선색 띠
		Mats.box(root, Vector3(0.02, 0.25, PL), Vector3(xw + inward * 0.01, 0.5, 0), accent)
	Mats.box(root, Vector3(hall_w, 0.3, PL + 40), Vector3(hall_cx, ceil_y + 0.6, 0), ceil_mat)
	# 천장 마감판과 조명
	Mats.box(root, Vector3(hall_w, 0.04, PL), Vector3(hall_cx, ceil_y, 0), Mats.textured("ceil",
		Mats.tile_texture(Color(0.83, 0.84, 0.85), Color(0.6, 0.6, 0.62), 2), Vector3(0.4, 0.4, 0.4)))
	var lights_x: Array = []
	if island:
		lights_x = [p * (EDGE + 1.5), p * (EDGE + W * 0.5), p * (EDGE + W - 1.5)]
	else:
		lights_x = [p * (EDGE + 1.8), x_opp - p * (EDGE + 1.8), 0.0, x_opp]
	for lx in lights_x:
		Mats.box(root, Vector3(0.25, 0.03, PL - 6), Vector3(lx, ceil_y - 0.03, 0), light_mat)
	# 양 끝 벽 (터널 입구 개구부 포함)
	for e in [-1, 1]:
		var ze: float = e * (HALF + 20)
		var tunnel_w := 4.4
		_end_wall(root, xa, xb, ze, [0.0, x_opp], tunnel_w, floor_y, ceil_y + 0.6, wall_mat)

	# 기둥
	var col_mat := Mats.textured("col", Mats.tile_texture(Color(0.9, 0.9, 0.88), Color(0.75, 0.75, 0.75), 3), Vector3(1.2, 1.2, 1.2))
	var col_x: float = p * (EDGE + W * 0.5) if island else -p * 1.95
	var col_z := -HALF + 8.0
	var ci := 0
	while col_z < HALF - 4.0:
		ci += 1
		if not island or absf(absf(col_z) - 45.0 * HALF / 105.0) > 7.0:
			var cy := (ceil_y + (0.0 if island else floor_y)) * 0.5
			var ch := ceil_y - (0.0 if island else floor_y)
			Mats.box(root, Vector3(0.7, ch, 0.7), Vector3(col_x, cy, col_z), col_mat)
			if island and ci % 2 == 0:
				# 기둥 역명
				for f in [1, -1]:
					Mats.label(root, ctx["st"]["ko"], Vector3(col_x + f * 0.36, 1.9, col_z), 56, 0.003,
						Color(0.1, 0.1, 0.12), true, _rot_for_side(f))
					Mats.box(root, Vector3(0.01, 0.3, 0.6), Vector3(col_x + f * 0.355, 1.9, col_z), Mats.unshaded(Color(0.97, 0.97, 0.97)))
		col_z += 8.0 if island else 6.0

	# 스크린도어
	_psd_row(ctx, p * EDGE, -p, true)
	if island:
		_psd_row(ctx, x_opp - p * EDGE, p, false)
	else:
		_psd_row(ctx, x_opp - p * EDGE, p, false)

	# 역명판: 선로 건너편 벽 / 승강장 뒷벽
	var board_z := -HALF + 15.0
	while board_z < HALF - 10.0:
		if island:
			# 우리 선로 뒤 벽 (열차 창밖으로 보임) 과 반대 선로 뒤 벽
			_name_board(ctx, root, Vector3(xa + 0.02 if p > 0 else xb - 0.02, 1.9, board_z), p)
			_name_board(ctx, root, Vector3(xb - 0.02 if p > 0 else xa + 0.02, 1.9, board_z), -p)
		else:
			_name_board(ctx, root, Vector3(p * (EDGE + W) - p * 0.02, 1.9, board_z), -p)
			_name_board(ctx, root, Vector3(x_opp - p * (EDGE + W) + p * 0.02, 1.9, board_z), p)
			# 선로 사이 기둥 쪽에서 보이는 광고판
		board_z += 30.0
	# 광고판
	var ad_z := -HALF + 30.0
	var ad_cols := [Color(0.85, 0.3, 0.25), Color(0.2, 0.45, 0.8), Color(0.95, 0.7, 0.2), Color(0.3, 0.65, 0.4)]
	var k := 0
	while ad_z < HALF - 20.0:
		var wx: float = xa + 0.03 if island == (p > 0) else xb - 0.03
		if not island:
			wx = p * (EDGE + W) - p * 0.03
		Mats.box(root, Vector3(0.04, 1.2, 2.6), Vector3(wx, 1.6, ad_z + 15.0), Mats.unshaded(ad_cols[k % 4]))
		k += 1
		ad_z += 30.0

	# 매달린 안내판, 전광판
	var sign_x: float = p * (EDGE + W * 0.5)
	var zk := HALF / 105.0
	for z in [-60.0, -20.0, 20.0, 60.0]:
		_hanging_sign(ctx, root, Vector3(sign_x, 3.3, z * zk))
	_info_board(ctx, root, Vector3(p * (EDGE + 0.9) if not island else p * (EDGE + 1.2), 2.9, 5.0), -p)
	_info_board(ctx, root, Vector3(p * (EDGE + 0.9) if not island else p * (EDGE + 1.2), 2.9, -35.0 * zk), -p)

	# 계단 (위층 대합실로)
	var stair_x: float = p * (EDGE + W * 0.5) if island else p * (EDGE + W - 1.4)
	for sz in [-45.0, 45.0]:
		_stair_up(root, Vector3(stair_x, 0, sz * zk), ceil_y, lc)
	# 벤치
	for bz0 in [-75.0, -30.0, 10.0, 30.0, 75.0]:
		var bz: float = bz0 * zk
		var bench := _prop("Bench")
		if island:
			bench.position = Vector3(p * (EDGE + W * 0.5) + p * 1.2, 0, bz)
			bench.rotation.y = PI if p > 0 else 0.0
		else:
			bench.position = Vector3(p * (EDGE + W - 0.35), 0, bz)
			bench.rotation.y = 0.0 if p > 0 else PI
		root.add_child(bench)
	# 소화기함/비상전화 같은 디테일
	for z0 in [-90.0, 0.0, 90.0]:
		var z: float = z0 * zk
		var wx2: float = p * (EDGE + W) - p * 0.1 if not island else p * (EDGE + W * 0.5) + 0.36
		Mats.box(root, Vector3(0.15, 0.6, 0.4), Vector3(wx2, 0.6, z + 3.0), Mats.color(Color(0.8, 0.1, 0.1), 0.5))


static func _end_wall(root: Node3D, xa: float, xb: float, ze: float, holes: Array, hole_w: float, y0: float, y1: float, mat: Material) -> void:
	# x 구간 [xa, xb] 에서 holes 중심 ±hole_w/2 를 뺀 부분을 벽으로 채운다
	var hs: Array = holes.duplicate()
	hs.sort()
	var x := xa
	for h in hs:
		var a: float = h - hole_w * 0.5
		if a > x:
			Mats.box(root, Vector3(a - x, y1 - y0, 0.4), Vector3((a + x) * 0.5, (y0 + y1) * 0.5, ze), mat)
		# 개구부 위
		Mats.box(root, Vector3(hole_w, y1 - 4.2, 0.4), Vector3(h, (y1 + 4.2) * 0.5 + 0.0, ze), mat)
		x = h + hole_w * 0.5
	if xb > x:
		Mats.box(root, Vector3(xb - x, y1 - y0, 0.4), Vector3((xb + x) * 0.5, (y0 + y1) * 0.5, ze), mat)


static func _stair_up(root: Node3D, pos: Vector3, ceil_y: float, lc: Color) -> void:
	var n := Node3D.new()
	n.position = pos
	root.add_child(n)
	var steps := 24
	var rise := (ceil_y + 0.4) / steps
	var run := 0.3
	var step_mat := Mats.color(Color(0.55, 0.55, 0.55), 0.9)
	for k in range(steps):
		Mats.box(n, Vector3(2.4, rise, run), Vector3(0, rise * (k + 0.5), -k * run - 1.0), step_mat)
		Mats.box(n, Vector3(2.4, 0.01, 0.05), Vector3(0, rise * (k + 1) + 0.005, -k * run - 0.88), Mats.color(Color(0.95, 0.8, 0.1)))
	var length := steps * run
	var glass := Mats.glass(Color(0.6, 0.7, 0.75, 0.25))
	for s in [-1, 1]:
		Mats.box(n, Vector3(0.12, 1.1, length + 1.5), Vector3(s * 1.26, 0.55, -length * 0.5 - 0.4), Mats.color(Color(0.75, 0.76, 0.78), 0.3, 0.6))
		Mats.box(n, Vector3(0.02, 0.9, length + 1.5), Vector3(s * 1.26, 1.55, -length * 0.5 - 0.4), glass)
	# 계단 뒤쪽 막힌 벽 (노선색)
	Mats.box(n, Vector3(2.6, ceil_y, 0.15), Vector3(0, ceil_y * 0.5, 0.2), Mats.color(lc.lerp(Color.WHITE, 0.2), 0.6))
	Mats.label(n, "나가는곳  Exit ↑", Vector3(0, 2.2, 0.28), 56, 0.0035, Color.WHITE)
	# 천장 개구부 주변 (위층 바닥 두께 표현)
	Mats.box(n, Vector3(2.8, 0.4, 0.3), Vector3(0, ceil_y + 0.2, -length - 0.8), Mats.color(Color(0.6, 0.6, 0.6)))


# ------------------------------------------------------------------ 지상/고가역
static func _build_open(ctx: Dictionary) -> void:
	var root: Node3D = ctx["root"]
	var p: int = ctx["p"]
	var lc: Color = ctx["lc"]
	var elevated: bool = ctx["type"] == "E"
	var island: bool = p > 0
	var W := 9.0 if island else 4.8
	ctx["W"] = W
	var plat_mat := Mats.textured("op_floor", Mats.tile_texture(Color(0.6, 0.58, 0.55), Color(0.45, 0.44, 0.42), 2), Vector3(0.5, 0.5, 0.5))
	var x_opp: float = p * (EDGE * 2 + W) if island else -p * 3.9
	_track(root, 0.0, -HALF - 15, HALF + 15, true)
	_track(root, x_opp, -HALF - 15, HALF + 15, true)
	var plats: Array = []   # [x0(선로쪽 끝), inward]
	var depth := 1.4
	Mats.box(root, Vector3(W, depth, PL), Vector3(p * (EDGE + W * 0.5), -depth * 0.5, 0), plat_mat)
	plats.append([p * EDGE, p])
	if island:
		plats.append([x_opp - p * EDGE, -p])
	else:
		Mats.box(root, Vector3(W, depth, PL), Vector3(x_opp - p * (EDGE + W * 0.5), -depth * 0.5, 0), plat_mat)
		plats.append([x_opp - p * EDGE, -p])
	# 승강장 옆면 (선로쪽 콘크리트)
	for pl in plats:
		var x0: float = pl[0]
		var inward: int = pl[1]
		if not ctx["psd"]:
			_edge_safety(root, x0, inward)
	if ctx["psd"]:
		_psd_row(ctx, p * EDGE, -p, true)
		_psd_row(ctx, x_opp - p * EDGE, p, false)

	# 지붕
	var roof_xs: Array = []
	if island:
		roof_xs = [p * (EDGE + W * 0.5)]
	else:
		roof_xs = [p * (EDGE + W * 0.5), x_opp - p * (EDGE + W * 0.5)]
	for rx in roof_xs:
		var z := -HALF + 25.0
		while z <= HALF - 25.0:
			var cn := _prop("Canopy")
			cn.position = Vector3(rx, 0, z)
			if not island:
				cn.scale = Vector3(0.75, 1, 1)
			root.add_child(cn)
			z += 10.0

	# 뒤쪽 방호 펜스 (상대식)
	var fence_mat := Mats.color(Color(0.35, 0.4, 0.45), 0.5, 0.6)
	if not island:
		for fx in [p * (EDGE + W), x_opp - p * (EDGE + W)]:
			Mats.box(root, Vector3(0.05, 1.2, PL), Vector3(fx, 0.6, 0), Mats.glass(Color(0.6, 0.7, 0.75, 0.3)))
			Mats.box(root, Vector3(0.08, 0.06, PL), Vector3(fx, 1.2, 0), fence_mat)

	# 역명판 (기둥에 세운 판, 선로 쪽을 향함)
	var bz := -HALF + 20.0
	while bz < HALF - 15.0:
		if island:
			for f in [-1, 1]:
				_name_board(ctx, root, Vector3(p * (EDGE + W * 0.5) + f * 0.4, 2.3, bz), -p if f * p < 0 else p, 2.6, 0.75)
		else:
			_name_board(ctx, root, Vector3(p * (EDGE + W - 0.4), 2.3, bz), -p, 2.6, 0.75)
			_name_board(ctx, root, Vector3(x_opp - p * (EDGE + W - 0.4), 2.3, bz), p, 2.6, 0.75)
		bz += 35.0
	_info_board(ctx, root, Vector3(p * (EDGE + 1.0) if not island else p * (EDGE + 1.4), 2.9, 5.0), -p)
	var zk := HALF / 105.0
	for z in [-50.0, 50.0]:
		_hanging_sign(ctx, root, Vector3(p * (EDGE + W * 0.5), 3.1, z * zk))

	# 벤치
	for bzz in [-60.0, -20.0, 20.0, 60.0]:
		var bench := _prop("Bench")
		bench.position = Vector3(p * (EDGE + W * 0.5) + (p * 1.0 if island else p * 1.3), 0, bzz * zk)
		bench.rotation.y = PI if p > 0 else 0.0
		root.add_child(bench)
	# 계단 (지하도/선상역사로)
	for sz in [-40.0, 40.0]:
		var stair := _prop("Stair")
		stair.position = Vector3(p * (EDGE + W * 0.5) + (0.0 if island else p * 0.6), 0, sz * zk)
		root.add_child(stair)

	# 선상역사 (선로 위를 가로지르는 역 건물)
	var bxa := minf(minf(-3.0, x_opp - 3.0), p * (EDGE + W + 2))
	var bxb := maxf(maxf(3.0, x_opp + 3.0), p * (EDGE + W + 2))
	var bld := Node3D.new()
	bld.position = Vector3(0, 0, 70.0 * zk)
	root.add_child(bld)
	Mats.box(bld, Vector3(bxb - bxa, 4.0, 16.0), Vector3((bxa + bxb) * 0.5, 8.0, 0), Mats.color(Color(0.82, 0.83, 0.84), 0.5))
	Mats.box(bld, Vector3(bxb - bxa + 0.05, 1.6, 16.05), Vector3((bxa + bxb) * 0.5, 8.3, 0), Mats.glass(Color(0.35, 0.5, 0.6, 0.85)))
	Mats.box(bld, Vector3(bxb - bxa + 0.1, 0.25, 16.1), Vector3((bxa + bxb) * 0.5, 6.1, 0), Mats.color(lc, 0.5))
	for cx in [bxa + 0.5, bxb - 0.5]:
		Mats.box(bld, Vector3(0.8, 7.0 + depth, 0.8), Vector3(cx, (6.0 - depth) * 0.5, 0), Mats.color(Color(0.7, 0.7, 0.7), 0.8))
	Mats.label(bld, ctx["st"]["ko"] + "역", Vector3((bxa + bxb) * 0.5, 9.3, -8.06), 128, 0.008, Color(0.1, 0.12, 0.2), true, PI)

	# 고가역 하부 구조
	if elevated:
		var xa := minf(-2.5, x_opp - 2.5)
		xa = minf(xa, p * (EDGE + W) - 0.5)
		xa = minf(xa, x_opp - p * (EDGE + W))
		var xb := maxf(2.5, x_opp + 2.5)
		xb = maxf(xb, p * (EDGE + W) + 0.5)
		xb = maxf(xb, x_opp - p * (EDGE + W))
		var conc := Mats.textured("conc", Mats.noise_texture(Color(0.66, 0.66, 0.64), 0.05), Vector3(0.5, 0.5, 0.5), Color.WHITE, 1.0)
		Mats.box(root, Vector3(xb - xa, 1.2, PL + 30), Vector3((xa + xb) * 0.5, -2.2, 0), conc)
		var z := -HALF
		while z <= HALF:
			Mats.box(root, Vector3(1.6, 8.0, 1.6), Vector3((xa + xb) * 0.5 - 3.0, -6.6, z), conc)
			Mats.box(root, Vector3(1.6, 8.0, 1.6), Vector3((xa + xb) * 0.5 + 3.0, -6.6, z), conc)
			z += 30.0
