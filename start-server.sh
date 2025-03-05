#!/bin/bash

echo "Starting local web server for WebAR Image Tracking..."

# Check if Python 3 is available
if command -v python3 &>/dev/null; then
    echo "Using Python 3 to start server"
    python3 -m http.server 8000
    
# Check if Python is available (might be Python 3 on some systems)
elif command -v python &>/dev/null; then
    PYTHON_VERSION=$(python --version 2>&1)
    if [[ $PYTHON_VERSION == *"Python 3"* ]]; then
        echo "Using Python 3 to start server"
        python -m http.server 8000
    else
        echo "Using Python 2 to start server"
        python -m SimpleHTTPServer 8000
    fi
    
# If no Python, check for Node.js/npx
elif command -v npx &>/dev/null; then
    echo "Using Node.js/npx to start server"
    npx serve -s .
    
# If nothing else works, provide instructions
else
    echo "Error: Neither Python nor Node.js found."
    echo "Please install one of the following:"
    echo "  - Python 3: https://www.python.org/downloads/"
    echo "  - Node.js: https://nodejs.org/"
    echo ""
    echo "Alternatively, you can use any web server of your choice to serve these files."
    exit 1
fi