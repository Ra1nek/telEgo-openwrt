# =============================================================================
# Nginx Configuration Package - OpenWrt 25.12 APK Format
# =============================================================================
include $(TOPDIR)/rules.mk

PKG_NAME:=nginx-telego
PKG_VERSION:=1.0.0
PKG_RELEASE:=1
PKG_ARCH:=all
PKG_INSTALL:=0

include $(INCLUDE_DIR)/package.mk

# =============================================================================
# Package Definition
# =============================================================================
define Package/nginx-telego
  SECTION:=net
  CATEGORY:=Network
  SUBMENU:=Web Servers/Proxies
  TITLE:=Nginx configuration for telEgo WEB Proxy
  DEPENDS:=+nginx +nginx-mod-http-ssl +luci-app-telego
endef

define Package/nginx-telego/description
  Nginx configuration package for telEgo WEB Proxy.
  This package installs nginx configuration files that enable:
  - HTTPS carrier mode: Direct HTTPS tunneling through nginx
  - WebSocket carrier mode: WebSocket upgrade and routing
  - TLS termination with SNI support
  - Path-based routing for different carrier modes
endef

define Package/nginx-telego/conffiles
/etc/config/nginx-telego
/etc/nginx/conf.d/telego.conf
endef

define Build/Compile
	# This is a meta package - no compilation needed
endef

define Package/nginx-telego/install
	# Install nginx configuration files
	$$(INSTALL_DIR) $(1)/etc/nginx/conf.d
	$$(INSTALL_CONF) ./files/conf.d/telego.conf $(1)/etc/nginx/conf.d/
	
	# Install UCI default configuration
	$$(INSTALL_DIR) $(1)/etc/config
	$$(INSTALL_CONF) ./config/nginx-telego.default $(1)/etc/config/nginx-telego
endef

define Package/nginx-telego/postinst
	if [ -f "/usr/share/nginx/telego.conf.template" ]; then
		cp /usr/share/nginx/telego.conf.template /etc/nginx/conf.d/telego.conf 2>/dev/null || true
	fi
endef

define Package/nginx-telego/postrm
	if [ -f "/etc/config/nginx-telego" ]; then
		cfg -r nginx-telego 2>/dev/null || true
	fi
	if [ -f "/etc/nginx/conf.d/telego.conf" ]; then
		rm -f /etc/nginx/conf.d/telego.conf 2>/dev/null || true
	fi
endef

$(eval $(call BuildPackage,nginx-telego))