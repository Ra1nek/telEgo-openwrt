# =============================================================================
# telEgo Core Daemon Package - OpenWrt 25.12 APK Format (SECURITY HARDENED)
# =============================================================================
include $(TOPDIR)/rules.mk

PKG_NAME:=telego
PKG_VERSION:=0.6.0
PKG_RELEASE:=1
PKG_ARCH:=$(LINUX_KERNEL)

# Host Go bypass - use GitHub Actions pre-installed Go 1.27
GO_HOST_BUILD:=1
export GO_CACHE_DIR:=$(HOME)/.cache/go-build

# Bundle source and build directory
PKG_BUILD_DIR:=@$(BUILD_DIR)/$(PKG_NAME)-$(PKG_VERSION)

include $(INCLUDE_DIR)/package.mk

# =============================================================================
# Package Definition
# =============================================================================
define Package/telego
  SECTION:=net
  CATEGORY:=Network
  SUBMENU:=Proxy
  TITLE:=Telegram MTProxy + WEB Proxy server (telego core daemon)
  URL:=https://github.com/Scratch-net/telego
  DEPENDS:=+libc +ca-bundle +libopenssl
endef

define Package/telego/description
  telEgo is a high-performance Telegram proxy server written in Go.
  Supports MTProto, FakeTLS (ee), Obfuscated2 (dd), WEB Proxy protocols.
endef

# =============================================================================
# Build/Prepare - Copy local source files to build directory
# =============================================================================
define Build/Prepare
	mkdir -p \$(PKG_BUILD_DIR)
	cp -r ./src/* \$(PKG_BUILD_DIR)/
	cd \$(PKG_BUILD_DIR) && \
		export PATH:=/opt/hostedtoolcache/go/\$(shell ls /opt/hostedtoolcache/go/ | head -1)/bin:\$(PATH) && \
		go build -buildmode=pie -ldflags="-s -w" -o telego ./cmd/telego
endef

# =============================================================================
# Package Installation - Copy pre-compiled binary to package staging area
# =============================================================================
define Package/telego/install
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/telego $(1)/usr/bin/telego
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/init.d/telego $(1)/etc/init.d/telego
endef

define Package/telego/postinst
if [ ! -f "/etc/config/telego" ]; then
	cp /usr/share/telego/telego.toml.default /etc/config/telego 2>/dev/null || true
fi
endef

$(eval $(call BuildPackage,telego))
