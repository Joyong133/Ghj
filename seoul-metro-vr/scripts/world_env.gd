extends Node3D
class_name WorldEnv
## 하늘, 햇빛, 주변광, 연무(안개). 지하/지상 전환과 실제 시각에 따른 낮·밤 하늘을 담당한다.
## 하늘은 tools/gen_textures.py 가 그린 파노라마(구름, 북한산 같은 먼 능선, 흐린 도시 스카이라인).

const SKY_DAY := "res://assets/textures/env/sky_day.png"
const SKY_NIGHT := "res://assets/textures/env/sky_night.png"

var env: WorldEnvironment
var sun: DirectionalLight3D
var day := 1.0                   # 0 밤 ~ 1 낮
var _underground := false
var _applied := false
var _sky_mat: PanoramaSkyMaterial


func _ready() -> void:
	env = WorldEnvironment.new()
	var e := Environment.new()
	var sky := Sky.new()
	_sky_mat = PanoramaSkyMaterial.new()
	sky.sky_material = _sky_mat
	sky.radiance_size = Sky.RADIANCE_SIZE_64
	e.sky = sky
	e.background_mode = Environment.BG_SKY
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color(0.8, 0.8, 0.82)
	e.ambient_light_energy = 0.5
	e.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	e.tonemap_exposure = 1.0
	# 먼 곳이 하늘색 연무 속으로 사라지게 (갑자기 나타나는 건물 가리기)
	e.fog_enabled = true
	e.fog_light_color = Color(0.74, 0.80, 0.87)
	e.fog_density = 0.0016
	e.fog_sky_affect = 0.0
	e.fog_light_energy = 1.0
	env.environment = e
	add_child(env)
	sun = DirectionalLight3D.new()
	sun.shadow_enabled = false
	add_child(sun)
	apply_daylight()


func apply_daylight() -> void:
	var t := Time.get_datetime_dict_from_system()
	var h: float = t["hour"] + t["minute"] / 60.0
	day = clampf(sin((h - 6.0) / 12.0 * PI) * 1.6, 0.0, 1.0)
	_sky_mat.panorama = load(SKY_DAY if day > 0.25 else SKY_NIGHT) as Texture2D
	_sky_mat.energy_multiplier = lerpf(0.35, 1.0, day) if day > 0.25 else 1.0
	sun.light_energy = 0.12 + day * 1.05
	sun.light_color = Color(1.0, 0.86, 0.70).lerp(Color(1.0, 0.97, 0.92), day)
	# 파노라마 속 해 위치(u≈0.30, 고도 약 35°)와 맞춘다
	sun.rotation_degrees = Vector3(-8.0 - day * 30.0, 70.0, 0)
	if not _underground:
		var e := env.environment
		e.ambient_light_color = Color(0.20, 0.22, 0.32).lerp(Color(0.74, 0.79, 0.88), day)
		e.ambient_light_energy = 0.55
		e.fog_light_color = Color(0.10, 0.10, 0.14).lerp(Color(0.74, 0.80, 0.87), day)


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
		e.fog_enabled = false
		sun.visible = false
	else:
		e.background_mode = Environment.BG_SKY
		e.fog_enabled = true
		sun.visible = true
		apply_daylight()
