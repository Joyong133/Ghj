extends Control
class_name MenuUI
## VR 메뉴 (SubViewport 안에 그려짐). 노선/방향/출발역 선택, 운행 정보, 배속, 설정.

signal start_route(route_idx: int, dir: int, station_idx: int)
signal time_scale(scale: float)
signal skip_to_arrival
signal toggle_sit
signal seated_mode(on: bool)
signal sound(on: bool)
signal close_menu

var routes: Array = []
var sel_route := 0
var sel_dir := 1
var sel_station := 0
var page := 0
const PER_PAGE := 24

var _tab_box: Control
var _pages := {}
var _info_label: RichTextLabel
var _clock_label: Label
var _route_btns: Array = []
var _dir_btns: Array = []
var _st_grid: GridContainer
var _page_label: Label
var _sel_label: Label
var _scale_btns: Array = []
var _sit_btn: Button
var _seat_btn: CheckButton
var _sound_btn: CheckButton
var theme_font: Font
var line_colors := MetroConst.LINE_COLORS


func build(p_routes: Array) -> void:
	routes = p_routes
	Mats.fonts()
	var th := Theme.new()
	th.default_font = Mats.font_bold
	th.default_font_size = 30
	theme = th
	var bg := ColorRect.new()
	bg.color = Color(0.08, 0.1, 0.14, 0.97)
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(bg)

	var root := VBoxContainer.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.offset_left = 24
	root.offset_right = -24
	root.offset_top = 16
	root.offset_bottom = -16
	root.add_theme_constant_override("separation", 10)
	add_child(root)

	var header := HBoxContainer.new()
	root.add_child(header)
	var title := Label.new()
	title.text = "서울 지하철 1·2호선 VR"
	title.add_theme_font_size_override("font_size", 40)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(title)
	_clock_label = Label.new()
	_clock_label.add_theme_font_size_override("font_size", 32)
	_clock_label.add_theme_color_override("font_color", Color(1.0, 0.8, 0.3))
	header.add_child(_clock_label)
	var close := _btn("✕ 닫기", func(): close_menu.emit())
	header.add_child(close)

	var tabs := HBoxContainer.new()
	tabs.add_theme_constant_override("separation", 8)
	root.add_child(tabs)
	for t in [["info", "운행 정보"], ["route", "노선 · 역 선택"], ["settings", "설정"]]:
		var key: String = t[0]
		tabs.add_child(_btn(t[1], func(): show_page(key), 30, Vector2(260, 64)))

	var pages := Control.new()
	pages.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_child(pages)
	_pages["info"] = _build_info()
	_pages["route"] = _build_route()
	_pages["settings"] = _build_settings()
	for k in _pages:
		var pg: Control = _pages[k]
		pg.set_anchors_preset(Control.PRESET_FULL_RECT)
		pages.add_child(pg)
	show_page("route")
	_refresh_route_page()


func _btn(text: String, cb: Callable, fs := 28, min_size := Vector2(0, 60)) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = min_size
	b.add_theme_font_size_override("font_size", fs)
	b.focus_mode = Control.FOCUS_NONE
	b.pressed.connect(cb)
	return b


func show_page(key: String) -> void:
	for k in _pages:
		_pages[k].visible = (k == key)


func _build_info() -> Control:
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 12)
	_info_label = RichTextLabel.new()
	_info_label.bbcode_enabled = true
	_info_label.fit_content = false
	_info_label.custom_minimum_size = Vector2(0, 430)
	_info_label.add_theme_font_override("normal_font", Mats.font_regular)
	_info_label.add_theme_font_override("bold_font", Mats.font_bold)
	_info_label.add_theme_font_size_override("normal_font_size", 30)
	_info_label.add_theme_font_size_override("bold_font_size", 34)
	_info_label.scroll_active = false
	v.add_child(_info_label)
	var sc := HBoxContainer.new()
	sc.add_theme_constant_override("separation", 8)
	var l := Label.new()
	l.text = "시간 배속:"
	sc.add_child(l)
	for s in [1.0, 2.0, 5.0, 10.0, 30.0, 60.0]:
		var val: float = s
		var b := _btn("%dx" % int(s), func(): _set_scale(val), 28, Vector2(110, 60))
		b.toggle_mode = true
		b.set_meta("scale", s)
		_scale_btns.append(b)
		sc.add_child(b)
	v.add_child(sc)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	row.add_child(_btn("다음 역 도착 직전으로 이동 ⏭", func(): skip_to_arrival.emit(), 28, Vector2(520, 64)))
	_sit_btn = _btn("좌석에 앉기", func(): toggle_sit.emit(), 28, Vector2(300, 64))
	row.add_child(_sit_btn)
	v.add_child(row)
	_set_scale_ui(1.0)
	return v


