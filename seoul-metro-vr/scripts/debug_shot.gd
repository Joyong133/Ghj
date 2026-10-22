extends Node
## 개발용: 명령줄 인자로 장면을 찍어 PNG 로 저장한다.
##   godot -- --shot out.png --route 0 --station 3 --cam x,y,z,yaw,pitch --wait 2 --run 30
## --run N : 출발 후 N초(시뮬레이션) 진행한 뒤 촬영 (배속 적용)

var main: Node
var args := {}
var t := 0.0
var stage := 0


func _ready() -> void:
	var a := OS.get_cmdline_user_args()
	var i := 0
	while i < a.size():
		if a[i].begins_with("--") and i + 1 < a.size():
			args[a[i].substr(2)] = a[i + 1]
			i += 2
		else:
			i += 1


func active() -> bool:
	return args.has("shot")


func _process(delta: float) -> void:
	if not active():
		return
	t += delta
	if stage == 0 and t > 0.3:
		stage = 1
		var r := int(args.get("route", "0"))
		var st := int(args.get("station", "0"))
		var d := int(args.get("dir", "1"))
		main.debug_log = true
		main.start_route(r, d, st)
		main._open_menu(args.get("menu", "0") == "1")
		if args.has("run"):
			main.time_scale = float(args.get("scale", "20"))
			main.timer = 0.0
	if stage == 1 and t > 1.0:
		if args.has("run"):
			if main.sim_clock < float(args["run"]):
				return
			main.time_scale = 0.0
		stage = 2
		t = 0.0
		if args.has("cam"):
			var c: PackedStringArray = args["cam"].split(",")
			var p: Player = main.player
			p.global_position = Vector3(float(c[0]), 0, float(c[2]))
			p.camera.position.y = float(c[1])
			p.rotation.y = deg_to_rad(float(c[3]))
			p.camera.rotation.x = deg_to_rad(float(c[4]))
	if stage == 2 and t > float(args.get("wait", "1.5")):
		var img := get_viewport().get_texture().get_image()
		img.save_png(args["shot"])
		print("STATE idx=%d (%s) dir=%d state=%d odo=%.1fkm sim=%.0fs" % [main.idx, main._st(main.idx)["ko"], main.dir, main.state, main.odo / 1000.0, main.sim_clock])
		print("PERF draw_calls=%d objects=%d prims=%d fps=%d" % [
			Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME),
			Performance.get_monitor(Performance.RENDER_TOTAL_OBJECTS_IN_FRAME),
			Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME),
			Performance.get_monitor(Performance.TIME_FPS)])
		print("SHOT ", args["shot"])
		get_tree().quit()
