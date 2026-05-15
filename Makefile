include $(TOPDIR)/rules.mk

PKG_LICENSE:=Apache-2.0
PKG_MAINTAINER:=Vassil Pandev

LUCI_TITLE:=WireGuard Endpoint Switcher
LUCI_DEPENDS:=+luci-base +wireguard-tools +curl +jsonfilter

PKG_VERSION:=1.0.0
PKG_RELEASE:=1

include $(TOPDIR)/feeds/luci/luci.mk

define Package/$(PKG_NAME)/install
	$(INSTALL_DIR) $(1)/www/luci-static/resources/view/wg-endpoints
	$(INSTALL_DATA) ./htdocs/luci-static/resources/view/wg-endpoints/overview.js \
		$(1)/www/luci-static/resources/view/wg-endpoints/
	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$(INSTALL_DATA) ./root/usr/share/luci/menu.d/luci-app-wg-endpoints.json \
		$(1)/usr/share/luci/menu.d/
	$(INSTALL_DIR) $(1)/usr/share/rpcd/acl.d
	$(INSTALL_DATA) ./root/usr/share/rpcd/acl.d/luci-app-wg-endpoints.json \
		$(1)/usr/share/rpcd/acl.d/
	$(INSTALL_DIR) $(1)/usr/libexec/rpcd
	$(INSTALL_BIN) ./root/usr/libexec/rpcd/luci.wg-endpoints \
		$(1)/usr/libexec/rpcd/
endef

# call BuildPackage - OpenWrt buildroot signature