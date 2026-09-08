#!/bin/bash
# Generate a random 32-character hex secret for telEgo

SECRET=$(openssl rand -hex 16)

echo "========================================"
echo "Generated Secret:"
echo "----------------------------------------"
echo "$SECRET"
echo "----------------------------------------"
echo ""
echo "MTProxy Link:"
echo "https://t.me/proxy?server=YOUR_HOSTNAME&port=443&secret=$SECRET"
echo ""
echo "WEB Proxy Link:"
echo "https://t.me/webproxy?server=YOUR_HOSTNAME&secret=$SECRET"
echo "========================================"
