include $(TOPDIR)/rules.mk

PKG_NAME:=nginx-telego
PKG_VERSION:=0.6.1
PKG_RELEASE:=2

include $(INCLUDE_DIR)/package.mk

define Package/nginx-telego
  SECTION:=net
  CATEGORY:=Network
  SUBMENU:=Web Servers/Proxies
  TITLE:=Nginx integration for telEgo WEB Proxy
  DEPENDS:=+nginx-ssl +telego-pkg
endef

define Package/nginx-telego/description
Nginx upstream and server-location snippets for telEgo native WEB Proxy.
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
