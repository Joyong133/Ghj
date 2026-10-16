// ---------------------------------------------------------------------------
// 명소, 대학교, 교통 노선 데이터
// 좌표는 대략값이다. 주변 OSM 데이터가 들어오면 q의 이름과 일치하는 지점으로 자동 보정한다.
// ---------------------------------------------------------------------------
const REGION = { s: 34.98, w: 128.80, n: 35.72, e: 129.50 }; // 부산 + 울산
const KOREA = { s: 33.0, w: 124.5, n: 38.8, e: 131.0 }; // 먼 지형을 불러오는 범위 (KTX로 가는 도시 포함)
// 명소 목록의 지역 묶음
const CITY_GROUP = {
  부산: '부산', 울산: '울산', 서울: '수도권', 광명: '수도권', '천안·아산': '충청', 청주: '충청', 대전: '충청',
  김천: '대구·경북', 대구: '대구·경북', 경주: '대구·경북', 포항: '대구·경북', 영덕: '대구·경북', 울진: '대구·경북',
  삼척: '강원', 동해: '강원', 강릉: '강원',
};

const CATS = {
  beach: { name: '해변', color: '#3aa0d8' },
  sight: { name: '명소', color: '#ffb43a' },
  market: { name: '시장·거리', color: '#ff7a5a' },
  culture: { name: '문화', color: '#c88aff' },
  nature: { name: '공원·자연', color: '#5fd28a' },
  uni: { name: '대학교', color: '#7ab8ff' },
  transit: { name: '교통', color: '#e8eef4' },
  sport: { name: '스포츠', color: '#ffd84a' },
  industry: { name: '산업', color: '#a8b4c0' },
};

