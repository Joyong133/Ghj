extends Node
class_name AudioSynth
## 소리를 코드로 합성한다 (외부 음원 없이): 도착 차임, 문 닫힘 경고음,
## 주행 소음(속도에 따라 변함), 인버터 소리, 레일 이음매 소리.

const RATE := 22050

var p_chime: AudioStreamPlayer
var p_door: AudioStreamPlayer
var p_rumble: AudioStreamPlayer
var p_motor: AudioStreamPlayer
var p_joint: AudioStreamPlayer
var s_arrive: AudioStreamWAV
var s_depart: AudioStreamWAV
var s_door_close: AudioStreamWAV
var s_door_open: AudioStreamWAV
var enabled := true


static func _wav(samples: PackedFloat32Array, loop := false) -> AudioStreamWAV:
	var data := PackedByteArray()
	data.resize(samples.size() * 2)
	for i in range(samples.size()):
		var v := int(clampf(samples[i], -1.0, 1.0) * 32000.0)
		data.encode_s16(i * 2, v)
	var w := AudioStreamWAV.new()
	w.format = AudioStreamWAV.FORMAT_16_BITS
	w.mix_rate = RATE
	w.stereo = false
	w.data = data
	if loop:
		w.loop_mode = AudioStreamWAV.LOOP_FORWARD
		w.loop_begin = 0
		w.loop_end = samples.size()
	return w


## 종소리 같은 음 (배음 + 감쇠)
static func _bell(out: PackedFloat32Array, start: float, freq: float, dur: float, amp: float) -> void:
	var i0 := int(start * RATE)
	var n := int(dur * RATE)
	for i in range(n):
		if i0 + i >= out.size():
			break
		var t := float(i) / RATE
		var env := exp(-t * 3.2) * minf(1.0, t * 200.0)
		var v := sin(TAU * freq * t) + 0.35 * sin(TAU * freq * 2.0 * t) + 0.12 * sin(TAU * freq * 3.01 * t)
		out[i0 + i] += v * env * amp


static func _melody(notes: Array, total: float) -> AudioStreamWAV:
	var out := PackedFloat32Array()
	out.resize(int(total * RATE))
	for nt in notes:
		_bell(out, nt[0], nt[1], nt[2], nt[3])
	return _wav(out)


func _ready() -> void:
	# 도착 안내 차임 (딩-동-댕 계열의 상승 음형)
	s_arrive = _melody([[0.0, 659.3, 1.2, 0.30], [0.28, 830.6, 1.2, 0.28], [0.56, 987.8, 1.6, 0.30]], 2.4)
	# 출발 차임
	s_depart = _melody([[0.0, 987.8, 1.0, 0.28], [0.25, 830.6, 1.0, 0.26], [0.5, 659.3, 1.5, 0.28]], 2.2)
	# 문 열림 '딩동'
	s_door_open = _melody([[0.0, 880.0, 0.9, 0.25], [0.35, 698.5, 1.2, 0.25]], 1.6)
	# 문 닫힘 경고 (삐-삐-삐)
	var dc := PackedFloat32Array()
	dc.resize(int(2.6 * RATE))
	for k in range(6):
		var i0 := int(k * 0.42 * RATE)
		for i in range(int(0.22 * RATE)):
			var t := float(i) / RATE
			dc[i0 + i] = 0.22 * sign(sin(TAU * 1250.0 * t)) * minf(1.0, t * 300.0) * minf(1.0, (0.22 - t) * 300.0)
	s_door_close = _wav(dc)

	# 주행 소음: 저역 통과된 잡음 루프
	var rn := PackedFloat32Array()
	rn.resize(RATE * 2)
	var rng := RandomNumberGenerator.new()
	rng.seed = 42
	var lp := 0.0
	var lp2 := 0.0
	for i in range(rn.size()):
		lp += (rng.randf_range(-1, 1) - lp) * 0.06
		lp2 += (lp - lp2) * 0.15
		rn[i] = lp2 * 2.2
	# 루프 이음새 부드럽게
	var fade := 2000
	for i in range(fade):
		var a := float(i) / fade
		rn[i] = rn[i] * a + rn[rn.size() - fade + i] * (1.0 - a)
	s_rumble_set(rn)

	# 인버터(VVVF) 소리: 기본음 + 배음 루프 (피치로 속도 표현)
	var mo := PackedFloat32Array()
	var period := 100            # 220.5 Hz
	mo.resize(period * 200)
	for i in range(mo.size()):
		var t := float(i) / RATE
		mo[i] = 0.25 * sin(TAU * 220.5 * t) + 0.12 * sin(TAU * 441.0 * t) + 0.06 * sin(TAU * 661.5 * t)
	p_motor = _player(_wav(mo, true), -40.0)

	# 레일 이음매 '덜컹'
	var jt := PackedFloat32Array()
	jt.resize(int(0.5 * RATE))
	for hit in [0.0, 0.11]:
		var i0 := int(hit * RATE)
		for i in range(int(0.15 * RATE)):
			var t := float(i) / RATE
			jt[i0 + i] += rng.randf_range(-1, 1) * exp(-t * 40.0) * 0.5 + sin(TAU * 90.0 * t) * exp(-t * 25.0) * 0.4
	p_joint = _player(_wav(jt), -8.0)

	p_chime = _player(s_arrive, -6.0)
	p_door = _player(s_door_close, -10.0)
	p_motor.play()
	p_rumble.play()


func s_rumble_set(rn: PackedFloat32Array) -> void:
	p_rumble = _player(_wav(rn, true), -40.0)


func _player(stream: AudioStream, db: float) -> AudioStreamPlayer:
	var p := AudioStreamPlayer.new()
	p.stream = stream
	p.volume_db = db
	add_child(p)
	return p


func play_arrive() -> void:
	if enabled:
		p_chime.stream = s_arrive
		p_chime.play()


func play_depart() -> void:
	if enabled:
		p_chime.stream = s_depart
		p_chime.play()


func play_door_open() -> void:
	if enabled:
		p_door.stream = s_door_open
		p_door.play()


func play_door_close() -> void:
	if enabled:
		p_door.stream = s_door_close
		p_door.play()


func play_joint() -> void:
	if enabled:
		p_joint.pitch_scale = randf_range(0.9, 1.1)
		p_joint.play()


## v = 속도(m/s), accel = 가속 중이면 +, 제동 중이면 -
func update_motion(v: float, accel: float, outdoor: bool) -> void:
	if not enabled:
		p_rumble.volume_db = -80.0
		p_motor.volume_db = -80.0
		return
	var k := clampf(v / 22.0, 0.0, 1.0)
	p_rumble.volume_db = lerpf(-38.0, -9.0 if not outdoor else -12.0, sqrt(k)) if v > 0.05 else -60.0
	p_rumble.pitch_scale = 0.7 + k * 0.8
	# 인버터 소리는 가감속 중에만 크게
	var drive := clampf(absf(accel) / 0.8, 0.0, 1.0)
	p_motor.volume_db = lerpf(-50.0, -20.0, drive) if v > 0.05 else -70.0
	p_motor.pitch_scale = clampf(0.6 + v * 0.18, 0.5, 4.0)
