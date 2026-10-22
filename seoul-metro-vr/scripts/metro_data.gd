class_name MetroData
## 서울 지하철 1·2호선, 수인분당선 역 데이터.
##
## 역 정보: [영문명, 역번호, 구조, 환승노선]
##   구조  U = 지하역, E = 고가역, G = 지상역
## 역간 거리(km)는 공개 자료를 기억에 의존해 정리한 근사값이며,
## 운행 시간은 이 거리로부터 실제 열차의 가감속/최고속도 모델로 계산한다.

const L1 := {
	"연천": ["Yeoncheon", "", "G", ""],
	"전곡": ["Jeongok", "", "G", ""],
	"청산": ["Cheongsan", "", "G", ""],
	"소요산": ["Soyosan", "100", "G", ""],
	"동두천": ["Dongducheon", "101", "G", ""],
	"보산": ["Bosan", "102", "G", ""],
	"동두천중앙": ["Dongducheon Jungang", "103", "G", ""],
	"지행": ["Jihaeng", "104", "G", ""],
	"덕정": ["Deokjeong", "105", "G", ""],
	"덕계": ["Deokgye", "106", "G", ""],
	"양주": ["Yangju", "107", "G", ""],
	"녹양": ["Nogyang", "108", "G", ""],
	"가능": ["Ganeung", "109", "G", ""],
	"의정부": ["Uijeongbu", "110", "G", "의정부"],
	"회룡": ["Hoeryong", "111", "G", "의정부"],
	"망월사": ["Mangwolsa", "112", "G", ""],
	"도봉산": ["Dobongsan", "113", "G", "7"],
	"도봉": ["Dobong", "114", "G", ""],
	"방학": ["Banghak", "115", "G", ""],
	"창동": ["Chang-dong", "116", "E", "4"],
	"녹천": ["Nokcheon", "117", "G", ""],
	"월계": ["Wolgye", "118", "G", ""],
	"광운대": ["Kwangwoon Univ.", "119", "G", ""],
	"석계": ["Seokgye", "120", "G", "6"],
	"신이문": ["Sinimun", "121", "G", ""],
	"외대앞": ["Hankuk Univ. of Foreign Studies", "122", "G", ""],
	"회기": ["Hoegi", "123", "G", "경의중앙,경춘"],
	"청량리": ["Cheongnyangni", "124", "U", "경의중앙,수인분당,경춘,KTX"],
	"제기동": ["Jegi-dong", "125", "U", ""],
	"신설동": ["Sinseol-dong", "126", "U", "2,우이신설"],
	"동묘앞": ["Dongmyo", "127", "U", "6"],
	"동대문": ["Dongdaemun", "128", "U", "4"],
	"종로5가": ["Jongno 5(o)-ga", "129", "U", ""],
	"종로3가": ["Jongno 3(sam)-ga", "130", "U", "3,5"],
	"종각": ["Jonggak", "131", "U", ""],
	"시청": ["City Hall", "132", "U", "2"],
	"서울역": ["Seoul Station", "133", "U", "4,공항,경의중앙,KTX"],
	"남영": ["Namyeong", "134", "G", ""],
	"용산": ["Yongsan", "135", "G", "경의중앙,KTX"],
	"노량진": ["Noryangjin", "136", "G", "9"],
	"대방": ["Daebang", "137", "G", "신림"],
	"신길": ["Singil", "138", "G", "5"],
	"영등포": ["Yeongdeungpo", "139", "G", ""],
	"신도림": ["Sindorim", "140", "G", "2"],
	"구로": ["Guro", "141", "G", ""],
	"구일": ["Guil", "142", "G", ""],
	"개봉": ["Gaebong", "143", "G", ""],
	"오류동": ["Oryu-dong", "144", "G", ""],
	"온수": ["Onsu", "145", "G", "7"],
	"역곡": ["Yeokgok", "146", "G", ""],
	"소사": ["Sosa", "147", "G", "서해"],
	"부천": ["Bucheon", "148", "G", ""],
	"중동": ["Jung-dong", "149", "G", ""],
	"송내": ["Songnae", "150", "G", ""],
	"부개": ["Bugae", "151", "G", ""],
	"부평": ["Bupyeong", "152", "G", "인천1"],
	"백운": ["Baegun", "153", "G", ""],
	"동암": ["Dongam", "154", "G", ""],
	"간석": ["Ganseok", "155", "G", ""],
	"주안": ["Juan", "156", "G", "인천2"],
	"도화": ["Dohwa", "157", "G", ""],
	"제물포": ["Jemulpo", "158", "G", ""],
	"도원": ["Dowon", "159", "G", ""],
	"동인천": ["Dongincheon", "160", "G", ""],
	"인천": ["Incheon", "161", "G", "수인분당"],
	"가산디지털단지": ["Gasan Digital Complex", "P142", "G", "7"],
	"독산": ["Doksan", "P143", "G", ""],
	"금천구청": ["Geumcheon-gu Office", "P144", "G", ""],
	"광명": ["Gwangmyeong", "P144-1", "U", "KTX"],
	"석수": ["Seoksu", "P145", "G", ""],
	"관악": ["Gwanak", "P146", "G", ""],
	"안양": ["Anyang", "P147", "G", ""],
	"명학": ["Myeonghak", "P148", "G", ""],
	"금정": ["Geumjeong", "P149", "G", "4"],
	"군포": ["Gunpo", "P150", "G", ""],
	"당정": ["Dangjeong", "P151", "G", ""],
	"의왕": ["Uiwang", "P152", "G", ""],
	"성균관대": ["Sungkyunkwan Univ.", "P153", "G", ""],
	"화서": ["Hwaseo", "P154", "G", ""],
	"수원": ["Suwon", "P155", "G", "수인분당,KTX"],
	"세류": ["Seryu", "P156", "G", ""],
	"병점": ["Byeongjeom", "P157", "G", ""],
	"서동탄": ["Seodongtan", "P157-1", "G", ""],
	"세마": ["Sema", "P158", "G", ""],
	"오산대": ["Osan College", "P159", "G", ""],
	"오산": ["Osan", "P160", "G", ""],
	"진위": ["Jinwi", "P161", "G", ""],
	"송탄": ["Songtan", "P162", "G", ""],
	"서정리": ["Seojeong-ri", "P163", "G", ""],
	"평택지제": ["Pyeongtaek Jije", "P164", "G", "KTX"],
	"평택": ["Pyeongtaek", "P165", "G", ""],
	"성환": ["Seonghwan", "P166", "G", ""],
	"직산": ["Jiksan", "P167", "G", ""],
	"두정": ["Dujeong", "P168", "G", ""],
	"천안": ["Cheonan", "P169", "G", ""],
	"봉명": ["Bongmyeong", "P170", "G", ""],
	"쌍용": ["Ssangyong (Nazarene Univ.)", "P171", "G", ""],
	"아산": ["Asan", "P172", "E", "KTX"],
	"탕정": ["Tangjeong", "", "G", ""],
	"배방": ["Baebang", "P173", "G", ""],
	"온양온천": ["Onyangoncheon", "P174", "G", ""],
	"신창": ["Sinchang", "P175", "G", ""],
}

