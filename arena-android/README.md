# Arena 안드로이드 앱 (APK)

[arena.ai](https://arena.ai)를 브라우저 없이 앱 화면 전체로 여는 안드로이드 앱입니다.
홈 화면의 **Arena** 아이콘을 누르면 주소창 없이 바로 arena.ai가 열립니다.

## 설치하기

휴대폰에서 아래 링크를 열면 항상 최신 APK를 받습니다.

**https://github.com/Joyong133/Ghj/releases/download/arena-android-latest/Arena.apk**

1. 받은 `Arena.apk`를 엽니다.
2. "출처를 알 수 없는 앱" 경고가 나오면 **설정 → 이 출처 허용**을 켭니다.
3. **설치**를 누릅니다.

새 버전도 같은 링크로 받아 설치하면 로그인 상태를 그대로 둔 채 업데이트됩니다.

## 기능

- **저장한 프롬프트**: 화면 오른쪽의 노란 버튼을 누르면 자주 쓰는 프롬프트 목록이 나오고,
  하나를 누르면 arena.ai 입력창에 바로 들어갑니다. 입력창에 이미 글이 있으면 줄을 바꿔 이어 붙입니다.
  - **새 프롬프트**로 직접 적어 저장하거나, **입력창 내용 저장**으로 지금 입력창에 쓴 글을 그대로 저장합니다.
  - ⋮ 버튼(또는 길게 누르기)으로 수정·복사·맨 위로·삭제를 할 수 있고, 6개 이상이면 검색창이 나옵니다.
  - 버튼은 위아래로 끌어서 옮길 수 있고, 옮긴 위치를 기억합니다.
  - 처음에는 예시 프롬프트 4개가 들어 있습니다. 필요 없으면 지우면 됩니다.
  - 프롬프트는 휴대폰 안에만 저장되고, 앱을 지우면 함께 지워집니다.
- 로그인 상태(쿠키)를 기억합니다.
- 구글 등 로그인 팝업은 앱 안에서 열리고, arena.ai와 상관없는 링크는 기본 브라우저로 열립니다.
- 이미지 첨부(파일 선택)가 됩니다.
- 뒤로 가기 버튼은 이전 페이지로 이동하고, 첫 페이지에서는 앱을 닫습니다.
- 인터넷이 끊기면 안내 화면이 나오고, 연결되면 자동으로 다시 엽니다.
- 다른 앱에서 arena.ai 링크를 누를 때 이 앱으로 열 수 있습니다.
- 휴대폰의 다크 모드를 따릅니다.

## 알아 둘 점

- 구글은 앱 내장 브라우저에서의 로그인을 막는 경우가 있습니다. 이 앱은 일반 Chrome처럼
  보이도록 설정했지만, 그래도 막히면 다른 로그인 방법을 쓰세요.
- 업데이트하려면 매번 같은 서명 키로 서명돼야 합니다. 서명 키는 저장소에 올리지 않고
  GitHub Actions 캐시에 보관합니다. 캐시는 7일 동안 빌드가 없으면 지워질 수 있고, 그러면 새 키로
  서명돼서 기존 앱을 지우고 다시 설치해야 합니다. 키를 영구히 고정하려면 아래 **서명 키 고정하기**를 따르세요.
- arena.ai는 외부 서비스이고, 이 앱은 그 웹사이트를 띄워 주기만 하는 비공식 앱입니다.

## 서명 키 고정하기 (선택)

PC에서 한 번만 하면 됩니다. JDK의 `keytool`이 필요합니다.

```bash
keytool -genkeypair -keystore arena.keystore -storetype PKCS12 -alias arena \
  -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Arena" \
  -storepass 원하는비밀번호 -keypass 원하는비밀번호
base64 -w0 arena.keystore    # 출력된 긴 문자열을 복사
```

저장소의 **Settings → Secrets and variables → Actions**에서 Secret 두 개를 추가합니다.

- `ARENA_KEYSTORE_BASE64`: 위에서 복사한 문자열
- `ARENA_KEYSTORE_PASSWORD`: 정한 비밀번호

Secret을 추가하면 키가 바뀌므로, 이미 설치한 앱은 한 번 지우고 다시 설치해야 합니다.
그 뒤로는 계속 덮어 설치됩니다. `arena.keystore` 파일은 저장소에 올리지 마세요.

## 직접 빌드하기

JDK 17과 Android SDK가 필요합니다.

```bash
cd arena-android
./gradlew assembleRelease
# 결과: app/build/outputs/apk/release/app-release.apk
```

GitHub에 푸시하면 Actions의 **Arena APK 빌드**가 자동으로 APK를 만들어 위 링크에 올립니다.
