include $(TOPDIR)/rules.mk

PKG_NAME:=nginx-telego
PKG_VERSION:=0.6.0
PKG_RELEASE:=1

include $(INCLUDE_DIR)/package.mk

define Package/nginx-telego
  SECTION:=net
  CATEGORY:=Network
  SUBMENU:=Web Servers/Proxies
  TITLE:=Nginx configuration helper for telEgo proxy integration
  DEPENDS:=+nginx-ssl +telego-pkg
endef

define Package/nginx-telego/description
  Reverse-proxy and TLS-fronting configuration assets for telEgo.
endef

define Build/Compile
endef

define Package/nginx-telego/install
	$(INSTALL_DIR) $(1)/etc/nginx/conf.d
	$(INSTALL_DATA) ./files/conf.d/telego.conf $(1)/etc/nginx/conf.d/telego.conf
	$(INSTALL_DATA) ./files/telego.locations $(1)/etc/nginx/conf.d/telego.locations
endef

$(eval $(call BuildPackage,nginx-telego))