const L2 := {
	"시청": ["City Hall", "201", "U", "1"],
	"을지로입구": ["Euljiro 1(il)-ga", "202", "U", ""],
	"을지로3가": ["Euljiro 3(sam)-ga", "203", "U", "3"],
	"을지로4가": ["Euljiro 4(sa)-ga", "204", "U", "5"],
	"동대문역사문화공원": ["Dongdaemun History & Culture Park", "205", "U", "4,5"],
	"신당": ["Sindang", "206", "U", "6"],
	"상왕십리": ["Sangwangsimni", "207", "U", ""],
	"왕십리": ["Wangsimni", "208", "U", "5,경의중앙,수인분당"],
	"한양대": ["Hanyang Univ.", "209", "U", ""],
	"뚝섬": ["Ttukseom", "210", "E", ""],
	"성수": ["Seongsu", "211", "E", ""],
	"용답": ["Yongdap", "211-1", "E", ""],
	"신답": ["Sindap", "211-2", "E", ""],
	"용두": ["Yongdu", "211-3", "U", ""],
	"신설동": ["Sinseol-dong", "211-4", "U", "1,우이신설"],
	"건대입구": ["Konkuk Univ.", "212", "E", "7"],
	"구의": ["Guui", "213", "E", ""],
	"강변": ["Gangbyeon", "214", "E", ""],
	"잠실나루": ["Jamsillaru", "215", "E", ""],
	"잠실": ["Jamsil", "216", "U", "8"],
	"잠실새내": ["Jamsilsaenae", "217", "U", ""],
	"종합운동장": ["Sports Complex", "218", "U", "9"],
	"삼성": ["Samseong", "219", "U", ""],
	"선릉": ["Seolleung", "220", "U", "수인분당"],
	"역삼": ["Yeoksam", "221", "U", ""],
	"강남": ["Gangnam", "222", "U", "신분당"],
	"교대": ["Seoul Nat'l Univ. of Education", "223", "U", "3"],
	"서초": ["Seocho", "224", "U", ""],
	"방배": ["Bangbae", "225", "U", ""],
	"사당": ["Sadang", "226", "U", "4"],
	"낙성대": ["Nakseongdae", "227", "U", ""],
	"서울대입구": ["Seoul Nat'l Univ.", "228", "U", ""],
	"봉천": ["Bongcheon", "229", "U", ""],
	"신림": ["Sillim", "230", "U", "신림"],
	"신대방": ["Sindaebang", "231", "E", ""],
	"구로디지털단지": ["Guro Digital Complex", "232", "E", ""],
	"대림": ["Daerim", "233", "E", "7"],
	"신도림": ["Sindorim", "234", "E", "1"],
	"도림천": ["Dorimcheon", "234-1", "E", ""],
	"양천구청": ["Yangcheon-gu Office", "234-2", "U", ""],
	"신정네거리": ["Sinjeongnegeori", "234-3", "U", ""],
	"까치산": ["Kkachisan", "234-4", "U", "5"],
	"문래": ["Mullae", "235", "U", ""],
	"영등포구청": ["Yeongdeungpo-gu Office", "236", "U", "5"],
	"당산": ["Dangsan", "237", "E", "9"],
	"합정": ["Hapjeong", "238", "U", "6"],
	"홍대입구": ["Hongik Univ.", "239", "U", "공항,경의중앙"],
	"신촌": ["Sinchon", "240", "U", ""],
	"이대": ["Ewha Womans Univ.", "241", "U", ""],
	"아현": ["Ahyeon", "242", "U", ""],
	"충정로": ["Chungjeongno", "243", "U", "5"],
}


