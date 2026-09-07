include $(TOPDIR)/rules.mk

PKG_NAME:=nginx-telego
PKG_VERSION:=0.6.1
PKG_RELEASE:=3

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
Nginx upstream and server-location snippets for telEgo native WEB Proxy.
Requires nginx-ssl at runtime.
endef

# This package only installs configuration snippets; it has no source tree
# and therefore must not invoke OpenWrt's default `make` build step.
define Build/Compile
endef

define Package/nginx-telego/install
	$(INSTALL_DIR) $(1)/etc/nginx/conf.d
	$(INSTALL_DATA) ./files/conf.d/telego.conf \
		$(1)/etc/nginx/conf.d/telego.conf

	$(INSTALL_DIR) $(1)/etc/nginx/snippets
	$(INSTALL_DATA) ./files/telego.locations \
		$(1)/etc/nginx/snippets/telego.locations
endef

$(eval $(call BuildPackage,nginx-telego))
