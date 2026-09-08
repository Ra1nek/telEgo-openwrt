include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-telego
PKG_VERSION:=0.6.1
PKG_RELEASE:=7
PKG_BUILD_DEPENDS:=luci-base/host

include $(INCLUDE_DIR)/package.mk

define Package/luci-app-telego
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=LuCI Web Interface for telEgo
  DEPENDS:=+luci-base +telego-pkg +rpcd-mod-ucode +ucode-mod-fs +ucode-mod-uci +ucode-mod-ubus +uclient-fetch
  PKGARCH:=all
endef

define Package/luci-app-telego/description
LuCI JavaScript interface for telEgo MTProxy, WEB Proxy and live telemetry.
endef

# This package only installs LuCI files and has no source tree to compile.
define Build/Compile
	true
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

$(eval $(call BuildPackage,luci-app-telego))