## 수인분당선 (청량리 ↔ 인천). 역번호 K209~K271, 6량 편성.
const SB := {
	"청량리": ["Cheongnyangni", "K209", "U", "1,경의중앙,경춘,KTX"],
	"왕십리": ["Wangsimni", "K210", "U", "2,5,경의중앙"],
	"서울숲": ["Seoul Forest", "K211", "U", ""],
	"압구정로데오": ["Apgujeongrodeo", "K212", "U", ""],
	"강남구청": ["Gangnam-gu Office", "K213", "U", "7"],
	"선정릉": ["Seonjeongneung", "K214", "U", "9"],
	"선릉": ["Seolleung", "K215", "U", "2"],
	"한티": ["Hanti", "K216", "U", ""],
	"도곡": ["Dogok", "K217", "U", "3"],
	"구룡": ["Guryong", "K218", "U", ""],
	"개포동": ["Gaepo-dong", "K219", "U", ""],
	"대모산입구": ["Daemosan", "K220", "U", ""],
	"수서": ["Suseo", "K221", "U", "3,SRT,GTX-A"],
	"복정": ["Bokjeong", "K222", "U", "8"],
	"가천대": ["Gachon Univ.", "K223", "U", ""],
	"태평": ["Taepyeong", "K224", "U", ""],
	"모란": ["Moran", "K225", "U", "8"],
	"야탑": ["Yatap", "K226", "U", ""],
	"이매": ["Imae", "K227", "U", "경강"],
	"서현": ["Seohyeon", "K228", "U", ""],
	"수내": ["Sunae", "K229", "U", ""],
	"정자": ["Jeongja", "K230", "U", "신분당"],
	"미금": ["Migeum", "K231", "U", "신분당"],
	"오리": ["Ori", "K232", "U", ""],
	"죽전": ["Jukjeon", "K233", "E", ""],
	"보정": ["Bojeong", "K234", "E", ""],
	"구성": ["Guseong", "K235", "E", ""],
	"신갈": ["Singal", "K236", "U", ""],
	"기흥": ["Giheung", "K237", "U", "용인"],
	"상갈": ["Sanggal", "K238", "U", ""],
	"청명": ["Cheongmyeong", "K239", "U", ""],
	"영통": ["Yeongtong", "K240", "U", ""],
	"망포": ["Mangpo", "K241", "U", ""],
	"매탄권선": ["Maetan-Gwonseon", "K242", "U", ""],
	"수원시청": ["Suwon City Hall", "K243", "U", ""],
	"매교": ["Maegyo", "K244", "U", ""],
	"수원": ["Suwon", "K245", "U", "1,KTX"],
	"고색": ["Gosaek", "K246", "U", ""],
	"오목천": ["Omokcheon", "K247", "E", ""],
	"어천": ["Eocheon", "K248", "E", ""],
	"야목": ["Yamok", "K249", "G", ""],
	"사리": ["Sari", "K250", "E", ""],
	"한대앞": ["Hanyang Univ. at Ansan", "K251", "G", "4"],
	"중앙": ["Jungang", "K252", "E", "4"],
	"고잔": ["Gojan", "K253", "E", "4"],
	"초지": ["Choji", "K254", "G", "4,서해"],
	"안산": ["Ansan", "K255", "G", "4"],
	"신길온천": ["Singiloncheon", "K256", "G", "4"],
	"정왕": ["Jeongwang", "K257", "G", "4"],
	"오이도": ["Oido", "K258", "G", "4"],
	"달월": ["Dalwol", "K259", "E", ""],
	"월곶": ["Wolgot", "K260", "E", ""],
	"소래포구": ["Soraepogu", "K261", "E", ""],
	"인천논현": ["Incheon Nonhyeon", "K262", "U", ""],
	"호구포": ["Hogupo", "K263", "U", ""],
	"남동인더스파크": ["Namdong Industrial Park", "K264", "U", ""],
	"원인재": ["Woninjae", "K265", "U", "인천1"],
	"연수": ["Yeonsu", "K266", "U", ""],
	"송도": ["Songdo", "K267", "U", ""],
	"인하대": ["Inha Univ.", "K268", "U", ""],
	"숭의": ["Sungui", "K269", "U", ""],
	"신포": ["Sinpo", "K270", "U", ""],
	"인천": ["Incheon", "K271", "U", "1"],
}

