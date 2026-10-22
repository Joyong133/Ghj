extends Node3D
## 서울 지하철 1·2호선 VR 체험 — 운행 시뮬레이션의 중심.
##
## 열차는 원점에 고정되어 있고 역/터널/풍경이 +Z 로 흘러간다 (부동소수 오차 없음, VR 멀미 감소).
## 시간은 실제 시각 기준(1배속)이며, 메뉴에서 배속을 올릴 수 있다.

enum S { DWELL, CLOSING, RUN, LAYOVER, HOLD, TURN }

var TC := MetroConst.train_center_z
var ZONE := MetroConst.platform_len * 0.5 + 12.0

var routes: Array = []
var route: Dictionary
var route_idx := 0
var dir := 1
var idx := 0                  # 현재(또는 방금 출발한) 역
var nxt := 1                  # 다음 역
var seg_d := 1000.0           # 현재 구간 길이 (m)
var s := 0.0                  # 구간 내 주행 거리
var v := 0.0                  # 속도 (m/s)
var a_now := 0.0
var odo := 0.0
var vmax := 16.0
var acc := 0.83
var dec := 0.97
var state := S.DWELL
var timer := 0.0
var time_scale := 1.0
var announced_near := false
var braking := false
var debug_log := false
var sim_clock := 0.0          # 시뮬레이션 경과 초
var seg_start_clock := 0.0
var seg_plan := 0.0           # 계획 주행시간

var station_a: Node3D
var station_b: Node3D
var train: Train
var scenery: Scenery
var player: Player
var audio: AudioSynth
var announcer: Announcer
var world_env: WorldEnv
var menu: MenuUI
var panel: Panel3D
var menu_open := true
var subtitle: Label3D
var subtitle_timer := 0.0
var fade: MeshInstance3D
var fade_alpha := 0.0
var sitting := false
var _last_joint := 0.0
var _info_tick := 0.0
var _line := 0


func _ready() -> void:
	routes = MetroData.routes()
	world_env = WorldEnv.new()
	add_child(world_env)
	scenery = Scenery.new()
	add_child(scenery)
	scenery.env_fn = _env_chunk
	scenery.raw_fn = _env_raw
	scenery.portal_fn = _portals
	scenery.bridge_fn = _bridges
	train = Train.new()
	add_child(train)
	audio = AudioSynth.new()
	add_child(audio)
	announcer = Announcer.new()
	add_child(announcer)
	player = Player.new()
	add_child(player)
	player.walk_check = _walk_check
	player.menu_toggle.connect(_toggle_menu)
	_build_overlays()
	_build_menu()
	start_route(0, 1, 0)
	_open_menu(true)
	var dbg := preload("res://scripts/debug_shot.gd").new()
	dbg.main = self
	add_child(dbg)


func _build_overlays() -> void:
	subtitle = Label3D.new()
	Mats.fonts()
	subtitle.font = Mats.font_bold
	subtitle.font_size = 40
	subtitle.pixel_size = 0.0011
	subtitle.outline_size = 10
	subtitle.outline_modulate = Color(0, 0, 0, 0.9)
	subtitle.no_depth_test = true
	subtitle.render_priority = 10
	subtitle.position = Vector3(0, -0.33, -1.3)
	subtitle.width = 900
	subtitle.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	player.camera.add_child(subtitle)
	fade = MeshInstance3D.new()
	var q := QuadMesh.new()
	q.size = Vector2(4, 4)
	fade.mesh = q
	var fm := StandardMaterial3D.new()
	fm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	fm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	fm.no_depth_test = true
	fm.render_priority = 20
	fm.albedo_color = Color(0, 0, 0, 0)
	fade.material_override = fm
	fade.position = Vector3(0, 0, -0.12)
	fade.visible = false
	player.camera.add_child(fade)


func say(text: String, secs := 7.0) -> void:
	subtitle.text = text
	subtitle_timer = secs


