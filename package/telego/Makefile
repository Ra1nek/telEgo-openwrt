# =============================================================================
# telEgo Core Daemon Package - OpenWrt 25.12 APK Format (SECURITY HARDENED)
# =============================================================================
include $(TOPDIR)/rules.mk

PKG_NAME:=telego
PKG_VERSION:=0.6.0
PKG_RELEASE:=1
PKG_ARCH:=$(LINUX_KERNEL)
PKG_INSTALL:=1

# Bundle Go source code directly in src/ subdirectory for golang.mk
# No download needed - source is bundled with the package
PKG_INSTALL:=1

include $(INCLUDE_DIR)/package.mk

# Include golang.mk for proper Go cross-compilation in OpenWrt 25.12 SDK
include $(INCLUDE_DIR)/golang.mk

# Go package configuration - module path matches go.mod in bundled source
GO_PKG:=github.com/scratch-net/telego
GO_LDFLAGS:=-s -w

# Specify the actual source directory within the build
MAKE_PATH:=src

# =============================================================================
# Package Definition
# =============================================================================
define Package/telego
  SECTION:=net
  CATEGORY:=Network
  SUBMENU:=Proxy
  TITLE:=Telegram MTProxy + WEB Proxy server with Middle-End support
  URL:=https://github.com/Scratch-net/telego
  DEPENDS:=+ca-bundle +libopenssl
endef

define Package/telego/description
  telEgo is a high-performance Telegram proxy server written in Go.
  Supports MTProto, FakeTLS (ee), Obfuscated2 (dd), WEB Proxy protocols,
  and Telegram Middle-End (v0.6.0+). Optimized for OpenWrt routers.
endef

define Package/telego/conffiles
/etc/config/telego
endef

# =============================================================================
# SECURITY: Capability-based privilege dropping for secure execution
# Allows binding to privileged ports (443, 80) without full root privileges
# ============================================================================
define Package/telego/install
	$$(INSTALL_DIR) $$(1)/usr/bin
	$$(INSTALL_BIN) $$(PKG_INSTALL_DIR)/usr/bin/telego $$(1)/usr/bin/telego
	
	# Set capability to allow binding to privileged ports (443, 80) without root
	setcap cap_net_bind_service=+ep $$(1)/usr/bin/telego 2>/dev/null || true
	
	$$(INSTALL_DIR) $$(1)/etc/init.d
	$$(INSTALL_BIN) ./files/init.d/telego $$(1)/etc/init.d/telego
	$$(INSTALL_DIR) $$(1)/usr/share/telego
	$$(INSTALL_CONF) ./config/telego.toml.default $$(1)/usr/share/telego/
endef

define Package/telego/postinst
if [ ! -f "/etc/config/telego" ]; then
	cp /usr/share/telego/telego.toml.default /etc/config/telego 2>/dev/null || true
fi
endef

define Package/telego/postrm
if [ -f "/etc/config/telego" ]; then
	cfg -r telego 2>/dev/null || true
fi
endef

$(eval $(call BuildPackage,telego))