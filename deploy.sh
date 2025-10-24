#!/bin/bash
set -e

echo "Building..."
npm run build

echo "Checking..."
node -c dist/webar-bundle.js

echo "Deploying..."
rsync -avz --delete dist/ webar@46.101.145.128:/var/www/webar/

echo "✓ Done"
