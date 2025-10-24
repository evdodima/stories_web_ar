#!/bin/bash

# WebAR Engine Simple Build Script
# Uses Emscripten's built-in OpenCV port (auto-downloads)

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}WebAR Engine - Simple WASM Build${NC}"
echo "Using Emscripten's built-in OpenCV port"
echo "========================================"
echo ""

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
echo ""

# Clean previous build
if [ -d "build" ]; then
    echo -e "${YELLOW}Cleaning previous build...${NC}"
    rm -rf build
fi

# Create build directory
BUILD_DIR="build"
mkdir -p $BUILD_DIR
cd $BUILD_DIR

# Configure with CMake
echo -e "${GREEN}Configuring build...${NC}"
emcmake cmake .. -DCMAKE_BUILD_TYPE=Release

echo ""
echo -e "${GREEN}Building WebAssembly module...${NC}"
echo -e "${YELLOW}Note: First build will download OpenCV (~100MB, takes ~5 minutes)${NC}"
echo ""

# Build
emmake make -j$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)

# Check if build succeeded
cd ..
if [ -f "public/wasm/webar_engine.wasm" ]; then
    WASM_SIZE=$(du -h "public/wasm/webar_engine.wasm" | cut -f1)
    JS_SIZE=$(du -h "public/wasm/webar_engine.js" | cut -f1)

    echo ""
    echo -e "${GREEN}✓ Build successful!${NC}"
    echo "Output files:"
    echo "  - webar_engine.wasm (${WASM_SIZE})"
    echo "  - webar_engine.js (${JS_SIZE})"
    echo ""
    echo "Files are in: public/wasm/"

else
    echo -e "${RED}Build failed!${NC}"
    echo ""
    echo "Common issues:"
    echo "1. Emscripten not properly installed"
    echo "2. Network issues downloading OpenCV"
    echo "3. Missing dependencies"
    echo ""
    echo "Try:"
    echo "  - Check Emscripten: emcc --version"
    echo "  - Check internet connection"
    echo "  - Look at error messages above"
    exit 1
fi

cd ..

echo ""
echo -e "${GREEN}Done!${NC}"
echo ""
echo "To use in browser:"
echo "  npm run serve"
echo "  Open http://localhost:8000/index-wasm.html"
