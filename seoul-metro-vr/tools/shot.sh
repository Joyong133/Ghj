#!/bin/bash
# 개발용 스크린샷: tools/shot.sh out.png [godot 사용자 인자...]
out="$1"; shift
cd "$(dirname "$0")/.."
timeout ${SHOT_TIMEOUT:-240} xvfb-run -a -s "-screen 0 1280x720x24" godot --rendering-driver opengl3 --resolution 1280x720 -- --shot "$out" "$@" 2>&1 | grep -E "SCRIPT ERROR|SHOT|PERF|STATE|SEG|at: " | grep -v openxr | head -20