# ------------------------------------------------------------------ 메뉴
func _build_menu() -> void:
	menu = MenuUI.new()
	menu.build(routes)
	panel = Panel3D.new()
	add_child(panel)
	panel.setup(menu, Vector2(1.2, 0.84), Vector2i(1200, 840))
	menu.start_route.connect(func(r, d, st):
		_fade_then(func(): start_route(r, d, st))
		_open_menu(false))
	menu.time_scale.connect(func(k): time_scale = k)
	menu.skip_to_arrival.connect(_skip_to_arrival)
	menu.toggle_sit.connect(_toggle_sit)
	menu.seated_mode.connect(func(on): player.set_seated_mode(on))
	menu.sound.connect(func(on):
		audio.enabled = on
		announcer.enabled = on)
	menu.close_menu.connect(func(): _open_menu(false))


func _toggle_menu() -> void:
	_open_menu(not menu_open)


func _open_menu(on: bool) -> void:
	menu_open = on
	panel.set_active(on)
	if on:
		# 머리 앞 1m 에 띄운다
		var cam := player.camera.global_transform
		var fwd := -cam.basis.z
		fwd.y = 0
		if fwd.length() < 0.1:
			fwd = Vector3.FORWARD
		fwd = fwd.normalized()
		var pos := cam.origin + fwd * 1.0
		pos.y = cam.origin.y - 0.15
		panel.global_position = pos
		panel.look_at(cam.origin + Vector3(0, -0.15, 0), Vector3.UP, true)
		menu.show_page("info" if state != S.DWELL or sim_clock > 1.0 else "route")


## VR 시작 직후엔 머리 위치를 모르므로, 메뉴가 너무 멀거나 낮으면 다시 앞에 띄운다
func _menu_follow() -> void:
	if not menu_open:
		return
	var head := player.camera.global_position
	var d := panel.global_position.distance_to(head)
	if d > 2.2 or panel.global_position.y < 0.3 or head.y - panel.global_position.y > 0.8:
		_open_menu(true)


func _fade_then(cb: Callable) -> void:
	var tw := create_tween()
	fade.visible = true
	tw.tween_method(func(a): (fade.material_override as StandardMaterial3D).albedo_color.a = a, 0.0, 1.0, 0.35)
	tw.tween_callback(cb)
	tw.tween_method(func(a): (fade.material_override as StandardMaterial3D).albedo_color.a = a, 1.0, 0.0, 0.45)
	tw.tween_callback(func(): fade.visible = false)


# ------------------------------------------------------------------ 노선 / 구간
func _n() -> int:
	return route["stations"].size()


func _step(i: int, d: int) -> int:
	if route["loop"]:
		return posmod(i + d, _n())
	return i + d


func _has_seg(i: int, d: int) -> bool:
	if route["loop"]:
		return true
	return (d > 0 and i < _n() - 1) or (d < 0 and i > 0)


func _seg_index(i: int, d: int) -> int:
	return (i if d > 0 else _step(i, -1)) if route["loop"] else (i if d > 0 else i - 1)


func _seg_len(i: int, d: int) -> float:
	if not _has_seg(i, d):
		return 0.0
	return route["dist"][posmod(_seg_index(i, d), route["dist"].size())]


func _seg_bridge(i: int, d: int) -> String:
	if not _has_seg(i, d):
		return ""
	return route["bridges"].get(posmod(_seg_index(i, d), route["dist"].size()), "")


func _st(i: int) -> Dictionary:
	return route["stations"][i]


func _dest_text() -> String:
	if route["loop"]:
		return "외선순환" if dir > 0 else "내선순환"
	return _st(_n() - 1 if dir > 0 else 0)["ko"] + "행"


func start_route(r: int, d: int, st: int) -> void:
	if announcer:
		announcer.stop()
	route_idx = r
	route = routes[r]
	dir = d
	idx = st
	if not route["loop"]:
		if idx >= _n() - 1 and dir > 0:
			dir = -1
		elif idx <= 0 and dir < 0:
			dir = 1
	if route["line"] != _line:
		_line = route["line"]
		MetroConst.set_line(_line)
		TC = MetroConst.train_center_z
		ZONE = MetroConst.platform_len * 0.5 + 12.0
		train.setup(_line)
		announcer.setup(_line)
	var p: Dictionary = MetroData.LINE_PARAMS[_line]
	acc = p["acc"]
	dec = p["dec"]
	menu.select(r, dir, idx)
	if station_a:
		station_a.queue_free()
	if station_b:
		station_b.queue_free()
	station_a = StationBuilder.build(route, idx, dir)
	add_child(station_a)
	_begin_segment()
	state = S.DWELL
	timer = MetroData.dwell_time(_line, _st(idx)) + 5.0
	train.set_doors_instant(0.0, station_a.get_meta("side"))
	_open_doors()
	sitting = false
	menu.set_sit_text(false)
	player.place(Vector3(-0.5 * station_a.get_meta("side"), 0.0, 0.8), 0.0)
	train.set_destination(_dest_text())
	say("%s %s — %s역에서 탑승했습니다." % [_line_name(), _dest_text(), _st(idx)["ko"]])
	_update_displays()


