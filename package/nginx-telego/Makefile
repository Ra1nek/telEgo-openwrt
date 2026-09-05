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
  DEPENDS:=+nginx-ssl +telego
endef

define Package/nginx-telego/description
  Automated reverse-proxy, TLS fronting, and secure masking rule helper binding Nginx to the telego Go backend daemon.
endef

define Build/Compile
	# Nothing to compile, configuration assets only
endef

define Package/nginx-telego/install
	$(INSTALL_DIR) $(1)/etc/nginx/conf.d
	$(INSTALL_DATA) ./files/telego.locations $(1)/etc/nginx/conf.d/telego.locations
endef

$(eval $(call BuildPackage,nginx-telego))