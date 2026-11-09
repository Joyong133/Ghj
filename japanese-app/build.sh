#!/usr/bin/env bash
# 니홍고 마스터 APK 빌드 스크립트 (Gradle 없이 aapt2 + javac + dx + zipalign + apksigner)
#
# 필요 도구 (Ubuntu/Debian):
#   sudo apt-get install -y aapt zipalign apksigner dalvik-exchange openjdk-17-jdk python3-pil
# android.jar(API 34)는 처음 실행 시 자동으로 내려받습니다.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE"

BUILD="$HERE/build"
CACHE="$HERE/.cache"
ANDROID_JAR="${ANDROID_JAR:-$CACHE/android-34.jar}"
KEYSTORE="${KEYSTORE:-$HERE/keystore/nihongo-release.jks}"
KS_PASS="${KS_PASS:-android}"
KEY_ALIAS="${KEY_ALIAS:-nihongo}"
OUT="$HERE/dist/nihongo-master.apk"

mkdir -p "$CACHE" "$HERE/dist"

if [ ! -f "$ANDROID_JAR" ]; then
  echo "▶ android.jar (API 34) 다운로드"
  curl -fsSL -o "$ANDROID_JAR" https://raw.githubusercontent.com/Sable/android-platforms/master/android-34/android.jar
fi

for t in aapt2 javac zipalign apksigner; do
  command -v "$t" >/dev/null || { echo "❌ $t 가 필요합니다"; exit 1; }
done
DX=""
if command -v d8 >/dev/null; then DX="d8"; elif command -v dalvik-exchange >/dev/null; then DX="dx"; else
  echo "❌ d8 또는 dalvik-exchange(dx)가 필요합니다"; exit 1; fi

rm -rf "$BUILD"
mkdir -p "$BUILD"/{compiled,gen,classes,assets/www}

echo "▶ 아이콘 생성"
python3 tools/make_icons.py

echo "▶ 웹 자산 검사 및 복사"
if command -v node >/dev/null && [ -f tools/check-data.js ]; then node tools/check-data.js; fi
cp -r web/. "$BUILD/assets/www/"

echo "▶ 리소스 컴파일 (aapt2)"
aapt2 compile --dir android/res -o "$BUILD/compiled/res.zip"

echo "▶ 리소스 링크"
aapt2 link -o "$BUILD/base.apk" \
  -I "$ANDROID_JAR" \
  --manifest android/AndroidManifest.xml \
  --java "$BUILD/gen" \
  -A "$BUILD/assets" \
  --min-sdk-version 21 --target-sdk-version 34 \
  --auto-add-overlay \
  "$BUILD/compiled/res.zip"

echo "▶ 자바 컴파일"
find android/src "$BUILD/gen" -name '*.java' > "$BUILD/sources.txt"
javac -nowarn -Xlint:-options -encoding UTF-8 -source 8 -target 8 \
  -bootclasspath "$ANDROID_JAR" -d "$BUILD/classes" @"$BUILD/sources.txt"

echo "▶ DEX 변환 ($DX)"
if [ "$DX" = "d8" ]; then
  d8 --release --min-api 21 --lib "$ANDROID_JAR" --output "$BUILD" $(find "$BUILD/classes" -name '*.class')
else
  dalvik-exchange --dex --min-sdk-version=21 --output="$BUILD/classes.dex" "$BUILD/classes"
fi

echo "▶ APK 패키징"
( cd "$BUILD" && zip -q -j base.apk classes.dex )
zipalign -p -f 4 "$BUILD/base.apk" "$BUILD/aligned.apk"

if [ ! -f "$KEYSTORE" ]; then
  echo "▶ 서명 키 생성"
  mkdir -p "$(dirname "$KEYSTORE")"
  keytool -genkeypair -keystore "$KEYSTORE" -storepass "$KS_PASS" -keypass "$KS_PASS" \
    -alias "$KEY_ALIAS" -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=Nihongo Master, OU=GHJ, O=GHJ, C=KR" 2>/dev/null
fi

echo "▶ 서명 (v1+v2+v3)"
apksigner sign --ks "$KEYSTORE" --ks-pass "pass:$KS_PASS" --key-pass "pass:$KS_PASS" \
  --ks-key-alias "$KEY_ALIAS" --min-sdk-version 21 \
  --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true --v4-signing-enabled false \
  --out "$OUT" "$BUILD/aligned.apk"
apksigner verify --min-sdk-version 21 "$OUT"

echo "✅ 완료: $OUT ($(du -h "$OUT" | cut -f1))"
