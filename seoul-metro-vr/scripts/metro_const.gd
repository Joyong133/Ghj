class_name MetroConst
## 열차/승강장 치수와 색상. blender/build_models.py 의 치수와 맞춰야 한다.

const CAR_SPACING := 20.0          # 객차 중심 간격 (차체 19.5m + 연결부)
const NUM_CARS := 10               # 10량 편성
const PLAYER_CAR := 4              # 플레이어가 타는 객차 (0 = 맨 앞)
const CAR_HALF_LEN := 9.75
const INNER_HALF_W := 1.45
const OUTER_HALF_W := 1.56
const LEAF_X := 1.505
const DOOR_W := 1.3
## Godot 좌표 기준 출입문 중심 z (Blender y 를 뒤집은 값)
const DOOR_Z := [7.5, 2.5, -2.5, -7.5]
const RAIL_TOP := -1.135
const GAUGE := 1.435

## 열차 중심 z. 객차 i 의 중심 = (i - PLAYER_CAR) * CAR_SPACING, 진행 방향은 -Z.
const TRAIN_CENTER_Z := ((0 - PLAYER_CAR) + (NUM_CARS - 1 - PLAYER_CAR)) * 0.5 * CAR_SPACING
const PLATFORM_LEN := 210.0
const PLATFORM_EDGE_X := 1.66

const LINE_COLORS := {
	1: Color("0052A4"),
	2: Color("00A84D"),
}

## 환승 노선 표시 색
const TRANSFER_COLORS := {
	"1": Color("0052A4"), "2": Color("00A84D"), "3": Color("EF7C1C"), "4": Color("00A5DE"),
	"5": Color("996CAC"), "6": Color("CD7C2F"), "7": Color("747F00"), "8": Color("E6186C"),
	"9": Color("BDB092"), "경의중앙": Color("77C4A3"), "수인분당": Color("F5A200"),
	"신분당": Color("D4003B"), "공항": Color("0090D2"), "우이신설": Color("B0CE18"),
	"신림": Color("6789CA"), "의정부": Color("FDA600"), "인천1": Color("7CA8D5"),
	"인천2": Color("ED8B00"), "KTX": Color("1E3A6E"), "서해": Color("8FC31F"),
	"GTX-A": Color("9A6292"), "경춘": Color("0C8E72"),
}

static func car_center_z(i: int) -> float:
	return (i - PLAYER_CAR) * CAR_SPACING
