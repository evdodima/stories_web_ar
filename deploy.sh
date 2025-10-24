#!/bin/bash

# WebAR Deployment Script
# Build, check, and deploy with rsync

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Load configuration
CONFIG_FILE="${DEPLOY_CONFIG:-deploy.config}"

if [ ! -f "$CONFIG_FILE" ]; then
    echo -e "${RED}Error: Configuration file not found: $CONFIG_FILE${NC}"
    echo -e "${YELLOW}Copy deploy.config.example to deploy.config and customize it${NC}"
    echo ""
    echo "  cp deploy.config.example deploy.config"
    echo "  nano deploy.config"
    echo ""
    exit 1
fi

source "$CONFIG_FILE"

# Validate required config
if [ -z "$DEPLOY_USER" ] || [ -z "$DEPLOY_HOST" ] || [ -z "$DEPLOY_PATH" ]; then
    echo -e "${RED}Error: Missing required configuration${NC}"
    echo "Required: DEPLOY_USER, DEPLOY_HOST, DEPLOY_PATH"
    exit 1
fi

# Default values
DEPLOY_PORT="${DEPLOY_PORT:-22}"
BUILD_DIR="dist"

echo ""
echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   WebAR Deployment Script             ║${NC}"
echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo ""
echo -e "${BLUE}Target:${NC} $DEPLOY_USER@$DEPLOY_HOST:$DEPLOY_PATH"
echo ""

# Step 1: Check dependencies
echo -e "${YELLOW}[1/6] Checking dependencies...${NC}"

if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed${NC}"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo -e "${RED}Error: npm is not installed${NC}"
    exit 1
fi

if ! command -v rsync &> /dev/null; then
    echo -e "${RED}Error: rsync is not installed${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Dependencies check passed${NC}"
echo ""

# Step 2: Install npm dependencies if needed
echo -e "${YELLOW}[2/6] Installing dependencies...${NC}"

if [ ! -d "node_modules" ]; then
    npm install
else
    echo -e "${GREEN}✓ Dependencies already installed${NC}"
fi
echo ""

# Step 3: Build
echo -e "${YELLOW}[3/6] Building application...${NC}"

# Remove old build
if [ -d "$BUILD_DIR" ]; then
    rm -rf "$BUILD_DIR"
fi

# Run build
npm run build

if [ ! -d "$BUILD_DIR" ]; then
    echo -e "${RED}Error: Build failed - $BUILD_DIR directory not created${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Build completed${NC}"
echo ""

# Step 4: Validate build
echo -e "${YELLOW}[4/6] Validating build...${NC}"

# Check required files
REQUIRED_FILES=(
    "$BUILD_DIR/index.html"
    "$BUILD_DIR/webar-bundle.js"
    "$BUILD_DIR/styles.css"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$file" ]; then
        echo -e "${RED}Error: Required file missing: $file${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓${NC} Found: $(basename $file)"
done

# Syntax check JavaScript bundle
echo -n "Checking JavaScript syntax... "
if node -c "$BUILD_DIR/webar-bundle.js" 2>/dev/null; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC}"
    echo -e "${RED}Error: JavaScript syntax validation failed${NC}"
    exit 1
fi

# Check bundle size
BUNDLE_SIZE=$(du -h "$BUILD_DIR/webar-bundle.js" | cut -f1)
echo -e "${GREEN}✓${NC} Bundle size: $BUNDLE_SIZE"

echo -e "${GREEN}✓ Build validation passed${NC}"
echo ""

# Step 5: Deploy with rsync
echo -e "${YELLOW}[5/6] Deploying to server...${NC}"

# Build rsync command
RSYNC_OPTS=(
    -avz
    --delete
    --progress
    --human-readable
    --stats
)

# Add SSH options
SSH_OPTS="ssh -p $DEPLOY_PORT"
if [ -n "$DEPLOY_KEY" ]; then
    SSH_OPTS="$SSH_OPTS -i $DEPLOY_KEY"
fi
RSYNC_OPTS+=(-e "$SSH_OPTS")

# Add exclude patterns
RSYNC_OPTS+=(
    --exclude='.git'
    --exclude='.DS_Store'
    --exclude='node_modules'
    --exclude='.gitignore'
)

if [ -n "$EXCLUDE_PATTERNS" ]; then
    for pattern in $EXCLUDE_PATTERNS; do
        RSYNC_OPTS+=(--exclude="$pattern")
    done
fi

# Perform rsync
echo ""
echo -e "${BLUE}Syncing files...${NC}"
rsync "${RSYNC_OPTS[@]}" \
    "$BUILD_DIR/" \
    "$DEPLOY_USER@$DEPLOY_HOST:$DEPLOY_PATH/"

if [ $? -ne 0 ]; then
    echo ""
    echo -e "${RED}Error: rsync failed${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}✓ Files synced successfully${NC}"
echo ""

# Step 6: Verify deployment
echo -e "${YELLOW}[6/6] Verifying deployment...${NC}"

echo -n "Checking remote files... "
SSH_CMD="ssh -p $DEPLOY_PORT"
if [ -n "$DEPLOY_KEY" ]; then
    SSH_CMD="$SSH_CMD -i $DEPLOY_KEY"
fi

REMOTE_CHECK="$SSH_CMD $DEPLOY_USER@$DEPLOY_HOST 'test -f $DEPLOY_PATH/index.html && test -f $DEPLOY_PATH/webar-bundle.js && echo OK'"

if eval "$REMOTE_CHECK" | grep -q "OK"; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC}"
    echo -e "${YELLOW}Warning: Could not verify remote files${NC}"
fi

echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Deployment completed successfully!   ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Deployed to:${NC} http://$DEPLOY_HOST"
echo ""

# Optional: Clean up local build
read -p "$(echo -e ${YELLOW}Clean up local build directory? [y/N]:${NC} )" -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    rm -rf "$BUILD_DIR"
    echo -e "${GREEN}✓ Build directory cleaned${NC}"
fi

echo ""
echo -e "${BLUE}Deployment completed at:${NC} $(date '+%Y-%m-%d %H:%M:%S')"
