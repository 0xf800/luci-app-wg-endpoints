# luci-app-wg-endpoints

A LuCI application for OpenWrt to easily managing different WireGuard endpoints.

## Features
- **Endpoint Switching**: Quickly toggle between pre-configured WireGuard servers.
- **PBR Integration**: Automatically stops and restarts Policy-Based Routing (PBR) during 
	switching to ensure traffic flows correctly.
- **Auto-Rollback**: If a new endpoint fails to establish a handshake within 10 seconds, 
	the system automatically rolls back to the previous working configuration.
- **Status Monitoring**: Real-time feedback on connection status and PBR state within the LuCI interface.

## Requirements
- OpenWrt (Tested on 25.12.2)
- `wireguard-tools`
- `pbr` (optional, for policy-based routing support)
- `curl` (for IP verification)

## Installation
1. Upload the `.apk` package to your router.
2. Install via opkg:
   ```bash
   opkg update
   opkg install luci-app-wg-endpoints_1.0.0-1_all.apk
