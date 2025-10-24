#!/bin/bash
set -e

echo "Building OpenCV for Emscripten..."

# Clone OpenCV
git clone --depth 1 --branch 4.8.0 https://github.com/opencv/opencv.git opencv-src
cd opencv-src
mkdir build && cd build

# Configure with minimal modules
emcmake cmake \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_INSTALL_PREFIX=../../opencv \
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
  -DBUILD_LIST=core,imgproc,features2d,video,calib3d \
  -DCPU_BASELINE='' \
  -DCPU_DISPATCH='' \
  ..

# Build (use all CPU cores)
emmake make -j$(npmake -j$(sysctl -n hw.ncpu)roc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)

# Install
make install

cd ../..
rm -rf opencv-src

echo "OpenCV installed to: $(pwd)/opencv"
ls -lh opencv/lib/