const PLACES = [
  // ---------------- 부산: 해운대·수영
  { id: 'haeundae', city: '부산', cat: 'beach', name: '해운대해수욕장', lat: 35.1587, lon: 129.1604, q: ['해운대해수욕장'], desc: '부산을 대표하는 해수욕장. 1.5km 남짓한 백사장을 따라 고층 빌딩이 늘어서 있다.' },
  { id: 'gwangalli', city: '부산', cat: 'beach', name: '광안리해수욕장', lat: 35.1532, lon: 129.1186, q: ['광안리해수욕장'], desc: '광안대교가 정면으로 보이는 해변. 밤이면 다리에 조명이 켜진다.' },
  { id: 'gwangan', city: '부산', cat: 'sight', name: '광안대교', lat: 35.1475, lon: 129.1300, q: ['광안대교'], desc: '수영구 남천동과 해운대구 우동을 잇는 2층 현수교. 길이는 약 7.4km이고 2003년에 개통했다.' },
  { id: 'lct', city: '부산', cat: 'sight', name: '해운대 엘시티', lat: 35.1608, lon: 129.1693, q: ['엘시티', 'LCT'], desc: '해운대해수욕장 동쪽 끝의 초고층 복합 건물. 랜드마크 타워 높이는 411m.' },
  { id: 'dongbaek', city: '부산', cat: 'nature', name: '동백섬·누리마루 APEC하우스', lat: 35.1527, lon: 129.1522, q: ['누리마루', '동백섬'], desc: '2005년 APEC 정상회의가 열린 누리마루가 있는 섬 공원. 해안 산책로에서 광안대교가 보인다.' },
  { id: 'marine', city: '부산', cat: 'sight', name: '마린시티·더베이101', lat: 35.1562, lon: 129.1490, q: ['더베이101', '더베이 101'], desc: '바다에 붙은 초고층 주거 단지. 밤에 수영만 건너편에서 보는 야경이 유명하다.' },
  { id: 'blueline', city: '부산', cat: 'sight', name: '블루라인파크 미포정거장', lat: 35.1607, lon: 129.1717, q: ['미포정거장', '블루라인파크'], desc: '옛 동해남부선 철길을 따라 미포에서 송정까지 해변열차와 스카이캡슐이 달린다.' },
  { id: 'cheongsapo', city: '부산', cat: 'sight', name: '청사포 다릿돌전망대', lat: 35.1606, lon: 129.1915, q: ['다릿돌전망대', '청사포'], desc: '바다 위로 뻗은 유리 바닥 전망대. 청사포 쌍둥이 등대가 가깝다.' },
  { id: 'songjeong', city: '부산', cat: 'beach', name: '송정해수욕장', lat: 35.1786, lon: 129.1999, q: ['송정해수욕장'], desc: '서핑하는 사람들이 많이 찾는 해운대구 동쪽의 해변.' },
  { id: 'yonggung', city: '부산', cat: 'culture', name: '해동용궁사', lat: 35.1884, lon: 129.2233, q: ['해동용궁사', '용궁사'], desc: '바닷가 바위 위에 지어진 절. 고려 말에 처음 세워졌다고 전한다.' },
  { id: 'lotteworld', city: '부산', cat: 'sight', name: '롯데월드 어드벤처 부산', lat: 35.1964, lon: 129.2150, q: ['롯데월드 어드벤처 부산', '롯데월드'], desc: '2022년 기장 오시리아 관광단지에 문을 연 테마파크.' },
  { id: 'jukseong', city: '부산', cat: 'sight', name: '죽성드림성당', lat: 35.2364, lon: 129.2490, q: ['죽성', '드림성당'], desc: '드라마 촬영 세트로 지어진 바닷가 바위 위의 성당 모양 건물.' },
  { id: 'centum', city: '부산', cat: 'market', name: '센텀시티', lat: 35.1688, lon: 129.1297, q: ['신세계 센텀시티', '센텀시티'], desc: '대형 백화점과 영화의전당, 벡스코가 모인 해운대구의 업무·쇼핑 지구.' },
  { id: 'cinema', city: '부산', cat: 'culture', name: '영화의전당', lat: 35.1711, lon: 129.1271, q: ['영화의전당'], desc: '부산국제영화제의 주 무대. 커다란 지붕이 공중에 떠 있는 듯한 건물이다.' },
  { id: 'bexco', city: '부산', cat: 'culture', name: '벡스코', lat: 35.1691, lon: 129.1363, q: ['벡스코', 'BEXCO'], desc: '부산의 전시·컨벤션 센터.' },
  { id: 'igidae', city: '부산', cat: 'nature', name: '이기대 해안산책로', lat: 35.1220, lon: 129.1260, q: ['이기대'], desc: '남구 바닷가 절벽을 따라 걷는 산책로. 광안대교와 해운대가 한눈에 들어온다.' },
  { id: 'oryukdo', city: '부산', cat: 'sight', name: '오륙도 스카이워크', lat: 35.1008, lon: 129.1243, q: ['오륙도스카이워크', '오륙도 스카이워크', '오륙도'], desc: '유리 바닥 전망대에서 오륙도 바위섬들을 내려다본다.' },
  // ---------------- 부산: 서면·원도심
  { id: 'seomyeon', city: '부산', cat: 'market', name: '서면', lat: 35.1578, lon: 129.0594, q: ['서면역'], desc: '부산 최대 번화가. 지하철 1·2호선이 만나는 서면역 주변으로 상점가와 지하상가가 이어진다.' },
  { id: 'jeonpo', city: '부산', cat: 'market', name: '전포카페거리', lat: 35.1548, lon: 129.0638, q: ['전포카페거리', '전포'], desc: '옛 공구상가 골목에 작은 카페와 가게가 모여든 거리.' },
  { id: 'citizenpark', city: '부산', cat: 'nature', name: '부산시민공원', lat: 35.1683, lon: 129.0571, q: ['부산시민공원'], desc: '옛 미군기지 캠프 하야리아 자리에 2014년 문을 연 도심 공원.' },
  { id: 'busanstn', city: '부산', cat: 'transit', name: '부산역', lat: 35.1152, lon: 129.0423, q: ['부산역'], desc: '경부고속철도(KTX)의 종착역. 지하철 1호선 부산역과 이어진다.' },
  { id: 'choryang', city: '부산', cat: 'sight', name: '초량 이바구길·168계단', lat: 35.1185, lon: 129.0362, q: ['168계단', '이바구길'], desc: '산비탈 동네를 오르는 168계단과 모노레일이 있는 골목길.' },
  { id: 'ferry', city: '부산', cat: 'transit', name: '부산항 국제여객터미널', lat: 35.1176, lon: 129.0490, q: ['부산항국제여객터미널', '국제여객터미널'], desc: '일본행 여객선이 드나드는 북항의 국제 여객선 터미널.' },
  { id: 'tower', city: '부산', cat: 'sight', name: '부산타워·용두산공원', lat: 35.1009, lon: 129.0324, q: ['부산타워', '용두산공원'], desc: '중구 용두산공원 위의 전망탑. 남포동과 부산항이 내려다보인다.' },
  { id: 'jagalchi', city: '부산', cat: 'market', name: '자갈치시장', lat: 35.0966, lon: 129.0305, q: ['자갈치시장', '자갈치'], desc: '남포동 바닷가의 큰 수산시장. 활어와 건어물 가게가 끝없이 이어진다.' },
  { id: 'gukje', city: '부산', cat: 'market', name: '국제시장', lat: 35.1015, lon: 129.0283, q: ['국제시장'], desc: '한국전쟁 뒤 피란민들의 장터에서 시작된 큰 재래시장.' },
  { id: 'biff', city: '부산', cat: 'culture', name: 'BIFF광장', lat: 35.0985, lon: 129.0278, q: ['BIFF광장', '비프광장'], desc: '부산국제영화제가 처음 열린 남포동 극장가. 씨앗호떡 노점이 유명하다.' },
  { id: 'yeongdobr', city: '부산', cat: 'sight', name: '영도대교', lat: 35.0955, lon: 129.0367, q: ['영도대교'], desc: '1934년에 처음 놓인 도개교. 지금도 하루 한 번 다리 상판을 들어 올린다.' },
  { id: 'harborbr', city: '부산', cat: 'sight', name: '부산항대교', lat: 35.1057, lon: 129.0645, q: ['부산항대교'], desc: '남구 감만동과 영도구 청학동을 잇는 사장교. 2014년에 개통했다.' },
  { id: 'gamcheon', city: '부산', cat: 'culture', name: '감천문화마을', lat: 35.0975, lon: 129.0106, q: ['감천문화마을'], desc: '산비탈에 계단처럼 들어선 알록달록한 집들. 피란민 마을에서 시작했다.' },
  { id: 'songdo', city: '부산', cat: 'beach', name: '송도해수욕장', lat: 35.0760, lon: 129.0175, q: ['송도해수욕장'], desc: '1913년에 문을 연 한국 최초의 공설 해수욕장. 바다 위 구름산책로와 해상케이블카가 있다.' },
  { id: 'huinnyeoul', city: '부산', cat: 'culture', name: '흰여울문화마을', lat: 35.0786, lon: 129.0450, q: ['흰여울문화마을', '흰여울'], desc: '영도 바닷가 절벽 위에 하얀 집들이 늘어선 마을.' },
  { id: 'taejongdae', city: '부산', cat: 'nature', name: '태종대', lat: 35.0530, lon: 129.0860, q: ['태종대'], desc: '영도 남쪽 끝 해안 절벽 공원. 등대와 전망대가 있다.' },
  { id: 'dadaepo', city: '부산', cat: 'beach', name: '다대포해수욕장', lat: 35.0466, lon: 128.9663, q: ['다대포해수욕장'], desc: '낙동강 하구의 넓은 모래사장. 해 질 녘 노을이 아름답다.' },
  { id: 'eulsukdo', city: '부산', cat: 'nature', name: '을숙도', lat: 35.1040, lon: 128.9445, q: ['을숙도', '낙동강하구에코센터'], desc: '낙동강 하구의 철새 도래지.' },
  // ---------------- 부산: 북부
  { id: 'beomeosa', city: '부산', cat: 'culture', name: '범어사', lat: 35.2836, lon: 129.0685, q: ['범어사'], desc: '금정산 기슭의 큰 절. 신라 때 의상대사가 세웠다고 전한다.' },
  { id: 'sanseong', city: '부산', cat: 'nature', name: '금정산성', lat: 35.2640, lon: 129.0510, q: ['금정산성'], desc: '둘레 약 17km로 한국에서 가장 큰 산성.' },
  { id: 'oncheon', city: '부산', cat: 'culture', name: '동래온천', lat: 35.2203, lon: 129.0835, q: ['동래온천', '허심청'], desc: '오래전부터 알려진 온천 지역. 온천장역 주변에 온천 시설이 모여 있다.' },
  { id: 'sajik', city: '부산', cat: 'sport', name: '사직야구장', lat: 35.1940, lon: 129.0615, q: ['사직야구장', '사직구장'], desc: '롯데 자이언츠의 홈구장.' },
  { id: 'asiad', city: '부산', cat: 'sport', name: '부산아시아드주경기장', lat: 35.1900, lon: 129.0587, q: ['아시아드주경기장'], desc: '2002년 부산 아시안게임 주경기장.' },
  // ---------------- 부산: 교통
  { id: 'pus', city: '부산', cat: 'transit', name: '김해국제공항', lat: 35.1795, lon: 128.9382, q: ['김해국제공항', '국제선 청사'], desc: '부산의 관문 공항. 강서구에 있고 부산김해경전철 공항역과 이어진다.', airport: 'PUS' },
  { id: 'nopo', city: '부산', cat: 'transit', name: '부산종합버스터미널', lat: 35.2836, lon: 129.0952, q: ['부산종합버스터미널'], desc: '지하철 1호선 노포역 옆의 고속·시외버스 터미널.' },
  { id: 'seobusan', city: '부산', cat: 'transit', name: '서부산터미널', lat: 35.1640, lon: 128.9840, q: ['서부산터미널', '부산서부시외버스터미널'], desc: '사상역 옆의 시외버스 터미널.' },
  // ---------------- 부산: 대학교
  { id: 'pnu', city: '부산', cat: 'uni', name: '부산대학교', lat: 35.2335, lon: 129.0800, q: ['부산대학교'], desc: '1946년에 문을 연 국립대학교. 장전동 캠퍼스는 금정산 자락에 있다.' },
  { id: 'pknu', city: '부산', cat: 'uni', name: '부경대학교', lat: 35.1336, lon: 129.1031, q: ['부경대학교'], desc: '국립대학교. 대연캠퍼스는 경성대·부경대역 바로 옆이다.' },
  { id: 'ks', city: '부산', cat: 'uni', name: '경성대학교', lat: 35.1374, lon: 129.1003, q: ['경성대학교'], desc: '남구 대연동의 사립대학교. 주변이 대학가 상권이다.' },
  { id: 'donga', city: '부산', cat: 'uni', name: '동아대학교 승학캠퍼스', lat: 35.1162, lon: 128.9682, q: ['동아대학교'], desc: '사하구 승학산 자락의 사립대학교 캠퍼스.' },
  { id: 'kmou', city: '부산', cat: 'uni', name: '한국해양대학교', lat: 35.0753, lon: 129.0868, q: ['한국해양대학교'], desc: '영도 앞 바다의 섬(조도)에 캠퍼스가 있는 국립대학교.' },
  { id: 'deu', city: '부산', cat: 'uni', name: '동의대학교', lat: 35.1435, lon: 129.0340, q: ['동의대학교'], desc: '부산진구 가야동의 사립대학교. 2호선 동의대역과 가깝다.' },
  { id: 'bufs', city: '부산', cat: 'uni', name: '부산외국어대학교', lat: 35.2690, lon: 129.0920, q: ['부산외국어대학교'], desc: '금정구 남산동의 사립대학교.' },
  { id: 'dongseo', city: '부산', cat: 'uni', name: '동서대학교', lat: 35.1457, lon: 129.0080, q: ['동서대학교'], desc: '사상구 주례동의 사립대학교.' },
  { id: 'silla', city: '부산', cat: 'uni', name: '신라대학교', lat: 35.1675, lon: 128.9963, q: ['신라대학교'], desc: '사상구 괘법동 백양산 자락의 사립대학교.' },
  // ---------------- 울산
  { id: 'taehwa', city: '울산', cat: 'nature', name: '태화강 국가정원·십리대숲', lat: 35.5486, lon: 129.2960, q: ['태화강국가정원', '태화강 국가정원', '십리대숲'], desc: '2019년 대한민국 두 번째 국가정원으로 지정된 강변 정원. 대나무 숲길이 이어진다.' },
  { id: 'taehwastn', city: '울산', cat: 'transit', name: '태화강역', lat: 35.5390, lon: 129.3535, q: ['태화강역'], desc: '부산 부전역과 동해선 광역전철로 이어지는 울산의 주요 역.' },
  { id: 'ulsanstn', city: '울산', cat: 'transit', name: '울산역(KTX)', lat: 35.5515, lon: 129.1386, q: ['울산역'], desc: '울주군 삼남읍의 고속철도역. 경부고속철도 열차가 선다.' },
  { id: 'usn', city: '울산', cat: 'transit', name: '울산공항', lat: 35.5935, lon: 129.3519, q: ['울산공항'], desc: '북구 송정동의 국내선 공항.', airport: 'USN' },
  { id: 'ulsanbr', city: '울산', cat: 'sight', name: '울산대교', lat: 35.5027, lon: 129.3780, q: ['울산대교'], desc: '남구 매암동과 동구를 잇는 현수교. 2015년에 개통했다.' },
  { id: 'ulsanbrobs', city: '울산', cat: 'sight', name: '울산대교 전망대', lat: 35.5050, lon: 129.3985, q: ['울산대교전망대', '울산대교 전망대'], desc: '동구 화정산 꼭대기의 전망대. 울산대교와 공업단지 야경이 내려다보인다.' },
  { id: 'daewangam', city: '울산', cat: 'nature', name: '대왕암공원', lat: 35.4935, lon: 129.4405, q: ['대왕암공원', '대왕암'], desc: '동구 바닷가의 기암괴석과 해송 숲. 출렁다리가 있다.' },
  { id: 'ilsan', city: '울산', cat: 'beach', name: '일산해수욕장', lat: 35.4980, lon: 129.4300, q: ['일산해수욕장'], desc: '대왕암공원 옆 동구의 해수욕장.' },
  { id: 'jangsaengpo', city: '울산', cat: 'culture', name: '장생포 고래문화마을', lat: 35.4990, lon: 129.3850, q: ['장생포고래문화마을', '고래박물관', '장생포'], desc: '옛 포경 기지였던 장생포의 고래박물관과 고래문화마을.' },
  { id: 'grandpark', city: '울산', cat: 'nature', name: '울산대공원', lat: 35.5280, lon: 129.2920, q: ['울산대공원'], desc: '남구의 넓은 도심 공원. 장미원과 동물원이 있다.' },
  { id: 'ganjeolgot', city: '울산', cat: 'nature', name: '간절곶', lat: 35.3590, lon: 129.3605, q: ['간절곶'], desc: '한반도 내륙에서 새해 해가 가장 먼저 뜨는 곳으로 알려진 바닷가 곶.' },
  { id: 'jinha', city: '울산', cat: 'beach', name: '진하해수욕장', lat: 35.3836, lon: 129.3451, q: ['진하해수욕장'], desc: '울주군 서생면의 넓은 해수욕장. 앞바다에 명선도가 있다.' },
  { id: 'bangudae', city: '울산', cat: 'culture', name: '반구대 암각화', lat: 35.6110, lon: 129.1730, q: ['반구대암각화', '반구대 암각화', '반구대'], desc: '대곡천 절벽에 새겨진 선사시대 바위그림. 고래 사냥 장면이 담겨 있다.' },
  { id: 'ganwoljae', city: '울산', cat: 'nature', name: '영남알프스 간월재', lat: 35.5520, lon: 129.0390, q: ['간월재'], desc: '신불산과 간월산 사이의 억새 평원.' },
  { id: 'hhi', city: '울산', cat: 'industry', name: '현대중공업 조선소', lat: 35.5070, lon: 129.4210, q: ['현대중공업', 'HD현대중공업'], desc: '동구 미포만의 거대한 조선소. 골리앗 크레인이 멀리서도 보인다.' },
  { id: 'hmc', city: '울산', cat: 'industry', name: '현대자동차 울산공장', lat: 35.5380, lon: 129.3770, q: ['현대자동차 울산공장', '현대자동차'], desc: '북구 양정동의 대규모 자동차 공장. 수출 선적 부두가 붙어 있다.' },
  { id: 'munsu', city: '울산', cat: 'sport', name: '울산문수축구경기장', lat: 35.5353, lon: 129.2594, q: ['문수축구경기장', '울산문수축구경기장'], desc: '2002년 월드컵 경기가 열린 축구 전용 경기장.' },
  { id: 'samsan', city: '울산', cat: 'market', name: '삼산동 번화가', lat: 35.5395, lon: 129.3375, q: ['삼산동'], desc: '백화점과 버스터미널이 모인 울산의 대표 번화가.' },
  { id: 'unist', city: '울산', cat: 'uni', name: 'UNIST', lat: 35.5733, lon: 129.1903, q: ['울산과학기술원', 'UNIST'], desc: '2009년에 문을 연 이공계 특성화 국립대학교. 울주군 언양읍에 있다.' },
  { id: 'uou', city: '울산', cat: 'uni', name: '울산대학교', lat: 35.5437, lon: 129.2566, q: ['울산대학교'], desc: '남구 무거동의 사립대학교.' },

  // ---------------- KTX로 가는 도시들 (좌표는 대략값, OSM 이름으로 보정)
  // 서울·경기
  { id: 'seoulstn', city: '서울', cat: 'transit', name: '서울역', lat: 37.5547, lon: 126.9707, q: ['서울역'], desc: 'KTX 경부선의 출발역. 옛 서울역사(문화역서울284) 옆에 지금의 역사가 있다.' },
  { id: 'gyeongbok', city: '서울', cat: 'culture', name: '경복궁', lat: 37.5788, lon: 126.9770, q: ['경복궁'], desc: '조선의 법궁. 광화문을 지나 근정전과 경회루가 이어진다.' },
  { id: 'gwanghwamun', city: '서울', cat: 'sight', name: '광화문광장', lat: 37.5720, lon: 126.9769, q: ['광화문광장', '광화문'], desc: '세종대왕상과 이순신 장군상이 서 있는 서울 도심의 광장.' },
  { id: 'changdeok', city: '서울', cat: 'culture', name: '창덕궁', lat: 37.5794, lon: 126.9910, q: ['창덕궁'], desc: '후원이 아름다운 조선의 궁궐. 유네스코 세계유산.' },
  { id: 'bukchon', city: '서울', cat: 'culture', name: '북촌한옥마을', lat: 37.5826, lon: 126.9836, q: ['북촌한옥마을', '북촌'], desc: '경복궁과 창덕궁 사이 언덕에 한옥이 모여 있는 동네.' },
  { id: 'namsan', city: '서울', cat: 'sight', name: 'N서울타워', lat: 37.5512, lon: 126.9882, q: ['N서울타워', '남산서울타워', '서울타워'], desc: '남산 꼭대기의 전망 타워. 서울 시내가 한눈에 보인다.' },
  { id: 'myeongdong', city: '서울', cat: 'market', name: '명동', lat: 37.5609, lon: 126.9862, q: ['명동'], desc: '쇼핑 거리와 노점이 빽빽한 서울 도심의 번화가.' },
  { id: 'namdaemun', city: '서울', cat: 'market', name: '남대문시장', lat: 37.5591, lon: 126.9776, q: ['남대문시장'], desc: '숭례문 옆의 오래된 전통시장.' },
  { id: 'cheonggye', city: '서울', cat: 'nature', name: '청계천', lat: 37.5692, lon: 126.9779, q: ['청계광장', '청계천'], desc: '도심을 동서로 흐르는 복원된 하천과 산책로.' },
  { id: 'ddp', city: '서울', cat: 'culture', name: '동대문디자인플라자', lat: 37.5663, lon: 127.0092, q: ['동대문디자인플라자', 'DDP'], desc: '곡선 외벽의 복합 문화 공간. 주변은 밤늦게까지 여는 패션 상가.' },
  { id: 'hongdae', city: '서울', cat: 'market', name: '홍대 거리', lat: 37.5551, lon: 126.9233, q: ['홍대', '홍익대학교'], desc: '클럽과 공연장, 카페가 모인 젊은 거리.' },
  { id: 'yeouido', city: '서울', cat: 'nature', name: '여의도 한강공원', lat: 37.5283, lon: 126.9326, q: ['여의도한강공원', '여의도 한강공원'], desc: '한강 남쪽 여의도의 강변 공원. 봄에는 벚꽃길이 붐빈다.' },
  { id: 'gangnam', city: '서울', cat: 'market', name: '강남역 거리', lat: 37.4979, lon: 127.0276, q: ['강남역'], desc: '고층 빌딩과 상가가 늘어선 강남대로의 중심.' },
  { id: 'coex', city: '서울', cat: 'sight', name: '코엑스', lat: 37.5115, lon: 127.0595, q: ['코엑스', 'COEX'], desc: '전시장과 지하 쇼핑몰, 별마당 도서관이 있는 복합 시설.' },
  { id: 'lwt', city: '서울', cat: 'sight', name: '롯데월드타워', lat: 37.5126, lon: 127.1025, q: ['롯데월드타워'], desc: '높이 555m, 123층의 초고층 건물. 꼭대기에 전망대가 있다.' },
  { id: 'snu', city: '서울', cat: 'uni', name: '서울대학교', lat: 37.4600, lon: 126.9516, q: ['서울대학교'], desc: '관악산 자락의 국립대학교.' },
  { id: 'yonsei', city: '서울', cat: 'uni', name: '연세대학교', lat: 37.5658, lon: 126.9386, q: ['연세대학교'], desc: '서대문구 신촌의 사립대학교.' },
  { id: 'korea', city: '서울', cat: 'uni', name: '고려대학교', lat: 37.5894, lon: 127.0323, q: ['고려대학교'], desc: '성북구 안암동의 사립대학교.' },
  { id: 'gwangmyeongstn', city: '광명', cat: 'transit', name: '광명역', lat: 37.4163, lon: 126.8848, q: ['광명역'], desc: '경부고속철도가 서울을 벗어나며 처음 서는 KTX 역.' },
  // 충청·대전
  { id: 'cheonanasan', city: '천안·아산', cat: 'transit', name: '천안아산역', lat: 36.7945, lon: 127.1046, q: ['천안아산역'], desc: '천안과 아산 사이의 KTX 역.' },
  { id: 'independence', city: '천안·아산', cat: 'culture', name: '독립기념관', lat: 36.7838, lon: 127.2229, q: ['독립기념관'], desc: '흑성산 아래의 독립운동 역사 전시관.' },
  { id: 'osong', city: '청주', cat: 'transit', name: '오송역', lat: 36.6203, lon: 127.3275, q: ['오송역'], desc: '경부고속철도와 호남고속철도가 갈라지는 KTX 역.' },
  { id: 'daejeonstn', city: '대전', cat: 'transit', name: '대전역', lat: 36.3323, lon: 127.4346, q: ['대전역'], desc: '대전 동구의 KTX 역. 원도심 한가운데에 있다.' },
  { id: 'hanbit', city: '대전', cat: 'sight', name: '엑스포과학공원 한빛탑', lat: 36.3765, lon: 127.3868, q: ['한빛탑', '엑스포과학공원'], desc: '1993년 대전 엑스포의 상징탑.' },
  { id: 'kaist', city: '대전', cat: 'uni', name: 'KAIST', lat: 36.3721, lon: 127.3604, q: ['한국과학기술원', 'KAIST'], desc: '유성구의 이공계 특성화 국립대학교.' },
  { id: 'cnu', city: '대전', cat: 'uni', name: '충남대학교', lat: 36.3685, lon: 127.3460, q: ['충남대학교'], desc: '유성구의 국립대학교.' },
  { id: 'yuseong', city: '대전', cat: 'culture', name: '유성온천', lat: 36.3537, lon: 127.3418, q: ['유성온천'], desc: '대전 유성구의 온천 거리. 무료 족욕장이 있다.' },
  // 대구·경북
  { id: 'gimcheongumi', city: '김천', cat: 'transit', name: '김천구미역', lat: 36.1137, lon: 128.1802, q: ['김천구미역', '김천(구미)역'], desc: '김천시 남면의 KTX 역. 구미와 김천 사이에 있다.' },
  { id: 'seodaegu', city: '대구', cat: 'transit', name: '서대구역', lat: 35.8826, lon: 128.5390, q: ['서대구역'], desc: '2022년에 문을 연 대구 서구의 KTX 역.' },
  { id: 'dongdaegu', city: '대구', cat: 'transit', name: '동대구역', lat: 35.8793, lon: 128.6286, q: ['동대구역'], desc: '대구의 대표 KTX 역. 복합환승센터가 붙어 있다.' },
  { id: 'dongseongno', city: '대구', cat: 'market', name: '동성로', lat: 35.8694, lon: 128.5960, q: ['동성로'], desc: '대구 도심의 쇼핑 거리.' },
  { id: 'seomun', city: '대구', cat: 'market', name: '서문시장', lat: 35.8695, lon: 128.5806, q: ['서문시장'], desc: '조선 시대부터 이어진 대구의 큰 전통시장. 야시장이 열린다.' },
  { id: 'kimkwangseok', city: '대구', cat: 'culture', name: '김광석다시그리기길', lat: 35.8597, lon: 128.6066, q: ['김광석다시그리기길', '김광석 다시그리기 길'], desc: '가수 김광석을 기리는 벽화 골목.' },
  { id: 'e83', city: '대구', cat: 'sight', name: '83타워', lat: 35.8532, lon: 128.5650, q: ['83타워', '이월드'], desc: '두류공원 옆 이월드의 전망 타워.' },
  { id: 'suseongmot', city: '대구', cat: 'nature', name: '수성못', lat: 35.8280, lon: 128.6170, q: ['수성못'], desc: '수성구의 호수 공원. 둘레 산책로가 있다.' },
  { id: 'lionspark', city: '대구', cat: 'sport', name: '대구삼성라이온즈파크', lat: 35.8411, lon: 128.6815, q: ['대구삼성라이온즈파크', '라이온즈파크'], desc: '수성구 연호동의 야구장.' },
  { id: 'knu', city: '대구', cat: 'uni', name: '경북대학교', lat: 35.8899, lon: 128.6105, q: ['경북대학교'], desc: '대구 북구의 국립대학교.' },
  { id: 'gyeongjustn', city: '경주', cat: 'transit', name: '경주역', lat: 35.7982, lon: 129.1390, q: ['경주역', '신경주역'], desc: '건천읍의 KTX 역(옛 신경주역). 경부선 KTX와 동해선 KTX-이음이 선다.' },
  { id: 'bulguksa', city: '경주', cat: 'culture', name: '불국사', lat: 35.7900, lon: 129.3320, q: ['불국사'], desc: '신라 때 세운 절. 다보탑과 석가탑이 있는 유네스코 세계유산.' },
  { id: 'seokguram', city: '경주', cat: 'culture', name: '석굴암', lat: 35.7950, lon: 129.3490, q: ['석굴암'], desc: '토함산 중턱의 석굴 사원. 불국사와 함께 세계유산이다.' },
  { id: 'cheomseongdae', city: '경주', cat: 'culture', name: '첨성대', lat: 35.8347, lon: 129.2190, q: ['첨성대'], desc: '신라 선덕여왕 때 세운 천문대.' },
  { id: 'daereungwon', city: '경주', cat: 'culture', name: '대릉원', lat: 35.8381, lon: 129.2120, q: ['대릉원'], desc: '신라 왕과 귀족의 큰 무덤이 모인 고분 공원. 천마총이 있다.' },
  { id: 'donggung', city: '경주', cat: 'culture', name: '동궁과 월지', lat: 35.8346, lon: 129.2266, q: ['동궁과월지', '동궁과 월지', '안압지'], desc: '신라 별궁 터와 연못. 밤 조명이 아름답다.' },
  { id: 'hwangridan', city: '경주', cat: 'market', name: '황리단길', lat: 35.8378, lon: 129.2096, q: ['황리단길'], desc: '대릉원 옆 한옥 카페와 가게가 모인 거리.' },
  { id: 'bomun', city: '경주', cat: 'sight', name: '보문관광단지', lat: 35.8420, lon: 129.2850, q: ['보문호', '보문관광단지'], desc: '보문호를 둘러싼 호텔과 놀이공원 단지.' },
  { id: 'pohangstn', city: '포항', cat: 'transit', name: '포항역', lat: 36.0717, lon: 129.3418, q: ['포항역'], desc: '흥해읍의 KTX 역. 동해선 KTX-이음이 선다.' },
  { id: 'yeongildae', city: '포항', cat: 'beach', name: '영일대해수욕장', lat: 36.0560, lon: 129.3790, q: ['영일대해수욕장', '영일대'], desc: '바다 위 누각 영일대가 있는 포항의 해수욕장. 건너편으로 제철소가 보인다.' },
  { id: 'spacewalk', city: '포항', cat: 'sight', name: '스페이스워크', lat: 36.0655, lon: 129.3920, q: ['스페이스워크', '환호공원'], desc: '환호공원 언덕 위의 롤러코스터 모양 철제 산책로.' },
  { id: 'jukdo', city: '포항', cat: 'market', name: '죽도시장', lat: 36.0350, lon: 129.3650, q: ['죽도시장'], desc: '경북 동해안에서 가장 큰 수산 시장.' },
  { id: 'homigot', city: '포항', cat: 'nature', name: '호미곶', lat: 36.0770, lon: 129.5690, q: ['호미곶', '상생의손'], desc: '한반도 동쪽 끝의 곶. 바다 위로 상생의 손 조형물이 솟아 있다.' },
  { id: 'posco', city: '포항', cat: 'industry', name: '포스코 포항제철소', lat: 36.0040, lon: 129.3880, q: ['포항제철소', '포스코'], desc: '형산강 하구의 대규모 제철소.' },
  { id: 'postech', city: '포항', cat: 'uni', name: '포항공과대학교', lat: 36.0130, lon: 129.3220, q: ['포항공과대학교', 'POSTECH'], desc: '포항 남구의 이공계 사립대학교.' },
  { id: 'yeongdeokstn', city: '영덕', cat: 'transit', name: '영덕역', lat: 36.4157, lon: 129.3627, q: ['영덕역'], desc: '영덕읍의 동해선 역. KTX-이음이 선다.' },
  { id: 'ganggu', city: '영덕', cat: 'market', name: '강구항 대게거리', lat: 36.3580, lon: 129.3880, q: ['강구항'], desc: '대게 식당이 줄지어 선 영덕의 항구.' },
  { id: 'uljinstn', city: '울진', cat: 'transit', name: '울진역', lat: 36.9930, lon: 129.3990, q: ['울진역'], desc: '울진읍의 동해선 역. KTX-이음이 선다.' },
  // 강원
  { id: 'samcheokstn', city: '삼척', cat: 'transit', name: '삼척역', lat: 37.4410, lon: 129.1660, q: ['삼척역'], desc: '삼척 시내의 역. 동해선 KTX-이음이 선다.' },
  { id: 'jukseoru', city: '삼척', cat: 'culture', name: '죽서루', lat: 37.4418, lon: 129.1608, q: ['죽서루'], desc: '오십천 절벽 위의 누각. 관동팔경의 하나.' },
  { id: 'donghaestn', city: '동해', cat: 'transit', name: '동해역', lat: 37.4977, lon: 129.1241, q: ['동해역'], desc: '동해시의 역. KTX-이음이 선다.' },
  { id: 'chuam', city: '동해', cat: 'nature', name: '추암 촛대바위', lat: 37.4770, lon: 129.1630, q: ['촛대바위', '추암'], desc: '바다에 솟은 촛대 모양 바위. 해돋이 명소.' },
  { id: 'mukhostn', city: '동해', cat: 'transit', name: '묵호역', lat: 37.5464, lon: 129.1094, q: ['묵호역'], desc: '묵호항 가까이의 역. KTX-이음이 선다.' },
  { id: 'nongol', city: '동해', cat: 'culture', name: '논골담길', lat: 37.5520, lon: 129.1170, q: ['논골담길', '묵호등대'], desc: '묵호등대 아래 벽화 골목. 항구와 바다가 내려다보인다.' },
  { id: 'jeongdongjin', city: '강릉', cat: 'beach', name: '정동진', lat: 37.6913, lon: 129.0342, q: ['정동진역', '정동진'], desc: '바다에 가장 가까운 역으로 알려진 해돋이 명소.' },
  { id: 'gangneungstn', city: '강릉', cat: 'transit', name: '강릉역', lat: 37.7640, lon: 128.8996, q: ['강릉역'], desc: '동해선 KTX-이음의 종착역. 서울로 가는 강릉선 KTX도 선다.' },
  { id: 'gyeongpo', city: '강릉', cat: 'beach', name: '경포해변', lat: 37.8055, lon: 128.9080, q: ['경포해변', '경포해수욕장'], desc: '경포호 옆의 넓은 백사장.' },
  { id: 'anmok', city: '강릉', cat: 'market', name: '안목해변 커피거리', lat: 37.7720, lon: 128.9480, q: ['안목해변', '커피거리'], desc: '바다를 보며 커피를 마시는 카페 거리.' },
  { id: 'ojukheon', city: '강릉', cat: 'culture', name: '오죽헌', lat: 37.7790, lon: 128.8780, q: ['오죽헌'], desc: '신사임당과 율곡 이이가 태어난 집.' },
  { id: 'gnmarket', city: '강릉', cat: 'market', name: '강릉중앙시장', lat: 37.7540, lon: 128.8990, q: ['강릉중앙시장', '중앙시장'], desc: '강릉 도심의 전통시장.' },
];

