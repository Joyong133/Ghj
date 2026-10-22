extends Node3D
class_name Panel3D
## SubViewport 에 그린 2D UI 를 3D 판에 띄우고, VR 컨트롤러 레이/마우스로 누를 수 있게 한다.

const LAYER := 1 << 19           # 레이캐스트 전용 충돌 레이어 (20번)

var viewport: SubViewport
var quad: MeshInstance3D
var body: StaticBody3D
var size_m := Vector2(1.2, 0.84)
var px := Vector2i(1200, 840)
var _last_px := Vector2.ZERO
var _pressed := false


func setup(content: Control, size_meters: Vector2, size_px: Vector2i) -> void:
	size_m = size_meters
	px = size_px
	viewport = SubViewport.new()
	viewport.size = px
	viewport.transparent_bg = false
	viewport.gui_embed_subwindows = true
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	add_child(viewport)
	content.size = Vector2(px)
	viewport.add_child(content)

	quad = MeshInstance3D.new()
	var qm := QuadMesh.new()
	qm.size = size_m
	quad.mesh = qm
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.albedo_texture = viewport.get_texture()
	m.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	quad.material_override = m
	add_child(quad)

	body = StaticBody3D.new()
	body.collision_layer = LAYER
	body.collision_mask = 0
	var cs := CollisionShape3D.new()
	var bs := BoxShape3D.new()
	bs.size = Vector3(size_m.x, size_m.y, 0.02)
	cs.shape = bs
	body.add_child(cs)
	add_child(body)
	body.set_meta("panel", self)


func set_active(on: bool) -> void:
	visible = on
	body.collision_layer = LAYER if on else 0
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS if on else SubViewport.UPDATE_DISABLED


func _to_px(global_hit: Vector3) -> Vector2:
	var local := to_local(global_hit)
	var u := local.x / size_m.x + 0.5
	var v := 0.5 - local.y / size_m.y
	return Vector2(u * px.x, v * px.y)


## 포인터가 판 위에 있을 때 매 프레임 호출. pressed/released 는 이번 프레임 변화.
func pointer(global_hit: Vector3, pressed: bool, released: bool) -> void:
	var p := _to_px(global_hit)
	var mm := InputEventMouseMotion.new()
	mm.position = p
	mm.global_position = p
	mm.relative = p - _last_px
	mm.button_mask = MOUSE_BUTTON_MASK_LEFT if _pressed else 0
	viewport.push_input(mm, true)
	_last_px = p
	if pressed:
		_pressed = true
		_click(p, true)
	if released and _pressed:
		_pressed = false
		_click(p, false)


func pointer_exit() -> void:
	if _pressed:
		_pressed = false
		_click(_last_px, false)


func scroll(p_amount: float) -> void:
	var ev := InputEventMouseButton.new()
	ev.position = _last_px
	ev.global_position = _last_px
	ev.button_index = MOUSE_BUTTON_WHEEL_DOWN if p_amount > 0 else MOUSE_BUTTON_WHEEL_UP
	ev.pressed = true
	ev.factor = absf(p_amount)
	viewport.push_input(ev, true)


func _click(p: Vector2, down: bool) -> void:
	var ev := InputEventMouseButton.new()
	ev.position = p
	ev.global_position = p
	ev.button_index = MOUSE_BUTTON_LEFT
	ev.pressed = down
	ev.button_mask = MOUSE_BUTTON_MASK_LEFT if down else 0
	viewport.push_input(ev, true)
