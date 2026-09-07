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

function buildStatusView() {
	const state = E('div', {
		'class': 'telego-status-grid'
	}, [
		E('div', { 'class': 'telego-status-card' }, [
			E('div', { 'class': 'telego-status-label' }, _('Service State')),
			E('div', { 'class': 'telego-status-value', 'id': 'telego-status-state' }, _('Checking...'))
		]),
		E('div', { 'class': 'telego-status-card' }, [
			E('div', { 'class': 'telego-status-label' }, _('PID')),
			E('div', { 'class': 'telego-status-value', 'id': 'telego-status-pid' }, _('—'))
		]),
		E('div', { 'class': 'telego-status-card' }, [
			E('div', { 'class': 'telego-status-label' }, _('System Uptime')),
			E('div', { 'class': 'telego-status-value', 'id': 'telego-status-uptime' }, _('—'))
		]),
		E('div', { 'class': 'telego-status-card' }, [
			E('div', { 'class': 'telego-status-label' }, _('Active Connections')),
			E('div', { 'class': 'telego-status-value', 'id': 'telego-status-connections' }, _('—'))
		]),
		E('div', { 'class': 'telego-status-card' }, [
			E('div', { 'class': 'telego-status-label' }, _('Active IPs')),
			E('div', { 'class': 'telego-status-value', 'id': 'telego-status-ips' }, _('—'))
		]),
		E('div', { 'class': 'telego-status-card' }, [
			E('div', { 'class': 'telego-status-label' }, _('Blocked IPs')),
			E('div', { 'class': 'telego-status-value', 'id': 'telego-status-blocked' }, _('—'))
		]),
		E('div', { 'class': 'telego-status-card' }, [
			E('div', { 'class': 'telego-status-label' }, _('Traffic Received')),
			E('div', { 'class': 'telego-status-value', 'id': 'telego-status-rx' }, _('—'))
		]),
		E('div', { 'class': 'telego-status-card' }, [
			E('div', { 'class': 'telego-status-label' }, _('Traffic Sent')),
			E('div', { 'class': 'telego-status-value', 'id': 'telego-status-tx' }, _('—'))
		])
	]);

	const error = E('p', {
		'class': 'telego-status-error',
		'id': 'telego-status-error',
		'aria-live': 'polite'
	});

	return E('div', {}, [
		E('h2', {}, _('telEgo Status')),
		E('p', {}, _('Live service and traffic statistics from the local rpcd telemetry backend.')),
		state,
		error
	]);
}

function updateStatus(status, root) {
	root = root || document;
	const values = {
		state: serviceState(status),
		pid: status && status.pid ? status.pid : _('—'),
		uptime: status ? formatUptime(status.uptime) : _('—'),
		connections: status ? status.connections : _('—'),
		ips: status ? status.ips_active : _('—'),
		blocked: status ? status.ips_blocked : _('—'),
		rx: status ? formatBytes(status.rx_bytes) : _('—'),
		tx: status ? formatBytes(status.tx_bytes) : _('—')
	};

	Object.keys(values).forEach(function (key) {
		const node = root.querySelector('#telego-status-' + key);
		if (node)
			node.textContent = String(values[key]);
	});

	const error = root.querySelector('#telego-status-error');
	if (error)
		error.textContent = '';
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
		_('Configure MTProxy, TLS fronting, WEB Proxy and user secrets.')
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

	o = s.option(form.Value, 'cert_host', _('Certificate Host'));
	o.datatype = 'hostname';
	o.rmempty = true;

	o = s.option(form.Value, 'cert_port', _('Certificate Port'));
	o.datatype = 'port';
	o.rmempty = true;
	o.default = '';

	o = s.option(form.Value, 'splice_host', _('Fallback Host'));
	o.datatype = 'hostname';
	o.rmempty = true;

	o = s.option(form.Value, 'splice_port', _('Fallback Port'));
	o.datatype = 'port';
	o.rmempty = true;
	o.default = '';

	o = s.option(form.Value, 'fake_cert_size', _('Fake Certificate Size'));
	o.datatype = 'uinteger';
	o.default = '0';

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

	/*
	 * Dynamic users.
	 */
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

	/*
	 * WEB Proxy.
	 */
	s = m.section(form.TypedSection, 'web_proxy', _('WEB Proxy'));
	s.anonymous = true;
	s.addremove = false;

	o = s.option(form.Flag, 'enabled', _('Enable WEB Proxy'));
	o.default = '0';

	o = s.option(
		form.ListValue,
		'carrier',
		_('Carrier Mode'),
		_('Select the transport used by Telegram Desktop.')
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
		_('Hostname covered by the public TLS certificate.')
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
	o.datatype = 'cidr';
	o.default = ['127.0.0.1/32'];

	/*
	 * Middle-End.
	 */
	s = m.section(form.TypedSection, 'middle_end', _('Telegram Middle-End'));
	s.anonymous = true;
	s.addremove = false;

	o = s.option(form.Flag, 'enabled', _('Enable Middle-End'));
	o.default = '0';

	o = s.option(form.Value, 'proxy_tag', _('Proxy Tag'));
	o.datatype = 'string';

	o = s.option(form.Value, 'socks5', _('SOCKS5 Proxy'));
	o.datatype = 'string';
	o.rmempty = true;

	o = s.option(form.Value, 'socks5_username', _('SOCKS5 Username'));
	o.datatype = 'string';
	o.rmempty = true;

	o = s.option(form.Value, 'socks5_password', _('SOCKS5 Password'));
	o.password = true;
	o.datatype = 'string';
	o.rmempty = true;

	o = s.option(form.Value, 'artifact_proxy', _('Artifact Proxy'));
	o.datatype = 'string';
	o.rmempty = true;

	o = s.option(form.Value, 'nat_ip', _('STUN NAT IP'));
	o.datatype = 'ipaddr';
	o.rmempty = true;

	o = s.option(form.Value, 'max_connections', _('Middle-End Max Connections'));
	o.datatype = 'uinteger';
	o.default = '0';

	o = s.option(form.Value, 'queue_budget_mb', _('Middle-End Queue Budget (MB)'));
	o.datatype = 'uinteger';
	o.default = '0';

	/*
	 * Performance, upstream and metrics are kept available for advanced users.
	 */
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

	s = m.section(form.TypedSection, 'upstream', _('Upstream'));
	s.anonymous = true;
	s.addremove = false;
	o = s.option(form.Value, 'socks5', _('SOCKS5 Proxy'));
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

			// The view is not attached to document yet. Populate the first status
			// using its own root; later polling can use the mounted document.
			if (data[1])
				updateStatus(data[1], root);
			else
				updateStatusError(_('Unable to read telEgo status.'), root);

			return root;
		});
	}
});