func _set_scale(s: float) -> void:
	_set_scale_ui(s)
	time_scale.emit(s)


func _set_scale_ui(s: float) -> void:
	for b in _scale_btns:
		b.button_pressed = is_equal_approx(b.get_meta("scale"), s)


func set_sit_text(sitting: bool) -> void:
	_sit_btn.text = "일어서기" if sitting else "좌석에 앉기"


func _build_route() -> Control:
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 16)
	var left := VBoxContainer.new()
	left.custom_minimum_size = Vector2(430, 0)
	left.add_theme_constant_override("separation", 6)
	h.add_child(left)
	for i in range(routes.size()):
		var idx := i
		var r: Dictionary = routes[i]
		var b := _btn(r["title"], func(): _pick_route(idx), 22, Vector2(430, 56))
		b.toggle_mode = true
		b.alignment = HORIZONTAL_ALIGNMENT_LEFT
		var sb := StyleBoxFlat.new()
		sb.bg_color = (line_colors[r["line"]] as Color).darkened(0.35)
		sb.set_corner_radius_all(6)
		b.add_theme_stylebox_override("normal", sb)
		var sbp := sb.duplicate() as StyleBoxFlat
		sbp.bg_color = line_colors[r["line"]]
		sbp.border_color = Color.WHITE
		sbp.set_border_width_all(3)
		b.add_theme_stylebox_override("pressed", sbp)
		b.add_theme_stylebox_override("hover_pressed", sbp)
		_route_btns.append(b)
		left.add_child(b)
	var dl := Label.new()
	dl.text = "방향"
	left.add_child(dl)
	for d in [1, -1]:
		var dd: int = d
		var b2 := _btn("", func(): _pick_dir(dd), 24, Vector2(430, 56))
		b2.toggle_mode = true
		_dir_btns.append(b2)
		left.add_child(b2)

	var right := VBoxContainer.new()
	right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	right.add_theme_constant_override("separation", 8)
	h.add_child(right)
	var tl := Label.new()
	tl.text = "출발역 선택 (모든 역으로 바로 이동 가능)"
	tl.add_theme_font_size_override("font_size", 26)
	right.add_child(tl)
	_st_grid = GridContainer.new()
	_st_grid.columns = 4
	_st_grid.add_theme_constant_override("h_separation", 6)
	_st_grid.add_theme_constant_override("v_separation", 6)
	_st_grid.size_flags_vertical = Control.SIZE_EXPAND_FILL
	right.add_child(_st_grid)
	var nav := HBoxContainer.new()
	nav.add_theme_constant_override("separation", 8)
	nav.add_child(_btn("◀ 이전", func(): _page_step(-1), 26, Vector2(150, 56)))
	_page_label = Label.new()
	_page_label.custom_minimum_size = Vector2(120, 0)
	_page_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	nav.add_child(_page_label)
	nav.add_child(_btn("다음 ▶", func(): _page_step(1), 26, Vector2(150, 56)))
	right.add_child(nav)
	_sel_label = Label.new()
	_sel_label.add_theme_font_size_override("font_size", 26)
	_sel_label.add_theme_color_override("font_color", Color(1.0, 0.85, 0.4))
	right.add_child(_sel_label)
	var go := _btn("▶  이 역에서 탑승하기", func(): start_route.emit(sel_route, sel_dir, sel_station), 32, Vector2(0, 72))
	var gsb := StyleBoxFlat.new()
	gsb.bg_color = Color(0.1, 0.55, 0.3)
	gsb.set_corner_radius_all(8)
	go.add_theme_stylebox_override("normal", gsb)
	right.add_child(go)
	return h


