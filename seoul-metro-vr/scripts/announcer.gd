extends Node
class_name Announcer
## 차내 안내방송 (음성). main.gd 가 운행 상황에 맞춰 아래 함수를 부른다.
## 자막은 main.gd 의 say() 가 따로 띄우므로, 여기서는 소리만 책임진다.
##
## 음성 파일은 tools/gen_voice.py 로 미리 합성해 둔다:
##   res://assets/voice/<노선>/<md5(역명)[:10]>_<종류>.ogg
##   종류: next_ko, next_en (이번 역은...), last_ko, last_en (종착역), arr_ko (잠시 후 도착)
##   res://assets/voice/<노선>/dest_<md5(행선)>.ogg, res://assets/voice/common/*.ogg
##
## line: 1, 2, MetroConst.LINE_SUIN_BUNDANG(100)
## st:   MetroData 역 사전 {ko, en, no, type, tr(환승 배열), kind}

const VOICE_DIR := "res://assets/voice/"

var enabled := true
var player: AudioStreamPlayer
var queue: Array = []            # AudioStream 또는 float(쉬는 시간, 초)
var _wait := 0.0
var _line := 2
var chime_next: AudioStreamWAV
var chime_transfer: AudioStreamWAV
var chime_arrive: AudioStreamWAV
var chime_korail: AudioStreamWAV


func _ready() -> void:
	player = AudioStreamPlayer.new()
	player.volume_db = -1.0
	add_child(player)
	player.finished.connect(_next)
	# 차임은 코드로 합성 (실제 음원을 쓰지 않음)
	# 일반역: 부드러운 2음 차임
	chime_next = AudioSynth._melody([[0.0, 783.99, 1.4, 0.22], [0.36, 659.26, 1.6, 0.22]], 1.9)
	# 환승역: 국악풍 5음 음계의 짧은 선율 (원곡 아님)
	chime_transfer = AudioSynth._melody([
		[0.0, 587.33, 0.9, 0.20], [0.22, 659.26, 0.9, 0.20], [0.44, 783.99, 0.9, 0.20],
		[0.70, 880.0, 1.0, 0.22], [1.00, 783.99, 1.3, 0.20], [1.30, 659.26, 1.6, 0.18]], 2.6)
	# 도착 직전: 짧은 상승 3음
	chime_arrive = AudioSynth._melody([[0.0, 659.26, 1.0, 0.20], [0.2, 830.61, 1.0, 0.20], [0.4, 987.77, 1.4, 0.22]], 1.7)
	# 코레일(1호선·수인분당선) 계열: 하강 3음
	chime_korail = AudioSynth._melody([[0.0, 1046.5, 1.0, 0.18], [0.28, 880.0, 1.0, 0.18], [0.56, 698.46, 1.5, 0.20]], 2.0)


func setup(line: int) -> void:
	_line = line
	stop()


func _path(line: int, ko: String, kind: String) -> String:
	return VOICE_DIR + "%d/%s_%s.ogg" % [line, ko.md5_text().substr(0, 10), kind]


func _clip(path: String) -> AudioStream:
	if ResourceLoader.exists(path):
		return load(path) as AudioStream
	return null


func _play(items: Array) -> void:
	if not enabled:
		return
	stop()
	for it in items:
		if it == null:
			continue
		queue.append(it)
	_next()


func _next() -> void:
	while not queue.is_empty():
		var it: Variant = queue.pop_front()
		if it is float:
			_wait = it
			return
		if it is AudioStream:
			player.stream = it
			player.play()
			return


func _process(delta: float) -> void:
	if _wait > 0.0:
		_wait -= delta
		if _wait <= 0.0:
			_wait = 0.0
			_next()


func stop() -> void:
	queue.clear()
	_wait = 0.0
	if player and player.playing:
		player.stop()


func _transfers(line: int, st: Dictionary) -> bool:
	for t in st["tr"]:
		if str(t) != str(line):
			return true
	return false


## 출발 직후: "이번 역은 ○○, ○○역입니다. 내리실 문은 ○쪽입니다. (환승 안내)" + 영어
func next_stop(line: int, st: Dictionary, _door_right: bool, terminal: bool) -> void:
	var chime: AudioStream = chime_korail if line != 2 else chime_next
	if _transfers(line, st):
		chime = chime_transfer
	var ko: AudioStream = null
	var en: AudioStream = null
	if terminal:
		ko = _clip(_path(line, st["ko"], "last_ko"))
		en = _clip(_path(line, st["ko"], "last_en"))
	if ko == null:
		ko = _clip(_path(line, st["ko"], "next_ko"))
	if en == null:
		en = _clip(_path(line, st["ko"], "next_en"))
	_play([1.2, chime, 0.35, ko, 0.7, en])


## 도착 직전 (약 380m 전)
func arriving(line: int, st: Dictionary, _door_right: bool, _terminal: bool) -> void:
	_play([chime_arrive, 0.25, _clip(_path(line, st["ko"], "arr_ko"))])


## 출입문 닫힘
func doors_closing() -> void:
	_play([_clip(VOICE_DIR + "common/door_close.ogg")])


## 종착역 도착 후
func terminal_arrived(_line_id: int, _st: Dictionary) -> void:
	_play([2.0, _clip(VOICE_DIR + "common/terminal_ko.ogg"), 0.6, _clip(VOICE_DIR + "common/terminal_en.ogg")])


## 회차 후 새 행선 안내 (dest_text 예: "인천행", "외선순환")
func turnaround(line: int, dest_text: String) -> void:
	_play([0.8, chime_korail if line != 2 else chime_next, 0.3,
		_clip(VOICE_DIR + "%d/dest_%s.ogg" % [line, dest_text.md5_text().substr(0, 10)])])