# ------------------------------------------------------------------ 1호선 구간
const GYEONGWON := ["연천", "전곡", "청산", "소요산", "동두천", "보산", "동두천중앙", "지행", "덕정", "덕계",
	"양주", "녹양", "가능", "의정부", "회룡", "망월사", "도봉산", "도봉", "방학", "창동", "녹천", "월계",
	"광운대", "석계", "신이문", "외대앞", "회기", "청량리"]
const GYEONGWON_KM := [7.6, 6.3, 4.6, 2.5, 1.4, 1.4, 1.1, 3.0, 2.2, 3.6, 2.6, 1.2, 1.0, 1.4, 1.4, 1.5,
	1.2, 1.2, 1.6, 1.4, 1.2, 1.4, 1.0, 1.4, 0.8, 0.8, 1.4]

const SEOUL_METRO := ["청량리", "제기동", "신설동", "동묘앞", "동대문", "종로5가", "종로3가", "종각", "시청", "서울역"]
const SEOUL_METRO_KM := [1.0, 0.9, 0.7, 0.6, 0.8, 0.9, 0.8, 1.0, 1.1]

const GYEONGBU_N := ["서울역", "남영", "용산", "노량진", "대방", "신길", "영등포", "신도림", "구로"]
const GYEONGBU_N_KM := [1.7, 1.5, 2.8, 1.5, 0.8, 1.0, 1.6, 1.1]

