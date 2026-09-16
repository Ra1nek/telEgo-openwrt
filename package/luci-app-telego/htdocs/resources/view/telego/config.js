'use strict';

'require form';
'require rpc';
'require uci';
'require view';

const callTelegoStatus = rpc.declare({
	object: 'telego',
	method: 'status',
	expect: { '': {} }
});

function randomSecret() {
	const bytes = new Uint8Array(16);
	window.crypto.getRandomValues(bytes);

	return Array.from(bytes)
		.map(function (value) {
			return value.toString(16).padStart(2, '0');
		})
		.join('');
}

function formatBytes(value) {
	value = Number(value) || 0;

	if (value < 1024)
		return _('0 B').replace('0', Math.round(value));

	const units = [_('B'), _('KiB'), _('MiB'), _('GiB'), _('TiB')];
	let unit = 0;

	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit++;
	}

	return value.toFixed(value >= 100 ? 0 : 1) + ' ' + units[unit];
}

function formatUptime(seconds) {
	seconds = Math.max(0, Number(seconds) || 0);

	const days = Math.floor(seconds / 86400);
	seconds %= 86400;
	const hours = Math.floor(seconds / 3600);
	seconds %= 3600;
	const minutes = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);

	const parts = [];

	if (days)
		parts.push(days + ' ' + _('d'));
	if (hours || days)
		parts.push(hours + ' ' + _('h'));
	if (minutes || hours || days)
		parts.push(minutes + ' ' + _('m'));

	parts.push(secs + ' ' + _('s'));
	return parts.join(' ');
}

function serviceState(status) {
	if (!status || !status.running)
		return uci.get('telego', 'general', 'enabled') === '1'
			? _('Stopped')
			: _('Disabled');

	return _('Running');
}

function onOff(value) {
	return value ? _('Enabled') : _('Disabled');
}

function yesNo(value) {
	return Number(value) > 0 ? _('Yes') : _('No');
}

function middleEndArtifactState(status) {
	if (!status || !status.middleend_enabled)
		return _('Disabled');
	if (!status.metrics_available)
		return _('—');
	if (Number(status.middleend_artifact_pending) > 0)
		return _('Pending');
	if (Number(status.middleend_artifact_applied) > 0)
		return _('Applied');
	return _('Waiting');
}

function statusCard(label, key) {
	return E('div', { 'class': 'telego-status-card' }, [
		E('div', { 'class': 'telego-status-label' }, label),
		E('div', { 'class': 'telego-status-value', 'id': 'telego-status-' + key }, _('—'))
	]);
}

function statusGroup(title, cards) {
	return E('div', { 'class': 'telego-status-section' }, [
		E('h3', {}, title),
		E('div', { 'class': 'telego-status-grid' }, cards)
	]);
}

