#!/bin/bash

# Build script for native test program

set -e

echo "=========================================="
echo "Building WebAR Test Program (Native)"
echo "=========================================="
echo ""

# Check if OpenCV is installed
if ! pkg-config --exists opencv4 2>/dev/null; then
    echo "Error: OpenCV not found!"
    echo "Install OpenCV:"
    echo "  macOS: brew install opencv"
    echo "  Linux: sudo apt-get install libopencv-dev"
    exit 1
fi

OPENCV_VERSION=$(pkg-config --modversion opencv4)
echo "Found OpenCV version: $OPENCV_VERSION"
echo ""

# Clean previous build
if [ -d "build-test" ]; then
    echo "Cleaning previous build..."
    rm -rf build-test
fi

# Create build directory
mkdir -p build-test
cd build-test

# Configure
echo "Configuring..."
cmake .. -DCMAKE_BUILD_TYPE=Release

# Build
echo ""
echo "Building..."
make -j$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)

echo ""
echo "Build complete!"
echo ""
echo "Run test:"
echo "  cd wasm"
echo "  ./test_tracking"
echo ""
