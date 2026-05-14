# luci-app-wg-endpoints

A LuCI application for OpenWrt that provides a graphical interface for managing and switching between multiple WireGuard endpoints (servers) per interface — without editing config files or restarting the router manually.

Tested on **OpenWrt 25.12.x** with Policy-Based Routing ([PBR](https://docs.openwrt.melmac.net/pbr/)).

---

## The Problem It Solves

WireGuard on OpenWrt supports multiple peer sections per interface, but switching between them requires:

- Manually editing `/etc/config/network`
- Running `uci` commands from SSH
- Or navigating through multiple LuCI screens and confirming staged changes

When using PBR, the situation is worse — PBR must be stopped before the interface restarts and started again after, or routing rules break.

This app reduces all of that to a single click.

---

## Features

- **Auto-detection** — reads all WireGuard interfaces and their peers directly from `/etc/config/network` on every page load; no separate config file required
- **One-click endpoint switching** — select a peer from the list and click *Switch Endpoint*
- **PBR integration** — automatically stops PBR before switching and restarts it after; works correctly even if PBR is not installed
- **Auto-rollback** — if a handshake is not established within 10 seconds, the previous working endpoint is automatically restored
- **Double-fail protection** — if rollback also fails, PBR is restarted regardless and a clear error is logged
- **Live status panel** — real-time feedback during switching: PBR state, current endpoint, handshake result, public IP and country
- **Public IP verification** — after a successful switch, queries `api.myip.com` through the WireGuard interface to confirm the correct exit IP and country
- **Add / Delete endpoints** — add new peers directly from the UI without touching config files
- **System log integration** — all switch events are written to syslog via `logger` for persistent audit trail
- **Debug logs** — detailed per-operation log saved to `/tmp/wgdebug_<timestamp>.log` including PBR process IDs, UCI state snapshots and timing

---

## How It Works

### Endpoint switching

Each WireGuard peer section in `/etc/config/network` can carry an `option disabled '1'` flag. OpenWrt's `wireguard.sh` protocol handler respects this flag — disabled peers are excluded when building the `wg syncconf` configuration on interface startup.

When you click *Switch Endpoint*, the backend shell script (`luci.wg-endpoints`):

1. Records the currently active peer (the one without `disabled '1'`) as the rollback target
2. Sets `disabled=0` on the selected peer and `disabled=1` on all others
3. Commits the change directly to `/etc/config/network` — the LuCI JavaScript never touches UCI, so no *Unsaved Changes* banner appears
4. Stops PBR if running
5. Runs `ifdown <iface>`, waits 2 seconds, runs `ifup <iface>`
6. Waits up to 10 seconds for a WireGuard handshake
7. On success: queries public IP, logs result, returns response to the browser, then starts PBR in the background
8. On failure: immediately returns a rollback-initiated response to the browser, then runs the full rollback sequence in the background

### Rollback

If the handshake probe fails:

```
handshake with Vienna failed → UCI reverted to sofia surf → ifdown/ifup → handshake probe
  ├── OK  → PBR start → syslog: handshake failed, reverted to sofia surf: OK
  └── FAIL → PBR start → syslog: ERROR: switching failed, no active endpoint, check logs
```

The browser receives the rollback-initiated response immediately (after ~15s max), so there is no XHR timeout. The rollback itself runs entirely in the background.

### PBR concurrency protection

Before starting PBR, the script waits for any existing `pbr` process to finish (up to 30 seconds). This prevents routing table corruption when two rapid switches are performed in succession.

---

## Requirements

- OpenWrt 25.12+
- `wireguard-tools` (`wg` binary)
- `curl` (for public IP verification)
- `jsonfilter` (included in OpenWrt base)
- `pbr` — optional; PBR integration is skipped gracefully if not installed

---

## Installation

### Manual (recommended for now)

Download the archive from [Releases](https://github.com/0xf800/luci-app-wg-endpoints/releases) and extract it directly to the router root:

```sh
# Upload the archive to the router
scp luci-app-wg-endpoints.tar.gz root@192.168.1.1:/tmp/

# Extract to filesystem root
ssh root@192.168.1.1 "tar xzf /tmp/luci-app-wg-endpoints.tar.gz -C / && /etc/init.d/rpcd restart"
```

Then do a hard refresh in the browser (`Ctrl+Shift+R`). The app appears under **Network → WireGuard Endpoints**.

### Survival across sysupgrade

The files installed above live in the router's overlay filesystem and will **not** survive a `sysupgrade` unless you include them in a custom image or backup. To persist the installation, add the file paths to `/etc/sysupgrade.conf`:

```
/usr/libexec/rpcd/luci.wg-endpoints
/usr/share/rpcd/acl.d/luci-app-wg-endpoints.json
/usr/share/luci/menu.d/luci-app-wg-endpoints.json
/www/luci-static/resources/view/wg-endpoints/overview.js
```

---

## File Structure

```
/usr/libexec/rpcd/luci.wg-endpoints          # Shell backend (rpcd method handler)
/usr/share/rpcd/acl.d/luci-app-wg-endpoints.json  # rpcd ACL — declares allowed methods
/usr/share/luci/menu.d/luci-app-wg-endpoints.json  # LuCI menu entry (Network section)
/www/luci-static/resources/view/wg-endpoints/overview.js  # LuCI UI (JavaScript)
```

### Backend (`luci.wg-endpoints`)

A POSIX shell script registered as an rpcd handler. Exposes five methods:

| Method | Parameters | Description |
|---|---|---|
| `check_status` | `iface` | Returns PBR state, current WireGuard endpoint and last handshake time |
| `apply` | `iface`, `peer` | Performs the full switch sequence with rollback support |
| `get_active_peer` | `iface` | Returns the public key of the peer with the most recent handshake |
| `add_peer` | `iface`, `desc`, `host`, `pubkey`, `port` | Adds a new peer section to `/etc/config/network` |
| `remove_peer` | `peer` | Removes a peer section from `/etc/config/network` |

All UCI writes go through the shell backend. The LuCI JavaScript layer never modifies UCI staging, which prevents the *Unsaved Changes* banner from appearing.

### Frontend (`overview.js`)

A standard LuCI view written in JavaScript. On load it reads `/etc/config/network` via the UCI API and renders one block per WireGuard interface. Each block contains:

- A table of configured peers with radio button selection (active peer pre-selected)
- A *Switch Endpoint* button with a live status panel showing each step
- A collapsible *Add endpoint* form

---

## Syslog Output

All switch events are written to syslog with tag `wg-endpoints`:

```
wg-endpoints: switching endpoint initiated for wgshark - PBR detected, stopping
wg-endpoints: endpoint changed to: Vienna; active public ip for wgshark: 89.187.168.57, Austria
wg-endpoints: PBR started - done, switch duration 13s
```

Rollback:
```
wg-endpoints: handshake with Berlin failed, switching back to sofia surf
wg-endpoints: handshake failed, reverted to sofia surf: OK; active public ip for wgshark: 185.9.16.110, Bulgaria
```

Double fail:
```
wg-endpoints: ERROR: switching failed, no active endpoint, check logs
```

---

## Debug Logs

Each operation writes a detailed log to `/tmp/wgdebug_<YYYYMMDD_HHMMSS>.log` containing:

- PBR process IDs at each step
- Full UCI state snapshot after commit
- Handshake timing
- Public IP lookup result
- Rollback sequence if triggered

To enable persistent debug logs, copy them from `/tmp/` before the router reboots (they do not survive reboot).

---

## UCI Structure

The app relies entirely on the standard OpenWrt WireGuard UCI schema. No extra config files are created. The only field it manages beyond standard peer configuration is:

```
option disabled '1'    # peer is inactive (excluded from wg syncconf)
option disabled '0'    # peer is active
```

Example with two peers, one active:

```
config wireguard_wgshark
    option description 'sofia surf'
    option public_key  'LQFiCiZc...'
    option endpoint_host '185.9.16.109'
    option endpoint_port '51820'
    option persistent_keepalive '25'
    option allowed_ips '0.0.0.0/0'
    option route_allowed_ips '1'
    option disabled '1'

config wireguard_wgshark
    option description 'Vienna'
    option public_key  'dPZe8Jq3...'
    option endpoint_host '89.187.168.56'
    option endpoint_port '51820'
    option persistent_keepalive '25'
    option allowed_ips '0.0.0.0/0'
    option route_allowed_ips '1'
    option disabled '0'
```

---

## Contributing

Issues and pull requests are welcome. The `testing` branch is used for active development; `main` contains stable releases.

When contributing to the shell backend, please test with `shellcheck`:

```sh
shellcheck usr/libexec/rpcd/luci.wg-endpoints
```

---

## License

GPL-3.0 — see [LICENSE](LICENSE)