func _line_name() -> String:
	return MetroConst.line_name(_line)


## 현재 역(idx)에서 다음 역으로의 구간을 준비하고 다음 역을 짓는다
func _begin_segment() -> void:
	s = 0.0
	v = 0.0
	braking = false
	announced_near = false
	if station_b:
		station_b.queue_free()
		station_b = null
	if not _has_seg(idx, dir):
		seg_d = 0.0
		nxt = idx
		return
	nxt = _step(idx, dir)
	seg_d = _seg_len(idx, dir)
	vmax = MetroData.segment_vmax(_line, _st(idx), _st(nxt)) / 3.6
	seg_plan = MetroData.run_time(seg_d, vmax * 3.6, acc, dec)
	# 계획 시간(운전 여유 포함)에 맞도록 실제 주행 최고속도를 조금 낮춘다
	var lo := 3.0
	var hi := vmax
	for k in range(24):
		var mid := (lo + hi) * 0.5
		if MetroData.run_time(seg_d, mid * 3.6, acc, dec) / 1.08 > seg_plan:
			lo = mid
		else:
			hi = mid
	vmax = (lo + hi) * 0.5
	station_b = StationBuilder.build(route, nxt, dir)
	add_child(station_b)
	_place_stations()


func _place_stations() -> void:
	if station_a:
		station_a.position.z = TC + s
		station_a.visible = absf(station_a.position.z) < 1200.0
	if station_b:
		station_b.position.z = TC + s - seg_d
		station_b.visible = absf(station_b.position.z) < 1200.0


func _open_doors() -> void:
	var side: int = station_a.get_meta("side")
	train.open_doors(side)
	audio.play_door_open()


# ------------------------------------------------------------------ 환경 판정 (scenery 콜백)
func _type(i: int) -> String:
	return _st(i)["type"]


func _env_raw(z: float) -> String:
	var za := TC + s
	var ta := _type(idx)
	if z >= za:
		var d := z - za
		if d < ZONE or not _has_seg(idx, -dir):
			return ta
		var dp := _seg_len(idx, -dir)
		var pi_ := _step(idx, -dir)
		if _seg_bridge(idx, -dir) != "" and absf(d - dp * 0.5) < minf(550.0, dp * 0.36):
			return "B"
		return ta if d < dp * 0.5 else _type(pi_)
	if seg_d <= 0.0:
		return ta
	var zb := za - seg_d
	var tb := _type(nxt)
	if z >= zb:
		var d2 := za - z
		if d2 < ZONE:
			return ta
		if z - zb < ZONE:
			return tb
		if _seg_bridge(idx, dir) != "" and absf(d2 - seg_d * 0.5) < minf(550.0, seg_d * 0.36):
			return "B"
		return ta if d2 < seg_d * 0.5 else tb
	var d3 := zb - z
	if d3 < ZONE or not _has_seg(nxt, dir):
		return tb
	var dn := _seg_len(nxt, dir)
	if _seg_bridge(nxt, dir) != "" and absf(d3 - dn * 0.5) < minf(550.0, dn * 0.36):
		return "B"
	return tb if d3 < dn * 0.5 else _type(_step(nxt, dir))


func _env_chunk(z: float) -> String:
	var za := TC + s
	if absf(z - za) < ZONE:
		return "S"
	if seg_d > 0.0 and absf(z - (za - seg_d)) < ZONE:
		return "S"
	return _env_raw(z)


func _bridges() -> Array:
	var out: Array = []
	var za := TC + s
	var segs := [[idx, -dir, za, 1], [idx, dir, za, -1]]
	if seg_d > 0.0:
		segs.append([nxt, dir, za - seg_d, -1])
	for sg in segs:
		if _seg_bridge(sg[0], sg[1]) == "":
			continue
		var dl := _seg_len(sg[0], sg[1])
		var mid: float = sg[2] + sg[3] * dl * 0.5
		var half := minf(550.0, dl * 0.36)
		out.append([mid - half, mid + half])
	return out


