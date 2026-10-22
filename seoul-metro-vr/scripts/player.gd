extends XROrigin3D
class_name Player
## VR 플레이어 (OpenXR). 헤드셋이 없으면 PC 모드(WASD + 마우스)로 동작한다.

signal menu_toggle

var xr_active := false
var camera: XRCamera3D
var left: XRController3D
var right: XRController3D
var rays: Array = []             # {ctrl, mesh, dot, panel, trig}
var walk_speed := 1.4
var seated_offset := 0.0
var walk_check: Callable          # func(from: Vector3, to: Vector3) -> Vector3
var _snap_ready := true
var _yaw := 0.0
var _pitch := 0.0
var _mouse_captured := false
var _desktop_click := false
var _desktop_release := false
var _desktop_panel: Panel3D
const DESKTOP_EYE := 1.65


func _ready() -> void:
	camera = XRCamera3D.new()
	camera.near = 0.05
	camera.far = 2500.0
	add_child(camera)
	left = _make_controller("left_hand")
	right = _make_controller("right_hand")
	var xr := XRServer.find_interface("OpenXR")
	if xr != null and xr.is_initialized():
		xr_active = true
		get_viewport().use_xr = true
		DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_DISABLED)
		# 화면 재생률에 맞춰 물리 틱 설정
		var rr: float = xr.get_display_refresh_rate() if xr.has_method("get_display_refresh_rate") else 72.0
		if rr > 0.0:
			Engine.physics_ticks_per_second = int(rr)
	else:
		camera.position.y = DESKTOP_EYE
		camera.current = true
		left.visible = false
		right.visible = false


func _make_controller(tracker: String) -> XRController3D:
	var c := XRController3D.new()
	c.tracker = tracker
	add_child(c)
	# 손 모양 대신 간단한 컨트롤러 모양
	var body := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = Vector3(0.045, 0.03, 0.12)
	body.mesh = bm
	body.position = Vector3(0, -0.01, 0.04)
	body.material_override = Mats.color(Color(0.15, 0.15, 0.17), 0.5)
	c.add_child(body)
	var ray := MeshInstance3D.new()
	var rm := BoxMesh.new()
	rm.size = Vector3(0.004, 0.004, 1.0)
	ray.mesh = rm
	ray.material_override = Mats.unshaded(Color(0.4, 0.8, 1.0))
	ray.position = Vector3(0, 0, -0.5)
	ray.visible = false
	c.add_child(ray)
	var dot := MeshInstance3D.new()
	var sm := SphereMesh.new()
	sm.radius = 0.008
	sm.height = 0.016
	dot.mesh = sm
	dot.material_override = Mats.unshaded(Color(1.0, 1.0, 1.0))
	dot.visible = false
	add_child(dot)
	c.button_pressed.connect(func(b): _on_button(c, b, true))
	c.button_released.connect(func(b): _on_button(c, b, false))
	rays.append({"ctrl": c, "mesh": ray, "dot": dot, "panel": null, "press": false, "release": false})
	return c


func _on_button(c: XRController3D, b: String, down: bool) -> void:
	if b == "by_button" or b == "menu_button":
		if down:
			menu_toggle.emit()
		return
	if b == "trigger_click":
		for r in rays:
			if r["ctrl"] == c:
				if down:
					r["press"] = true
				else:
					r["release"] = true


func head_global() -> Vector3:
	return camera.global_position


func set_seated_mode(on: bool) -> void:
	seated_offset = 0.45 if on else 0.0
	if xr_active:
		position.y = seated_offset


## 바닥 높이 y 에 맞춰 선다 (좌석 = 0.0 바닥 기준이 아닐 때 사용)
func place(pos: Vector3, yaw: float) -> void:
	if xr_active:
		# 머리 위치가 pos 가 되도록 원점을 옮긴다
		rotation.y = yaw
		var head_local := camera.position
		head_local.y = 0
		var off := global_transform.basis * head_local
		global_position = Vector3(pos.x - off.x, pos.y + seated_offset, pos.z - off.z)
	else:
		_yaw = yaw
		rotation.y = yaw
		global_position = pos


