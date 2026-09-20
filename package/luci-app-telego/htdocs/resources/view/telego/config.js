'use strict';

'require form';
'require rpc';
'require ui';
'require uci';
'require view';
'require view.telego.app-shell as appShell';

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

function buildDDSecret(baseSecret) {
	const normalized = String(baseSecret || '').trim().toLowerCase();
	if (!/^[0-9a-f]{32}$/.test(normalized))
		throw new Error(_('Base secret is invalid. Save a 32-hex secret first.'));

	return 'dd' + normalized;
}

function utf8Hex(value) {
	return Array.from(new TextEncoder().encode(String(value || '')))
		.map(function (byte) {
			return byte.toString(16).padStart(2, '0');
		})
		.join('');
}

function buildEESecret(baseSecret, maskHost) {
	const host = String(maskHost || '').trim();
	if (!host)
		throw new Error(_('Mask domain is required for EE / FakeTLS.'));

	return 'ee' + buildDDSecret(baseSecret).slice(2) + utf8Hex(host);
}

function listenPort(bindTo) {
	const match = String(bindTo || '').match(/:([0-9]+)$/);
	return match ? match[1] : '';
}

function normalizePublicServer(server) {
	server = String(server || '').trim();
	if (!server)
		throw new Error(_('Public server is required.'));
	if (/[\\/?#@\s]/.test(server))
		throw new Error(_('Enter a hostname or IP address only, without a URL, path or spaces.'));

	let candidate = server;
	let ipv6 = false;
	if (candidate.startsWith('[') || candidate.endsWith(']')) {
		if (!(candidate.startsWith('[') && candidate.endsWith(']')))
			throw new Error(_('Enter a valid hostname or IP address.'));
		candidate = candidate.slice(1, -1);
		ipv6 = true;
	}
	else if (candidate.includes(':')) {
		ipv6 = true;
	}

	try {
		const parsed = new URL(ipv6 ? 'http://[' + candidate + ']/' : 'http://' + candidate + '/');
		if (!parsed.hostname || parsed.username || parsed.password || parsed.port)
			throw new Error();
		if (ipv6) {
			const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
			if (!hostname.includes(':'))
				throw new Error();
			return hostname.toLowerCase();
		}
		return parsed.hostname.toLowerCase();
	}
	catch (e) {
		throw new Error(_('Enter a valid hostname or IP address.'));
	}
}

function buildTelegramProxyLink(server, port, secret) {
	server = normalizePublicServer(server);
	port = String(port || '').trim();

	if (!/^[0-9]+$/.test(port) || Number(port) < 1 || Number(port) > 65535)
		throw new Error(_('Enter a valid public port.'));

	return 'tg://proxy?server=' + encodeURIComponent(server) +
		'&port=' + encodeURIComponent(port) +
		'&secret=' + secret;
}

function copyText(value) {
	if (window.navigator && window.navigator.clipboard && window.navigator.clipboard.writeText)
		return window.navigator.clipboard.writeText(value);

	return new Promise(function (resolve, reject) {
		const textarea = document.createElement('textarea');
		textarea.value = value;
		textarea.setAttribute('readonly', 'readonly');
		textarea.style.position = 'fixed';
		textarea.style.opacity = '0';
		document.body.appendChild(textarea);
		textarea.select();

		let copied = false;
		try {
			copied = document.execCommand('copy');
		}
		catch (e) {}

		document.body.removeChild(textarea);
		if (copied)
			resolve();
		else
			reject(new Error('clipboard unavailable'));
	});
}

function proxyOutputField(label, id) {
	const input = E('input', {
		'id': id,
		'type': 'text',
		'class': 'cbi-input-text',
		'readonly': 'readonly',
		'spellcheck': 'false',
		'style': 'width:100%;font-family:monospace'
	});
	const button = E('button', {
		'type': 'button',
		'class': 'btn cbi-button cbi-button-action',
		'click': function () {
			if (!input.value)
				return;

			return copyText(input.value).then(function () {
				ui.addNotification(null, E('p', {}, _('Copied to clipboard.')), 'info');
			}, function () {
				ui.addNotification(
					null,
					E('p', {}, _('Unable to copy automatically. Select the field and copy it manually.')),
					'warning'
				);
			});
		}
	}, _('Copy'));

	return {
		input: input,
		button: button,
		node: E('div', { 'style': 'margin:0 0 1rem' }, [
			E('label', { 'style': 'display:block;font-weight:600;margin-bottom:.35rem' }, label),
			E('div', { 'style': 'display:flex;gap:.5rem;align-items:center' }, [input, button])
		])
	};
}

function showProxyLinks(sectionId) {
	const username = uci.get('telego', sectionId, 'name') || sectionId;
	const baseSecret = uci.get('telego', sectionId, 'secret') || '';
	const tlsFrontingEnabled = uci.get('telego', 'tls_fronting', 'enabled') !== '0';
	const maskHost = uci.get('telego', 'tls_fronting', 'mask_host') || '';
	const bindTo = uci.get('telego', 'general', 'bind_to') || '';
	const publicHost = uci.get('telego', 'general', 'public_host') || '';
	const publicPort = uci.get('telego', 'general', 'public_port') || listenPort(bindTo);

	const serverInput = E('input', {
		'id': 'telego-proxy-public-server',
		'type': 'text',
		'class': 'cbi-input-text',
		'value': publicHost,
		'placeholder': 'proxy.example.com',
		'style': 'width:100%'
	});
	const portInput = E('input', {
		'id': 'telego-proxy-public-port',
		'type': 'number',
		'class': 'cbi-input-text',
		'value': publicPort,
		'min': '1',
		'max': '65535',
		'style': 'width:100%'
	});

	const endpointError = E('div', {
		'id': 'telego-proxy-endpoint-error',
		'class': 'alert-message warning',
		'hidden': true,
		'role': 'alert'
	});
	const ddError = E('div', {
		'id': 'telego-proxy-dd-error',
		'class': 'alert-message warning',
		'hidden': true,
		'role': 'alert'
	});
	const eeError = E('div', {
		'id': 'telego-proxy-ee-error',
		'class': 'alert-message warning',
		'hidden': true,
		'role': 'alert'
	});

	const ddSecret = proxyOutputField(_('Derived Secret'), 'telego-proxy-dd-secret');
	const ddLink = proxyOutputField(_('Telegram Link'), 'telego-proxy-dd-link');
	const eeSecret = proxyOutputField(_('Derived Secret'), 'telego-proxy-ee-secret');
	const eeLink = proxyOutputField(_('Telegram Link'), 'telego-proxy-ee-link');

	const ddPanel = E('div', { 'id': 'telego-proxy-panel-dd' }, [
		E('p', {}, _('Raw Obfuscated2. The generated secret is dd + the saved 32-hex base secret.')),
		ddError,
		ddSecret.node,
		ddLink.node
	]);
	const eePanel = E('div', { 'id': 'telego-proxy-panel-ee', 'hidden': true }, [
		E('p', {}, _('FakeTLS + Obfuscated2. The EE secret uses the saved TLS Fronting mask domain.')),
		E('p', {}, [
			E('strong', {}, _('Mask Domain') + ': '),
			E('span', { 'id': 'telego-proxy-ee-mask-host' }, [maskHost || _('—')])
		]),
		eeError,
		eeSecret.node,
		eeLink.node
	]);

	let ddTab;
	let eeTab;
	function selectTab(mode) {
		const dd = mode === 'dd';
		ddPanel.hidden = !dd;
		eePanel.hidden = dd;
		if (dd) {
			ddTab.classList.add('active');
			eeTab.classList.remove('active');
		} else {
			eeTab.classList.add('active');
			ddTab.classList.remove('active');
		}
	}

	ddTab = E('button', {
		'id': 'telego-proxy-tab-dd',
		'type': 'button',
		'class': 'btn cbi-button active',
		'click': function () { selectTab('dd'); }
	}, _('DD / Raw'));
	eeTab = E('button', {
		'id': 'telego-proxy-tab-ee',
		'type': 'button',
		'class': 'btn cbi-button',
		'disabled': tlsFrontingEnabled ? null : 'disabled',
		'title': tlsFrontingEnabled ? '' : _('Enable TLS Fronting to generate EE / FakeTLS links.'),
		'click': function () {
			if (tlsFrontingEnabled)
				selectTab('ee');
		}
	}, _('EE / FakeTLS'));

	function setError(node, error) {
		node.textContent = error ? String(error.message || error) : '';
		node.hidden = !error;
	}

	function refresh() {
		const server = serverInput.value;
		const port = portInput.value;
		let endpointFailure = null;
		try {
			buildTelegramProxyLink(server, port, 'test');
		}
		catch (e) {
			endpointFailure = e;
		}
		setError(endpointError, endpointFailure);

		try {
			const secret = buildDDSecret(baseSecret);
			ddSecret.input.value = secret;
			ddLink.input.value = endpointFailure ? '' : buildTelegramProxyLink(server, port, secret);
			ddSecret.button.disabled = false;
			ddLink.button.disabled = !!endpointFailure;
			setError(ddError, null);
		}
		catch (e) {
			ddSecret.input.value = '';
			ddLink.input.value = '';
			ddSecret.button.disabled = true;
			ddLink.button.disabled = true;
			setError(ddError, e);
		}

		if (!tlsFrontingEnabled) {
			eeSecret.input.value = '';
			eeLink.input.value = '';
			eeSecret.button.disabled = true;
			eeLink.button.disabled = true;
			setError(eeError, new Error(_('TLS Fronting is disabled. EE / FakeTLS links are unavailable.')));
			return;
		}
		try {
			const secret = buildEESecret(baseSecret, maskHost);
			eeSecret.input.value = secret;
			eeLink.input.value = endpointFailure ? '' : buildTelegramProxyLink(server, port, secret);
			eeSecret.button.disabled = false;
			eeLink.button.disabled = !!endpointFailure;
			setError(eeError, null);
		}
		catch (e) {
			eeSecret.input.value = '';
			eeLink.input.value = '';
			eeSecret.button.disabled = true;
			eeLink.button.disabled = true;
			setError(eeError, e);
		}
	}

	serverInput.addEventListener('input', refresh);
	portInput.addEventListener('input', refresh);

	ui.showModal([_('Connection Links') + ' — ' + username], [
		E('p', {}, _('Links are generated locally in your browser. This dialog does not change telEgo runtime settings.')),
		E('div', { 'style': 'display:grid;grid-template-columns:minmax(0,1fr) minmax(8rem,.35fr);gap:.75rem;margin-bottom:1rem' }, [
			E('label', {}, [
				E('span', { 'style': 'display:block;font-weight:600;margin-bottom:.35rem' }, _('Public Server')),
				serverInput
			]),
			E('label', {}, [
				E('span', { 'style': 'display:block;font-weight:600;margin-bottom:.35rem' }, _('Public Port')),
				portInput
			])
		]),
		endpointError,
		E('div', { 'class': 'telego-tabs', 'style': 'margin:1rem 0' }, [ddTab, eeTab]),
		ddPanel,
		eePanel,
		E('div', { 'class': 'right' }, [
			E('button', {
				'type': 'button',
				'class': 'btn cbi-button',
				'click': ui.hideModal
			}, _('Close'))
		])
	]);

	refresh();
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

function statusGroup(title, cards, key) {
	const attrs = { 'class': 'telego-status-section' };
	if (key) {
		attrs.id = 'telego-status-group-' + key;
		attrs.hidden = true;
	}

	return E('div', attrs, [
		E('h3', {}, title),
		E('div', { 'class': 'telego-status-grid' }, cards)
	]);
}

function setStatusGroupVisible(root, key, visible) {
	const node = root.querySelector('#telego-status-group-' + key);
	if (node)
		node.hidden = !visible;
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
	], 'web');

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
	], 'middleend');

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
	setStatusGroupVisible(root, 'web', !!(status && status.web_enabled));
	setStatusGroupVisible(root, 'middleend', !!(status && status.middleend_enabled));

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
		'web-sessions': metricsVisible && status.web_enabled ? status.web_sessions_active : _('—'),
		'web-streams': metricsVisible && status.web_enabled ? status.web_streams_active : _('—'),
		'web-websockets': metricsVisible && status.web_enabled ? status.web_websockets_active : _('—'),
		'web-dials': metricsVisible && status.web_enabled ? status.web_backend_dials_active : _('—'),
		'web-pending-bytes': metricsVisible && status.web_enabled ? formatBytes(status.web_pending_bytes) : _('—'),
		'web-pending-items': metricsVisible && status.web_enabled ? status.web_pending_items : _('—'),
		'web-created': metricsVisible && status.web_enabled ? status.web_sessions_created_total : _('—'),
		'web-closed': metricsVisible && status.web_enabled ? status.web_sessions_closed_total : _('—'),
		'web-retries': metricsVisible && status.web_enabled ? status.web_carrier_retries_total : _('—'),
		'web-backpressure': metricsVisible && status.web_enabled ? status.web_backpressure_total : _('—'),

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
	root = root || document;
	updateStatus(null, root);

	const state = root.querySelector('#telego-status-state');
	if (state)
		state.textContent = _('Unavailable');

	const node = root.querySelector('#telego-status-error');
	if (node)
		node.textContent = errorText || _('Unable to read telEgo status.');
}