const GYEONGBU_S := ["구로", "가산디지털단지", "독산", "금천구청", "석수", "관악", "안양", "명학", "금정", "군포",
	"당정", "의왕", "성균관대", "화서", "수원", "세류", "병점", "세마", "오산대", "오산", "진위", "송탄",
	"서정리", "평택지제", "평택", "성환", "직산", "두정", "천안", "봉명", "쌍용", "아산", "탕정", "배방",
	"온양온천", "신창"]
const GYEONGBU_S_KM := [2.3, 1.4, 1.6, 2.2, 1.4, 2.3, 1.9, 2.2, 2.1, 1.4, 2.6, 2.8, 2.9, 2.0, 2.2, 4.5,
	2.8, 2.5, 1.6, 4.5, 3.6, 2.1, 4.0, 2.6, 7.4, 4.8, 4.6, 2.4, 1.4, 1.5, 4.4, 1.8, 1.7, 5.2, 6.6]

const GYEONGIN := ["구로", "구일", "개봉", "오류동", "온수", "역곡", "소사", "부천", "중동", "송내", "부개",
	"부평", "백운", "동암", "간석", "주안", "도화", "제물포", "도원", "동인천", "인천"]
const GYEONGIN_KM := [1.4, 1.2, 1.2, 1.3, 1.3, 1.8, 1.6, 1.3, 1.3, 1.3, 1.6, 1.4, 1.2, 1.2, 1.1, 1.0, 1.0,
	1.4, 1.2, 2.0]

# ------------------------------------------------------------------ 2호선 구간
const L2_LOOP := ["시청", "을지로입구", "을지로3가", "을지로4가", "동대문역사문화공원", "신당", "상왕십리",
	"왕십리", "한양대", "뚝섬", "성수", "건대입구", "구의", "강변", "잠실나루", "잠실", "잠실새내",
	"종합운동장", "삼성", "선릉", "역삼", "강남", "교대", "서초", "방배", "사당", "낙성대", "서울대입구",
	"봉천", "신림", "신대방", "구로디지털단지", "대림", "신도림", "문래", "영등포구청", "당산", "합정",
	"홍대입구", "신촌", "이대", "아현", "충정로"]
## 마지막 값은 충정로 → 시청
const L2_LOOP_KM := [0.7, 0.8, 0.6, 1.0, 0.9, 0.9, 0.8, 1.0, 1.1, 0.8, 1.2, 1.0, 0.8, 1.4, 1.2, 1.1, 0.9,
	1.0, 1.0, 1.0, 0.8, 1.2, 0.7, 1.0, 1.6, 1.7, 1.0, 1.0, 1.1, 1.8, 1.1, 1.1, 1.8, 1.2, 0.9, 1.1, 1.6,
	1.3, 1.3, 0.8, 0.9, 0.8, 1.1]
const L2_SEONGSU := ["성수", "용답", "신답", "용두", "신설동"]
const L2_SEONGSU_KM := [2.3, 1.0, 0.9, 1.2]
const L2_SINJEONG := ["신도림", "도림천", "양천구청", "신정네거리", "까치산"]
const L2_SINJEONG_KM := [1.0, 1.7, 1.6, 1.7]

