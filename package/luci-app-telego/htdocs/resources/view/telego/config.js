'use strict';

'require form';
'require rpc';
'require ui';
'require uci';
'require uqr';
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

function proxyOutputField(label, id, copyLabel) {
	const input = E('input', {
		'id': id,
		'type': 'text',
		'class': 'cbi-input-text telego-connection-output-input',
		'readonly': 'readonly',
		'spellcheck': 'false'
	});
	const button = E('button', {
		'id': id + '-copy',
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
	}, copyLabel || _('Copy'));

	return {
		input: input,
		button: button,
		node: E('div', { 'class': 'telego-connection-output' }, [
			E('label', { 'for': id }, label),
			E('div', { 'class': 'telego-connection-output-row' }, [input, button])
		])
	};
}

function proxySummaryRow(label, id, value) {
	return [
		E('dt', {}, label),
		E('dd', { 'id': id }, value || _('—'))
	];
}

function proxyOpenLink(id) {
	return E('a', {
		'id': id,
		'class': 'btn cbi-button cbi-button-positive telego-connection-open disabled',
		'href': '#',
		'aria-disabled': 'true',
		'click': function (event) {
			if (this.getAttribute('aria-disabled') === 'true' && event && event.preventDefault)
				event.preventDefault();
		}
	}, _('Open Telegram'));
}

function setProxyOpenLink(node, value) {
	if (value) {
		node.setAttribute('href', value);
		node.setAttribute('aria-disabled', 'false');
		node.classList.remove('disabled');
	}
	else {
		node.setAttribute('href', '#');
		node.setAttribute('aria-disabled', 'true');
		node.classList.add('disabled');
	}
}

function renderProxyQr(node, link) {
	node.innerHTML = '';
	node.textContent = '';

	if (!link) {
		node.setAttribute('data-state', 'empty');
		node.textContent = _('Enter a valid public server and port to generate the QR code.');
		return;
	}

	try {
		node.innerHTML = uqr.renderSVG(link, {
			pixelSize: 4,
			margin: 2,
			ecLevel: 'M',
			whiteColor: 'white',
			blackColor: 'black'
		});
		node.setAttribute('data-state', 'ready');
	}
	catch (e) {
		node.setAttribute('data-state', 'error');
		node.textContent = _('QR code could not be generated.');
	}
}

function proxyQrCard(id) {
	const qr = E('div', {
		'id': id,
		'class': 'telego-connection-qr',
		'role': 'img',
		'aria-label': _('QR code for Telegram link'),
		'data-state': 'empty'
	}, _('Enter a valid public server and port to generate the QR code.'));

	return {
		qr: qr,
		node: E('aside', { 'class': 'telego-connection-qr-card' }, [
			qr,
			E('p', { 'class': 'telego-connection-qr-caption' },
				_('The QR code contains the complete Telegram link shown here.'))
		])
	};
}

