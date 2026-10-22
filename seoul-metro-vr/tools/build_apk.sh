#!/bin/bash
# 서울 지하철 VR — Meta Quest(OpenXR) 용 APK 빌드
#
# 필요한 것:
#   - Godot 4.3 (godot 명령) + Android 내보내기 템플릿
#   - JDK 17+ (keytool), apksigner, zipalign, apktool.jar
#   - Khronos OpenXR 로더 AAR (Maven Central: org.khronos.openxr:openxr_loader_for_android)
#
# Godot 4.3 은 OpenXR 모드로 내보내려면 Gradle 빌드(Android SDK 전체)가 필요하다.
# 이 스크립트는 Gradle 없이 기본 템플릿으로 내보낸 뒤, Gradle 빌드가 해 주는 일
# (OpenXR 로더 포함, VR 매니페스트 항목 추가, xr_mode_openxr 플래그)을 직접 적용한다.
#
# 사용법: tools/build_apk.sh            → build/SeoulMetroVR.apk
# 환경변수: GODOT, APKTOOL_JAR, OPENXR_AAR, KEYSTORE, KEYSTORE_PASS, KEY_ALIAS
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$ROOT/build"
GODOT="${GODOT:-godot}"
APKTOOL_JAR="${APKTOOL_JAR:-$HOME/tools/apktool.jar}"
OPENXR_AAR="${OPENXR_AAR:-$HOME/tools/openxr_loader.aar}"
OPENXR_VER="1.0.34"
KEYSTORE="${KEYSTORE:-$BUILD/release.keystore}"
KEYSTORE_PASS="${KEYSTORE_PASS:-seoulmetro}"
KEY_ALIAS="${KEY_ALIAS:-seoulmetro}"
OUT="$BUILD/SeoulMetroVR.apk"

mkdir -p "$BUILD"
touch "$BUILD/.gdignore"          # Godot 가 build 폴더를 프로젝트에 넣지 않도록
rm -rf "$BUILD/dec"

if [ ! -f "$APKTOOL_JAR" ]; then
	echo "apktool 다운로드..."
	curl -sSL -o "$APKTOOL_JAR" https://github.com/iBotPeaches/Apktool/releases/download/v2.10.0/apktool_2.10.0.jar
fi
if [ ! -f "$OPENXR_AAR" ]; then
	echo "OpenXR 로더 다운로드..."
	curl -sSL -o "$OPENXR_AAR" "https://repo.maven.apache.org/maven2/org/khronos/openxr/openxr_loader_for_android/$OPENXR_VER/openxr_loader_for_android-$OPENXR_VER.aar"
fi
if [ ! -f "$KEYSTORE" ]; then
	echo "서명용 키스토어 생성..."
	keytool -genkeypair -keystore "$KEYSTORE" -storepass "$KEYSTORE_PASS" -alias "$KEY_ALIAS" \
		-keypass "$KEYSTORE_PASS" -keyalg RSA -keysize 2048 -validity 10000 \
		-dname "CN=Seoul Metro VR,O=GHJ,C=KR" >/dev/null 2>&1
fi

echo "[1/5] Godot 내보내기 (기본 템플릿)"
cd "$ROOT"
"$GODOT" --headless --editor --quit >/dev/null 2>&1 || true
GODOT_ANDROID_KEYSTORE_RELEASE_PATH="$KEYSTORE" \
GODOT_ANDROID_KEYSTORE_RELEASE_USER="$KEY_ALIAS" \
GODOT_ANDROID_KEYSTORE_RELEASE_PASSWORD="$KEYSTORE_PASS" \
	"$GODOT" --headless --export-release "Android" "$BUILD/base.apk" 2>&1 | grep -E "ERROR|error|export: end" || true
[ -f "$BUILD/base.apk" ] || { echo "내보내기 실패"; exit 1; }

echo "[2/5] APK 풀기"
rm -rf "$BUILD/dec"
java -jar "$APKTOOL_JAR" d -s -f "$BUILD/base.apk" -o "$BUILD/dec" >/dev/null

echo "[3/5] OpenXR 적용 (로더, 매니페스트, 실행 플래그)"
mkdir -p "$BUILD/dec/lib/arm64-v8a"
unzip -p "$OPENXR_AAR" "prefab/modules/openxr_loader/libs/android.arm64-v8a/libopenxr_loader.so" > "$BUILD/dec/lib/arm64-v8a/libopenxr_loader.so"
python3 "$ROOT/tools/patch_openxr.py" "$BUILD/dec"

echo "[4/5] 다시 묶기"
rm -f "$BUILD/unsigned.apk" "$BUILD/aligned.apk"
java -jar "$APKTOOL_JAR" b "$BUILD/dec" -o "$BUILD/unsigned.apk" >/dev/null
zipalign -f -p 4 "$BUILD/unsigned.apk" "$BUILD/aligned.apk"

echo "[5/5] 서명"
apksigner sign --ks "$KEYSTORE" --ks-pass "pass:$KEYSTORE_PASS" --ks-key-alias "$KEY_ALIAS" \
	--key-pass "pass:$KEYSTORE_PASS" --out "$OUT" "$BUILD/aligned.apk"
apksigner verify "$OUT"
rm -rf "$BUILD/dec" "$BUILD/unsigned.apk" "$BUILD/aligned.apk" "$OUT.idsig"
ls -la "$OUT"
echo "완료: $OUT"