const STARTS = ['busanstn', 'haeundae', 'gwangalli', 'seomyeon', 'jagalchi', 'pus', 'pnu', 'taehwa', 'daewangam', 'seoulstn', 'dongdaegu', 'bulguksa', 'gangneungstn'];

// 부산·울산 도시철도와 광역철도. 역 이름 순서대로 OSM 역 지점과 철길을 찾아 노선을 만든다.
const LINES = [
  { id: 'L1', name: '부산 1호선', short: '1', color: '#f06a00', rail: ['subway'],
    stations: ['다대포해수욕장', '다대포항', '낫개', '신장림', '장림', '동매', '신평', '하단', '당리', '사하', '괴정', '대티', '서대신', '동대신', '토성', '자갈치', '남포', '중앙', '부산역', '초량', '부산진', '좌천', '범일', '범내골', '서면', '부전', '양정', '시청', '연산', '교대', '동래', '명륜', '온천장', '부산대', '장전', '구서', '두실', '남산', '범어사', '노포'] },
  { id: 'L2', name: '부산 2호선', short: '2', color: '#81bf48', rail: ['subway'],
    stations: ['장산', '중동', '해운대', '동백', '벡스코', '센텀시티', '민락', '수영', '광안', '금련산', '남천', '경성대부경대', '대연', '못골', '지게골', '문현', '문전', '전포', '서면', '부암', '가야', '동의대', '개금', '냉정', '주례', '감전', '사상', '덕포', '모덕', '모라', '구남', '구명', '덕천', '수정', '화명', '율리', '동원', '금곡', '호포', '증산', '부산대양산캠퍼스', '남양산', '양산'] },
  { id: 'L3', name: '부산 3호선', short: '3', color: '#bb8c00', rail: ['subway'],
    stations: ['수영', '망미', '배산', '물만골', '연산', '거제', '종합운동장', '사직', '미남', '만덕', '남산정', '숙등', '덕천', '구포', '강서구청', '체육공원', '대저'] },
  { id: 'L4', name: '부산 4호선', short: '4', color: '#217dcb', rail: ['subway', 'light_rail', 'monorail'],
    stations: ['미남', '동래', '수안', '낙민', '충렬사', '명장', '서동', '금사', '반여농산물시장', '석대', '영산대', '윗반송', '고촌', '안평'] },
  { id: 'BGL', name: '부산김해경전철', short: '김해', color: '#8652a1', rail: ['light_rail', 'subway'],
    stations: ['사상', '괘법르네시떼', '서부산유통지구', '공항', '덕두', '등구', '대저', '평강', '대사', '불암', '지내', '김해대학', '인제대', '김해시청', '부원', '봉황', '수로왕릉', '박물관', '연지공원', '장신대', '가야대'] },
  { id: 'DH', name: '동해선', short: '동해', color: '#0054a6', rail: ['rail'],
    stations: ['부전', '거제해맞이', '거제', '교대', '동래', '안락', '부산원동', '재송', '센텀', '벡스코', '신해운대', '송정', '오시리아', '기장', '일광', '좌천', '월내', '서생', '남창', '망양', '덕하', '태화강'] },
];

