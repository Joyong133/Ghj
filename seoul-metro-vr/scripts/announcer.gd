extends Node
class_name Announcer
## 차내 안내방송 (음성). main.gd 가 운행 상황에 맞춰 아래 함수를 부른다.
## 자막은 main.gd 의 say() 가 따로 띄우므로, 여기서는 소리만 책임진다.
##
## line: 1, 2, MetroConst.LINE_SUIN_BUNDANG(100)
## st:   MetroData 역 사전 {ko, en, no, type, tr(환승 배열), kind}

var enabled := true


func setup(_line: int) -> void:
	pass


## 출발 직후: "이번 역은 ○○, ○○역입니다. 내리실 문은 ○쪽입니다. (환승 안내)" + 영어
func next_stop(_line: int, _st: Dictionary, _door_right: bool, _terminal: bool) -> void:
	pass


## 도착 직전 (약 380m 전)
func arriving(_line: int, _st: Dictionary, _door_right: bool, _terminal: bool) -> void:
	pass


## 출입문 닫힘
func doors_closing() -> void:
	pass


## 종착역 도착 후
func terminal_arrived(_line: int, _st: Dictionary) -> void:
	pass


## 회차 후 새 행선 안내 (dest_text 예: "인천행", "외선순환")
func turnaround(_line: int, _dest_text: String) -> void:
	pass


func stop() -> void:
	pass
