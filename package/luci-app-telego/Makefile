include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-telego
PKG_VERSION:=0.6.1
PKG_RELEASE:=2
PKG_BUILD_DEPENDS:=luci-base/host

include $(INCLUDE_DIR)/package.mk

PO2LMO:=$(STAGING_DIR_HOSTPKG)/bin/po2lmo

define Package/luci-app-telego
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=LuCI Web Interface for telEgo
  DEPENDS:=+luci-base +telego-pkg +rpcd-mod-ucode +ucode-mod-fs
  PKGARCH:=all
endef

define Package/luci-app-telego/description
LuCI JavaScript interface for telEgo MTProxy and native WEB proxy.
endef

define Package/luci-app-telego/install
	$(INSTALL_DIR) $(1)/www/luci-static/resources/view/telego
	$(CP) ./htdocs/resources/view/telego/*.js \
		$(1)/www/luci-static/resources/view/telego/

	$(INSTALL_DIR) $(1)/www/luci-static/resources/css
	$(CP) ./htdocs/css/* \
		$(1)/www/luci-static/resources/css/

	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$(INSTALL_DATA) ./root/usr/share/luci/menu.d/telego.menu.json \
		$(1)/usr/share/luci/menu.d/

	$(INSTALL_DIR) $(1)/usr/share/rpcd/acl.d
	$(INSTALL_DATA) ./root/usr/share/rpcd/acl.d/luci-app-telego.json \
		$(1)/usr/share/rpcd/acl.d/

	$(INSTALL_DIR) $(1)/usr/share/rpcd/ucode
	$(INSTALL_BIN) ./root/usr/share/rpcd/ucode/telego \
		$(1)/usr/share/rpcd/ucode/telego
endef


define Package/luci-i18n-telego-ru
  SECTION:=luci
  CATEGORY:=LuCI
  TITLE:=Russian translation for luci-app-telego
  DEPENDS:=+luci-app-telego
  HIDDEN:=1
  PKGARCH:=all
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

$(eval $(call BuildPackage,luci-app-telego))
$(eval $(call BuildPackage,luci-i18n-telego-ru))
