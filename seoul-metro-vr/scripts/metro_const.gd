class_name MetroConst
## 열차/승강장 치수와 색상. blender/build_models.py 의 치수와 맞춰야 한다.

const CAR_SPACING := 20.0          # 객차 중심 간격 (차체 19.5m + 연결부)

## 노선 번호. 수인분당선은 숫자 노선이 아니므로 100 을 쓴다.
const LINE_SUIN_BUNDANG := 100

## 현재 노선의 편성 (set_line 으로 바꾼다)
static var num_cars := 10          # 1·2호선 10량, 수인분당선 6량
static var player_car := 4         # 플레이어가 타는 객차 (0 = 맨 앞). 이 객차의 중심이 z=0
static var train_center_z := 10.0  # 편성 전체의 중심 z
static var platform_len := 210.0   # 승강장 길이
const CAR_HALF_LEN := 9.75
const INNER_HALF_W := 1.45
const OUTER_HALF_W := 1.56
const LEAF_X := 1.505
const DOOR_W := 1.3
## Godot 좌표 기준 출입문 중심 z (Blender y 를 뒤집은 값)
const DOOR_Z := [7.5, 2.5, -2.5, -7.5]
const RAIL_TOP := -1.135
const GAUGE := 1.435

const PLATFORM_EDGE_X := 1.66

const LINE_COLORS := {
	1: Color("0052A4"),
	2: Color("00A84D"),
	100: Color("F5A200"),
}

const LINE_NAMES := {
	1: "1호선",
	2: "2호선",
	100: "수인분당선",
}

const LINE_NAMES_EN := {
	1: "Line 1",
	2: "Line 2",
	100: "Suin-Bundang Line",
}

## 환승 노선 표시 색
const TRANSFER_COLORS := {
	"1": Color("0052A4"), "2": Color("00A84D"), "3": Color("EF7C1C"), "4": Color("00A5DE"),
	"5": Color("996CAC"), "6": Color("CD7C2F"), "7": Color("747F00"), "8": Color("E6186C"),
	"9": Color("BDB092"), "경의중앙": Color("77C4A3"), "수인분당": Color("F5A200"),
	"신분당": Color("D4003B"), "공항": Color("0090D2"), "우이신설": Color("B0CE18"),
	"신림": Color("6789CA"), "의정부": Color("FDA600"), "인천1": Color("7CA8D5"),
	"인천2": Color("ED8B00"), "KTX": Color("1E3A6E"), "서해": Color("8FC31F"),
	"GTX-A": Color("9A6292"), "경춘": Color("0C8E72"), "경강": Color("003DA5"),
	"용인": Color("509F22"), "SRT": Color("651C5C"),
}


## 노선에 맞춰 편성 길이와 승강장 길이를 정한다. 열차/역을 만들기 전에 호출.
## 객차 i 의 중심 = (i - player_car) * CAR_SPACING, 진행 방향은 -Z.
static func set_line(line: int) -> void:
	num_cars = 6 if line == LINE_SUIN_BUNDANG else 10
	player_car = 2 if num_cars == 6 else 4
	train_center_z = ((0 - player_car) + (num_cars - 1 - player_car)) * 0.5 * CAR_SPACING
	platform_len = num_cars * CAR_SPACING + 10.0


static func car_center_z(i: int) -> float:
	return (i - player_car) * CAR_SPACING


static func line_name(line: int) -> String:
	return LINE_NAMES.get(line, "%d호선" % line)
