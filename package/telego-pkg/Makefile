include $(TOPDIR)/rules.mk

PKG_NAME:=telego-pkg
PKG_VERSION:=0.6.1
PKG_RELEASE:=6

include $(INCLUDE_DIR)/package.mk

define Package/telego-pkg
  SECTION:=net
  CATEGORY:=Network
  TITLE:=telEgo high-performance Telegram proxy core daemon
  DEPENDS:=+ca-bundle
  EXTRA_DEPENDS:=procd-ujail >=2026.03.13~58eb263d-r1
  PKGARCH:=x86_64
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
endef

define Package/telego-pkg/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] && exit 0

if ! grep -q '^telego:' /etc/group 2>/dev/null; then
	addgroup -S telego || exit 1
fi

if ! grep -q '^telego:' /etc/passwd 2>/dev/null; then
	adduser -S -D -H -s /bin/false -G telego telego || exit 1
fi

exit 0
endef

$(eval $(call BuildPackage,telego-pkg))
