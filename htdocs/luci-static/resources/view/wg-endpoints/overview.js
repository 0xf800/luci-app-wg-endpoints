'use strict';
'require view';
'require uci';
'require rpc';
'require ui';
'require dom';

const callCheckStatus = rpc.declare({
	object: 'luci.wg-endpoints',
	method: 'check_status',
	params: [ 'iface' ],
	expect: {}
});

const callApply = rpc.declare({
	object: 'luci.wg-endpoints',
	method: 'apply',
	params: [ 'iface', 'peer' ],
	expect: {}
});

const callAddPeer = rpc.declare({
	object: 'luci.wg-endpoints',
	method: 'add_peer',
	params: [ 'iface', 'desc', 'host', 'pubkey', 'port' ],
	expect: {}
});

const callRemovePeer = rpc.declare({
	object: 'luci.wg-endpoints',
	method: 'remove_peer',
	params: [ 'peer' ],
	expect: {}
});

const STATUS_CSS = `
.wge-status-panel {
	margin: 1em 0;
	padding: 0.5em 1em;
	border: 1px solid #ccc;
	border-radius: 4px;
	background: #f9f9f9;
	font-family: monospace;
	font-size: 0.9em;
	min-height: 2em;
}
.wge-status-line {
	display: flex;
	align-items: center;
	gap: 0.5em;
	padding: 2px 0;
}
.wge-status-line.ok     { color: #46b450; }
.wge-status-line.warn   { color: #ffba00; }
.wge-status-line.error  {
	color: #fff;
	background: #dc3232;
	padding: 4px 8px;
	border-radius: 3px;
	margin-top: 4px;
}
.wge-status-line.info   { color: #555; }
.wge-status-line.notice {
	color: #fff;
	background: #ffba00;
	padding: 4px 8px;
	border-radius: 3px;
	margin-top: 4px;
}
.wge-spinner {
	display: inline-block;
	width: 12px; height: 12px;
	border: 2px solid #ccc;
	border-top-color: #46b450;
	border-radius: 50%;
	animation: wge-spin 0.8s linear infinite;
}
@keyframes wge-spin { to { transform: rotate(360deg); } }
`;

