# Standalone Test for WebAR Engine (Native build, not WASM)
cmake_minimum_required(VERSION 3.15)
project(webar_test)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Find OpenCV (system installation)
find_package(OpenCV REQUIRED COMPONENTS core imgproc features2d video calib3d imgcodecs highgui videoio)

# Source files (same as WASM, but with test main)
set(SOURCES
    src/ar_engine.cpp
    src/feature_detector.cpp
    src/optical_flow_tracker.cpp
    src/target_manager.cpp
    src/memory_pool.cpp
    test_tracking.cpp
)

# Include directories
include_directories(${CMAKE_CURRENT_SOURCE_DIR}/include)
include_directories(${OpenCV_INCLUDE_DIRS})

# Create test executable
add_executable(test_tracking ${SOURCES})

# Link OpenCV
target_link_libraries(test_tracking ${OpenCV_LIBS})

# Set output directory
set_target_properties(test_tracking PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}"
)

message(STATUS "")
message(STATUS "WebAR Test Configuration:")
message(STATUS "  Build type: ${CMAKE_BUILD_TYPE}")
message(STATUS "  C++ Standard: ${CMAKE_CXX_STANDARD}")
message(STATUS "  OpenCV version: ${OpenCV_VERSION}")
message(STATUS "  OpenCV libs: ${OpenCV_LIBS}")
message(STATUS "")
