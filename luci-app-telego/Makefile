include $(TOPDIR)/rules.mk

PKG_NAME := luci-app-telego
PKG_VERSION := 1.0.0
PKG_RELEASE := 1
PKG_ARCH := all
PKG_INSTALL := 1

include $(INCLUDE_DIR)/package.mk

define Package/luci-app-telego
  SUBMENU := LuCI
  DEPENDS:=+telego-pkg +luci-base +luci-compat
  TITLE := LuCI support for telEgo (Telegram MTProxy + WEB Proxy)
  PKG_URL := https://github.com/Ra1nek/telEGo-openwrt
  DESCRIPTION += \n\nLuCI web interface for managing Telegram proxy servers:
    - MTProxy (MTProto) — classic Telegram proxy protocol
    - WEB Proxy — new standard based on HTTP/2 and WebSocket
endef

define Package/luci-app-telego/description
LuCI application for telEgo provides a comprehensive web-based interface to configure and monitor:
- MTProxy server settings (port, secret, address)
- WEB Proxy configuration (HTTP/2, WebSocket carrier modes)
- User authentication secrets
- TLS/HTTPS settings with custom certificates
- Real-time status monitoring via LuCI JavaScript API
endef

define Package/luci-app-telego/install
	$(INSTALL_DIR) $(1)/usr/libexec/rpcd
	$(INSTALL_BIN) ./root/usr/libexec/rpcd/telego $(1)/usr/libexec/rpcd/telego
	$(INSTALL_DIR) $(1)/www/luci-static/resources/view/telego
	$(CP) ./htdocs/resources/* $(1)/www/luci-static/resources/view/telego/
	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$(INSTALL_DATA) ./root/usr/share/luci/menu.d/telego.menu.json $(1)/usr/share/luci/menu.d/telego.menu.json
endef

$(eval $(call BuildPackage,luci-app-telego))

# =============================================================================
# Russian Translation Package (luci-i18n-telego-ru)
# =============================================================================

define Package/luci-i18n-telego-ru
  SUBMENU := 3. Translations
  TITLE:=Russian translation for luci-app-telego
  DEPENDS:=+luci-app-telego
endef

define Package/luci-i18n-telego-ru/install
	$(INSTALL_DIR) $(1)/usr/share/luci/i18n/
	$(INSTALL_DATA) ./po/ru/telego.po $(1)/usr/share/luci/i18n/telego.ru.lmo
endef

$(eval $(call BuildPackage,luci-i18n-telego-ru))
