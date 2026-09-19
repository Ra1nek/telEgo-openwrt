include $(TOPDIR)/rules.mk

PKG_NAME:=nginx-telego
PKG_VERSION:=0.6.5
PKG_RELEASE:=3

include $(INCLUDE_DIR)/package.mk

define Package/nginx-telego
  SECTION:=net
  CATEGORY:=Network
  SUBMENU:=Web Servers/Proxies
  TITLE:=Nginx integration for telEgo WEB Proxy
  DEPENDS:=+telego-pkg +flock +firewall4 +openssl-util
  EXTRA_DEPENDS:=nginx-ssl (>=1.0)
endef

define Package/nginx-telego/description
Nginx integration for telEgo native WEB Proxy. Installs reusable upstream and
location snippets, an explicit managed-file ownership registry, canonical repair
copies, guarded administrator operations for foreign/custom conf.d files, a
restricted transactional editor and lifecycle helper for foreign files, a
transactional firewall4 manager plus LuCI/split-DNS platform reconciliation for Direct HTTPS dedicated TCP/443 ownership, X.509/ACME
readiness checks with a renewal hotplug preflight, and opt-in native shared-port,
Cloudflare Tunnel, or Direct HTTPS ingress profiles. Managed listeners are disabled
by default.
endef

# This package only installs configuration and helper scripts; it has no source
# tree and therefore must not invoke OpenWrt's default `make` build step.
define Build/Compile
endef

define Package/nginx-telego/install
	$(INSTALL_DIR) $(1)/etc/nginx/conf.d
	$(INSTALL_DATA) ./files/conf.d/20-telego-core.conf \
		$(1)/etc/nginx/conf.d/20-telego-core.conf

	$(INSTALL_DIR) $(1)/etc/nginx/snippets
	$(INSTALL_DATA) ./files/telego.locations \
		$(1)/etc/nginx/snippets/telego.locations

	$(INSTALL_DIR) $(1)/usr/share/nginx-telego/templates
	$(INSTALL_DATA) ./files/conf.d/20-telego-core.conf \
		$(1)/usr/share/nginx-telego/templates/20-telego-core.conf
	$(INSTALL_DATA) ./files/telego.locations \
		$(1)/usr/share/nginx-telego/templates/telego.locations
	$(INSTALL_DATA) ./files/usr/share/nginx-telego/ownership.tsv \
		$(1)/usr/share/nginx-telego/ownership.tsv

	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./files/config/nginx_telego \
		$(1)/etc/config/nginx_telego

	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/init.d/nginx-telego \
		$(1)/etc/init.d/nginx-telego

	$(INSTALL_DIR) $(1)/usr/libexec
	$(INSTALL_BIN) ./files/usr/libexec/nginx-telego-render \
		$(1)/usr/libexec/nginx-telego-render
	$(INSTALL_BIN) ./files/usr/libexec/nginx-telego-files \
		$(1)/usr/libexec/nginx-telego-files
	$(INSTALL_BIN) ./files/usr/libexec/nginx-telego-reconcile \
		$(1)/usr/libexec/nginx-telego-reconcile
	$(INSTALL_BIN) ./files/usr/libexec/nginx-telego-config-migrate \
		$(1)/usr/libexec/nginx-telego-config-migrate
	$(INSTALL_BIN) ./files/usr/libexec/nginx-telego-firewall \
		$(1)/usr/libexec/nginx-telego-firewall
	$(INSTALL_BIN) ./files/usr/libexec/nginx-telego-cert \
		$(1)/usr/libexec/nginx-telego-cert
	$(INSTALL_BIN) ./files/usr/libexec/nginx-telego-admin \
		$(1)/usr/libexec/nginx-telego-admin
	$(INSTALL_BIN) ./files/usr/libexec/nginx-telego-editor \
		$(1)/usr/libexec/nginx-telego-editor

	$(INSTALL_DIR) $(1)/etc/hotplug.d/acme
	$(INSTALL_BIN) ./files/etc/hotplug.d/acme/90-nginx-telego \
		$(1)/etc/hotplug.d/acme/90-nginx-telego
endef

define Package/nginx-telego/postinst
#!/bin/sh
	[ -n "$${IPKG_INSTROOT}" ] && exit 0
	[ -x /usr/libexec/telego-package-reconcile ] || exit 1
	/usr/libexec/telego-package-reconcile
	[ -x /usr/libexec/nginx-telego-config-migrate ] || exit 1
	/usr/libexec/nginx-telego-config-migrate
endef

define Package/nginx-telego/prerm
	#!/bin/sh
	[ -n "$${IPKG_INSTROOT}" ] && exit 0
	[ "$${PKG_UPGRADE}" = "1" ] && exit 0
	if [ -x /usr/libexec/nginx-telego-firewall ]; then
		/usr/libexec/nginx-telego-firewall remove || exit $?
	fi
	if [ -x /usr/libexec/nginx-telego-platform ]; then
		/usr/libexec/nginx-telego-platform remove || exit $?
	fi
	[ -x /usr/libexec/nginx-telego-reconcile ] || exit 0
	/usr/libexec/nginx-telego-reconcile remove-generated
	exit $$?
endef

$(eval $(call BuildPackage,nginx-telego))
