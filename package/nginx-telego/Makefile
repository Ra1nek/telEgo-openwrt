include $(TOPDIR)/rules.mk

PKG_NAME:=nginx-telego
PKG_VERSION:=0.6.2
PKG_RELEASE:=1

include $(INCLUDE_DIR)/package.mk

define Package/nginx-telego
  SECTION:=net
  CATEGORY:=Network
  SUBMENU:=Web Servers/Proxies
  TITLE:=Nginx integration for telEgo WEB Proxy
  DEPENDS:=+telego-pkg
  EXTRA_DEPENDS:=nginx-ssl (>=1.0)
endef

define Package/nginx-telego/description
Nginx integration for telEgo native WEB Proxy. Installs the reusable upstream
and location snippets plus opt-in managed native shared-port and Cloudflare
Tunnel ingress profiles. Managed listeners are disabled by default.
endef

# This package only installs configuration and helper scripts; it has no source
# tree and therefore must not invoke OpenWrt's default `make` build step.
define Build/Compile
endef

define Package/nginx-telego/install
	$(INSTALL_DIR) $(1)/etc/nginx/conf.d
	$(INSTALL_DATA) ./files/conf.d/telego.conf \
		$(1)/etc/nginx/conf.d/telego.conf

	$(INSTALL_DIR) $(1)/etc/nginx/snippets
	$(INSTALL_DATA) ./files/telego.locations \
		$(1)/etc/nginx/snippets/telego.locations

	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./files/config/nginx_telego \
		$(1)/etc/config/nginx_telego

	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/init.d/nginx-telego \
		$(1)/etc/init.d/nginx-telego

	$(INSTALL_DIR) $(1)/usr/libexec
	$(INSTALL_BIN) ./files/usr/libexec/nginx-telego-render \
		$(1)/usr/libexec/nginx-telego-render
endef

# A generated managed server block is not a package-owned conffile. Remove it
# before a real uninstall while the generic upstream/snippet files are still
# present, so Nginx never retains a stale reference to a removed package. Keep
# it across upgrades; the newly installed renderer will revalidate it.
define Package/nginx-telego/prerm
	#!/bin/sh
	[ -n "$${IPKG_INSTROOT}" ] && exit 0
	[ "$${PKG_UPGRADE}" = "1" ] && exit 0
	[ -x /usr/libexec/nginx-telego-render ] || exit 0
	/usr/libexec/nginx-telego-render remove
	exit $$?
endef

$(eval $(call BuildPackage,nginx-telego))
