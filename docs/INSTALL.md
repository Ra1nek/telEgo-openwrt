# telEgo Installation Guide for OpenWRT 25.x

## Prerequisites

- OpenWRT 25.x with APK package manager
- x86_64 architecture router
- Public domain with DNS A record pointing to your router
- Ports 80 and 443 available on WAN interface

## Quick Installation

### Step 1: Download Packages

Download the latest packages from GitHub Releases:
```bash
cd /tmp
wget https://github.com/YOUR_REPO/telego-openwrt/releases/latest/download/telego_*.apk
wget https://github.com/YOUR_REPO/telego-openwrt/releases/latest/download/luci-app-telego_*.apk
wget https://github.com/YOUR_REPO/telego-openwrt/releases/latest/download/nginx-telego_*.apk
