include $(TOPDIR)/rules.mk

PKG_NAME:=telego-pkg
PKG_VERSION:=0.6.0
PKG_RELEASE:=1

include $(INCLUDE_DIR)/package.mk

define Package/telego-pkg
  SECTION:=net
  CATEGORY:=Network
  TITLE:=telEgo high-performance Telegram proxy core daemon
  DEPENDS:=+libc +ca-bundle
endef

define Build/Prepare
endef

define Build/Compile
endef

define Package/telego-pkg/install
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) ./files/usr/bin/telego $(1)/usr/bin/telego
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/init.d/telego $(1)/etc/init.d/telego
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./files/config/telego $(1)/etc/config/telego
endef

$(eval $(call BuildPackage,telego-pkg))