function buildStatusView() {
	const service = statusGroup(_('Service and MTProxy'), [
		statusCard(_('Service State'), 'state'),
		statusCard(_('PID'), 'pid'),
		statusCard(_('Service Uptime'), 'uptime'),
		statusCard(_('Metrics'), 'metrics'),
		statusCard(_('Active Connections'), 'connections'),
		statusCard(_('Active IPs'), 'ips'),
		statusCard(_('Tracked IPs'), 'tracked'),
		statusCard(_('Blocked IPs'), 'blocked'),
		statusCard(_('Traffic Received'), 'rx'),
		statusCard(_('Traffic Sent'), 'tx')
	]);

	const web = statusGroup(_('WEB Proxy Runtime'), [
		statusCard(_('WEB Proxy State'), 'web-state'),
		statusCard(_('Carrier Mode'), 'web-carrier'),
		statusCard(_('Active WEB Sessions'), 'web-sessions'),
		statusCard(_('Active WEB Streams'), 'web-streams'),
		statusCard(_('Active WebSockets'), 'web-websockets'),
		statusCard(_('Backend Dials'), 'web-dials'),
		statusCard(_('Pending WEB Bytes'), 'web-pending-bytes'),
		statusCard(_('Pending WEB Items'), 'web-pending-items'),
		statusCard(_('WEB Sessions Created'), 'web-created'),
		statusCard(_('WEB Sessions Closed'), 'web-closed'),
		statusCard(_('Carrier Retries'), 'web-retries'),
		statusCard(_('Backpressure Events'), 'web-backpressure')
	]);

	const middleEnd = statusGroup(_('Middle-End Runtime'), [
		statusCard(_('Middle-End State'), 'me-state'),
		statusCard(_('Admitting New Bindings'), 'me-admitting'),
		statusCard(_('Repair in Progress'), 'me-repairing'),
		statusCard(_('Physical Links'), 'me-links'),
		statusCard(_('Active Bindings'), 'me-bindings'),
		statusCard(_('Active Slot Repairs'), 'me-repairs'),
		statusCard(_('Slot Failures'), 'me-failures'),
		statusCard(_('Artifact State'), 'me-artifact'),
		statusCard(_('Artifact Refresh Failures'), 'me-artifact-failures')
	]);

	const error = E('p', {
		'class': 'telego-status-error',
		'id': 'telego-status-error',
		'aria-live': 'polite'
	});

	return E('div', {}, [
		E('h2', {}, _('telEgo Status')),
		E('p', {}, _('Live service, WEB Proxy and Middle-End statistics from the local metrics endpoint.')),
		service,
		web,
		middleEnd,
		error
	]);
}

function updateStatus(status, root) {
	root = root || document;
	const metricsReady = !!(status && status.metrics_available);
	const metricsVisible = !!(status && status.running && metricsReady);
	const values = {
		state: serviceState(status),
		pid: status && status.pid ? status.pid : _('—'),
		uptime: status ? formatUptime(status.uptime) : _('—'),
		metrics: status && status.running ? (metricsReady ? _('Running') : _('Error')) : _('—'),
		connections: metricsVisible ? status.connections : _('—'),
		ips: metricsVisible ? status.ips_active : _('—'),
		tracked: metricsVisible ? status.ips_tracked : _('—'),
		blocked: metricsVisible ? status.ips_blocked : _('—'),
		rx: metricsVisible ? formatBytes(status.rx_bytes) : _('—'),
		tx: metricsVisible ? formatBytes(status.tx_bytes) : _('—'),

		'web-state': status ? onOff(status.web_enabled) : _('—'),
		'web-carrier': status && status.web_carrier ? status.web_carrier : _('—'),
		'web-sessions': metricsVisible ? status.web_sessions_active : _('—'),
		'web-streams': metricsVisible ? status.web_streams_active : _('—'),
		'web-websockets': metricsVisible ? status.web_websockets_active : _('—'),
		'web-dials': metricsVisible ? status.web_backend_dials_active : _('—'),
		'web-pending-bytes': metricsVisible ? formatBytes(status.web_pending_bytes) : _('—'),
		'web-pending-items': metricsVisible ? status.web_pending_items : _('—'),
		'web-created': metricsVisible ? status.web_sessions_created_total : _('—'),
		'web-closed': metricsVisible ? status.web_sessions_closed_total : _('—'),
		'web-retries': metricsVisible ? status.web_carrier_retries_total : _('—'),
		'web-backpressure': metricsVisible ? status.web_backpressure_total : _('—'),

		'me-state': status ? onOff(status.middleend_enabled) : _('—'),
		'me-admitting': metricsVisible && status.middleend_enabled ? yesNo(status.middleend_admitting) : _('—'),
		'me-repairing': metricsVisible && status.middleend_enabled ? yesNo(status.middleend_repairing) : _('—'),
		'me-links': metricsVisible && status.middleend_enabled ? status.middleend_links : _('—'),
		'me-bindings': metricsVisible && status.middleend_enabled ? status.middleend_bindings : _('—'),
		'me-repairs': metricsVisible && status.middleend_enabled ? status.middleend_repairs_active : _('—'),
		'me-failures': metricsVisible && status.middleend_enabled ? status.middleend_slot_failures_total : _('—'),
		'me-artifact': status ? middleEndArtifactState(status) : _('—'),
		'me-artifact-failures': metricsVisible && status.middleend_enabled ? status.middleend_artifact_refresh_failures : _('—')
	};

	Object.keys(values).forEach(function (key) {
		const node = root.querySelector('#telego-status-' + key);
		if (node)
			node.textContent = String(values[key]);
	});

	const error = root.querySelector('#telego-status-error');
	if (error)
		error.textContent = status && status.running && !metricsReady
			? _('Metrics') + ': ' + _('Error') + ' (' + String(status.metrics_error || 'unavailable') + ')'
			: '';
}

