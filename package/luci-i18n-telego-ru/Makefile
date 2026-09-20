include $(TOPDIR)/rules.mk

PKG_NAME:=luci-i18n-telego-ru
PKG_VERSION:=0.6.5
PKG_RELEASE:=17
PKG_BUILD_DEPENDS:=luci-base/host

include $(INCLUDE_DIR)/package.mk

PO2LMO:=$(STAGING_DIR_HOSTPKG)/bin/po2lmo

define Package/luci-i18n-telego-ru
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=Russian translation for luci-app-telego
  DEPENDS:=+luci-app-telego
  EXTRA_DEPENDS:=luci-app-telego (>=0.6.5-r23)
  HIDDEN:=1
  DEFAULT:=LUCI_LANG_ru||(ALL&&m)
  PKGARCH:=all
endef

define Package/luci-i18n-telego-ru/description
Russian translation for luci-app-telego.
endef

define Build/Compile
	true
endef

define Package/luci-i18n-telego-ru/install
	$(INSTALL_DIR) $(1)/etc/uci-defaults
	printf '%s\n' \
		"uci set luci.languages.ru='Русский (Russian)'; uci commit luci" \
		> $(1)/etc/uci-defaults/luci-i18n-telego-ru
	chmod 0755 $(1)/etc/uci-defaults/luci-i18n-telego-ru

	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/i18n
	$(foreach po,$(wildcard ./po/ru/*.po), \
		$(PO2LMO) $(po) \
			$(1)/usr/lib/lua/luci/i18n/$(basename $(notdir $(po))).ru.lmo;)
endef

define Package/luci-i18n-telego-ru/postinst
#!/bin/sh
	[ -n "$${IPKG_INSTROOT}" ] || {
	rm -f /tmp/luci-indexcache.*
	rm -rf /tmp/luci-modulecache/
	}
	exit 0
endef

$(eval $(call BuildPackage,luci-i18n-telego-ru))
