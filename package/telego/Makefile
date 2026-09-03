# =============================================================================
# telEgo Core Daemon Package - OpenWrt 25.12 APK Format
# =============================================================================
include $(TOPDIR)/rules.mk

PKG_NAME:=telego
PKG_VERSION:=0.6.0
PKG_RELEASE:=1
PKG_ARCH:=$(LINUX_KERNEL)
PKG_INSTALL:=1

include $(INCLUDE_DIR)/package.mk

# Go package configuration for native cross-compilation
GO_PKG:=github.com/Scratch-net/telego
GO_LDFLAGS:=-s -w

# =============================================================================
# Package Definition
# =============================================================================
define Package/telego
  SECTION:=net
  CATEGORY:=Network
  SUBMENU:=Proxy
  TITLE:=Telegram MTProxy + WEB Proxy server with Middle-End support
  URL:=https://github.com/Ra1nek/telEgo-openwrt
  DEPENDS:=+ca-bundle +libopenssl +luci-app-telego
endef

define Package/telego/description
  telEgo is a high-performance Telegram proxy server written in Go.
  Supports MTProto, FakeTLS (ee), Obfuscated2 (dd), WEB Proxy protocols,
  and Telegram Middle-End (v0.6.0+). Optimized for OpenWrt routers.
endef

define Build/Compile
	$(GO_PKG_BIN) $(PKG_BUILD_DIR)/go/src/$(GO_PKG)/telego \
		-trimpath -ldflags "$(GO_LDFLAGS)" \
		-o $(PKG_INSTALL_DIR)/usr/bin/telego
endef

define Package/telego/install
	# Install binary
	$$(INSTALL_DIR) $$(1)/usr/bin
	$$(INSTALL_BIN) $$(PKG_INSTALL_DIR)/usr/bin/telego $$(1)/usr/bin/
	
	# Install init script with SIGHUP hot-reload support
	$$(INSTALL_DIR) $$(1)/etc/init.d
	$$(INSTALL_BIN) ./files/init.d/telego $$(1)/etc/init.d/telego
	
	# Install default configuration template
	$$(INSTALL_DIR) $$(1)/usr/share/telego
	$$(INSTALL_CONF) ./config/telego.toml.default $$(1)/usr/share/telego/
endef

define Package/telego/conffiles
/etc/config/telego
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