func _unhandled_input(event: InputEvent) -> void:
	if xr_active:
		return
	if event is InputEventMouseMotion and _mouse_captured:
		_yaw -= event.relative.x * 0.003
		_pitch = clampf(_pitch - event.relative.y * 0.003, -1.4, 1.4)
		rotation.y = _yaw
		camera.rotation.x = _pitch
	elif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if not _mouse_captured and event.pressed:
			Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
			_mouse_captured = true
		elif event.pressed:
			_desktop_click = true
		else:
			_desktop_release = true
	elif event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_ESCAPE:
			Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
			_mouse_captured = false
		elif event.keycode == KEY_TAB:
			menu_toggle.emit()


func _physics_process(delta: float) -> void:
	var move := Vector2.ZERO
	var turn := 0.0
	if xr_active:
		move = left.get_vector2("primary")
		turn = right.get_vector2("primary").x
	else:
		move = Vector2(
			Input.get_action_strength("ui_right") - Input.get_action_strength("ui_left"),
			Input.get_action_strength("ui_up") - Input.get_action_strength("ui_down"))
		if Input.is_physical_key_pressed(KEY_W): move.y += 1
		if Input.is_physical_key_pressed(KEY_S): move.y -= 1
		if Input.is_physical_key_pressed(KEY_A): move.x -= 1
		if Input.is_physical_key_pressed(KEY_D): move.x += 1
		move = move.limit_length(1.0)

	# 스냅 회전 (머리 위치 기준)
	if xr_active:
		if absf(turn) > 0.7 and _snap_ready:
			_snap_ready = false
			var pivot := camera.global_position
			var ang := -signf(turn) * deg_to_rad(30.0)
			var t := Transform3D(Basis(Vector3.UP, ang), Vector3.ZERO)
			global_transform = Transform3D.IDENTITY.translated(pivot) * t * Transform3D.IDENTITY.translated(-pivot) * global_transform
		elif absf(turn) < 0.3:
			_snap_ready = true

	if move.length() > 0.15:
		var basis := camera.global_transform.basis
		var fwd := -basis.z
		fwd.y = 0
		fwd = fwd.normalized()
		var rgt := basis.x
		rgt.y = 0
		rgt = rgt.normalized()
		var step := (fwd * move.y + rgt * move.x) * walk_speed * delta
		var head := camera.global_position
		var target := head + step
		if walk_check.is_valid():
			target = walk_check.call(head, target)
		global_position += Vector3(target.x - head.x, 0, target.z - head.z)

	_update_pointers()


func _update_pointers() -> void:
	var space := get_world_3d().direct_space_state
	if xr_active:
		for r in rays:
			var c: XRController3D = r["ctrl"]
			var from := c.global_position
			var dir := -c.global_transform.basis.z
			_ray(space, r, from, dir)
	else:
		var from := camera.global_position
		var dir := -camera.global_transform.basis.z
		var r: Dictionary = rays[1]
		r["press"] = _desktop_click
		r["release"] = _desktop_release
		_desktop_click = false
		_desktop_release = false
		_ray(space, r, from, dir)


func _ray(space: PhysicsDirectSpaceState3D, r: Dictionary, from: Vector3, dir: Vector3) -> void:
	var q := PhysicsRayQueryParameters3D.create(from, from + dir * 6.0, Panel3D.LAYER)
	q.collide_with_areas = false
	var hit := space.intersect_ray(q)
	var mesh: MeshInstance3D = r["mesh"]
	var dot: MeshInstance3D = r["dot"]
	var prev: Panel3D = r["panel"]
	if hit.is_empty() or not hit["collider"].has_meta("panel"):
		mesh.visible = false
		dot.visible = false
		if prev != null:
			prev.pointer_exit()
		r["panel"] = null
	else:
		var panel: Panel3D = hit["collider"].get_meta("panel")
		var d := from.distance_to(hit["position"])
		if xr_active:
			mesh.visible = true
			mesh.scale = Vector3(1, 1, d)
			mesh.position = Vector3(0, 0, -d * 0.5)
		dot.visible = true
		dot.global_position = hit["position"]
		if prev != null and prev != panel:
			prev.pointer_exit()
		r["panel"] = panel
		panel.pointer(hit["position"], r["press"], r["release"])
	r["press"] = false
	r["release"] = false
