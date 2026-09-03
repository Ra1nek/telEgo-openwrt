# =============================================================================
# LuCI Application Package - OpenWrt 25.12 APK Format
# =============================================================================
include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-telego
PKG_VERSION:=1.0.0
PKG_RELEASE:=1
PKG_ARCH:=all
PKG_INSTALL:=0

include $(INCLUDE_DIR)/package.mk

# =============================================================================
# Main LuCI Application Package Definition
# =============================================================================
define Package/luci-app-telego
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=LuCI support for telEgo (Telegram MTProxy + WEB Proxy)
  DEPENDS:=+telego +nginx +libustream-openssl +ca-bundle +luci-base +luci-compat
endef

define Package/luci-app-telego/description
  LuCI application for telEgo - Telegram MTProxy and WEB Proxy server.
  This package provides a comprehensive web interface for configuring and
  monitoring Telegram proxy servers directly from your OpenWrt router's
  web interface.
endef

define Package/luci-app-telego/conffiles
/etc/config/telego
endef

define Build/Compile
	# No compilation needed - this is a pure LuCI application package
endef

define Package/luci-app-telego/install
	# Install menu definition (JSON format for OpenWrt 25.12)
	$$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$$(INSTALL_DATA) ./root/usr/share/luci/menu.d/telego.menu.json $(1)/usr/share/luci/menu.d/
	
	# Install JavaScript resources (modern LuCI client-side rendering)
	$$(INSTALL_DIR) $(1)/www/luci-static/resources/view/telego
	$$(INSTALL_DATA) ./htdocs/resources/view/telego/config.js $(1)/www/luci-static/resources/view/telego/
	$$(INSTALL_DATA) ./htdocs/resources/view/telego/status.js $(1)/www/luci-static/resources/view/telego/
	$$(INSTALL_DATA) ./htdocs/resources/view/telego/form.js $(1)/www/luci-static/resources/view/telego/
	
	# Install CSS stylesheets
	$$(INSTALL_DIR) $(1)/www/luci-static/resources/css
	$$(INSTALL_DATA) ./htdocs/css/telego.css $(1)/www/luci-static/resources/css/
	
	# Install default configuration file
	$$(INSTALL_DIR) $(1)/etc/config
	$$(INSTALL_CONF) ./config/telego.default $(1)/etc/config/telego
endef

define Package/luci-app-telego/postinst
	# Create default config if not exists
	if [ ! -f "/etc/config/telego" ]; then
		cp /usr/share/telego/telego.default /etc/config/telego 2>/dev/null || true
	fi
endef

define Package/luci-app-telego/postrm
	# Cleanup on removal
	if [ -f "/etc/config/telego" ]; then
		cfg -r telego 2>/dev/null || true
	fi
endef

$(eval $(call BuildPackage,luci-app-telego))

# =============================================================================
# Russian Translation Package (integrated into same build)
# =============================================================================
define Package/luci-i18n-telego-ru
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Translations
  TITLE:=Russian language support for luci-app-telego
  DEPENDS:=+luci-app-telego
endef

define Package/luci-i18n-telego-ru/install
	$$(INSTALL_DIR) $(1)/usr/share/luci/i18n
	$$(INSTALL_DATA) ./po/ru/telego.po $(1)/usr/share/luci/i18n/telego.ru.lmo
endef

define Package/luci-i18n-telego-ru/prerm
	if [ -f "/usr/share/luci/i18n/telego.ru.lmo" ]; then
		rm -f /usr/share/luci/i18n/telego.ru.lmo
	fi
endef

$(eval $(call BuildPackage,luci-i18n-telego-ru))