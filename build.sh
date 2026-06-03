#!/usr/bin/env bash
set -euo pipefail

# Install root dependencies (postinstall also runs: cd website && npm install)
npm ci

# Fetch and consolidate vendor registry data
npm run consolidate

# Install website dependencies with lock file
cd website && npm ci && cd ..

# Copy consolidated API and schema files into the website's public dir
mkdir -p website/public/api/v1 website/public/schemas
cp dist/api/v1/*.json website/public/api/v1/
cp schemas/*.json website/public/schemas/

# Build the React/Vite site; releng-pipeline picks up output from website/dist
cd website && npm run build
