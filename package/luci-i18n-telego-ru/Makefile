include $(TOPDIR)/rules.mk

PKG_NAME:=luci-i18n-telego-ru
PKG_VERSION:=0.6.1
PKG_RELEASE:=1
PKG_BUILD_DEPENDS:=luci-base/host

include $(INCLUDE_DIR)/package.mk

PO2LMO:=$(STAGING_DIR_HOSTPKG)/bin/po2lmo

define Package/luci-i18n-telego-ru
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=Russian translation for luci-app-telego
  DEPENDS:=+luci-app-telego
  HIDDEN:=1
  PKGARCH:=all
endef

define Package/luci-i18n-telego-ru/description
Russian translation for luci-app-telego.
endef

define Package/luci-i18n-telego-ru/install
	$(INSTALL_DIR) $(1)/etc/uci-defaults
	printf '%s\n' \
		"uci set luci.languages.ru='Русский (Russian)'; uci commit luci" \
		> $(1)/etc/uci-defaults/luci-i18n-telego-ru
	chmod 0755 $(1)/etc/uci-defaults/luci-i18n-telego-ru

	$(INSTALL_DIR) $(1)/usr/share/luci/i18n
	$(PO2LMO) \
		./po/ru/telego.po \
		$(1)/usr/share/luci/i18n/telego.ru.lmo
endef

$(eval $(call BuildPackage,luci-i18n-telego-ru))
