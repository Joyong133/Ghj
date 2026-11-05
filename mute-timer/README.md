# BGM 차단 타이머 (Android)

설정한 시간 동안 **음악 · 게임 BGM · 다운받은 영상 · 유튜브 등 모든 앱의 미디어 소리**를 막아주는 앱입니다.
시간이 끝나면 원래 볼륨으로 자동 복원됩니다.

## 작동 방식
- 미디어 볼륨(STREAM_MUSIC)을 음소거 → 모든 앱의 음악/BGM/영상 소리가 꺼짐
- 차단 중 누가 볼륨을 올려도 즉시 다시 음소거
- (옵션) 오디오 포커스를 가져와 유튜브·음악앱·동영상 플레이어를 **일시정지**시키고, 다시 재생하면 또 멈춤
- 전화벨 · 알람 · 알림 소리는 건드리지 않음
- 알림창에 남은 시간 표시 + "지금 해제" 버튼

## 설치
1. 저장소의 **Releases → `mute-timer-latest`** 에서 `BGM-Mute-Timer.apk` 다운로드
2. 휴대폰에서 열기 → "출처를 알 수 없는 앱 설치" 허용 → 설치
3. 처음 실행 시 알림 권한 허용 (남은 시간 표시용)

## 빌드
`mute-timer/` 아래가 바뀌면 GitHub Actions(`.github/workflows/mute-timer-apk.yml`)가 자동으로 APK를 빌드해 Release에 올립니다.
로컬 빌드: `cd mute-timer && ./gradlew assembleRelease` (Android SDK 필요)

최소 Android 8.0 (API 26).
