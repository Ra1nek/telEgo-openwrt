include $(TOPDIR)/rules.mk

PKG_NAME:=telego-pkg
PKG_VERSION:=0.6.5
PKG_RELEASE:=7

include $(INCLUDE_DIR)/package.mk

define Package/telego-pkg
  SECTION:=net
  CATEGORY:=Network
  TITLE:=telEgo high-performance Telegram proxy core daemon
  DEPENDS:=+ca-bundle +procd-ujail
  PKGARCH:=x86_64
  USERID:=telego:telego
endef

define Package/telego-pkg/description
Production telEgo proxy daemon packaged for OpenWrt 25.12+ x86_64.
endef

# The telego binary is built by CI with the pinned upstream Go toolchain
# and copied into files/usr/bin before the OpenWrt package step. There is
# intentionally no source-tree Makefile to build here.
define Build/Compile
	true
endef

define Package/telego-pkg/install
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) ./files/usr/bin/telego $(1)/usr/bin/telego
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/init.d/telego $(1)/etc/init.d/telego
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./files/config/telego $(1)/etc/config/telego
	$(INSTALL_DIR) $(1)/etc/capabilities
	$(INSTALL_DATA) ./files/capabilities/telego.json $(1)/etc/capabilities/telego.json
	$(INSTALL_DIR) $(1)/usr/libexec
	$(INSTALL_BIN) ./files/usr/libexec/telego-package-reconcile \
		$(1)/usr/libexec/telego-package-reconcile
endef

define Package/telego-pkg/postinst
#!/bin/sh
	[ -n "$${IPKG_INSTROOT}" ] && exit 0
	[ -x /usr/libexec/telego-package-reconcile ] || exit 1
	/usr/libexec/telego-package-reconcile
endef

$(eval $(call BuildPackage,telego-pkg))