func _portals() -> Array:
	var out: Array = []
	var za := TC + s
	var segs := [[idx, -dir, za, 1], [idx, dir, za, -1]]
	if seg_d > 0.0:
		segs.append([nxt, dir, za - seg_d, -1])
	for sg in segs:
		if not _has_seg(sg[0], sg[1]):
			continue
		var t0 := _type(sg[0])
		var t1 := _type(_step(sg[0], sg[1]))
		if (t0 == "U") == (t1 == "U"):
			continue
		var dl := _seg_len(sg[0], sg[1])
		var z: float = sg[2] + sg[3] * dl * 0.5
		out.append({"z": z, "u_side": 1 if _env_raw(z + 1.0) == "U" else -1})
	return out


# ------------------------------------------------------------------ 이동 제한
func _platform_ok(p: Vector3) -> bool:
	if station_a == null or state == S.RUN or s > 0.01:
		return false
	var side: int = station_a.get_meta("side")
	var w: float = station_a.get_meta("W")
	var lx := p.x * side
	var lz := p.z - station_a.position.z
	return lx >= 1.72 and lx <= MetroConst.PLATFORM_EDGE_X + w - 0.35 and absf(lz) < MetroConst.platform_len * 0.5 - 1.0


func _door_gap_ok(p: Vector3) -> bool:
	if train.door_open < 0.8 or state == S.RUN:
		return false
	var side: int = station_a.get_meta("side") if station_a else 1
	if signf(p.x) != side and absf(p.x) > 1.0:
		return false
	if absf(p.x) > 1.95:
		return false
	for dz in MetroConst.DOOR_Z:
		if absf(p.z - dz) < 0.5:
			return true
	return false


func _inside_ok(p: Vector3) -> bool:
	return absf(p.x) <= 1.2 and absf(p.z) <= MetroConst.CAR_HALF_LEN - 0.3


func _allowed(p: Vector3) -> bool:
	return _inside_ok(p) or _door_gap_ok(p) or _platform_ok(p)


func _walk_check(from: Vector3, to: Vector3) -> Vector3:
	if _allowed(to):
		return to
	var tx := Vector3(to.x, from.y, from.z)
	if _allowed(tx):
		return tx
	var tz := Vector3(from.x, from.y, to.z)
	if _allowed(tz):
		return tz
	return from


func _player_inside() -> bool:
	var h := player.head_global()
	return absf(h.x) < MetroConst.INNER_HALF_W + 0.05 and absf(h.z) < MetroConst.CAR_HALF_LEN


# ------------------------------------------------------------------ 시뮬레이션
func _process(delta: float) -> void:
	var dt := delta * time_scale
	var steps := int(ceil(dt / 0.05))
	var h := dt / maxi(steps, 1)
	for k in range(steps):
		_sim(h)
	_place_stations()
	_psd_anim(delta)
	var outdoor := _env_raw(TC - 0.0) != "U"
	# 플레이어가 있는 객차 부근의 환경
	var t_here := _env_raw(0.0)
	world_env.set_underground(t_here == "U")
	scenery.update_world(odo, t_here != "U")
	audio.update_motion(v, a_now, outdoor)
	if _line == 1 and outdoor and v > 2.0 and odo - _last_joint > 25.0:
		_last_joint = odo
		audio.play_joint()
	if subtitle_timer > 0.0:
		subtitle_timer -= delta
		if subtitle_timer <= 0.0:
			subtitle.text = ""
	_menu_follow()
	_info_tick -= delta
	if _info_tick <= 0.0:
		_info_tick = 0.5
		_update_displays()


func _sim(dt: float) -> void:
	sim_clock += dt
	train.advance_doors(dt)
	match state:
		S.DWELL:
			timer -= dt
			if timer <= 0.0:
				if not _player_inside():
					state = S.HOLD
					say("승객이 내리셨습니다. 열차가 기다리고 있습니다 — 다시 타 주세요.\n(Please board the train.)", 4.0)
				else:
					_start_closing()
		S.HOLD:
			if _player_inside():
				_start_closing()
		S.CLOSING:
			timer -= dt
			if timer <= 0.0 and train.doors_fully_closed():
				_depart()
		S.RUN:
			_run(dt)
		S.LAYOVER:
			timer -= dt
			if timer <= 0.0:
				if not _player_inside():
					state = S.HOLD
					return
				state = S.TURN
				_reverse()