function makeConfigMap() {
	const sharedWeb = uci.get('nginx_telego', 'shared', 'enabled') === '1';
	const m = new form.Map(
		'telego',
		_('telEgo Configuration'),
		_('Configure the core telEgo services. Rare transport and runtime controls are available on the Advanced Settings page.')
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

	o = s.option(
		form.Value,
		'public_host',
		_('Public Host'),
		_('Hostname or IP used only when generating MTProxy client links. It does not change the listener address.')
	);
	o.datatype = 'host';
	o.rmempty = true;

	o = s.option(
		form.Value,
		'public_port',
		_('Public Port'),
		_('Optional port used only in generated links. Leave empty to reuse the port from Listen Address.')
	);
	o.datatype = 'port';
	o.rmempty = true;
	o.default = '';

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
		form.Flag,
		'enabled',
		_('Enable TLS Fronting'),
		_('Enables EE / FakeTLS, certificate fingerprinting and TLS splice handling. DD / Raw continues to work when this is disabled.')
	);
	o.default = '1';
	o.validate = function (section_id, value) {
		return sharedWeb && String(value) !== '1'
			? _('TLS Fronting is required while Native Shared-Port is enabled. Disable Native Shared-Port first.')
			: true;
	};

	o = s.option(
		form.Value,
		'mask_host',
		_('Mask Domain'),
		_('Hostname used for FakeTLS SNI validation and certificate fetching.')
	);
	o.datatype = 'hostname';
	o.default = 'www.google.com';
	o.rmempty = false;
	o.depends('enabled', '1');
	o.retain = true;

	o = s.option(form.Value, 'mask_port', _('Mask Port'));
	o.datatype = 'port';
	o.default = '443';
	o.depends('enabled', '1');
	o.retain = true;

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
	o.modalonly = true;
	o.password = true;
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
		input.type = 'password';

		const reveal = E('button', {
			'id': 'telego-secret-reveal-' + section_id,
			'type': 'button',
			'class': 'btn cbi-button',
			'title': _('Show secret'),
			'aria-label': _('Show secret'),
			'click': function () {
				const hidden = input.type === 'password';
				input.type = hidden ? 'text' : 'password';
				this.textContent = hidden ? _('Hide') : _('Show');
				this.title = hidden ? _('Hide secret') : _('Show secret');
				this.setAttribute('aria-label', this.title);
			}
		}, _('Show'));

		const copy = E('button', {
			'type': 'button',
			'class': 'btn cbi-button',
			'title': _('Copy secret'),
			'aria-label': _('Copy secret'),
			'click': function () {
				if (!input.value)
					return;
				return copyText(input.value).then(function () {
					ui.addNotification(null, E('p', {}, _('Copied to clipboard.')), 'info');
				}, function () {
					ui.addNotification(null, E('p', {}, _('Unable to copy automatically. Select the field and copy it manually.')), 'warning');
				});
			}
		}, _('Copy'));

		const generate = E('button', {
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
			reveal,
			copy,
			generate
		]);
	};

	o = s.option(form.Button, '_links', _('Links'));
	o.inputtitle = _('Links');
	o.inputstyle = 'apply';
	o.editable = true;
	o.onclick = function (ev, section_id) {
		showProxyLinks(section_id);
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
	o.validate = function (section_id, value) {
		const chunk = Number(uci.get('telego', 'performance', 'dd_downlink_chunk') || '0');
		const delay = uci.get('telego', 'performance', 'dd_downlink_delay') || '0s';
		return String(value) === '1' && (chunk > 0 || delay !== '0s')
			? _('Disable DD Downlink Shaping before enabling Middle-End.')
			: true;
	};

	o = s.option(form.Value, 'proxy_tag', _('Proxy Tag'));
	o.depends('enabled', '1');
	o.retain = true;
	o.datatype = 'string';
	o.rmempty = true;
	o.description = _('Optional registered Telegram proxy tag: exactly 32 hexadecimal characters.');
	o.validate = function (section_id, value) {
		return !value || /^[0-9a-fA-F]{32}$/.test(value)
			? true
			: _('Proxy Tag must be empty or contain exactly 32 hexadecimal characters.');
	};

	return m.render();
}

