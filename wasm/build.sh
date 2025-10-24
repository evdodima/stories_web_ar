#!/bin/bash

# WebAR Engine Build Script
# Builds C++ code to WebAssembly using Emscripten

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}WebAR Engine - WASM Build${NC}"
echo "================================"

# Check if Emscripten is installed
if ! command -v emcc &> /dev/null; then
    echo -e "${RED}Error: Emscripten not found!${NC}"
    echo "Please install Emscripten:"
    echo "  git clone https://github.com/emscripten-core/emsdk.git"
    echo "  cd emsdk"
    echo "  ./emsdk install latest"
    echo "  ./emsdk activate latest"
    echo "  source ./emsdk_env.sh"
    exit 1
fi

# Check Emscripten version
EMCC_VERSION=$(emcc --version | head -n 1)
echo -e "${GREEN}Using: ${EMCC_VERSION}${NC}"

# Check for OpenCV
OPENCV_DIR="./opencv"
if [ ! -d "$OPENCV_DIR" ]; then
    echo -e "${YELLOW}Warning: OpenCV directory not found at ${OPENCV_DIR}${NC}"
    echo "You need to either:"
    echo "  1. Build OpenCV for Emscripten and place it in ./opencv/"
    echo "  2. Use OpenCV.js headers (will increase binary size)"
    echo ""
    echo -e "${YELLOW}For production, consider building OpenCV with:"
    echo "  - Only required modules (core, imgproc, features2d, video, calib3d)"
    echo "  - Optimized for WASM (-O3, SIMD)"
    echo ""
    echo -e "${GREEN}Continuing build (will fail if OpenCV not available)...${NC}"
fi

# Create build directory
BUILD_DIR="build"
mkdir -p $BUILD_DIR
cd $BUILD_DIR

# Configure with CMake
echo -e "${GREEN}Configuring build...${NC}"
emcmake cmake .. \
    -DCMAKE_BUILD_TYPE=Release \
    -DOpenCV_DIR=$OPENCV_DIR

# Build
echo -e "${GREEN}Building WebAssembly module...${NC}"
emmake make -j$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)

# Check if build succeeded
if [ -f "../public/wasm/webar_engine.wasm" ]; then
    WASM_SIZE=$(du -h "../public/wasm/webar_engine.wasm" | cut -f1)
    JS_SIZE=$(du -h "../public/wasm/webar_engine.js" | cut -f1)

    echo ""
    echo -e "${GREEN}Build successful!${NC}"
    echo "Output files:"
    echo "  - webar_engine.wasm (${WASM_SIZE})"
    echo "  - webar_engine.js (${JS_SIZE})"
    echo ""
    echo "Files are in: ../public/wasm/"

    # Suggest optimization
    if command -v wasm-opt &> /dev/null; then
        echo ""
        echo -e "${GREEN}Running wasm-opt for additional optimization...${NC}"
        wasm-opt -O3 -o "../public/wasm/webar_engine.opt.wasm" \
            "../public/wasm/webar_engine.wasm"
        mv "../public/wasm/webar_engine.opt.wasm" \
            "../public/wasm/webar_engine.wasm"

        OPT_SIZE=$(du -h "../public/wasm/webar_engine.wasm" | cut -f1)
        echo "Optimized WASM size: ${OPT_SIZE}"
    else
        echo -e "${YELLOW}Tip: Install wasm-opt from binaryen for better optimization${NC}"
    fi

else
    echo -e "${RED}Build failed!${NC}"
    exit 1
fi

cd ..

echo ""
echo -e "${GREEN}Done!${NC}"
echo "To use in browser, include the generated .js file:"
echo "  <script src=\"public/wasm/webar_engine.js\"></script>"
