extends SceneTree
## 노선 데이터를 JSON 으로 내보낸다 (음성 생성기용).
##   godot --headless -s tools/dump_routes.gd -- out.json
func _init() -> void:
	var out := "routes.json"
	var a := OS.get_cmdline_user_args()
	if a.size() > 0:
		out = a[0]
	var rs := MetroData.routes()
	var f := FileAccess.open(out, FileAccess.WRITE)
	f.store_string(JSON.stringify(rs))
	f.close()
	print("routes: ", rs.size(), " -> ", out)
	quit()
