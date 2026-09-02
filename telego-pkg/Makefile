include $(TOPDIR)/rules.mk

PKG_NAME:=telego
PKG_VERSION:=0.6.0
PKG_RELEASE:=1

PKG_SOURCE_URL:=https://github.com/Scratch-net/telego
PKG_LICENSE:=MIT
PKG_LICENSE_FILES:=LICENSE

include $(INCLUDE_DIR)/golang-package.mk

GO_PKG:=github.com/Scratch-net/telego
GO_LDFLAGS:=-s -w

define Package/telego
  SECTION:=net
  CATEGORY:=Network
  SUBMENU:=Proxy
  TITLE:=Telegram MTProxy + WEB Proxy server with Middle-End support
  URL:=https://github.com/Scratch-net/telego
  DEPENDS:=+ca-bundle +libopenssl +luci-app-telego
endef

define Package/telego/description
  telEgo is a high-performance Telegram proxy server written in Go.
  Supports MTProto, FakeTLS (ee), Obfuscated2 (dd), WEB Proxy protocols,
  and Telegram Middle-End (v0.6.0+). Optimized for OpenWrt routers.
endef

define Package/telego/install
	$$(INSTALL_DIR) $$(1)/usr/bin
	$$(INSTALL_BIN) $$(PKG_BUILD_DIR)/go/src/$$(GO_PKG)/telego $$(1)/usr/bin/telego
	$$(INSTALL_DIR) $$(1)/etc/init.d
	$$(INSTALL_BIN) ./files/init.d/telego $$(1)/etc/init.d/telego
	$$(INSTALL_DIR) $$(1)/etc/config
	$$(INSTALL_CONF) ./config/telego.toml.default $$(1)/etc/config/telego.default
endef

$(eval $(call BuildPackage,telego))
