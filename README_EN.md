# 🚀 telEgo — Telegram MTProxy + WEB Proxy for OpenWrt
[![OpenWrt](https://img.shields.io/badge/OpenWrt-25.12.4+-blue?style=for-the-badge&logo=openwrt)](https://openwrt.org/)
[![Go](https://img.shields.io/badge/Go-1.24+-blue?style=for-the-badge&logo=go)](https://golang.org/)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-x86_64%20%7C%20arm-blue?style=for-the-badge)](#)

**Professional Telegram Proxy Server Solution for OpenWrt Routers — MTProxy + WEB Proxy with LuCI Web Interface**

---

## 📋 Table of Contents
- [Overview](#overview)
- [Key Features](#key-features)
- [Architecture & Structure](#architecture--structure)
- [Installation & Build Instructions](#installation--build-instructions)
- [Configuration & Usage](#configuration--usage)
- [Technical Documentation](#technical-documentation)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

---

## 📖 Overview

**telEgo** is a production-ready Telegram proxy server solution designed for OpenWrt routers. It combines the original [`Scratch-net/telego`](https://github.com/Scratch-net/telego) Go binary with a comprehensive LuCI web interface, providing both **MTProxy (classic protocol)** and **WEB Proxy (new 2026 standard)** support.

### What Makes telEgo Special?
- ✅ **Dual Protocol Support**: MTProxy + WEB Proxy in one package
- ✅ **LuCI Web Interface**: Full configuration via OpenWrt web UI
- ✅ **Hot Reload**: SIGHUP signal for config changes without restart
- ✅ **Multi-Architecture**: x86_64, arm, mips support
- ✅ **Production Ready**: Prometheus metrics, TLS masking, obfuscation

---

## ✨ Key Features

### 🔷 MTProxy (Classic Protocol)
<table>
<tr>
<td width="50%">
**Encryption Modes:**
</td>
<td width="50%">
✅ **TLS Mode (ee)** — Standard TLS<br>
✅ **FakeTLS** — TLS imitation for DPI bypass<br>
✅ **Secure Mode (dd)** — Obfuscated2
</td>
</tr>
<tr>
<td width="50%">
**Features:**
</td>
<td width="50%">
🔹 Middle-End Proxy Routing<br>
🔹 TLS Domain Masking (FakeTLS)<br>
🔹 32-character hex secret generation<br>
🔹 Dynamic section management
</td>
</tr>
</table>

### 🔷 WEB Proxy (New Telegram Standard)
<table>
<tr>
<td width="50%">
**Carrier Modes:**
</td>
<td width="50%">
🌐 **HTTPS** — Direct HTTPS tunnel<br>
🔗 **WebSocket** — WebSocket tunneling<br>
🚧 **WebSocket Lanes** — Optimized WS<br>
⚡ **HTTPS Lanes** — Optimized HTTPS
</td>
</tr>
<tr>
<td width="50%">
**Settings:**
</td>
<td width="50%">
🔹 Custom hostname override<br>
🔹 Trusted proxy CIDRs<br>
🔹 X-Forwarded-For validation<br>
🔹 Backend address configuration
</td>
</tr>
</table>

### 🔷 LuCI Web Interface
<table>
<tr>
<td width="50%">
**Configuration:**
</td>
<td width="50%">
⚙️ MTProxy Settings (TLS, FakeTLS, Obfuscated2)<br>
⚙️ WEB Proxy Settings (HTTPS/WS carriers)<br>
⚙️ Secret Management UI<br>
⚙️ Performance Tuning
</td>
</tr>
<tr>
<td width="50%">
**Monitoring:**
</td>
<td width="50%">
📊 Real-time Status Dashboard<br>
📊 Traffic Statistics<br>
📊 Active Connections<br>
📊 Prometheus Metrics Export
</td>
</tr>
</table>

---

## 🏗️ Architecture & Structure

```
telEgo-openwrt/
├── telego-src/                    # Go source code (from Scratch-net)
│   ├── go.mod, go.sum             # Dependencies
│   ├── cmd/telego/main.go         # Entry point
│   └── pkg/{config,log,metrics,gproxy,webproxy}/
├── telego-pkg/                     # Go binary package
│   ├── Makefile                    # golang-package.mk based build
│   └── files/init.d/telego         # Init script with SIGHUP hot-reload
├── luci-app-telego/                # LuCI application
│   ├── Makefile                    # Package definition
│   ├── root/usr/share/luci/menu.d/telego.menu.json  # Menu
│   ├── htdocs/resources/view/telego/{config,status,form}.js  # JS views
│   ├── htdocs/css/telego.css       # Stylesheet
│   ├── lua/model/telego.lua        # UCI model (simplified)
│   └── po/ru/telego.po             # Russian localization
├── nginx-pkg/                      # Nginx reverse proxy package
├── scripts/                        # Build automation scripts
├── docs/                           # Documentation
│   ├── API.md                       # REST API documentation
│   ├── CONFIGURATION.md             # Config options reference
│   └── INSTALL.md                   # Installation guide
├── README.md                       # Russian documentation
├── README_EN.md                    # English documentation (this file)
└── LICENSE                         # MIT License
```

---

## 🛠️ Installation & Build Instructions

### Prerequisites
```bash
OpenWrt SDK 25.12.4+ installed
Go 1.24+ for cross-compilation
Git, Make, GCC toolchain
```

### Option 1: Quick Build Script (Recommended)
```bash
# Clone repository
git clone https://github.com/Ra1nek/telEgo-openwrt.git
cd telEgo-openwrt

# Run automated build script
chmod +x scripts/build-all.sh
./scripts/build-all.sh
```

This automatically builds:
- ✅ Go binary `telego` for x86_64 and arm
- ✅ LuCI application `luci-app-telego.apk`
- ✅ Nginx package with configuration

### Option 2: Manual Build (Separate Packages)
**Build Go Binary:**
```bash
cd telego-pkg
make package/telego/compile
```

**Build LuCI Application:**
```bash
cd luci-app-telego
make package/luci-app-telego/compile
```

### Option 3: Install APKs on Router
```bash
# Upload .apk files to router via SCP/SFTP
scp telego-pkg/ipk/*.apk root@router-ip:/tmp/
scp luci-app-telego/ipk/*.apk root@router-ip:/tmp/

# On router:
cd /tmp
opkg install *.ipk
/etc/init.d/telego enable
/etc/init.d/telego start
```

---

## ⚙️ Configuration & Usage

### LuCI Web Interface Access
1. Navigate to **Services → telEgo** in OpenWrt web UI
2. Configure MTProxy or WEB Proxy settings
3. Generate user secrets via the interface
4. Click **Save & Apply**
5. Service auto-reloads with new configuration

### Telegram Connection Examples
#### MTProxy Connection:
```
Type: MTProxy
Address: athlon.twilightparadox.com (or IP)
Port: 443
Secret: <your_32_char_hex_secret>
Encryption Mode: TLS / FakeTLS / Secure
```

#### WEB Proxy Connection:
```
Type: HTTP/HTTPS Proxy
Address: https://athlon.twilightparadox.com
Port: 80/443
Login: <username>
Password: <secret>
```

### Command Line Management
```bash
# Start service
/etc/init.d/telego start

# Stop service
/etc/init.d/telego stop

# Hot reload configuration (SIGHUP)
/etc/init.d/telego reload

# Check status
/etc/init.d/telego status

# View logs
tail -f /var/log/messages | grep telego
```

---

## 📚 Technical Documentation

### REST API Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/status` | GET | Service status and metrics |
| `/api/secrets/add` | POST | Add new user secret |
| `/api/secrets/delete/{id}` | DELETE | Remove user secret |

### Prometheus Metrics
```
telego_uptime_seconds              # Service uptime
telego_bytes_total{direction="up"}    # Uplink traffic
telego_bytes_total{direction="down"}  # Downlink traffic
telego_connections_active             # Active connections
telego_current_speed_bps               # Current speed (bits/sec)
```

### Configuration File Location
- **UCI Config**: `/etc/config/telego`
- **Default Template**: `luci-app-telego/config/telego.default`

---

## 🔧 Troubleshooting

### Service Won't Start
```bash
# Check if port is already in use
netstat -tlnp | grep 443

# Verify configuration syntax
uci show telego

# Check logs
cat /var/log/messages | grep telego
```

### FakeTLS Not Working
- Ensure valid certificate and private key are configured
- Set masking host to popular domain (e.g., `google.com`)
- Verify TLS mode is enabled in configuration

### WEB Proxy Connection Issues
- Check trusted proxy CIDRs include client IP range
- Verify hostname override matches SSL certificate
- Ensure backend address is correctly formatted

---

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines:
1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

---

## 📝 License

This project is licensed under the MIT License — see [LICENSE](LICENSE) for details.

---

## 🔗 Links
- 🌐 **Official Repository:** https://github.com/Ra1nek/telEgo-openwrt
- 📱 **Telegram API Documentation:** https://core.telegram.org/meta
- 📖 **OpenWrt LuCI Docs:** https://openwrt.org/docs/guide-user/luci/luci.essentials
- 🔧 **Scratch-net/telego (Original Project):** https://github.com/Scratch-net/telego

---

<div align="center">
**Built with ❤️ for the OpenWrt community** | **Version 1.0.0** | **© 2026 Ra1nek**
</div>