#!/bin/bash
# Build script for telEgo OpenWRT packages
# Usage: ./build-all.sh [openwrt_source_dir]

set -e

OPENWRT_SRC=${1:-~/openwrt}
BUILD_DIR=$(pwd)/build
OUTPUT_DIR=$(pwd)/packages

echo "=== Building telEgo OpenWRT Packages ==="

# Create directories
mkdir -p $BUILD_DIR $OUTPUT_DIR

# Build telEgo binary first
echo "[1/4] Building telEgo binary..."
cd telego-pkg
make -C $OPENWRT_SRC package/telego/{clean,compile} V=s
cp build_dir/target-x86-64_cortex-a64+wp/telego*/telego $OUTPUT_DIR/

# Build telEgo APK package
echo "[2/4] Building telEgo APK..."
nfpm pkg --target $OUTPUT_DIR/telego_1.0.0_x86_64.apk --packager apk

# Build LuCI interface APK
echo "[3/4] Building LuCI APK..."
cd ../luci-app-telego
make -C $OPENWRT_SRC package/luci-app-telego/{clean,compile} V=s
nfpm pkg --target $OUTPUT_DIR/luci-app-telego_1.0.0_noarch.apk --packager apk

# Build Nginx config APK
echo "[4/4] Building Nginx Config APK..."
cd ../nginx-pkg
nfpm pkg --target $OUTPUT_DIR/nginx-telego_1.0.0_x86_64.apk --packager apk

echo "=== Build Complete ==="
echo "Packages available in: $OUTPUT_DIR/"
ls -lh $OUTPUT_DIR/*.apk
