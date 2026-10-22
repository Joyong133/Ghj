extends Node3D
class_name Train
## 10량 편성 열차. Blender 모델(train_car.glb, train_cab.glb)을 배치하고
## 출입문, 문 위 LCD 안내기, 노선도, 행선 표시기를 관리한다.
## 열차는 원점에 고정되어 있고, 세계(역/터널)가 +Z 방향으로 움직인다.

const CAR_SCENE := preload("res://assets/models/train_car.glb")
const CAB_SCENE := preload("res://assets/models/train_cab.glb")

var line_color := Color("00A84D")
var leaves: Array = []          # {node, base, sign, side}
var door_open := 0.0            # 0 = 닫힘, 1 = 열림
var door_target := 0.0
var door_side := 1              # -1 왼쪽, +1 오른쪽
var lcds: Array = []            # {top: Label3D, main: Label3D}
var dest_labels: Array = []
var route_maps: Array = []      # Node3D 들 (끝벽 노선도)
var cars: Array = []

const DOOR_SPEED := 0.45        # 1/초 (약 2.2초에 완전 개폐)


func setup(line: int) -> void:
	for c in get_children():
		remove_child(c)
		c.queue_free()
	leaves.clear()
	lcds.clear()
	dest_labels.clear()
	route_maps.clear()
	cars.clear()
	line_color = MetroConst.LINE_COLORS[line]
	for i in range(MetroConst.num_cars):
		var car := CAR_SCENE.instantiate() as Node3D
		car.name = "Car%d" % i
		car.position.z = MetroConst.car_center_z(i)
		add_child(car)
		cars.append(car)
		StationBuilder.apply_line_color(car, line_color)
		if i == MetroConst.player_car:
			_build_interior_displays(car)
			_add_interior_lights(car)
	# 선두/후미 운전실
	var front := CAB_SCENE.instantiate() as Node3D
	front.position.z = MetroConst.car_center_z(0) - MetroConst.CAR_HALF_LEN
	front.rotation.y = PI
	add_child(front)
	var rear := CAB_SCENE.instantiate() as Node3D
	rear.position.z = MetroConst.car_center_z(MetroConst.num_cars - 1) + MetroConst.CAR_HALF_LEN
	add_child(rear)
	for cab in [front, rear]:
		StationBuilder.apply_line_color(cab, line_color)
		var l := Mats.label(cab, "", Vector3(0, 2.085, 0.70), 56, 0.0028, Color(1.0, 0.6, 0.1), true)
		dest_labels.append(l)
	# 모든 객차의 문짝을 (좌/우, 열리는 방향) 4묶음으로 합쳐서 한 번에 움직인다
	var groups := {}
	for car in cars:
		for g in _collect_leaves(car):
			var key := "%d_%d" % [g["side"], g["sign"]]
			if not groups.has(key):
				groups[key] = {"nodes": [], "side": g["side"], "sign": g["sign"]}
			groups[key]["nodes"].append(g["node"])
	for key in groups:
		var g: Dictionary = groups[key]
		var mi := Mats.merge_nodes(g["nodes"], self, "Doors_" + key)
		leaves.append({"node": mi, "base": 0.0, "sign": g["sign"], "side": g["side"]})
	var keep: Array = []
	for l in leaves:
		keep.append(l["node"])
	for rm in route_maps:
		for r in rm["rows"]:
			keep.append(r["dot"])
	Mats.merge_static(self, keep, "TrainBody")


func _collect_leaves(car: Node3D) -> Array:
	var out: Array = []
	for side_name in ["L", "R"]:
		for d in range(4):
			for ab in ["a", "b"]:
				var n := car.find_child("Door%s%d%s" % [side_name, d, ab], true, false) as Node3D
				if n == null:
					continue
				var dz: float = MetroConst.DOOR_Z[d]
				var sgn := signf(n.position.z - dz)
				out.append({"node": n, "sign": int(sgn), "side": -1 if side_name == "L" else 1})
	return out


func _add_interior_lights(car: Node3D) -> void:
	for z in [-5.0, 5.0]:
		var o := OmniLight3D.new()
		o.position = Vector3(0, 2.0, z)
		o.omni_range = 7.0
		o.light_energy = 0.35
		o.light_color = Color(1.0, 0.98, 0.94)
		o.shadow_enabled = false
		car.add_child(o)


