include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-telego
PKG_VERSION:=0.6.0
PKG_RELEASE:=1
PKG_BUILD_DEPENDS:=luci-base/host

include $(INCLUDE_DIR)/package.mk

define Package/luci-app-telego
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=LuCI Web Interface support for telEgo Proxy
  DEPENDS:=+luci-base +telego-pkg
  PKGARCH:=all
endef

define Package/luci-i18n-telego-ru
  SECTION:=luci
  CATEGORY:=LuCI
  TITLE:=Russian translation for luci-app-telego
  DEPENDS:=+luci-app-telego
  HIDDEN:=1
  PKGARCH:=all
endef

define Build/Compile
endef

define Package/luci-app-telego/install
	$(INSTALL_DIR) $(1)/www/luci-static/resources/view/telego
	$(CP) ./htdocs/resources/view/telego/* $(1)/www/luci-static/resources/view/telego/

	$(INSTALL_DIR) $(1)/www/luci-static/resources/css
	$(CP) ./htdocs/css/* $(1)/www/luci-static/resources/css/

	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$(INSTALL_DATA) ./root/usr/share/luci/menu.d/telego.menu.json $(1)/usr/share/luci/menu.d/

	$(INSTALL_DIR) $(1)/usr/share/rpcd/acl.d
	$(INSTALL_DATA) ./root/usr/share/rpcd/acl.d/luci-app-telego.json $(1)/usr/share/rpcd/acl.d/
endef

define Package/luci-i18n-telego-ru/install
	$(INSTALL_DIR) $(1)/etc/uci-defaults
	echo "uci set luci.languages.ru='Русский (Russian)'; uci commit luci" > $(1)/etc/uci-defaults/luci-i18n-telego-ru
	$(INSTALL_DIR) $(1)/usr/share/luci/i18n
	po2lmo ./po/ru/telego.po $(1)/usr/share/luci/i18n/telego.ru.lmo
endef

$(eval $(call BuildPackage,luci-app-telego))
$(eval $(call BuildPackage,luci-i18n-telego-ru))
