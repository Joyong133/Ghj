#!/bin/sh
# Builds the off-screen test harness (needs libegl-dev, libgles-dev and Mesa).
set -e
cd "$(dirname "$0")"
SRC=../app/src/main/cpp
g++ -std=c++17 -O2 -Wall -I"$SRC" -I. main_desktop.cpp "$SRC"/app.cpp "$SRC"/gfx.cpp "$SRC"/world.cpp \
    "$SRC"/train.cpp "$SRC"/track.cpp -o line1_desktop -lEGL -lGLESv2
