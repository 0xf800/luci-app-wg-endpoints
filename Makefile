include $(TOPDIR)/rules.mk

# Name of the package and version
PKG_NAME:=luci-app-wg-endpoints
PKG_VERSION:=1.0.0
PKG_RELEASE:=1

# Build information
PKG_LICENSE:=Apache-2.0
PKG_MAINTAINER:=Vassil Pandev

include $(INCLUDE_DIR)/package.mk

# Define the package properties
define Package/$(PKG_NAME)
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=WireGuard Endpoint Switcher
  DEPENDS:=+luci-base +wireguard-tools +curl +jsonfilter
  PKGARCH:=all
endef

define Package/$(PKG_NAME)/description
  A LuCI application to manage and switch between multiple WireGuard endpoints
  with support for PBR (Policy-Based Routing) auto-restart.
endef

# No compilation is needed for JS/Shell app, just prepare files
define Build/Compile
endef

# Define where to install files on the target device
define Package/$(PKG_NAME)/install
	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$(INSTALL_DATA) ./usr/share/luci/menu.d/luci-app-wg-endpoints.json $(1)/usr/share/luci/menu.d/

	$(INSTALL_DIR) $(1)/usr/share/rpcd/acl.d
	$(INSTALL_DATA) ./usr/share/rpcd/acl.d/luci-app-wg-endpoints.json $(1)/usr/share/rpcd/acl.d/

	$(INSTALL_DIR) $(1)/usr/libexec/rpcd
	$(INSTALL_BIN) ./usr/libexec/rpcd/luci.wg-endpoints $(1)/usr/libexec/rpcd/

	$(INSTALL_DIR) $(1)/www/luci-static/resources/view/wg-endpoints
	$(INSTALL_DATA) ./www/luci-static/resources/view/wg-endpoints/overview.js $(1)/www/luci-static/resources/view/wg-endpoints/
endef

$(eval $(call BuildPackage,$(PKG_NAME)))