function updateStatusError(errorText, root) {
	const node = (root || document).querySelector('#telego-status-error');
	if (node)
		node.textContent = errorText || _('Unable to read telEgo status.');
}

function makeConfigMap() {
	const m = new form.Map(
		'telego',
		_('telEgo Configuration'),
		_('Configure MTProxy, TLS fronting, WEB Proxy, Middle-End and runtime limits.')
	);

	let s = m.section(form.TypedSection, 'general', _('MTProxy'));
	s.anonymous = true;
	s.addremove = false;

	let o = s.option(form.Flag, 'enabled', _('Enable MTProxy'));
	o.default = '0';

	o = s.option(
		form.Value,
		'bind_to',
		_('Listen Address'),
		_('Public TCP address where telEgo accepts MTProxy connections.')
	);
	o.datatype = 'string';
	o.default = '0.0.0.0:443';

	o = s.option(form.ListValue, 'log_level', _('Log Level'));
	o.value('trace', _('Trace'));
	o.value('debug', _('Debug'));
	o.value('info', _('Info'));
	o.value('warn', _('Warning'));
	o.value('error', _('Error'));
	o.default = 'info';

	o = s.option(
		form.Flag,
		'proxy_protocol',
		_('Accept Incoming PROXY Protocol'),
		_('Enable only when a trusted TCP proxy is directly in front of the public MTProxy listener.')
	);
	o.default = '0';

	o = s.option(form.Value, 'max_connections_per_ip', _('Max Connections per IP'));
	o.datatype = 'uinteger';
	o.default = '100';
	o.description = _('0 disables this connection-flood limit.');

	o = s.option(form.Value, 'max_ips_per_user', _('Max IPs per User'));
	o.datatype = 'uinteger';
	o.default = '10';
	o.description = _('0 disables per-secret IP limiting.');

	o = s.option(form.Value, 'ip_block_timeout', _('IP Block Timeout'));
	o.datatype = 'string';
	o.default = '5m';

	o = s.option(form.Value, 'handshake_timeout', _('Handshake Timeout'));
	o.datatype = 'string';
	o.default = '5s';

	o = s.option(
		form.Value,
		'clock_sync_url',
		_('Clock Sync URL'),
		_('Optional HTTP(S) URL whose Date header corrects startup clock skew for FakeTLS validation.')
	);
	o.datatype = 'string';
	o.rmempty = true;

	s = m.section(form.TypedSection, 'tls_fronting', _('TLS Fronting'));
	s.anonymous = true;
	s.addremove = false;

	o = s.option(
		form.Value,
		'mask_host',
		_('Mask Domain'),
		_('Hostname used for FakeTLS SNI validation and certificate fetching.')
	);
	o.datatype = 'hostname';
	o.default = 'www.google.com';

	o = s.option(form.Value, 'mask_port', _('Mask Port'));
	o.datatype = 'port';
	o.default = '443';

	o = s.option(
		form.Value,
		'cert_host',
		_('Certificate Host'),
		_('Optional certificate source. Native shared-port Nginx on this router uses 127.0.0.1.')
	);
	o.datatype = 'host';
	o.rmempty = true;

	o = s.option(
		form.Value,
		'cert_port',
		_('Certificate Port'),
		_('Native shared-port Nginx uses port 8444 for certificate collection.')
	);
	o.datatype = 'port';
	o.rmempty = true;
	o.default = '';

	o = s.option(
		form.Value,
		'splice_host',
		_('Fallback Host'),
		_('Where unrecognized TLS is spliced. Native shared-port Nginx on this router uses 127.0.0.1.')
	);
	o.datatype = 'host';
	o.rmempty = true;

	o = s.option(
		form.Value,
		'splice_port',
		_('Fallback Port'),
		_('Native shared-port Nginx uses port 8443 and PROXY protocol v2.')
	);
	o.datatype = 'port';
	o.rmempty = true;
	o.default = '';

	o = s.option(form.Value, 'fake_cert_size', _('Fake Certificate Size'));
	o.datatype = 'uinteger';
	o.default = '0';
	o.description = _('0 selects automatic matching; an explicit override must be from 256 to 16384 bytes.');
	o.validate = function (section_id, value) {
		const number = Number(value);
		return value === '0' || (Number.isInteger(number) && number >= 256 && number <= 16384)
			? true
			: _('Use 0 for automatic mode or a value from 256 to 16384.');
	};

	o = s.option(form.DynamicList, 'mask_sni_safelist', _('Mask SNI Safelist'));
	o.datatype = 'hostname';

	o = s.option(form.ListValue, 'splice_proxy_protocol', _('Fallback PROXY Protocol'));
	o.value('0', _('Disabled'));
	o.value('1', _('PROXY Protocol v1'));
	o.value('2', _('PROXY Protocol v2'));
	o.default = '0';

	o = s.option(form.Value, 'splice_idle_timeout', _('Fallback Idle Timeout'));
	o.datatype = 'string';
	o.default = '30s';

	o = s.option(form.Flag, 'enable_drs', _('Enable DRS'));
	o.default = '1';

	o = s.option(form.Flag, 'enable_split_tls', _('Enable Split TLS'));
	o.default = '1';

	/* Dynamic users. */
	s = m.section(form.GridSection, 'secret', _('Users'));
	s.anonymous = true;
	s.addremove = true;
	s.sortable = true;

	o = s.option(form.Value, 'name', _('Username'));
	o.datatype = 'uciname';
	o.rmempty = false;

	o = s.option(
		form.Value,
		'secret',
		_('Secret (32 hex characters)'),
		_('Enter exactly 32 hexadecimal characters.')
	);
	o.datatype = 'string';
	o.rmempty = false;
	o.validate = function (section_id, value) {
		return /^[0-9a-fA-F]{32}$/.test(value)
			? true
			: _('Secret must contain exactly 32 hexadecimal characters.');
	};
	o.renderWidget = function (section_id, option_index, cfgvalue) {
		const widget = form.Value.prototype.renderWidget.apply(
			this,
			[section_id, option_index, cfgvalue]
		);

		const input = widget.querySelector('input');
		const button = E('button', {
			'type': 'button',
			'class': 'btn cbi-button cbi-button-action',
			'title': _('Generate random secret'),
			'aria-label': _('Generate random secret'),
			'click': function () {
				input.value = randomSecret();
				input.dispatchEvent(new Event('change', { bubbles: true }));
			}
		}, _('Generate'));

		return E('div', { 'class': 'telego-secret-editor' }, [
			widget,
			button
		]);
	};

	/* WEB Proxy. */
	s = m.section(form.TypedSection, 'web_proxy', _('WEB Proxy'));
	s.anonymous = true;
	s.addremove = false;

	o = s.option(form.Flag, 'enabled', _('Enable WEB Proxy'));
	o.default = '0';

	o = s.option(
		form.ListValue,
		'carrier',
		_('Carrier Mode'),
		_('Select the transport used by Telegram Desktop. HTTPS Lanes is the conservative upstream recommendation for new HTTP/2 deployments.')
	);
	o.value('https', _('HTTPS'));
	o.value('https-lanes', _('HTTPS Lanes'));
	o.value('websocket', _('WebSocket'));
	o.value('websocket-lanes', _('WebSocket Lanes'));
	o.default = 'https-lanes';

	o = s.option(
		form.Value,
		'bind_to',
		_('Bind Address'),
		_('Private HTTP/1.1 listener. Keep this address inaccessible from the Internet.')
	);
	o.datatype = 'string';
	o.default = '127.0.0.1:8080';

	o = s.option(
		form.Value,
		'hostname',
		_('Hostname'),
		_('Hostname covered by the public TLS certificate or Cloudflare Published Application.')
	);
	o.depends('enabled', '1');
	o.retain = true;
	o.datatype = 'hostname';
	o.rmempty = false;

	o = s.option(
		form.DynamicList,
		'trusted_proxy_cidrs',
		_('Trusted Proxy CIDRs'),
		_('Only these proxy addresses may supply forwarded client addresses.')
	);
	o.depends('enabled', '1');
	o.datatype = 'cidr';
	o.default = ['127.0.0.1/32'];

	o = s.option(
		form.Value,
		'backend',
		_('Compatibility Backend'),
		_('Optional local TCP or Unix backend. Leave empty to use the faster shared MTProxy core directly.')
	);
	o.depends('enabled', '1');
	o.datatype = 'string';
	o.rmempty = true;

	o = s.option(
		form.Value,
		'num_event_loops',
		_('WEB Event Loops'),
		_('0 selects the automatic gnet event-loop count.')
	);
	o.depends('enabled', '1');
	o.datatype = 'uinteger';
	o.default = '0';

	/* Middle-End. */
	s = m.section(form.TypedSection, 'middle_end', _('Telegram Middle-End'));
	s.anonymous = true;
	s.addremove = false;

	o = s.option(
		form.Flag,
		'enabled',
		_('Enable Middle-End'),
		_('Keep disabled unless you intentionally use Telegram Middle-End transport. Existing direct DC routing remains the default.')
	);
	o.default = '0';

	o = s.option(form.Value, 'proxy_tag', _('Proxy Tag'));
	o.depends('enabled', '1');
	o.datatype = 'string';
	o.rmempty = true;
	o.description = _('Optional registered Telegram proxy tag: exactly 32 hexadecimal characters.');
	o.validate = function (section_id, value) {
		return !value || /^[0-9a-fA-F]{32}$/.test(value)
			? true
			: _('Proxy Tag must be empty or contain exactly 32 hexadecimal characters.');
	};

	o = s.option(form.Value, 'socks5', _('SOCKS5 Proxy'));
	o.depends('enabled', '1');
	o.datatype = 'string';
	o.rmempty = true;

	o = s.option(form.Value, 'socks5_username', _('SOCKS5 Username'));
	o.depends('enabled', '1');
	o.datatype = 'string';
	o.rmempty = true;

	o = s.option(form.Value, 'socks5_password', _('SOCKS5 Password'));
	o.depends('enabled', '1');
	o.password = true;
	o.datatype = 'string';
	o.rmempty = true;

	o = s.option(form.Value, 'artifact_proxy', _('Artifact Proxy'));
	o.depends('enabled', '1');
	o.datatype = 'string';
	o.rmempty = true;

	o = s.option(form.Value, 'nat_ip', _('STUN NAT IP'));
	o.depends('enabled', '1');
	o.datatype = 'ipaddr';
	o.rmempty = true;

	o = s.option(form.Value, 'max_connections', _('Middle-End Max Connections'));
	o.depends('enabled', '1');
	o.datatype = 'uinteger';
	o.default = '0';
	o.description = _('0 uses the upstream default of 10000; an override may only reduce it.');
	o.validate = function (section_id, value) {
		const number = Number(value);
		return value === '0' || (Number.isInteger(number) && number >= 1 && number <= 10000)
			? true
			: _('Use 0 or a value from 1 to 10000.');
	};

	o = s.option(form.Value, 'queue_budget_mb', _('Middle-End Queue Budget (MB)'));
	o.depends('enabled', '1');
	o.datatype = 'uinteger';
	o.default = '0';
	o.description = _('0 uses the upstream 32 MiB default; an override may be from 2 to 32 MiB.');
	o.validate = function (section_id, value) {
		const number = Number(value);
		return value === '0' || (Number.isInteger(number) && number >= 2 && number <= 32)
			? true
			: _('Use 0 or a value from 2 to 32.');
	};

	/* Performance, upstream and metrics are advanced runtime controls. */
	s = m.section(form.TypedSection, 'performance', _('Performance'));
	s.anonymous = true;
	s.addremove = false;

	o = s.option(form.Value, 'tcp_buffer_kb', _('TCP Buffer (KB)'));
	o.datatype = 'uinteger';
	o.default = '128';

	o = s.option(form.Value, 'num_event_loops', _('Event Loops'));
	o.datatype = 'uinteger';
	o.default = '0';

	o = s.option(form.ListValue, 'prefer_ip', _('IP Preference'));
	o.value('prefer-ipv4', _('Prefer IPv4'));
	o.value('prefer-ipv6', _('Prefer IPv6'));
	o.value('only-ipv4', _('IPv4 only'));
	o.value('only-ipv6', _('IPv6 only'));
	o.default = 'prefer-ipv4';

	o = s.option(form.Value, 'idle_timeout', _('Idle Timeout'));
	o.datatype = 'string';
	o.default = '5m';

	o = s.option(form.Value, 'max_write_buffer_mb', _('Max Write Buffer (MB)'));
	o.datatype = 'uinteger';
	o.default = '0';

	o = s.option(form.Value, 'client_silence_close', _('Client Silence Close'));
	o.datatype = 'string';
	o.default = '0s';
	o.description = _('0 disables this recovery timer; upstream suggests roughly 10–15s only when diagnosing the iOS Updating stall.');

	s = m.section(form.TypedSection, 'upstream', _('Upstream'));
	s.anonymous = true;
	s.addremove = false;
	o = s.option(
		form.Value,
		'socks5',
		_('SOCKS5 Proxy'),
		_('Optional SOCKS5 route for Telegram DC connections. Leave empty for direct routing.')
	);
	o.datatype = 'string';
	o.rmempty = true;

	s = m.section(form.TypedSection, 'metrics', _('Metrics'));
	s.anonymous = true;
	s.addremove = false;
	o = s.option(form.Value, 'bind_to', _('Metrics Address'));
	o.datatype = 'string';
	o.default = '127.0.0.1:9090';
	o.description = _('Keep metrics on a literal loopback address.');
	o = s.option(form.Value, 'path', _('Metrics Path'));
	o.datatype = 'string';
	o.default = '/metrics';
	o = s.option(form.Flag, 'diagnostics', _('Enable Diagnostics'));
	o.description = _('Private runtime diagnostics require a literal loopback metrics address.');
	o.default = '0';

	return m.render();
}

