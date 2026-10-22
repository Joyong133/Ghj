class_name Mats
## 공용 재질과 코드로 그린 텍스처 (타일, 콘크리트, 침목, 건물 창문 등)

static var _cache := {}
static var font_regular: FontFile
static var font_bold: FontFile


static func fonts() -> void:
	if font_regular == null:
		font_regular = load("res://assets/fonts/NanumBarunGothic.ttf")
		font_bold = load("res://assets/fonts/NanumBarunGothicBold.ttf")


static func color(c: Color, rough := 0.7, metal := 0.0) -> StandardMaterial3D:
	var key := "c%s_%.2f_%.2f" % [c.to_html(), rough, metal]
	if _cache.has(key):
		return _cache[key]
	var m := StandardMaterial3D.new()
	m.albedo_color = c
	m.roughness = rough
	m.metallic = metal
	_cache[key] = m
	return m


static func emissive(c: Color, energy := 1.5) -> StandardMaterial3D:
	var key := "e%s_%.2f" % [c.to_html(), energy]
	if _cache.has(key):
		return _cache[key]
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.albedo_color = c * energy
	_cache[key] = m
	return m


static func unshaded(c: Color) -> StandardMaterial3D:
	return emissive(c, 1.0)


static func glass(c := Color(0.4, 0.5, 0.55, 0.25)) -> StandardMaterial3D:
	var key := "g%s" % c.to_html()
	if _cache.has(key):
		return _cache[key]
	var m := StandardMaterial3D.new()
	m.albedo_color = c
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.roughness = 0.05
	m.cull_mode = BaseMaterial3D.CULL_DISABLED
	_cache[key] = m
	return m


static func textured(name: String, tex: Texture2D, uv_scale: Vector3, tint := Color.WHITE, rough := 0.8) -> StandardMaterial3D:
	var key := "t%s_%s_%s" % [name, str(uv_scale), tint.to_html()]
	if _cache.has(key):
		return _cache[key]
	var m := StandardMaterial3D.new()
	m.albedo_texture = tex
	m.albedo_color = tint
	m.uv1_scale = uv_scale
	m.roughness = rough
	m.uv1_triplanar = true
	m.uv1_world_triplanar = false
	m.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
	_cache[key] = m
	return m


# ------------------------------------------------------------------ 텍스처
static func _tex(key: String, img: Image) -> ImageTexture:
	img.generate_mipmaps()
	var t := ImageTexture.create_from_image(img)
	_cache[key] = t
	return t


## 벽/바닥 타일: 줄눈이 있는 사각 타일
static func tile_texture(base: Color, grout: Color, n := 4) -> ImageTexture:
	var key := "tex_tile_%s_%s_%d" % [base.to_html(), grout.to_html(), n]
	if _cache.has(key):
		return _cache[key]
	var s := 128
	var img := Image.create(s, s, false, Image.FORMAT_RGB8)
	var cell := s / n
	var rng := RandomNumberGenerator.new()
	rng.seed = 7
	for y in range(s):
		for x in range(s):
			var c := base
			if x % cell < 2 or y % cell < 2:
				c = grout
			else:
				var k := rng.randf_range(-0.025, 0.025)
				c = Color(c.r + k, c.g + k, c.b + k)
			img.set_pixel(x, y, c)
	return _tex(key, img)


static func noise_texture(base: Color, amount := 0.08, seed := 3) -> ImageTexture:
	var key := "tex_noise_%s_%.2f_%d" % [base.to_html(), amount, seed]
	if _cache.has(key):
		return _cache[key]
	var s := 128
	var img := Image.create(s, s, false, Image.FORMAT_RGB8)
	var rng := RandomNumberGenerator.new()
	rng.seed = seed
	for y in range(s):
		for x in range(s):
			var k := rng.randf_range(-amount, amount)
			img.set_pixel(x, y, Color(base.r + k, base.g + k, base.b + k))
	return _tex(key, img)


## 자갈 도상 위 침목 (V 방향 1주기 = 침목 1개)
static func sleeper_texture() -> ImageTexture:
	var key := "tex_sleeper"
	if _cache.has(key):
		return _cache[key]
	var w := 64
	var h := 64
	var img := Image.create(w, h, false, Image.FORMAT_RGB8)
	var rng := RandomNumberGenerator.new()
	rng.seed = 11
	for y in range(h):
		for x in range(w):
			var k := rng.randf_range(-0.12, 0.12)
			var c := Color(0.42 + k, 0.40 + k, 0.37 + k)       # 자갈
			if y > 20 and y < 44 and x > 4 and x < 60:
				var j := rng.randf_range(-0.03, 0.03)
				c = Color(0.62 + j, 0.61 + j, 0.58 + j)        # 콘크리트 침목
			img.set_pixel(x, y, c)
	return _tex(key, img)


## 건물 외벽 (창문 격자)
static func window_texture(night := false) -> ImageTexture:
	var key := "tex_window_%s" % str(night)
	if _cache.has(key):
		return _cache[key]
	var s := 64
	var img := Image.create(s, s, false, Image.FORMAT_RGB8)
	var rng := RandomNumberGenerator.new()
	rng.seed = 5
	for y in range(s):
		for x in range(s):
			var c := Color(0.85, 0.85, 0.85)
			var wx := x % 16
			var wy := y % 16
			if wx > 3 and wx < 13 and wy > 4 and wy < 13:
				c = Color(0.25, 0.32, 0.40)
				if night and rng.randf() < 0.5:
					c = Color(1.0, 0.85, 0.5)
			img.set_pixel(x, y, c)
	return _tex(key, img)