// KTX: 역 [이름, 위도, 경도, 다음 역까지 최고 속도(m/s), 다른 이름]. 위치는 OSM 역 지점으로 보정하고
// 역 사이 철길은 OSM 철도에서 찾는다. 속도는 실제 소요 시간에 가깝게 맞춘 모의 운행 값
const KTX_LINES = [
  { id: 'KTX', name: 'KTX 경부선', short: 'KTX', color: '#1f4fa0', model: 'sancheon', cars: 10, headway: 1800,
    stations: [
      ['서울', 37.5547, 126.9707, 33], ['광명', 37.4163, 126.8848, 83], ['천안아산', 36.7945, 127.1046, 83], ['오송', 36.6203, 127.3275, 83],
      ['대전', 36.3323, 127.4346, 83], ['김천구미', 36.1137, 128.1802, 70, ['김천(구미)']], ['서대구', 35.8826, 128.5390, 28],
      ['동대구', 35.8793, 128.6286, 83], ['경주', 35.7982, 129.1390, 83, ['신경주']], ['울산', 35.5515, 129.1386, 64, ['울산(통도사)']],
      ['부산', 35.1152, 129.0423],
    ] },
  { id: 'KTXE', name: 'KTX-이음 동해선', short: '이음', color: '#2a8fd0', model: 'eum', cars: 6, headway: 7200,
    stations: [
      ['부전', 35.1642, 129.0597, 30], ['태화강', 35.5390, 129.3535, 32], ['경주', 35.7982, 129.1390, 32, ['신경주']], ['포항', 36.0717, 129.3418, 32],
      ['영덕', 36.4157, 129.3627, 32], ['울진', 36.9930, 129.3990, 32], ['삼척', 37.4410, 129.1660, 32], ['동해', 37.4977, 129.1241, 32],
      ['묵호', 37.5464, 129.1094, 32], ['정동진', 37.6913, 129.0342, 32], ['강릉', 37.7640, 128.8996],
    ] },
];

