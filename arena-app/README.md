# Arena 데스크톱 앱

[arena.ai](https://arena.ai)를 브라우저 없이 독립된 앱 창으로 여는 앱입니다.
주소창이나 탭 없이 바탕화면·시작 메뉴 아이콘을 눌러 바로 들어갈 수 있습니다.
Windows, macOS, Linux에서 동작합니다.

## 설치하기

1. 이 저장소의 **Actions** 탭 → **Arena 앱 빌드** → 가장 최근에 성공한 실행을 엽니다.
2. 아래쪽 **Artifacts**에서 내 운영체제에 맞는 파일을 내려받아 압축을 풉니다.
   - **Windows**: `Arena-Setup-1.0.0.exe`(설치형, 바탕화면·시작 메뉴 바로가기 생성) 또는
     `Arena-Portable-1.0.0.exe`(설치 없이 바로 실행)
   - **macOS**: `Arena-1.0.0-arm64.dmg` (Apple 실리콘 Mac용)
   - **Linux**: `Arena-1.0.0.AppImage` 또는 `.deb`

`arena-v1.0.0` 같은 태그를 올리면 같은 파일이 **Releases**에도 올라갑니다.

### 처음 실행할 때 경고가 뜨면

코드 서명이 없는 앱이라 운영체제가 한 번 경고합니다.

- **Windows**: "Windows의 PC 보호" 창에서 **추가 정보** → **실행**
- **macOS**: 앱을 우클릭 → **열기** → **열기**
  (그래도 막히면 터미널에서 `xattr -cr /Applications/Arena.app`)

## 기능

- 로그인 상태와 창 크기·위치를 기억합니다.
- 구글 등 로그인 팝업은 앱 안에서 열리고, 그 밖의 외부 링크는 기본 브라우저로 열립니다.
- 앱을 두 번 실행해도 창이 하나만 뜹니다.
- 인터넷이 끊기면 안내 화면과 **다시 시도** 버튼이 나오고, 연결되면 자동으로 다시 엽니다.

| 단축키 (Windows / macOS) | 동작 |
| --- | --- |
| `Alt` | 메뉴 표시 (Windows) |
| `Ctrl+H` / `Cmd+H` | 홈으로 |
| `Alt+←` / `Cmd+[` | 뒤로 |
| `Alt+→` / `Cmd+]` | 앞으로 |
| `Ctrl+R` / `Cmd+R` | 새로고침 |
| `Ctrl+=`, `Ctrl+-`, `Ctrl+0` | 확대, 축소, 원래 크기 |

## 직접 빌드하기

Node.js 22 이상이 필요합니다.

```bash
cd arena-app
npm install
npm start            # 바로 실행
npm run dist:win     # Windows 설치 파일 → dist/
npm run dist:mac     # macOS (Mac에서만)
npm run dist:linux   # Linux
```

arena.ai는 외부 서비스이고, 이 앱은 그 웹사이트를 창에 띄워 주기만 하는 비공식 앱입니다.
