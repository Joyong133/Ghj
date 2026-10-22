#!/usr/bin/env python3
"""apktool 로 푼 Godot APK 를 OpenXR(Meta Quest 등) 용으로 고친다.

Godot 의 Gradle 빌드 + Khronos OpenXR 로더 AAR 이 매니페스트에 넣는 항목을 그대로 추가하고,
Godot 가 OpenXR 모드로 시작하도록 assets/_cl_ 의 실행 플래그를 바꾼다.
"""
import re
import struct
import sys
from pathlib import Path

dec = Path(sys.argv[1])

# ---------------------------------------------------------------- AndroidManifest.xml
mf = dec / "AndroidManifest.xml"
xml = mf.read_text(encoding="utf-8")

manifest_items = """
    <uses-feature android:name="android.hardware.vr.headtracking" android:required="true" android:version="1"/>
    <uses-permission android:name="org.khronos.openxr.permission.OPENXR"/>
    <uses-permission android:name="org.khronos.openxr.permission.OPENXR_SYSTEM"/>
    <queries>
        <provider android:authorities="org.khronos.openxr.runtime_broker;org.khronos.openxr.system_runtime_broker"/>
        <intent>
            <action android:name="org.khronos.openxr.OpenXRRuntimeService"/>
        </intent>
        <intent>
            <action android:name="org.khronos.openxr.OpenXRApiLayerService"/>
        </intent>
    </queries>
"""
if "org.khronos.openxr.permission.OPENXR" not in xml:
    xml = xml.replace("<application", manifest_items + "    <application", 1)

app_items = """
        <meta-data android:name="com.oculus.supportedDevices" android:value="quest2|questpro|quest3|quest3s"/>"""
if "com.oculus.supportedDevices" not in xml:
    xml = re.sub(r"(<application[^>]*>)", lambda m: m.group(1) + app_items, xml, count=1)

categories = """
                <category android:name="com.oculus.intent.category.VR"/>
                <category android:name="org.khronos.openxr.intent.category.IMMERSIVE_HMD"/>"""
if "com.oculus.intent.category.VR" not in xml:
    xml = xml.replace('<category android:name="android.intent.category.LAUNCHER"/>',
                      '<category android:name="android.intent.category.LAUNCHER"/>' + categories, 1)

# VR 에서는 창 크기 변경이 필요 없다
xml = xml.replace('android:resizeableActivity="true"', 'android:resizeableActivity="false"')
mf.write_text(xml, encoding="utf-8")

# ---------------------------------------------------------------- apktool.yml (minSdk 29 = Quest)
yml = dec / "apktool.yml"
y = yml.read_text(encoding="utf-8")
y = re.sub(r"minSdkVersion: '?\d+'?", "minSdkVersion: 29", y)
if "doNotCompress:" in y and "- so" not in y:
    y = y.replace("doNotCompress:\n", "doNotCompress:\n- so\n", 1)
yml.write_text(y, encoding="utf-8")

# ---------------------------------------------------------------- assets/_cl_ (실행 인자)
cl = dec / "assets" / "_cl_"
data = cl.read_bytes()
count = struct.unpack_from("<i", data, 0)[0]
off = 4
args = []
for _ in range(count):
    n = struct.unpack_from("<i", data, off)[0]
    off += 4
    args.append(data[off:off + n].decode("utf-8"))
    off += n
args = [a for a in args if not a.startswith("--xr_mode_")]
args.insert(0, "--xr_mode_openxr")
out = struct.pack("<i", len(args))
for a in args:
    b = a.encode("utf-8")
    out += struct.pack("<i", len(b)) + b
cl.write_bytes(out)
print("  실행 인자:", args)
