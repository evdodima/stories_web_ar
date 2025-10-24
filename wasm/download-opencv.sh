#!/bin/bash

# Download pre-built OpenCV.js for WebAssembly

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

OPENCV_VERSION="4.8.0"
OPENCV_DIR="opencv"
OPENCV_URL="https://docs.opencv.org/${OPENCV_VERSION}/opencv.js"

echo -e "${GREEN}Downloading OpenCV.js ${OPENCV_VERSION}...${NC}"

# Create opencv directory
mkdir -p ${OPENCV_DIR}

# Download opencv.js
echo "Downloading from: ${OPENCV_URL}"
curl -L -o ${OPENCV_DIR}/opencv.js ${OPENCV_URL}

if [ -f "${OPENCV_DIR}/opencv.js" ]; then
    SIZE=$(du -h ${OPENCV_DIR}/opencv.js | cut -f1)
    echo -e "${GREEN}✓ Downloaded opencv.js (${SIZE})${NC}"
    echo ""
    echo "OpenCV.js ready to use!"
else
    echo -e "${RED}Failed to download OpenCV.js${NC}"
    exit 1
fi