# ------------------------------------------------------------------ 수인분당선 구간
const SUIN_BUNDANG := ["청량리", "왕십리", "서울숲", "압구정로데오", "강남구청", "선정릉", "선릉", "한티", "도곡",
	"구룡", "개포동", "대모산입구", "수서", "복정", "가천대", "태평", "모란", "야탑", "이매", "서현", "수내",
	"정자", "미금", "오리", "죽전", "보정", "구성", "신갈", "기흥", "상갈", "청명", "영통", "망포", "매탄권선",
	"수원시청", "매교", "수원", "고색", "오목천", "어천", "야목", "사리", "한대앞", "중앙", "고잔", "초지",
	"안산", "신길온천", "정왕", "오이도", "달월", "월곶", "소래포구", "인천논현", "호구포", "남동인더스파크",
	"원인재", "연수", "송도", "인하대", "숭의", "신포", "인천"]
const SUIN_BUNDANG_KM := [2.3, 1.6, 2.3, 1.4, 1.0, 0.9, 0.8, 0.8, 0.7, 0.7, 0.8, 1.4, 2.6, 1.5, 1.0, 1.1,
	1.9, 1.9, 1.4, 1.2, 1.4, 1.6, 1.2, 1.8, 1.2, 2.0, 1.9, 1.6, 2.3, 1.6, 1.5, 1.0, 1.5, 1.2, 1.0, 1.3,
	2.8, 1.9, 3.6, 3.6, 4.7, 2.1, 1.6, 1.4, 1.5, 1.8, 2.0, 1.9, 1.6, 2.8, 1.1, 1.1, 1.4, 1.2, 1.5, 1.2,
	1.0, 1.3, 1.6, 1.6, 1.3, 1.0]

## 한강 철교 구간
const BRIDGES := [["용산", "노량진", "한강철교"], ["강변", "잠실나루", "잠실철교"], ["당산", "합정", "당산철교"]]

## 노선별 운행 모델 (최고 운행속도 km/h, 가속 m/s², 감속 m/s², 거리 보정)
const LINE_PARAMS := {
	1: {"v_under": 60.0, "v_ground": 78.0, "acc": 0.83, "dec": 0.97, "dist_scale": 1.0, "dwell": 30.0},
	2: {"v_under": 60.0, "v_ground": 60.0, "acc": 0.83, "dec": 0.97, "dist_scale": 1.06, "dwell": 30.0},
	100: {"v_under": 68.0, "v_ground": 75.0, "acc": 0.83, "dec": 0.97, "dist_scale": 1.085, "dwell": 30.0},
}


static func _join(parts: Array, kms: Array) -> Dictionary:
	# parts 의 각 구간을 이어 붙인다 (경계 역은 한 번만).
	var names: Array = []
	var dist: Array = []
	for p in range(parts.size()):
		var seq: Array = parts[p]
		var km: Array = kms[p]
		var start := 0 if names.is_empty() else 1
		for i in range(start, seq.size()):
			names.append(seq[i])
			if i > 0:
				dist.append(km[i - 1])
	return {"names": names, "km": dist}


static func _rev(a: Array) -> Array:
	var r := a.duplicate()
	r.reverse()
	return r


static func _make_route(id: String, line: int, title: String, j: Dictionary, loop: bool) -> Dictionary:
	var table: Dictionary = L1 if line == 1 else (L2 if line == 2 else SB)
	var stations: Array = []
	for n in j["names"]:
		var info: Array = table[n]
		var tr: Array = []
		if info[3] != "":
			tr = Array(info[3].split(","))
		stations.append({
			"ko": n, "en": info[0], "no": info[1], "type": info[2], "tr": tr,
			"kind": platform_kind(line, n),
		})
	var p: Dictionary = LINE_PARAMS[line]
	var dist: Array = []
	for km in j["km"]:
		dist.append(km * 1000.0 * p["dist_scale"])
	var bridges := {}
	var segs := dist.size()
	for i in range(segs):
		var a: String = stations[i]["ko"]
		var b: String = stations[(i + 1) % stations.size()]["ko"]
		for br in BRIDGES:
			if (br[0] == a and br[1] == b) or (br[0] == b and br[1] == a):
				bridges[i] = br[2]
	return {
		"id": id, "line": line, "title": title, "stations": stations, "dist": dist,
		"loop": loop, "bridges": bridges,
	}