return view.extend({
	load: function () {
		return Promise.all([
			uci.load('telego'),
			L.resolveDefault(uci.load('nginx_telego'), null)
		]);
	},

	render: function () {
		return Promise.all([
			makeConfigMap(),
			L.resolveDefault(callTelegoStatus(), null)
		]).then(function (data) {
			const configNode = data[0];
			const statusNode = buildStatusView();

			const configPane = E('section', {
				'id': 'telego-config-pane'
			}, configNode);

			const statusPane = E('section', {
				'id': 'telego-status-pane'
			}, statusNode);

			const initialSection =
				window.location && window.location.hash === '#mtproxy'
					? 'mtproxy'
					: 'overview';
			let root;

			function selectSection(section, updateUrl) {
				const mtproxy = section === 'mtproxy';
				configPane.style.display = mtproxy ? '' : 'none';
				statusPane.style.display = mtproxy ? 'none' : '';

				if (updateUrl && window.history && window.history.replaceState)
					window.history.replaceState(null, '', mtproxy ? '#mtproxy' : '#overview');

				if (root)
					appShell.activate(root, section);
			}

			root = appShell.wrap(initialSection, [statusPane, configPane], {
				onSelect: function (section) {
					selectSection(section, true);
				}
			});
			selectSection(initialSection, false);

			L.Poll.add(function () {
				return L.resolveDefault(callTelegoStatus(), null).then(function (status) {
					if (status)
						updateStatus(status, root);
					else
						updateStatusError(_('Unable to read telEgo status.'), root);
				});
			}, 5);

			if (data[1])
				updateStatus(data[1], root);
			else
				updateStatusError(_('Unable to read telEgo status.'), root);

			return root;
		});
	}
});