function displayProxyEndpoint(server, port) {
	try {
		const normalized = normalizePublicServer(server);
		const value = String(port || '').trim();
		if (!/^[0-9]+$/.test(value) || Number(value) < 1 || Number(value) > 65535)
			return _('—');
		return normalized.includes(':') ? '[' + normalized + ']:' + value : normalized + ':' + value;
	}
	catch (e) {
		return _('—');
	}
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
		'autocomplete': 'off',
		'spellcheck': 'false'
	});
	const portInput = E('input', {
		'id': 'telego-proxy-public-port',
		'type': 'number',
		'class': 'cbi-input-text',
		'value': publicPort,
		'min': '1',
		'max': '65535',
		'inputmode': 'numeric'
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

	const ddSecret = proxyOutputField(_('Derived Secret'), 'telego-proxy-dd-secret', _('Copy secret'));
	const ddLink = proxyOutputField(_('Telegram Link'), 'telego-proxy-dd-link', _('Copy link'));
	const eeSecret = proxyOutputField(_('Derived Secret'), 'telego-proxy-ee-secret', _('Copy secret'));
	const eeLink = proxyOutputField(_('Telegram Link'), 'telego-proxy-ee-link', _('Copy link'));
	const ddOpen = proxyOpenLink('telego-proxy-dd-open');
	const eeOpen = proxyOpenLink('telego-proxy-ee-open');
	const ddQr = proxyQrCard('telego-proxy-dd-qr');
	const eeQr = proxyQrCard('telego-proxy-ee-qr');

	const ddSummary = [];
	ddSummary.push.apply(ddSummary, proxySummaryRow(_('Username'), 'telego-proxy-dd-user', username));
	ddSummary.push.apply(ddSummary, proxySummaryRow(_('Connection mode'), 'telego-proxy-dd-mode', _('DD / Raw')));
	ddSummary.push.apply(ddSummary, proxySummaryRow(_('Server endpoint'), 'telego-proxy-dd-endpoint', _('—')));

	const eeSummary = [];
	eeSummary.push.apply(eeSummary, proxySummaryRow(_('Username'), 'telego-proxy-ee-user', username));
	eeSummary.push.apply(eeSummary, proxySummaryRow(_('Connection mode'), 'telego-proxy-ee-mode', _('EE / FakeTLS')));
	eeSummary.push.apply(eeSummary, proxySummaryRow(_('Server endpoint'), 'telego-proxy-ee-endpoint', _('—')));
	eeSummary.push.apply(eeSummary, proxySummaryRow(_('Mask Domain'), 'telego-proxy-ee-mask-host', maskHost || _('—')));

	const ddPanel = E('section', {
		'id': 'telego-proxy-panel-dd',
		'class': 'telego-connection-panel',
		'role': 'tabpanel',
		'aria-labelledby': 'telego-proxy-tab-dd'
	}, [
		E('div', { 'class': 'telego-connection-layout' }, [
			E('div', { 'class': 'telego-connection-details' }, [
				E('p', {}, _('Raw Obfuscated2. The generated secret is dd + the saved 32-hex base secret.')),
				E('dl', { 'class': 'telego-connection-summary' }, ddSummary),
				ddError,
				ddSecret.node,
				ddLink.node,
				E('div', { 'class': 'telego-connection-actions' }, [ddOpen])
			]),
			ddQr.node
		])
	]);

	const eePanel = E('section', {
		'id': 'telego-proxy-panel-ee',
		'class': 'telego-connection-panel',
		'role': 'tabpanel',
		'aria-labelledby': 'telego-proxy-tab-ee',
		'hidden': true
	}, [
		E('div', { 'class': 'telego-connection-layout' }, [
			E('div', { 'class': 'telego-connection-details' }, [
				E('p', {}, _('FakeTLS + Obfuscated2. The EE secret uses the saved TLS Fronting mask domain.')),
				E('dl', { 'class': 'telego-connection-summary' }, eeSummary),
				eeError,
				eeSecret.node,
				eeLink.node,
				E('div', { 'class': 'telego-connection-actions' }, [eeOpen])
			]),
			eeQr.node
		])
	]);

	let ddTab;
	let eeTab;
	function selectTab(mode) {
		const dd = mode === 'dd';
		ddPanel.hidden = !dd;
		eePanel.hidden = dd;
		ddTab.setAttribute('aria-selected', dd ? 'true' : 'false');
		eeTab.setAttribute('aria-selected', dd ? 'false' : 'true');
		if (dd) {
			ddTab.classList.add('active');
			eeTab.classList.remove('active');
		}
		else {
			eeTab.classList.add('active');
			ddTab.classList.remove('active');
		}
	}

	ddTab = E('button', {
		'id': 'telego-proxy-tab-dd',
		'type': 'button',
		'class': 'telego-connection-mode-tab active',
		'role': 'tab',
		'aria-selected': 'true',
		'aria-controls': 'telego-proxy-panel-dd',
		'click': function () { selectTab('dd'); }
	}, _('DD / Raw'));
	eeTab = E('button', {
		'id': 'telego-proxy-tab-ee',
		'type': 'button',
		'class': 'telego-connection-mode-tab',
		'role': 'tab',
		'aria-selected': 'false',
		'aria-controls': 'telego-proxy-panel-ee',
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
		const endpoint = displayProxyEndpoint(server, port);
		let endpointFailure = null;

		try {
			buildTelegramProxyLink(server, port, 'test');
		}
		catch (e) {
			endpointFailure = e;
		}
		setError(endpointError, endpointFailure);

		const ddEndpointNode = ddPanel.querySelector('#telego-proxy-dd-endpoint');
		const eeEndpointNode = eePanel.querySelector('#telego-proxy-ee-endpoint');
		if (ddEndpointNode)
			ddEndpointNode.textContent = endpoint;
		if (eeEndpointNode)
			eeEndpointNode.textContent = endpoint;

		try {
			const secret = buildDDSecret(baseSecret);
			const link = endpointFailure ? '' : buildTelegramProxyLink(server, port, secret);
			ddSecret.input.value = secret;
			ddLink.input.value = link;
			ddSecret.button.disabled = false;
			ddLink.button.disabled = !link;
			setProxyOpenLink(ddOpen, link);
			renderProxyQr(ddQr.qr, link);
			setError(ddError, null);
		}
		catch (e) {
			ddSecret.input.value = '';
			ddLink.input.value = '';
			ddSecret.button.disabled = true;
			ddLink.button.disabled = true;
			setProxyOpenLink(ddOpen, '');
			renderProxyQr(ddQr.qr, '');
			setError(ddError, e);
		}

		if (!tlsFrontingEnabled) {
			eeSecret.input.value = '';
			eeLink.input.value = '';
			eeSecret.button.disabled = true;
			eeLink.button.disabled = true;
			setProxyOpenLink(eeOpen, '');
			renderProxyQr(eeQr.qr, '');
			setError(eeError, new Error(_('TLS Fronting is disabled. EE / FakeTLS links are unavailable.')));
			return;
		}

		try {
			const secret = buildEESecret(baseSecret, maskHost);
			const link = endpointFailure ? '' : buildTelegramProxyLink(server, port, secret);
			eeSecret.input.value = secret;
			eeLink.input.value = link;
			eeSecret.button.disabled = false;
			eeLink.button.disabled = !link;
			setProxyOpenLink(eeOpen, link);
			renderProxyQr(eeQr.qr, link);
			setError(eeError, null);
		}
		catch (e) {
			eeSecret.input.value = '';
			eeLink.input.value = '';
			eeSecret.button.disabled = true;
			eeLink.button.disabled = true;
			setProxyOpenLink(eeOpen, '');
			renderProxyQr(eeQr.qr, '');
			setError(eeError, e);
		}
	}

	serverInput.addEventListener('input', refresh);
	portInput.addEventListener('input', refresh);

	ui.showModal([_('Connection Links') + ' — ' + username], [
		E('div', { 'class': 'telego-connection-modal' }, [
			E('p', {}, _('Links are generated locally in your browser. This dialog does not change telEgo runtime settings.')),
			E('div', {
				'id': 'telego-proxy-session-note',
				'class': 'alert-message notice'
			}, _('Public Server and Public Port are loaded from saved settings. Changes here apply only to this connection dialog and are not saved.')),
			E('div', { 'class': 'telego-connection-endpoint-grid' }, [
				E('label', {}, [
					E('span', {}, _('Public Server')),
					serverInput
				]),
				E('label', {}, [
					E('span', {}, _('Public Port')),
					portInput
				])
			]),
			endpointError,
			E('div', {
				'class': 'telego-connection-mode-tabs',
				'role': 'tablist',
				'aria-label': _('Connection mode')
			}, [ddTab, eeTab]),
			ddPanel,
			eePanel,
			E('div', { 'class': 'telego-connection-footer' }, [
				E('button', {
					'type': 'button',
					'class': 'btn cbi-button',
					'click': ui.hideModal
				}, _('Close'))
			])
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
	const externalTlsWeb =
		!sharedWeb &&
		(
			uci.get('nginx_telego', 'cloudflare', 'enabled') === '1' ||
			uci.get('nginx_telego', 'direct_https', 'enabled') === '1'
		);
	const m = new form.Map(
		'telego',
		_('telEgo Configuration'),
		_('Configure each telEgo service in context. Rare controls are kept in the Advanced tab of the service they affect.')
	);

	let s = m.section(form.TypedSection, 'general', _('MTProxy'));
	s.anonymous = true;
	s.addremove = false;
	s.tab('basic', _('Basic'));
	s.tab('advanced', _('Advanced'));

	let o = s.taboption('basic', form.Flag, 'enabled', _('Enable MTProxy'));
	o.default = '0';

	o = s.taboption(
		'basic',
		form.Value,
		'bind_to',
		_('Listen Address'),
		_('Public TCP address where telEgo accepts MTProxy connections.')
	);
	o.datatype = 'string';
	o.default = '0.0.0.0:443';

	o = s.taboption(
		'basic',
		form.Value,
		'public_host',
		_('Public Host'),
		_('Hostname or IP used only when generating MTProxy client links. It does not change the listener address.')
	);
	o.datatype = 'host';
	o.rmempty = true;

	o = s.taboption(
		'basic',
		form.Value,
		'public_port',
		_('Public Port'),
		_('Optional port used only in generated links. Leave empty to reuse the port from Listen Address.')
	);
	o.datatype = 'port';
	o.rmempty = true;
	o.default = '';

	o = s.taboption('basic', form.ListValue, 'log_level', _('Log Level'));
	o.value('trace', _('Trace'));
	o.value('debug', _('Debug'));
	o.value('info', _('Info'));
	o.value('warn', _('Warning'));
	o.value('error', _('Error'));
	o.default = 'info';

	o = s.taboption(
		'advanced',
		form.Flag,
		'proxy_protocol',
		_('Accept Incoming PROXY Protocol'),
		_('Enable only when a trusted TCP proxy is directly in front of the public MTProxy listener.')
	);
	o.default = '0';

	o = s.taboption('advanced', form.Value, 'max_connections_per_ip', _('Max Connections per IP'));
	o.datatype = 'uinteger';
	o.default = '100';
	o.description = _('0 disables this connection-flood limit.');

	o = s.taboption('advanced', form.Value, 'max_ips_per_user', _('Max IPs per User'));
	o.datatype = 'uinteger';
	o.default = '10';
	o.description = _('0 disables per-secret IP limiting.');

	o = s.taboption('advanced', form.Value, 'ip_block_timeout', _('IP Block Timeout'));
	o.datatype = 'string';
	o.default = '5m';

	o = s.taboption('advanced', form.Value, 'handshake_timeout', _('Handshake Timeout'));
	o.datatype = 'string';
	o.default = '5s';

	o = s.taboption(
		'advanced',
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
	s.tab('basic', _('Basic'));
	s.tab('advanced', _('Advanced'));

	o = s.taboption(
		'basic',
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

	o = s.taboption(
		'basic',
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

	o = s.taboption('basic', form.Value, 'mask_port', _('Mask Port'));
	o.datatype = 'port';
	o.default = '443';
	o.depends('enabled', '1');
	o.retain = true;

	if (!externalTlsWeb) {
		o = s.taboption(
			'advanced',
			form.Value,
			'cert_host',
			_('Certificate Host'),
			_('Optional certificate source. Native shared-port Nginx on this router uses 127.0.0.1.')
		);
		o.datatype = 'host';
		o.rmempty = true;
		o.depends('enabled', '1');
		o.retain = true;

		o = s.taboption(
			'advanced',
			form.Value,
			'cert_port',
			_('Certificate Port'),
			_('Native shared-port Nginx uses port 8444 for certificate collection.')
		);
		o.datatype = 'port';
		o.rmempty = true;
		o.default = '';
		o.depends('enabled', '1');
		o.retain = true;
	}

	o = s.taboption('advanced', form.Value, 'fake_cert_size', _('Fake Certificate Size'));
	o.datatype = 'uinteger';
	o.default = '0';
	o.description = _('0 selects automatic matching; an explicit override must be from 256 to 16384 bytes.');
	o.depends('enabled', '1');
	o.retain = true;
	o.validate = function (section_id, value) {
		const number = Number(value);
		return value === '0' || (Number.isInteger(number) && number >= 256 && number <= 16384)
			? true
			: _('Use 0 for automatic mode or a value from 256 to 16384.');
	};

	o = s.taboption('advanced', form.DynamicList, 'mask_sni_safelist', _('Mask SNI Safelist'));
	o.datatype = 'hostname';
	o.depends('enabled', '1');
	o.retain = true;

	if (!externalTlsWeb) {
		o = s.taboption(
			'advanced',
			form.Value,
			'splice_host',
			_('Fallback Host'),
			_('Where unrecognized TLS is spliced. Native shared-port Nginx on this router uses 127.0.0.1.')
		);
		o.datatype = 'host';
		o.rmempty = true;
		o.depends('enabled', '1');
		o.retain = true;

		o = s.taboption(
			'advanced',
			form.Value,
			'splice_port',
			_('Fallback Port'),
			_('Native shared-port Nginx uses port 8443 and PROXY protocol v2.')
		);
		o.datatype = 'port';
		o.rmempty = true;
		o.default = '';
		o.depends('enabled', '1');
		o.retain = true;
	}

	o = s.taboption('advanced', form.ListValue, 'splice_proxy_protocol', _('Fallback PROXY Protocol'));
	o.value('0', _('Disabled'));
	o.value('1', _('PROXY Protocol v1'));
	o.value('2', _('PROXY Protocol v2'));
	o.default = '0';
	o.depends('enabled', '1');
	o.retain = true;

	o = s.taboption('advanced', form.Value, 'splice_idle_timeout', _('Fallback Idle Timeout'));
	o.datatype = 'string';
	o.default = '30s';
	o.depends('enabled', '1');
	o.retain = true;

	o = s.taboption('advanced', form.Flag, 'enable_drs', _('Enable DRS'));
	o.default = '1';
	o.depends('enabled', '1');
	o.retain = true;

	o = s.taboption('advanced', form.Flag, 'enable_split_tls', _('Enable Split TLS'));
	o.default = '1';
	o.depends('enabled', '1');
	o.retain = true;

	/* Dynamic users. */
	s = m.section(
		form.GridSection,
		'secret',
		_('Users'),
		_('Manage MTProxy users without exposing their secrets in the users table. Use Connect for client links and Edit to change credentials.')
	);
	s.anonymous = true;
	s.addremove = true;
	s.sortable = true;
	s.addbtntitle = _('Add user');
	s.actionstitle = _('Actions');
	s.modaltitle = function (section_id) {
		const username = String(uci.get('telego', section_id, 'name') || '').trim();
		return username
			? _('Edit user') + ' — ' + username
			: _('Add user');
	};
	s.renderSectionPlaceholder = function () {
		return E('div', { 'class': 'telego-users-empty' }, [
			E('strong', {}, _('No users configured.')),
			E('span', {}, _('Add a user to create MTProxy credentials and connection links.'))
		]);
	};
	s.confirmUserDelete = function (section_id, ev) {
		if (ev && ev.preventDefault)
			ev.preventDefault();

		const usersSection = this;
		const username = uci.get('telego', section_id, 'name') || section_id;
		ui.showModal([_('Delete user') + ' — ' + username], [
			E('p', {}, _('This user will be removed from the pending configuration. Use Save & Apply to apply the change.')),
			E('div', { 'class': 'right' }, [
				E('button', {
					'type': 'button',
					'class': 'btn cbi-button',
					'click': ui.hideModal
				}, _('Cancel')),
				' ',
				E('button', {
					'id': 'telego-user-delete-confirm',
					'type': 'button',
					'class': 'btn cbi-button cbi-button-negative important',
					'disabled': this.map.readonly || null,
					'click': function (deleteEvent) {
						ui.hideModal();
						return form.GridSection.prototype.handleRemove.call(usersSection, section_id, deleteEvent);
					}
				}, _('Delete user'))
			])
		]);
	};
	s.renderRowActions = function (section_id) {
		const td = this.super('renderRowActions', [section_id, _('Edit')]);
		const actions = td.lastElementChild;
		const edit = actions ? actions.querySelector('.cbi-button-edit') : null;
		const remove = actions ? actions.querySelector('.cbi-button-remove') : null;
		const drag = actions ? actions.querySelector('.drag-handle') : null;
		const connect = E('button', {
			'type': 'button',
			'class': 'btn cbi-button cbi-button-positive telego-user-connect',
			'title': _('Open connection links'),
			'click': function (event) {
				if (event && event.preventDefault)
					event.preventDefault();
				showProxyLinks(section_id);
			}
		}, _('Connect'));

		td.classList.add('telego-user-actions-cell');
		td.setAttribute('data-title', _('Actions'));

		if (drag)
			drag.classList.add('telego-user-reorder');

		if (edit) {
			edit.textContent = _('Edit');
			edit.setAttribute('title', _('Edit user'));
			edit.classList.add('telego-user-edit');
		}

		if (actions)
			actions.insertBefore(connect, edit || remove || null);

		if (remove && remove.parentNode) {
			const confirmDelete = E('button', {
				'type': 'button',
				'class': 'btn cbi-button cbi-button-negative telego-user-delete',
				'title': _('Delete user'),
				'disabled': this.map.readonly || null,
				'click': ui.createHandlerFn(this, 'confirmUserDelete', section_id)
			}, _('Delete'));
			remove.parentNode.replaceChild(confirmDelete, remove);
		}

		return td;
	};

	o = s.option(form.Value, 'name', _('Username'));
	o.datatype = 'uciname';
	o.rmempty = false;
	o.width = '38%';

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

	o = s.option(form.DummyValue, '_secret_status', _('Secret'));
	o.modalonly = false;
	o.width = '22%';
	o.textvalue = function (section_id) {
		const secret = String(uci.get('telego', section_id, 'secret') || '');
		let state;
		let label;

		if (!secret) {
			state = 'missing';
			label = _('Not configured');
		}
		else if (/^[0-9a-fA-F]{32}$/.test(secret)) {
			state = 'configured';
			label = _('Configured');
		}
		else {
			state = 'invalid';
			label = _('Invalid');
		}

		return E('span', {
			'class': 'telego-user-secret-status is-' + state,
			'data-state': state
		}, label);
	};

	/* WEB Proxy. */
	s = m.section(form.TypedSection, 'web_proxy', _('WEB Proxy'));
	s.anonymous = true;
	s.addremove = false;
	s.tab('basic', _('Basic'));
	s.tab('advanced', _('Advanced'));

	o = s.taboption('basic', form.Flag, 'enabled', _('Enable WEB Proxy'));
	o.default = '0';

	o = s.taboption(
		'basic',
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

	o = s.taboption(
		'basic',
		form.Value,
		'bind_to',
		_('Bind Address'),
		_('Private HTTP/1.1 listener. Keep this address inaccessible from the Internet.')
	);
	o.datatype = 'string';
	o.default = '127.0.0.1:8080';

	o = s.taboption(
		'basic',
		form.Value,
		'hostname',
		_('Hostname'),
		_('Hostname covered by the public TLS certificate or Cloudflare Published Application.')
	);
	o.depends('enabled', '1');
	o.retain = true;
	o.datatype = 'hostname';
	o.rmempty = false;

	o = s.taboption(
		'advanced',
		form.DynamicList,
		'trusted_proxy_cidrs',
		_('Trusted Proxy CIDRs'),
		_('Only these proxy addresses may supply forwarded client addresses.')
	);
	o.datatype = 'cidr';
	o.default = ['127.0.0.1/32'];
	o.depends('enabled', '1');
	o.retain = true;

	o = s.taboption(
		'advanced',
		form.Value,
		'backend',
		_('Compatibility Backend'),
		_('Optional local TCP or Unix backend. Leave empty to use the faster shared MTProxy core directly.')
	);
	o.datatype = 'string';
	o.rmempty = true;
	o.depends('enabled', '1');
	o.retain = true;

	o = s.taboption(
		'advanced',
		form.Value,
		'num_event_loops',
		_('WEB Event Loops'),
		_('0 selects the automatic gnet event-loop count.')
	);
	o.datatype = 'uinteger';
	o.default = '0';
	o.depends('enabled', '1');
	o.retain = true;

	/* Middle-End. */
	s = m.section(form.TypedSection, 'middle_end', _('Telegram Middle-End'));
	s.anonymous = true;
	s.addremove = false;
	s.tab('basic', _('Basic'));
	s.tab('advanced', _('Advanced'));

	o = s.taboption(
		'basic',
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

	o = s.taboption('basic', form.Value, 'proxy_tag', _('Proxy Tag'));
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

	o = s.taboption('advanced', form.Value, 'socks5', _('SOCKS5 Proxy'));
	o.datatype = 'string';
	o.rmempty = true;
	o.depends('enabled', '1');
	o.retain = true;

	o = s.taboption('advanced', form.Value, 'socks5_username', _('SOCKS5 Username'));
	o.datatype = 'string';
	o.rmempty = true;
	o.depends('enabled', '1');
	o.retain = true;

	o = s.taboption('advanced', form.Value, 'socks5_password', _('SOCKS5 Password'));
	o.password = true;
	o.datatype = 'string';
	o.rmempty = true;
	o.depends('enabled', '1');
	o.retain = true;

	o = s.taboption('advanced', form.Value, 'artifact_proxy', _('Artifact Proxy'));
	o.datatype = 'string';
	o.rmempty = true;
	o.depends('enabled', '1');
	o.retain = true;

	o = s.taboption('advanced', form.Value, 'nat_ip', _('STUN NAT IP'));
	o.datatype = 'ipaddr';
	o.rmempty = true;
	o.depends('enabled', '1');
	o.retain = true;

	o = s.taboption('advanced', form.Value, 'max_connections', _('Middle-End Max Connections'));
	o.datatype = 'uinteger';
	o.default = '0';
	o.description = _('0 uses the upstream default of 10000; an override may only reduce it.');
	o.depends('enabled', '1');
	o.retain = true;
	o.validate = function (section_id, value) {
		const number = Number(value);
		return value === '0' || (Number.isInteger(number) && number >= 1 && number <= 10000)
			? true
			: _('Use 0 or a value from 1 to 10000.');
	};

	o = s.taboption('advanced', form.Value, 'queue_budget_mb', _('Middle-End Queue Budget (MB)'));
	o.datatype = 'uinteger';
	o.default = '0';
	o.description = _('0 keeps upstream defaults: about 32 MiB request/input and 66 MiB shared response/output on 64-bit; 2 to 32 sets N MiB request/input and 2xN MiB shared response/output.');
	o.depends('enabled', '1');
	o.retain = true;
	o.validate = function (section_id, value) {
		const number = Number(value);
		return value === '0' || (Number.isInteger(number) && number >= 2 && number <= 32)
			? true
			: _('Use 0 or a value from 2 to 32.');
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
