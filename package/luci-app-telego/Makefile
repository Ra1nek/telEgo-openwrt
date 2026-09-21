include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-telego
PKG_VERSION:=0.6.5
PKG_RELEASE:=28
PKG_BUILD_DEPENDS:=luci-base/host

include $(INCLUDE_DIR)/package.mk

define Package/luci-app-telego
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=LuCI Web Interface for telEgo
  DEPENDS:=+luci-base +luci-lib-uqr +telego-pkg +rpcd-mod-ucode +ucode-mod-fs +ucode-mod-uci +ucode-mod-ubus +uclient-fetch
  EXTRA_DEPENDS:=telego-pkg (>=0.6.5-r7)
  PKGARCH:=all
endef

define Package/luci-app-telego/description
LuCI JavaScript interface for telEgo MTProxy, WEB Proxy, optional managed Nginx
ingress with Direct HTTPS firewall/certificate readiness and ACME renewal preflight,
guarded foreign-file lifecycle administration and restricted foreign-file editing,
Middle-End and live runtime telemetry.
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
	$(INSTALL_BIN) ./root/usr/share/rpcd/ucode/telego-nginx \
		$(1)/usr/share/rpcd/ucode/telego-nginx
endef

define Package/luci-app-telego/postinst
#!/bin/sh
	[ -n "$${IPKG_INSTROOT}" ] || {
	rm -f /tmp/luci-indexcache.*
	rm -rf /tmp/luci-modulecache/
	/etc/init.d/rpcd reload 2>/dev/null || true
	}
	exit 0
endef

$(eval $(call BuildPackage,luci-app-telego))