func _start_closing() -> void:
	if seg_d <= 0.0 and not route["loop"]:
		state = S.LAYOVER
		timer = 60.0
		return
	state = S.CLOSING
	timer = 3.2
	train.close_doors()
	audio.play_door_close()
	announcer.doors_closing()
	say("출입문 닫습니다. (The doors are closing.)", 3.0)


func _depart() -> void:
	state = S.RUN
	seg_start_clock = sim_clock
	audio.play_depart()
	var st := _st(nxt)
	var side_txt := _door_side_text(nxt)
	var msg := "이번 역은 %s, %s역입니다. 내리실 문은 %s입니다." % [st["ko"], st["ko"], side_txt]
	if st["tr"].size() > 0:
		msg += "\n%s으로 갈아타실 수 있습니다." % MetroData.transfer_text(st["tr"])
	say(msg + "\nThis stop is %s." % st["en"])
	announcer.next_stop(_line, st, _st(nxt)["kind"] == "I", not route["loop"] and not _has_seg(nxt, dir))


func _door_side_text(i: int) -> String:
	# 승강장 형식: I(섬식) → 오른쪽, S(상대식) → 왼쪽
	return "오른쪽" if _st(i)["kind"] == "I" else "왼쪽"


func _run(dt: float) -> void:
	var remaining := seg_d - s
	if remaining <= 0.3 and v < 1.5:
		odo += remaining
		s = seg_d
		v = 0.0
		_arrive()
		return
	# 정위치 정차: 필요한 감속도가 상용 감속도에 이르면 제동 시작
	var need := v * v / (2.0 * maxf(remaining, 0.01))
	if need >= dec * 0.95:
		braking = true
	if braking:
		a_now = -need
	elif v < vmax - 0.05:
		a_now = minf(acc, (vmax - v) / dt)
	else:
		a_now = 0.0
	v = maxf(v + a_now * dt, 0.4 if braking else 0.0)
	var ds := minf(v * dt, remaining)
	s += ds
	odo += ds
	if not announced_near and remaining < 380.0:
		announced_near = true
		audio.play_arrive()
		var st := _st(nxt)
		var terminal: bool = not route["loop"] and not _has_seg(nxt, dir)
		announcer.arriving(_line, st, st["kind"] == "I", terminal)
		if terminal:
			say("이 열차의 종착역인 %s역입니다. 잊으신 물건 없이 안녕히 가십시오.\nThis is the last stop, %s." % [st["ko"], st["en"]])
		else:
			say("곧 %s역에 도착합니다. 내리실 문은 %s입니다.\nWe are arriving at %s." % [st["ko"], _door_side_text(nxt), st["en"]])


func _arrive() -> void:
	if debug_log:
		print("SEG %s→%s 실제 %.1fs 계획 %.1fs (vmax %.1f km/h)" % [_st(idx)["ko"], _st(nxt)["ko"], sim_clock - seg_start_clock, seg_plan, vmax * 3.6])
	v = 0.0
	a_now = 0.0
	s = seg_d
	_place_stations()
	# 역 교체: B 가 새 기준역 A 가 된다
	station_a.queue_free()
	station_a = station_b
	station_b = null
	idx = nxt
	s = 0.0
	seg_d = 0.0
	_place_stations()
	state = S.DWELL
	timer = MetroData.dwell_time(_line, _st(idx)) - 2.2
	_open_doors()
	# 다음 구간 준비 (정차 중에 다음 역을 짓는다)
	_begin_segment()
	if seg_d <= 0.0:
		announcer.terminal_arrived(_line, _st(idx))
		say("%s, 종착역입니다. 열차는 잠시 후 회차합니다.\n(The train will turn around shortly.)" % _st(idx)["ko"])


