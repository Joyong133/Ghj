extends Node3D
class_name WorldEnv
## 하늘, 햇빛, 주변광, 안개. 지하/지상 전환과 시간대(실제 시각)에 따른 하늘을 담당한다.

var env: WorldEnvironment
var sun: DirectionalLight3D
var _underground := false
var _applied := false


func _ready() -> void:
	env = WorldEnvironment.new()
	var e := Environment.new()
	var sky := Sky.new()
	var sm := ProceduralSkyMaterial.new()
	sky.sky_material = sm
	e.sky = sky
	e.background_mode = Environment.BG_SKY
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color(0.8, 0.8, 0.82)
	e.ambient_light_energy = 0.5
	e.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	e.fog_enabled = false
	env.environment = e
	add_child(env)
	sun = DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-50, -30, 0)
	sun.shadow_enabled = false
	add_child(sun)
	apply_daylight()


func apply_daylight() -> void:
	var t := Time.get_datetime_dict_from_system()
	var h: float = t["hour"] + t["minute"] / 60.0
	var day := clampf(sin((h - 6.0) / 12.0 * PI), 0.0, 1.0)
	var sm := env.environment.sky.sky_material as ProceduralSkyMaterial
	sm.sky_top_color = Color(0.03, 0.04, 0.10).lerp(Color(0.30, 0.52, 0.85), day)
	sm.sky_horizon_color = Color(0.10, 0.10, 0.16).lerp(Color(0.72, 0.80, 0.90), day)
	sm.ground_horizon_color = sm.sky_horizon_color
	sm.ground_bottom_color = Color(0.1, 0.1, 0.1)
	sun.light_energy = 0.15 + day * 1.0
	sun.rotation_degrees = Vector3(-10.0 - day * 55.0, -30, 0)


## 플레이어가 있는 곳이 지하(터널/지하역)인지
func set_underground(u: bool) -> void:
	if u == _underground and _applied:
		return
	_applied = true
	_underground = u
	var e := env.environment
	if u:
		e.background_mode = Environment.BG_COLOR
		e.background_color = Color(0.01, 0.01, 0.01)
		e.ambient_light_color = Color(0.85, 0.85, 0.86)
		e.ambient_light_energy = 0.5
		sun.visible = false
	else:
		e.background_mode = Environment.BG_SKY
		e.ambient_light_color = Color(0.75, 0.78, 0.85)
		e.ambient_light_energy = 0.45
		sun.visible = true
		apply_daylight()
