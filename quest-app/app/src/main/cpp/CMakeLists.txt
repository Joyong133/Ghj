cmake_minimum_required(VERSION 3.22.1)
project(questblack CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(OpenXR REQUIRED CONFIG)

add_library(questblack SHARED main.cpp)
target_compile_options(questblack PRIVATE -Wall -Wextra -Wno-unused-parameter -Wno-missing-field-initializers)
target_link_libraries(questblack PRIVATE OpenXR::openxr_loader EGL GLESv3 android log)
