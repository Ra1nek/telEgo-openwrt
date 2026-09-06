include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-telego
PKG_VERSION:=0.6.0
PKG_RELEASE:=1

include $(INCLUDE_DIR)/package.mk

define Package/luci-app-telego
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=LuCI Web Interface support for telEgo Proxy
  DEPENDS:=+luci-base +telego-pkg
endef

define Package/luci-i18n-telego-ru
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Translations
  TITLE:=Russian support for luci-app-telego
  DEPENDS:=+luci-app-telego
endef

define Build/Compile
endef

define Package/luci-app-telego/install
	$(INSTALL_DIR) $(1)/www/luci-static/resources/view/telego
	$(CP) ./htdocs/resources/view/telego/* $(1)/www/luci-static/resources/view/telego/
	$(INSTALL_DIR) $(1)/usr/share/rpcd/acl.d
	$(CP) ./root/usr/share/rpcd/acl.d/* $(1)/usr/share/rpcd/acl.d/
endef

define Package/luci-i18n-telego-ru/install
	$(INSTALL_DIR) $(1)/usr/share/luci/i18n
	$(INSTALL_DATA) ./po/ru/telego.po $(1)/usr/share/luci/i18n/telego.ru.lmo
endef

$(eval $(call BuildPackage,luci-app-telego))
$(eval $(call BuildPackage,luci-i18n-telego-ru))