func _reverse() -> void:
	_fade_then(func():
		dir = -dir
		var keep_pos := player.head_global()
		if station_a:
			station_a.queue_free()
		station_a = StationBuilder.build(route, idx, dir)
		add_child(station_a)
		_begin_segment()
		train.set_destination(_dest_text())
		state = S.DWELL
		timer = MetroData.dwell_time(_line, _st(idx))
		train.set_doors_instant(1.0, station_a.get_meta("side"))
		player.place(Vector3(-0.5 * station_a.get_meta("side"), 0.0, keep_pos.z), player.rotation.y)
		announcer.turnaround(_line, _dest_text())
		say("이 열차는 %s 열차입니다." % _dest_text()))


func _skip_to_arrival() -> void:
	if state != S.RUN:
		if state == S.DWELL:
			timer = minf(timer, 0.5)
		return
	# 남은 거리를 정지 직전 감속 구간까지 건너뛴다
	var target_v := minf(v, 12.0)
	var brake := target_v * target_v / (2.0 * dec)
	var jump := maxf(0.0, seg_d - s - brake - 420.0)
	if jump > 0.0:
		_fade_then(func():
			s += jump
			odo += jump
			v = minf(v, vmax))


func _toggle_sit() -> void:
	sitting = not sitting
	menu.set_sit_text(sitting)
	if sitting:
		var side := -1.0
		player.place(Vector3(side * 1.0, 0.0, 0.6), PI / 2 * -side)
		if player.xr_active:
			player.position.y = 1.2 - player.camera.position.y
		else:
			player.camera.position.y = 1.2
	else:
		player.place(Vector3(0.0, 0.0, 0.6), player.rotation.y)
		if player.xr_active:
			player.position.y = player.seated_offset
		else:
			player.camera.position.y = Player.DESKTOP_EYE
	_open_menu(false)


func _psd_anim(_delta: float) -> void:
	# 스크린도어는 열차 문과 함께 움직인다 (현재 정차 역만)
	if station_a == null or s > 0.01:
		return
	var f := smoothstep(0.0, 1.0, train.door_open)
	for l in station_a.get_meta("leaves"):
		var n: Node3D = l["node"]
		n.position.z = l["base"] + l["sign"] * 1.05 * f