// 바로 타는 KTX 여행 (도착역에서 자동으로 내린다)
const KTX_TRIPS = [
  { id: 'busan-gangneung', line: 'KTXE', from: '부전', to: '강릉', name: '부산 → 강릉', sub: 'KTX-이음 동해선 · 부전역 출발' },
  { id: 'gangneung-busan', line: 'KTXE', from: '강릉', to: '부전', name: '강릉 → 부산', sub: 'KTX-이음 동해선 · 부전역 도착' },
  { id: 'busan-seoul', line: 'KTX', from: '부산', to: '서울', name: '부산 → 서울', sub: 'KTX 경부선' },
  { id: 'seoul-busan', line: 'KTX', from: '서울', to: '부산', name: '서울 → 부산', sub: 'KTX 경부선' },
  { id: 'busan-daegu', line: 'KTX', from: '부산', to: '동대구', name: '부산 → 대구', sub: 'KTX 경부선 · 동대구역 도착' },
  { id: 'daegu-busan', line: 'KTX', from: '동대구', to: '부산', name: '대구 → 부산', sub: 'KTX 경부선' },
  { id: 'busan-gyeongju', line: 'KTXE', from: '부전', to: '경주', name: '부산 → 경주', sub: 'KTX-이음 동해선' },
  { id: 'busan-pohang', line: 'KTXE', from: '부전', to: '포항', name: '부산 → 포항', sub: 'KTX-이음 동해선' },
];
// 이 역에 서지 않는 KTX를 가까운 역에서 타도록 안내 (부산역 ↔ 부전역)
const KTX_TRANSFERS = [
  { at: '부산', line: 'KTXE', trip: 'busan-gangneung', label: '강릉 방면 (KTX-이음)', note: '동해선 KTX-이음은 부산역이 아니라 부전역에서 떠납니다. 부전역으로 옮겨 바로 탑니다' },
  { at: '부전', line: 'KTX', trip: 'busan-seoul', label: '서울 방면 (KTX 경부선)', note: 'KTX 경부선은 부산역에서 떠납니다. 부산역으로 옮겨 바로 탑니다' },
];

// OSM 활주로가 없을 때 쓰는 대략적인 활주로 (중심, 방위각)
const AIRPORTS = {
  PUS: { name: '김해국제공항', lat: 35.1795, lon: 128.9382, heading: 176, length: 3000 },
  USN: { name: '울산공항', lat: 35.5935, lon: 129.3519, heading: 177, length: 2000 },
};

function placeById(id) { return PLACES.find((p) => p.id === id); }
function stationLabel(n) { return /역$/.test(n) ? n : n + '역'; }
function normName(s) { return (s || '').replace(/\(.*?\)/g, '').replace(/[\s·.\-‧・]/g, '').replace(/역$/, ''); }
