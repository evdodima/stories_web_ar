#!/bin/bash

# Helper script to build WASM with Emscripten environment check

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo -e "${GREEN}WebAR WASM Build Helper${NC}"
echo "========================"
echo ""

# Check if Emscripten is available
if ! command -v emcc &> /dev/null; then
    echo -e "${RED}❌ Emscripten not found!${NC}"
    echo ""
    echo "You need to activate Emscripten first."
    echo ""
    echo -e "${YELLOW}Run this command:${NC}"
    echo ""
    echo "  source ~/emsdk/emsdk_env.sh"
    echo ""
    echo "Then run this script again."
    echo ""
    exit 1
fi

# Show Emscripten version
EMCC_VERSION=$(emcc --version | head -n 1)
echo -e "${GREEN}✓ Emscripten found:${NC}"
echo "  $EMCC_VERSION"
echo ""

# Run the build
echo "Starting build..."
echo ""
npm run build:wasm