func _build_interior_displays(car: Node3D) -> void:
	# 문 위 LCD (화면 위치는 build_models.py 의 Screen 박스와 동일)
	for s in [-1, 1]:
		for d in range(4):
			var dz: float = MetroConst.DOOR_Z[d]
			var holder := Node3D.new()
			holder.position = Vector3(s * (MetroConst.INNER_HALF_W - 0.068), 2.015, dz)
			holder.rotation.y = -PI / 2 if s > 0 else PI / 2
			car.add_child(holder)
			var bar := Mats.box(holder, Vector3(0.78, 0.045, 0.002), Vector3(0, 0.072, 0.001), Mats.unshaded(line_color))
			var top := Mats.label(holder, "", Vector3(0, 0.072, 0.003), 28, 0.0011, Color.WHITE, true)
			var main := Mats.label(holder, "", Vector3(0, -0.02, 0.003), 56, 0.0011, Color(1.0, 0.95, 0.75), true)
			main.width = 680
			main.autowrap_mode = TextServer.AUTOWRAP_OFF
			lcds.append({"top": top, "main": main, "side": s})
	# 양 끝벽 노선도
	for e in [-1, 1]:
		for xs in [1]:
			var rm := Node3D.new()
			rm.position = Vector3(xs * 0.97, 1.45, e * (MetroConst.CAR_HALF_LEN - 0.06))
			rm.rotation.y = 0.0 if e < 0 else PI
			car.add_child(rm)
			Mats.box(rm, Vector3(0.9, 0.95, 0.01), Vector3(0, 0, -0.006), Mats.unshaded(Color(0.97, 0.97, 0.97)))
			Mats.box(rm, Vector3(0.9, 0.09, 0.002), Vector3(0, 0.43, 0.0), Mats.unshaded(line_color))
			var title := Mats.label(rm, "", Vector3(0, 0.43, 0.003), 32, 0.0012, Color.WHITE, true)
			title.name = "Title"
			var rows := []
			for k in range(9):
				var y := 0.33 - k * 0.088
				var dot := Mats.box(rm, Vector3(0.035, 0.035, 0.004), Vector3(-0.33, y, 0.0), Mats.unshaded(line_color))
				var lab := Mats.label(rm, "", Vector3(-0.28, y, 0.003), 36, 0.0012, Color(0.15, 0.15, 0.18), true)
				lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
				rows.append({"dot": dot, "label": lab})
			# 세로 노선 선
			Mats.box(rm, Vector3(0.012, 0.72, 0.002), Vector3(-0.33, -0.02, -0.001), Mats.unshaded(line_color))
			route_maps.append({"node": rm, "title": title, "rows": rows})


func open_doors(side: int) -> void:
	door_side = side
	door_target = 1.0


func close_doors() -> void:
	door_target = 0.0


func doors_fully_closed() -> bool:
	return door_open <= 0.001


func doors_fully_open() -> bool:
	return door_open >= 0.999


## 시뮬레이션 시간으로 문을 움직인다 (main 의 시뮬레이션 단계마다 호출)
func advance_doors(dt: float) -> void:
	if door_open != door_target:
		door_open = move_toward(door_open, door_target, dt * DOOR_SPEED)
		_apply_doors()


func set_doors_instant(f: float, side: int) -> void:
	door_side = side
	door_open = f
	door_target = f
	_apply_doors()


func _apply_doors() -> void:
	# 처음엔 천천히, 중간에 빠르게
	var f := smoothstep(0.0, 1.0, door_open)
	for l in leaves:
		var n: Node3D = l["node"]
		if l["side"] == door_side:
			n.position.z = l["base"] + l["sign"] * 0.63 * f
		else:
			n.position.z = l["base"]


func set_lcd(top: String, main_text: String) -> void:
	for l in lcds:
		l["top"].text = top
		l["main"].text = main_text


func set_destination(text: String) -> void:
	for l in dest_labels:
		l.text = text


## 노선도 갱신: names = 표시할 역 이름(최대 9), cur = 강조할 행
func set_route_map(title: String, names: Array, highlight: int, passed_upto: int) -> void:
	for rm in route_maps:
		rm["title"].text = title
		var rows: Array = rm["rows"]
		for k in range(rows.size()):
			var lab: Label3D = rows[k]["label"]
			var dot: MeshInstance3D = rows[k]["dot"]
			if k < names.size():
				lab.text = names[k]
				dot.visible = true
				if k == highlight:
					lab.modulate = Color(0.85, 0.1, 0.1)
					lab.font_size = 42
				elif k < passed_upto:
					lab.modulate = Color(0.6, 0.6, 0.62)
					lab.font_size = 34
				else:
					lab.modulate = Color(0.15, 0.15, 0.18)
					lab.font_size = 36
			else:
				lab.text = ""
				dot.visible = false
