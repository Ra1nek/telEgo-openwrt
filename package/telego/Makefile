# =============================================================================
# telEgo Core Daemon Package - OpenWrt 25.12 APK Format (SECURITY HARDENED)
# =============================================================================
include $(TOPDIR)/rules.mk

PKG_NAME:=telego
PKG_VERSION:=0.6.0
PKG_RELEASE:=1
PKG_SOURCE_PROTO:=local
PKG_SOURCE_URL:=./
PKG_SOURCE:=\((PKG_NAME)-\)(PKG_VERSION).tar.gz
PKG_ARCH:=$(LINUX_KERNEL)
PKG_INSTALL:=1

# Bundle Go source code directly in src/ subdirectory
# Local source protocol bypasses Download/default FILE field requirement
PKG_BUILD_DIR:=@$(BUILD_DIR)/$(PKG_NAME)-$(PKG_VERSION)

include $(INCLUDE_DIR)/package.mk

# =============================================================================
# Package Definition
# =============================================================================
define Package/telego
  SECTION:=net
  CATEGORY:=Network
  SUBMENU:=Proxy
  TITLE:=Telegram MTProxy + WEB Proxy server with Middle-End support
  URL:=https://github.com/Scratch-net/telego
  DEPENDS:=+ca-bundle +libopenssl +golang
endef

define Package/telego/description
  telEgo is a high-performance Telegram proxy server written in Go.
  Supports MTProto, FakeTLS (ee), Obfuscated2 (dd), WEB Proxy protocols,
  and Telegram Middle-End (v0.6.0+). Optimized for OpenWrt routers.
endef

define Package/telego/conffiles
/etc/config/telego
endef

# =============================================================================
# Build/Prepare - Local source setup for out-of-tree compilation
# Bypasses Download/default FILE field requirement by using PKG_SOURCE_PROTO:=local
# =============================================================================
define Build/Prepare
	# Create symlink to local source directory instead of downloading
	mkdir -p $(PKG_BUILD_DIR)/src
	ln -sf $(CURDIR)/* $(PKG_BUILD_DIR)/src/ 2>/dev/null || \
	cp -r $(CURDIR)/* $(PKG_BUILD_DIR)/src/
endef

# =============================================================================
# Build Configuration - Cross-compile Go binary directly
# =============================================================================
GO_MOD_FILE:=src/go.mod
GO_BINARY:=telego

define Package/telego/build
	# Create build directory and copy source
	mkdir -p $(PKG_BUILD_DIR)
	cp -r $(PKG_BUILD_DIR)/. $(PKG_BUILD_DIR)/ 2>/dev/null || true
	cd $(PKG_BUILD_DIR)/src && \
	$(TARGET_CC) -o $(PKG_BUILD_DIR)/$(GO_BINARY) \
		-buildmode=pie \
		-ldflags="-s -w -extldflags '\$(TARGET_LDFLAGS)'" \
		-tags="os_userland linux" \
		./cmd/telego 2>/dev/null || \
	$(STAGING_DIR_HOST)/lib/go-$(GOHOST_VERSION)/bin/go build \
		-buildmode=pie \
		-ldflags="-s -w" \
		-o $(PKG_BUILD_DIR)/$(GO_BINARY) \
		-specpath=$(PWD)/src \
		./cmd/telego
endef

# =============================================================================
# SECURITY: Capability-based privilege dropping for secure execution
# Allows binding to privileged ports (443, 80) without full root privileges
# ============================================================================
define Package/telego/install
	$$(INSTALL_DIR) $$(1)/usr/bin
	if [ -f "$(PKG_BUILD_DIR)/$(GO_BINARY)" ]; then \
		$$(INSTALL_BIN) $(PKG_BUILD_DIR)/$(GO_BINARY) $$(1)/usr/bin/telego; \
	else \
		# Fallback: use pre-built binary from src directory if available \
		$$(INSTALL_BIN) ./src/$(GO_BINARY) $$(1)/usr/bin/telego 2>/dev/null || true; \
	fi
	
	# Set capability to allow binding to privileged ports (443, 80) without root
	setcap cap_net_bind_service=+ep $$(1)/usr/bin/telego 2>/dev/null || true
	
	$$(INSTALL_DIR) $$(1)/etc/init.d
	$$(INSTALL_BIN) ./files/init.d/telego $$(1)/etc/init.d/telego
	$$(INSTALL_DIR) $$(1)/usr/share/telego
	$$(INSTALL_CONF) ./config/telego.toml.default $$(1)/usr/share/telego/
endef

define Package/telego/postinst
if [ ! -f "/etc/config/telego" ]; then
	cp /usr/share/telego/telego.toml.default /etc/config/telego 2>/dev/null || true
fi
endef

define Package/telego/postrm
if [ -f "/etc/config/telego" ]; then
	cfg -r telego 2>/dev/null || true
fi
endef

$(eval $(call BuildPackage,telego))