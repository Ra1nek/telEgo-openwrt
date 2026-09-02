#!/bin/bash
# Installation script for telEgo on OpenWRT router
# Usage: ./install-on-router.sh <router_ip> [packages_dir]

ROUTER_IP=${1:-192.168.88.1}
PACKAGES_DIR=${2:-./packages}

echo "=== Installing telEgo on $ROUTER_IP ==="

# Transfer packages to router
scp ${PACKAGES_DIR}/*.apk root@$ROUTER_IP:/tmp/

# Install packages via SSH
ssh root@$ROUTER_IP << 'EOF'
# Update repositories
apk update

# Install dependencies
apk add luci-base luci-compat qrencode ca-bundle unzip curl jq nginx openssl

# Install telEgo packages
cd /tmp
apk add --allow-untrusted telego_*.apk
apk add --allow-untrusted luci-app-telego_*.apk
apk add --allow-untrusted nginx-telego_*.apk

# Clean up
rm -f *.apk

echo "Installation complete!"
EOF

echo "=== Installation Complete ==="
echo "Access LuCI interface at: http://$ROUTER_IP"
echo "Menu: Services → Telegram MTProxy (telEgo)"
