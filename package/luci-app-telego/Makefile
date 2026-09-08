include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-telego
PKG_VERSION:=0.6.1
PKG_RELEASE:=7

LUCI_TITLE:=LuCI Web Interface for telEgo
LUCI_DESCRIPTION:=LuCI JavaScript interface for telEgo MTProxy, WEB Proxy and live telemetry.
LUCI_DEPENDS:=+luci-base +telego-pkg +rpcd-mod-ucode +ucode-mod-fs +ucode-mod-uci +ucode-mod-ubus +uclient-fetch
LUCI_PKGARCH:=all

include $(TOPDIR)/feeds/luci/luci.mk
