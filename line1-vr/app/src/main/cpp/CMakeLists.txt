cmake_minimum_required(VERSION 3.22.1)
project(line1vr LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(OpenXR REQUIRED CONFIG)

add_library(native_app_glue STATIC
    ${ANDROID_NDK}/sources/android/native_app_glue/android_native_app_glue.c)
target_include_directories(native_app_glue PUBLIC
    ${ANDROID_NDK}/sources/android/native_app_glue)

add_library(line1vr SHARED
    main_android.cpp
    audio_android.cpp
    app.cpp
    gfx.cpp
    world.cpp
    train.cpp
    track.cpp)

target_compile_options(line1vr PRIVATE -Wall -Wno-unused-function)
target_link_libraries(line1vr
    native_app_glue
    OpenXR::openxr_loader
    android log EGL GLESv3 aaudio)

# Keep the NativeActivity entry point that lives in the static glue library.
target_link_options(line1vr PRIVATE -u ANativeActivity_onCreate)