return view.extend({
	load: function () {
		return uci.load('telego');
	},

	render: function () {
		return Promise.all([
			makeConfigMap(),
			L.resolveDefault(callTelegoStatus(), null)
		]).then(function (data) {
			const configNode = data[0];
			const statusNode = buildStatusView();

			L.Poll.add(function () {
				return L.resolveDefault(callTelegoStatus(), null).then(function (status) {
					if (status)
						updateStatus(status);
					else
						updateStatusError(_('Unable to read telEgo status.'));
				});
			}, 5);

			const configPane = E('section', {
				'id': 'telego-config-pane'
			}, configNode);

			const statusPane = E('section', {
				'id': 'telego-status-pane',
				'style': 'display:none'
			}, statusNode);

			const configTab = E('button', {
				'type': 'button',
				'class': 'btn cbi-button active',
				'click': function () {
					configPane.style.display = '';
					statusPane.style.display = 'none';
					configTab.classList.add('active');
					statusTab.classList.remove('active');
				}
			}, _('Configuration'));

			const statusTab = E('button', {
				'type': 'button',
				'class': 'btn cbi-button',
				'click': function () {
					configPane.style.display = 'none';
					statusPane.style.display = '';
					statusTab.classList.add('active');
					configTab.classList.remove('active');
				}
			}, _('Status'));

			const root = E('div', { 'class': 'telego-view' }, [
				E('div', { 'class': 'telego-tabs' }, [
					configTab,
					statusTab
				]),
				configPane,
				statusPane
			]);

			if (data[1])
				updateStatus(data[1], root);
			else
				updateStatusError(_('Unable to read telEgo status.'), root);

			return root;
		});
	}
});
