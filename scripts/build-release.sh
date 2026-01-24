#!/usr/bin/env bash
# Build release packages for multiple platforms using Docker

set -euo pipefail

VERSION=$(node -p "require('../package.json').version")
REPO=$(node -p "require('../package.json').repository.url" | sed 's/https:\/\/github.com\///' | sed 's/.git//')

echo "Building Invariant Accounting v${VERSION} for multiple platforms..."

# Ensure the build directory exists
mkdir -p ./build

# Create directories for each platform
mkdir -p ./build/windows
mkdir -p ./build/linux
mkdir -p ./build/macos-intel
mkdir -p ./build/macos-apple-silicon

# Build for each platform
echo "Building for Windows..."
cd ./build/windows
docker run --rm -v $(pwd)/../../:/src -w /src \
  rust:latest \
  bash -c "rustup target add x86_64-pc-windows-gnu && \
           cargo build --target x86_64-pc-windows-gnu --release"

echo "Building for Linux..."
cd ../linux
docker run --rm -v $(pwd)/../../:/src -w /src \
  rust:latest \
  bash -c "cargo build --release"

echo "Building for macOS Intel..."
cd ../macos-intel
docker run --rm -v $(pwd)/../../:/src -w /src \
  rust:latest \
  bash -c "rustup target add x86_64-apple-darwin && \
           cargo build --target x86_64-apple-darwin --release"

echo "Building for macOS Apple Silicon..."
cd ../macos-apple-silicon
docker run --rm -v $(pwd)/../../:/src -w /src \
  rust:latest \
  bash -c "rustup target add aarch64-apple-darwin && \
           cargo build --target aarch64-apple-darwin --release"

cd ../..

# Create release.json for updater
cat > ./build/latest.json <<EOF
{
  "version": "${VERSION}",
  "notes": "See CHANGELOG.md for details",
  "pub_date": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "platforms": {
    "windows-x86_64": {
      "signature": "",
      "url": "https://github.com/${REPO}/releases/download/v${VERSION}/invariant_${VERSION}_x64_en-US.msi"
    },
    "linux-x86_64": {
      "signature": "",
      "url": "https://github.com/${REPO}/releases/download/v${VERSION}/invariant_${VERSION}_amd64.AppImage"
    },
    "darwin-x86_64": {
      "signature": "",
      "url": "https://github.com/${REPO}/releases/download/v${VERSION}/invariant_${VERSION}_x64.dmg"
    },
    "darwin-aarch64": {
      "signature": "",
      "url": "https://github.com/${REPO}/releases/download/v${VERSION}/invariant_${VERSION}_aarch64.dmg"
    }
  }
}
EOF

echo "Build complete! Files in ./build directory."
echo "Add to GitHub release: https://github.com/${REPO}/releases/tag/v${VERSION}"