return view.extend({

	load: function() {
		return uci.load('network');
	},

	_injectCSS: function() {
		if (document.getElementById('wge-style')) return;
		const s = document.createElement('style');
		s.id = 'wge-style';
		s.textContent = STATUS_CSS;
		document.head.appendChild(s);
	},

	getWgInterfaces: function() {
		const ifaces = [];
		uci.sections('network', 'interface', function(s) {
			if (s.proto !== 'wireguard') return;
			const peers = [];
			uci.sections('network', 'wireguard_' + s['.name'], function(p) {
				peers.push({
					name:     p['.name'],
					desc:     p.description   || p['.name'],
					host:     p.endpoint_host || '',
					port:     p.endpoint_port || '51820',
					pubkey:   p.public_key    || '',
					disabled: p.disabled === '1'
				});
			});
			if (peers.length > 0)
				ifaces.push({ name: s['.name'], peers: peers });
		});
		return ifaces;
	},

	// ── Status panel helpers ──────────────────────────────────────────────────

	_statusPanel: null,

	_initPanel: function(container) {
		let panel = container.querySelector('.wge-status-panel');
		if (!panel) {
			panel = E('div', { 'class': 'wge-status-panel' });
			container.appendChild(panel);
		}
		panel.innerHTML = '';
		this._statusPanel = panel;
	},

	_addLine: function(text, type, spinner) {
		if (!this._statusPanel) return;
		const icon = { ok: '✓', warn: '⚠', error: '✗', info: '…', notice: '⚠' }[type] || '·';
		const line = E('div', { 'class': 'wge-status-line ' + (type || 'info') }, [
			spinner ? E('span', { 'class': 'wge-spinner' }) : E('span', {}, icon),
			E('span', {}, ' ' + text)
		]);
		this._statusPanel.appendChild(line);
	},

	_clearSpinners: function() {
		if (!this._statusPanel) return;
		this._statusPanel.querySelectorAll('.wge-status-line.info').forEach(function(l) {
			l.remove();
		});
	},

	// ── Apply endpoint ────────────────────────────────────────────────────────

	_applyEndpoint: function(ifname, container) {
		const self     = this;
		const selected = document.querySelector(
			'input[name="active_peer_' + ifname + '"]:checked'
		);

		if (!selected) {
			self._initPanel(container);
			self._addLine(_('Please select an endpoint first.'), 'warn');
			return;
		}

		const btn = container.querySelector('.wge-apply-btn-' + ifname);
		if (btn) btn.disabled = true;

		self._initPanel(container);
		self._addLine(_('Checking PBR and WireGuard status…'), 'info', true);

		callCheckStatus(ifname)
		.then(function(st) {
			self._clearSpinners();

			if (st.pbr_installed) {
				self._addLine(
					_('PBR installed') + ' — ' + (st.pbr_active ? _('active') : _('inactive')),
					st.pbr_active ? 'ok' : 'warn'
				);
			}
			if (st.wg_endpoint) {
				self._addLine(
					_('Current endpoint: ') + st.wg_endpoint +
					(st.wg_handshake ? ' — ' + st.wg_handshake : ''),
					'info'
				);
			}

			self._addLine(_('Switching endpoint…'), 'info', true);
			self._addLine(_('Restarting interface ') + ifname + '…', 'info', true);
			self._addLine(_('Waiting for handshake (max 10s)…'), 'info', true);

			return callApply(ifname, selected.value);
		})
		.then(function(res) {
			self._clearSpinners();

			if (res.error) {
				self._addLine(_('Error: ') + res.error, 'error');
				if (btn) btn.disabled = false;
				return;
			}

			if (res.handshake) {
				// Success
				if (res.pbr_was_active)
					self._addLine(_('PBR stopped'), 'ok');
				self._addLine(_('Interface ') + ifname + _(' restarted'), 'ok');
				self._addLine(
					_('Handshake OK — ') + String(res.active_key).substring(0, 16) + '…',
					'ok'
				);
				self._addLine(_('PBR restarting in background…'), 'ok');
				setTimeout(function() { window.location.reload(); }, 2000);

			} else if (res.rolling_back) {
				// Handshake failed, rollback initiated in background
				self._addLine(_('Interface ') + ifname + _(' restarted'), 'ok');
				self._addLine(
					_('Handshake failed — rolling back to ') + res.prev_desc + '…',
					'notice'
				);
				self._addLine(
					_('Rollback running in background — check syslog for result.'),
					'info'
				);
				// Reload after rollback completes (~20s)
				setTimeout(function() { window.location.reload(); }, 22000);

			} else {
				// Switching failed — double fail already handled in background
				self._addLine(_('Handshake failed'), 'error');
				self._addLine(
					_('Switching failed — activate debug logs and try again in a few minutes.'),
					'error'
				);
				if (btn) btn.disabled = false;
			}
		})
		.catch(function(e) {
			self._clearSpinners();
			self._addLine(_('Error: ') + (e.message || String(e)), 'error');
			if (btn) btn.disabled = false;
		});
	},

	// ── Delete peer ───────────────────────────────────────────────────────────

	_deletePeer: function(peerName) {
		if (!confirm(_('Delete this endpoint?'))) return;

		callRemovePeer(peerName)
		.then(function(res) {
			if (res && res.error) {
				alert(res.error);
			} else {
				window.location.reload();
			}
		})
		.catch(function(e) {
			alert(_('Error: ') + String(e));
		});
	},

	// ── Add peer ──────────────────────────────────────────────────────────────

	_addPeer: function(ifname) {
		const val = function(id) {
			const el = document.getElementById(id + '_' + ifname);
			return el ? el.value.trim() : '';
		};

		const desc   = val('ep_desc');
		const host   = val('ep_host');
		const pubkey = val('ep_pubkey');
		const port   = val('ep_port') || '51820';

		if (!desc || !host || !pubkey) {
			alert(_('Description, Host and Public Key are required.'));
			return;
		}

		callAddPeer(ifname, desc, host, pubkey, port)
		.then(function(res) {
			if (res && res.error) {
				alert(res.error);
			} else {
				window.location.reload();
			}
		})
		.catch(function(e) {
			alert(_('Error: ') + String(e));
		});
	},

	// ── Render ────────────────────────────────────────────────────────────────

	_renderAddForm: function(ifname) {
		const self = this;

		const field = function(id, label, placeholder, hint) {
			return E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, label),
				E('div', { 'class': 'cbi-value-field' }, [
					E('input', {
						'id':          id + '_' + ifname,
						'class':       'cbi-input-text',
						'type':        'text',
						'placeholder': placeholder
					}),
					hint ? E('div', { 'class': 'cbi-value-description' }, hint) : ''
				])
			]);
		};

		return E('details', { 'style': 'margin-top:1em' }, [
			E('summary', { 'style': 'cursor:pointer; font-weight:bold' },
				_('+ Add endpoint for ') + ifname),
			E('div', { 'class': 'cbi-section-node', 'style': 'margin-top:0.5em' }, [
				field('ep_desc',   _('Description'), 'Romania Bucharest',
					_('Display name for this endpoint')),
				field('ep_host',   _('Host'),        '1.2.3.4',
					_('IP address or hostname of the VPN server')),
				field('ep_pubkey', _('Public Key'),  'base64 public key',
					_('WireGuard public key of this server')),
				field('ep_port',   _('Port'),        '51820',
					_('Leave empty for default 51820')),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, ''),
					E('div', { 'class': 'cbi-value-field' },
						E('button', {
							'class': 'btn cbi-button cbi-button-add',
							'click': function() { self._addPeer(ifname); }
						}, _('Add'))
					)
				])
			])
		]);
	},

	renderIface: function(iface) {
		const self = this;

		const table = E('table', { 'class': 'table cbi-section-table' }, [
			E('tr', { 'class': 'tr table-titles' }, [
				E('th', { 'class': 'th', 'style': 'width:2em' }, ''),
				E('th', { 'class': 'th' }, _('Description')),
				E('th', { 'class': 'th' }, _('Host')),
				E('th', { 'class': 'th' }, _('Port')),
				E('th', { 'class': 'th' }, _('Public Key')),
				E('th', { 'class': 'th' }, _('Actions'))
			])
		]);

		iface.peers.forEach(function(p) {
			table.appendChild(E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td', 'style': 'width:2em' },
					E('input', {
						'type':    'radio',
						'name':    'active_peer_' + iface.name,
						'value':   p.name,
						'checked': !p.disabled ? 'checked' : null
					})
				),
				E('td', { 'class': 'td' }, p.desc),
				E('td', { 'class': 'td' }, p.host),
				E('td', { 'class': 'td' }, p.port),
				E('td', { 'class': 'td',
					'style': 'font-size:0.8em; word-break:break-all; max-width:150px' },
					p.pubkey.substring(0, 20) + '…'),
				E('td', { 'class': 'td' },
					E('button', {
						'class': 'btn cbi-button cbi-button-remove',
						'click': function() { self._deletePeer(p.name); }
					}, _('Delete'))
				)
			]));
		});

		const container = E('div', { 'class': 'cbi-section', 'style': 'margin-bottom:2em' });
		container.appendChild(E('h3', {}, iface.name));
		container.appendChild(table);
		container.appendChild(
			E('div', { 'style': 'margin-top:0.8em' },
				E('button', {
					'class': 'btn cbi-button-apply wge-apply-btn-' + iface.name,
					'click': function() { self._applyEndpoint(iface.name, container); }
				}, _('Switch Endpoint'))
			)
		);
		container.appendChild(self._renderAddForm(iface.name));

		return container;
	},

	render: function() {
		this._injectCSS();
		const self   = this;
		const ifaces = this.getWgInterfaces();

		if (ifaces.length === 0) {
			return E('div', {}, [
				E('h2', {}, _('WireGuard Endpoints')),
				E('p', { 'class': 'cbi-section-descr' },
					_('No WireGuard interfaces found.'))
			]);
		}

		return E('div', {}, [
			E('h2', {}, _('WireGuard Endpoints')),
			E('p', { 'class': 'cbi-section-descr' },
				_('Select an endpoint and click Switch Endpoint. ' +
				  'PBR will be stopped, interface restarted, then PBR restarted automatically.')),
			...ifaces.map(function(iface) { return self.renderIface(iface); })
		]);
	},

	handleSaveApply: null,
	handleSave:      null,
	handleReset:     null
});