## 승강장 형식. 정확한 역별 자료가 없어 역 이름으로 결정적으로 고른다.
## I = 섬식(내리는 문 오른쪽), S = 상대식(내리는 문 왼쪽) — 좌측통행 기준.
static func platform_kind(line: int, name: String) -> String:
	var h := 0
	for c in (name + str(line)).to_utf8_buffer():
		h = (h * 31 + c) % 1000003
	return "I" if h % 2 == 0 else "S"


static func routes() -> Array:
	var r: Array = []
	r.append(_make_route("L2_LOOP", 2, "2호선 순환선 (시청 ↔ 시청)",
		{"names": L2_LOOP, "km": L2_LOOP_KM}, true))
	r.append(_make_route("L2_SEONGSU", 2, "2호선 성수지선 (성수 ↔ 신설동)",
		{"names": L2_SEONGSU, "km": L2_SEONGSU_KM}, false))
	r.append(_make_route("L2_SINJEONG", 2, "2호선 신정지선 (신도림 ↔ 까치산)",
		{"names": L2_SINJEONG, "km": L2_SINJEONG_KM}, false))
	r.append(_make_route("L1_GB", 1, "1호선 경부선 (연천 ↔ 신창)",
		_join([GYEONGWON, SEOUL_METRO, GYEONGBU_N, GYEONGBU_S],
			[GYEONGWON_KM, SEOUL_METRO_KM, GYEONGBU_N_KM, GYEONGBU_S_KM]), false))
	r.append(_make_route("L1_GI", 1, "1호선 경인선 (연천 ↔ 인천)",
		_join([GYEONGWON, SEOUL_METRO, GYEONGBU_N, GYEONGIN],
			[GYEONGWON_KM, SEOUL_METRO_KM, GYEONGBU_N_KM, GYEONGIN_KM]), false))
	r.append(_make_route("L1_GM", 1, "1호선 광명셔틀 (영등포 ↔ 광명)",
		_join([["영등포", "신도림", "구로"], ["구로", "가산디지털단지", "독산", "금천구청"], ["금천구청", "광명"]],
			[[1.6, 1.1], [2.3, 1.4, 1.6], [4.7]]), false))
	r.append(_make_route("L1_SDT", 1, "1호선 서동탄행 (구로 ↔ 서동탄)",
		_join([GYEONGBU_S.slice(0, 17), ["병점", "서동탄"]], [GYEONGBU_S_KM.slice(0, 16), [2.2]]), false))
	r.append(_make_route("SB", MetroConst.LINE_SUIN_BUNDANG, "수인분당선 (청량리 ↔ 인천)",
		{"names": SUIN_BUNDANG, "km": SUIN_BUNDANG_KM}, false))
	return r


## 구간 주행 시간(초) — 사다리꼴 속도 모델 + 운전 여유 8%
static func run_time(dist_m: float, vmax_kmh: float, acc: float, dec: float) -> float:
	var v := vmax_kmh / 3.6
	var d_ramp := v * v / (2.0 * acc) + v * v / (2.0 * dec)
	var t: float
	if dist_m < d_ramp:
		v = sqrt(2.0 * dist_m / (1.0 / acc + 1.0 / dec))
		t = v / acc + v / dec
	else:
		t = v / acc + v / dec + (dist_m - d_ramp) / v
	return t * 1.08


static func segment_vmax(line: int, a: Dictionary, b: Dictionary) -> float:
	var p: Dictionary = LINE_PARAMS[line]
	if a["type"] == "U" and b["type"] == "U":
		return p["v_under"]
	return p["v_ground"]


static func dwell_time(line: int, st: Dictionary) -> float:
	var d: float = LINE_PARAMS[line]["dwell"]
	if st["tr"].size() >= 2:
		d += 10.0
	return d


static func transfer_text(tr: Array) -> String:
	var parts: Array = []
	for t in tr:
		parts.append(t + "호선" if t.is_valid_int() else t)
	return ", ".join(parts)
