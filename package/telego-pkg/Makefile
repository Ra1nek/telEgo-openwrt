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
	# Handled out-of-tree by host workspace runner
endef

define Build/Compile
	# Pre-compiled binary is already injected into files/usr/bin/telego
endef

define Package/telego-pkg/install
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) ./files/usr/bin/telego $(1)/usr/bin/telego
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/init.d/telego $(1)/etc/init.d/telego
endef

$(eval $(call BuildPackage,telego-pkg))