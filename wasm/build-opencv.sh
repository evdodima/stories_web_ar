#!/bin/bash

# Build OpenCV for Emscripten (with TBB disabled to avoid errors)

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}Building OpenCV for Emscripten${NC}"
echo "===================================="
echo ""

# Check Emscripten
if ! command -v emcc &> /dev/null; then
    echo -e "${RED}Error: Emscripten not found!${NC}"
    echo "Run: source ~/emsdk/emsdk_env.sh"
    exit 1
fi

OPENCV_VERSION="4.8.0"
OPENCV_DIR="opencv"
OPENCV_SRC="opencv-src"

# Clone OpenCV if not exists
if [ ! -d "${OPENCV_SRC}" ]; then
    echo "Cloning OpenCV ${OPENCV_VERSION}..."
    git clone --depth 1 --branch ${OPENCV_VERSION} \
        https://github.com/opencv/opencv.git ${OPENCV_SRC}
fi

# Create build directory
mkdir -p ${OPENCV_SRC}/build
cd ${OPENCV_SRC}/build

echo ""
echo -e "${GREEN}Configuring OpenCV build...${NC}"
echo ""

# Configure with CMake - DISABLE TBB to avoid errors
emcmake cmake .. \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_INSTALL_PREFIX=../../${OPENCV_DIR} \
    -DBUILD_SHARED_LIBS=OFF \
    -DBUILD_opencv_apps=OFF \
    -DBUILD_opencv_python=OFF \
    -DBUILD_opencv_python2=OFF \
    -DBUILD_opencv_python3=OFF \
    -DBUILD_EXAMPLES=OFF \
    -DBUILD_TESTS=OFF \
    -DBUILD_PERF_TESTS=OFF \
    -DBUILD_DOCS=OFF \
    -DWITH_PNG=OFF \
    -DWITH_JPEG=OFF \
    -DWITH_TIFF=OFF \
    -DWITH_WEBP=OFF \
    -DWITH_OPENJPEG=OFF \
    -DWITH_JASPER=OFF \
    -DWITH_OPENEXR=OFF \
    -DWITH_TBB=OFF \
    -DWITH_IPP=OFF \
    -DWITH_PTHREADS_PF=OFF \
    -DCV_ENABLE_INTRINSICS=OFF \
    -DBUILD_ITT=OFF \
    -DWITH_ITT=OFF \
    -DBUILD_LIST=core,imgproc,features2d,video,calib3d \
    -DCPU_BASELINE='' \
    -DCPU_DISPATCH=''

echo ""
echo -e "${GREEN}Building OpenCV (this takes ~10 minutes)...${NC}"
echo ""

# Build
emmake make -j$(sysctl -n hw.ncpu 2>/dev/null || echo 4)

echo ""
echo -e "${GREEN}Installing OpenCV...${NC}"
echo ""

# Install
make install

cd ../..

echo ""
echo -e "${GREEN}✓ OpenCV built successfully!${NC}"
echo "Installed to: $(pwd)/${OPENCV_DIR}"
echo ""
ls -lh ${OPENCV_DIR}/lib/*.a 2>/dev/null | head -10 || echo "No .a files found"
echo ""
