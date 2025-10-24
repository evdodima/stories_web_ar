#!/bin/bash

# WebAR Deployment Script
# Wrapper for Capistrano deployment with obfuscation

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default environment
ENVIRONMENT=${1:-production}

echo -e "${GREEN}WebAR Deployment Script${NC}"
echo "================================"
echo ""

# Check if Bundler is installed
if ! command -v bundle &> /dev/null; then
    echo -e "${RED}Error: Bundler is not installed${NC}"
    echo "Install with: gem install bundler"
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed${NC}"
    exit 1
fi

# Install Ruby dependencies
echo -e "${YELLOW}Installing Ruby dependencies...${NC}"
bundle install

# Install Node.js dependencies (for local testing)
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing Node.js dependencies...${NC}"
    npm install
fi

# Test build locally
echo -e "${YELLOW}Testing build process locally...${NC}"
npm run build

if [ ! -d "dist" ]; then
    echo -e "${RED}Error: Build failed - dist directory not created${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Local build successful${NC}"
echo ""

# Clean up local build
rm -rf dist

# Deploy with Capistrano
echo -e "${YELLOW}Deploying to ${ENVIRONMENT}...${NC}"
bundle exec cap $ENVIRONMENT deploy

echo ""
echo -e "${GREEN}✓ Deployment completed successfully!${NC}"