# ------------------------------------------------------------------ 표시기 갱신
func _update_displays() -> void:
	var page := int(Time.get_ticks_msec() / 3500) % 3
	var top := "%s  %s" % [_line_name(), _dest_text()]
	var main_text := ""
	var target := _st(nxt) if state == S.RUN or state == S.CLOSING else _st(idx)
	var terminal_here: bool = seg_d <= 0.0 and not route["loop"]
	if state == S.RUN or state == S.CLOSING:
		var near := seg_d - s < 380.0
		match page:
			0: main_text = ("곧 도착  " if near else "이번역  ") + target["ko"]
			1: main_text = ("Arriving  " if near else "Next  ") + target["en"]
			2:
				if target["tr"].size() > 0:
					main_text = "환승  " + MetroData.transfer_text(target["tr"])
				else:
					main_text = "내리실 문  " + _door_side_text(nxt)
	else:
		match page:
			0: main_text = target["ko"] + "  역입니다"
			1: main_text = target["en"]
			2:
				if terminal_here:
					main_text = "종착역 · 모두 내리십시오"
				else:
					main_text = "다음역  " + _st(nxt)["ko"]
	train.set_lcd(top, main_text)

	# 끝벽 노선도: 지난 역 2개 + 앞으로 6개
	var names: Array = []
	var hi := 0
	var passed := 0
	var center := idx
	for k in range(-2, 7):
		var j := center + k * dir
		if route["loop"]:
			j = posmod(j, _n())
		elif j < 0 or j >= _n():
			continue
		if k == 0:
			hi = names.size()
		if k < 0:
			passed += 1
		names.append(_st(j)["ko"])
	if state == S.RUN:
		hi += 1
		passed = hi
	train.set_route_map("%s  %s" % [_line_name(), _dest_text()], names, hi, passed)

	# 승강장 전광판
	if station_a:
		var txt := ""
		if state == S.DWELL or state == S.HOLD or state == S.LAYOVER:
			txt = "%s %s\n열차가 도착했습니다" % [_line_name(), _dest_text()]
		elif state == S.CLOSING:
			txt = "%s %s\n출입문 닫습니다" % [_line_name(), _dest_text()]
		else:
			txt = "%s %s\n열차가 출발했습니다" % [_line_name(), _dest_text()]
		for b in station_a.get_meta("boards"):
			b.text = txt
	if station_b:
		var remaining := seg_d - s
		var txt2: String
		if state != S.RUN:
			txt2 = "%s %s\n전역 %s 정차중" % [_line_name(), _dest_text(), _st(idx)["ko"]]
		elif remaining < 400.0:
			txt2 = "%s %s\n열차가 들어오고 있습니다" % [_line_name(), _dest_text()]
		else:
			txt2 = "%s %s\n전역 %s 출발" % [_line_name(), _dest_text(), _st(idx)["ko"]]
		for b in station_b.get_meta("boards"):
			b.text = txt2

	# 메뉴 운행 정보
	if menu_open:
		var now := Time.get_datetime_dict_from_system()
		var clock := "%02d:%02d:%02d" % [now["hour"], now["minute"], now["second"]]
		var state_txt: String = {S.DWELL: "정차 중 (문 열림)", S.CLOSING: "출입문 닫는 중", S.RUN: "운행 중",
			S.LAYOVER: "종착역 회차 대기", S.HOLD: "승객 탑승 대기", S.TURN: "회차 중"}[state]
		var bb := "[b]%s %s[/b]   %s\n" % [_line_name(), _dest_text(), route["title"]]
		bb += "상태: %s\n" % state_txt
		bb += "현재 역: %s (%s)\n" % [_st(idx)["ko"], _st(idx)["en"]]
		if seg_d > 0.0:
			var rem := seg_d - s
			var eta := _eta_seconds()
			var arr := Time.get_unix_time_from_system() + eta / time_scale
			var at := Time.get_datetime_dict_from_unix_time(int(arr) + _tz_offset())
			bb += "다음 역: [b]%s[/b]  ·  남은 거리 %.2f km\n" % [_st(nxt)["ko"], rem / 1000.0]
			bb += "속도: %d km/h  ·  다음 역 도착 예정 %02d:%02d:%02d (약 %d분 %d초)\n" % [
				int(round(v * 3.6)), at["hour"], at["minute"], at["second"], int(eta / time_scale) / 60, int(eta / time_scale) % 60]
			bb += "구간 계획 소요: %d분 %d초 (역간 %.1f km)\n" % [int(seg_plan) / 60, int(seg_plan) % 60, seg_d / 1000.0]
		bb += "총 주행: %.1f km  ·  배속 %dx\n" % [odo / 1000.0, int(time_scale)]
		var total := _route_total_time()
		bb += "전 구간 소요(정차 포함): 약 %d시간 %d분" % [int(total) / 3600, (int(total) % 3600) / 60]
		menu.set_info(bb, clock)


func _tz_offset() -> int:
	var tz := Time.get_time_zone_from_system()
	return int(tz.get("bias", 0)) * 60


func _eta_seconds() -> float:
	var t := 0.0
	if state == S.DWELL or state == S.HOLD:
		t += maxf(timer, 0.0) + 3.5
	elif state == S.CLOSING:
		t += maxf(timer, 0.0)
	var rem := seg_d - s
	# 남은 거리를 현재 속도에서 감속까지 근사
	var vm := vmax
	var t_run: float
	if state == S.RUN:
		var d_dec := v * v / (2.0 * dec)
		if rem <= d_dec + 1.0:
			t_run = 2.0 * rem / maxf(v, 0.5)
		else:
			var d_acc := maxf(0.0, (vm * vm - v * v) / (2.0 * acc))
			if d_acc + vm * vm / (2.0 * dec) < rem:
				t_run = (vm - v) / acc + vm / dec + (rem - d_acc - vm * vm / (2.0 * dec)) / vm
			else:
				t_run = rem / maxf((v + vm) * 0.5, 1.0) + vm / dec
	else:
		t_run = MetroData.run_time(rem, vm * 3.6, acc, dec)
	return t + t_run


func _route_total_time() -> float:
	var total := 0.0
	var segs: int = route["dist"].size()
	for i in range(segs):
		var a := _st(i)
		var b := _st((i + 1) % _n())
		total += MetroData.run_time(route["dist"][i], MetroData.segment_vmax(_line, a, b), acc, dec)
		total += MetroData.dwell_time(_line, b)
	return total