func _pick_route(i: int) -> void:
	sel_route = i
	sel_station = 0
	page = 0
	_refresh_route_page()


func _pick_dir(d: int) -> void:
	sel_dir = d
	_refresh_route_page()


func _page_step(k: int) -> void:
	var n: int = routes[sel_route]["stations"].size()
	var pages := int(ceil(float(n) / PER_PAGE))
	page = clampi(page + k, 0, pages - 1)
	_refresh_route_page()


func _pick_station(i: int) -> void:
	sel_station = i
	_refresh_route_page()


func select(route_idx: int, dir: int, station_idx: int) -> void:
	sel_route = route_idx
	sel_dir = dir
	sel_station = station_idx
	page = station_idx / PER_PAGE
	_refresh_route_page()


func _refresh_route_page() -> void:
	var r: Dictionary = routes[sel_route]
	for i in range(_route_btns.size()):
		_route_btns[i].button_pressed = (i == sel_route)
	var sts: Array = r["stations"]
	if r["loop"]:
		_dir_btns[0].text = "외선순환 (시계방향)"
		_dir_btns[1].text = "내선순환 (반시계방향)"
	else:
		_dir_btns[0].text = "%s 방면" % sts[sts.size() - 1]["ko"]
		_dir_btns[1].text = "%s 방면" % sts[0]["ko"]
	_dir_btns[0].button_pressed = sel_dir == 1
	_dir_btns[1].button_pressed = sel_dir == -1
	for c in _st_grid.get_children():
		_st_grid.remove_child(c)
		c.queue_free()
	var n := sts.size()
	var pages := int(ceil(float(n) / PER_PAGE))
	for i in range(page * PER_PAGE, mini(n, (page + 1) * PER_PAGE)):
		var idx := i
		var name: String = sts[i]["ko"]
		var fs := 24 if name.length() <= 5 else (20 if name.length() <= 7 else 17)
		var b := _btn(name, func(): _pick_station(idx), fs, Vector2(160, 54))
		b.toggle_mode = true
		b.button_pressed = (i == sel_station)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_st_grid.add_child(b)
	_page_label.text = "%d / %d" % [page + 1, pages]
	var st: Dictionary = sts[sel_station]
	var tr := ""
	if st["tr"].size() > 0:
		tr = "  ·  환승: " + MetroData.transfer_text(st["tr"])
	_sel_label.text = "선택: %s (%s)%s" % [st["ko"], st["en"], tr]


func set_info(bb: String, clock: String) -> void:
	if _info_label:
		_info_label.text = bb
	if _clock_label:
		_clock_label.text = clock


func _build_settings() -> Control:
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 16)
	_seat_btn = CheckButton.new()
	_seat_btn.text = "앉아서 플레이 (시점 높이 +45cm 보정)"
	_seat_btn.focus_mode = Control.FOCUS_NONE
	_seat_btn.toggled.connect(func(on): seated_mode.emit(on))
	v.add_child(_seat_btn)
	_sound_btn = CheckButton.new()
	_sound_btn.text = "소리 (안내 차임 · 주행음)"
	_sound_btn.button_pressed = true
	_sound_btn.focus_mode = Control.FOCUS_NONE
	_sound_btn.toggled.connect(func(on): sound.emit(on))
	v.add_child(_sound_btn)
	var help := Label.new()
	help.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	help.add_theme_font_size_override("font_size", 24)
	help.text = "조작법\n" \
		+ "• 왼쪽 스틱: 걷기   • 오른쪽 스틱 좌우: 30° 회전\n" \
		+ "• 트리거: 메뉴 버튼 누르기   • Y / B 버튼: 메뉴 열기·닫기\n" \
		+ "• 문이 열려 있을 때 승강장으로 내려서 역을 둘러볼 수 있어요.\n" \
		+ "  (밖에 있으면 열차가 출발하지 않고 기다려요)\n" \
		+ "• PC: WASD 이동, 마우스 시점, 클릭/Tab 메뉴, Esc 마우스 해제\n\n" \
		+ "역간 거리와 소요 시간은 실제 노선 자료를 바탕으로 한 근사값이며,\n" \
		+ "가속·감속·최고속도와 정차 시간을 실제 전동차 기준으로 계산합니다."
	v.add_child(help)
	return v