## 터널 벽: 세로 이음매와 케이블
static func tunnel_texture() -> ImageTexture:
	var key := "tex_tunnel"
	if _cache.has(key):
		return _cache[key]
	var s := 128
	var img := Image.create(s, s, false, Image.FORMAT_RGB8)
	var rng := RandomNumberGenerator.new()
	rng.seed = 21
	for y in range(s):
		for x in range(s):
			var k := rng.randf_range(-0.04, 0.04)
			var c := Color(0.30 + k, 0.30 + k, 0.29 + k)
			if x < 2:
				c = Color(0.18, 0.18, 0.18)
			if (y > 60 and y < 64) or (y > 70 and y < 73):
				c = Color(0.10, 0.10, 0.10)
			img.set_pixel(x, y, c)
	return _tex(key, img)


# ------------------------------------------------------------------ 메시 헬퍼
static func box(parent: Node3D, size: Vector3, pos: Vector3, mat: Material, name := "") -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = size
	mi.mesh = bm
	mi.material_override = mat
	mi.position = pos
	if name != "":
		mi.name = name
	parent.add_child(mi)
	return mi


static func label(parent: Node3D, text: String, pos: Vector3, size_px := 64, px := 0.004,
		col := Color.BLACK, bold := true, rot_y := 0.0) -> Label3D:
	fonts()
	var l := Label3D.new()
	l.font = font_bold if bold else font_regular
	l.text = text
	l.font_size = size_px
	l.pixel_size = px
	l.modulate = col
	l.outline_size = 0
	l.double_sided = false
	l.shaded = false
	l.position = pos
	l.rotation.y = rot_y
	l.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	# 멀리 있는 글자는 그리지 않는다 (Quest 드로우콜 절약)
	l.visibility_range_end = clampf(size_px * px * 220.0, 25.0, 140.0)
	parent.add_child(l)
	return l


## 노선 표시 원 (색 원 + 노선 번호)
static func line_badge(parent: Node3D, line_key: String, pos: Vector3, radius: float, rot_y := 0.0) -> Node3D:
	var n := Node3D.new()
	n.position = pos
	n.rotation.y = rot_y
	parent.add_child(n)
	var mi := MeshInstance3D.new()
	var cm := CylinderMesh.new()
	cm.top_radius = radius
	cm.bottom_radius = radius
	cm.height = 0.01
	cm.radial_segments = 24
	mi.mesh = cm
	mi.rotation.x = PI / 2
	var col: Color = MetroConst.TRANSFER_COLORS.get(line_key, Color.GRAY)
	mi.material_override = unshaded(col)
	n.add_child(mi)
	var txt := line_key
	if not line_key.is_valid_int():
		txt = line_key.substr(0, 2)
	var fs := 64 if line_key.is_valid_int() else 40
	label(n, txt, Vector3(0, 0, 0.008), fs, radius * 1.1 / 64.0 * (1.0 if txt.length() == 1 else 0.8), Color.WHITE)
	return n


# ------------------------------------------------------------------ 메시 병합 (드로우콜 줄이기)
static func _rel_transform(n: Node3D, root: Node3D) -> Transform3D:
	var t := n.transform
	var p := n.get_parent()
	while p != null and p != root:
		if p is Node3D:
			t = (p as Node3D).transform * t
		p = p.get_parent()
	return t


static func _surface_mat(mi: MeshInstance3D, i: int) -> Material:
	var m := mi.get_surface_override_material(i)
	if m == null:
		m = mi.material_override
	if m == null:
		m = mi.mesh.surface_get_material(i)
	return m


## nodes 의 메시를 root 기준 좌표로 하나의 MeshInstance3D 로 합치고 원본은 지운다.
static func merge_nodes(nodes: Array, root: Node3D, name: String) -> MeshInstance3D:
	var groups := {}
	var order: Array = []
	for n in nodes:
		var mi := n as MeshInstance3D
		if mi == null or mi.mesh == null:
			continue
		var t := _rel_transform(mi, root)
		for i in range(mi.mesh.get_surface_count()):
			var mat := _surface_mat(mi, i)
			var fmt := -1
			if mi.mesh is ArrayMesh:
				fmt = (mi.mesh as ArrayMesh).surface_get_format(i) & (Mesh.ARRAY_FORMAT_TEX_UV | Mesh.ARRAY_FORMAT_NORMAL | Mesh.ARRAY_FORMAT_TANGENT | Mesh.ARRAY_FORMAT_COLOR)
			var st: SurfaceTool
			var found := -1
			for k in range(order.size()):
				if order[k][0] == mat and order[k][1] == fmt:
					found = k
					break
			if found < 0:
				st = SurfaceTool.new()
				order.append([mat, fmt, st])
			else:
				st = order[found][2]
			st.append_from(mi.mesh, i, t)
	var am := ArrayMesh.new()
	for g in order:
		var st2: SurfaceTool = g[2]
		st2.commit(am)
		am.surface_set_material(am.get_surface_count() - 1, g[0])
	var out := MeshInstance3D.new()
	out.name = name
	out.mesh = am
	root.add_child(out)
	for n in nodes:
		var mi2 := n as MeshInstance3D
		if mi2 == null:
			continue
		if mi2.get_child_count() == 0:
			mi2.get_parent().remove_child(mi2)
			mi2.free()
		else:
			mi2.mesh = null
	return out


## root 아래의 모든 정적 메시(exclude 제외)를 하나로 합친다.
static func merge_static(root: Node3D, exclude: Array, name := "Merged") -> MeshInstance3D:
	var nodes: Array = []
	for n in root.find_children("*", "MeshInstance3D", true, false):
		if n in exclude:
			continue
		if (n as MeshInstance3D).mesh == null:
			continue
		nodes.append(n)
	if nodes.is_empty():
		return null
	return merge_nodes(nodes, root, name)
