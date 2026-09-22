'use strict';

'require form';
'require rpc';
'require uci';
'require view';
'require view.telego.app-shell as appShell';
'require view.telego.ui-foundation as uiFoundation';

const callTelegoStatus = rpc.declare({
	object: 'telego',
	method: 'status',
	expect: { '': {} }
});

const callPlatformStatus = rpc.declare({
	object: 'telego.nginx',
	method: 'platform_status',
	expect: { '': {} }
});

const callFirewallStatus = rpc.declare({
	object: 'telego.nginx',
	method: 'firewall_status',
	expect: { '': {} }
});

const callCertificateStatus = rpc.declare({
	object: 'telego.nginx',
	method: 'certificate_status',
	expect: { '': {} }
});

const callNginxInventory = rpc.declare({
	object: 'telego.nginx',
	method: 'inventory',
	expect: { '': {} }
});

const callUiCapabilities = rpc.declare({
	object: 'telego.ui',
	method: 'capabilities',
	expect: { '': {} }
});

const callServiceStatus = rpc.declare({
	object: 'telego.admin',
	method: 'service_status',
	expect: { '': {} }
});

const callServiceAction = rpc.declare({
	object: 'telego.admin',
	method: 'service_action',
	params: ['action', 'request_id', 'expected_revision'],
	expect: { '': {} }
});

const callOperationStatus = rpc.declare({
	object: 'telego.admin',
	method: 'operation_status',
	params: ['operation_id'],
	expect: { '': {} }
});

const callSessionAccess = rpc.declare({
	object: 'session',
	method: 'access',
	params: ['scope', 'object', 'function'],
	expect: { 'access': false }
});


const maxDDDownlinkDelayUs = 1000000;

const PERFORMANCE_PROFILE_KEYS = [
	'num_event_loops',
	'prefer_ip',
	'idle_timeout',
	'max_write_buffer_mb',
	'dd_downlink_chunk',
	'dd_downlink_delay',
	'client_silence_close'
];

const PERFORMANCE_PROFILES = {
	'default': {
		num_event_loops: '0',
		prefer_ip: 'prefer-ipv4',
		idle_timeout: '5m',
		max_write_buffer_mb: '0',
		dd_downlink_chunk: '0',
		dd_downlink_delay: '0s',
		client_silence_close: '0s'
	},
	'mobile_dpi': {
		num_event_loops: '0',
		prefer_ip: 'prefer-ipv4',
		idle_timeout: '5m',
		max_write_buffer_mb: '0',
		dd_downlink_chunk: '1200',
		dd_downlink_delay: '2ms',
		client_silence_close: '0s'
	},
	'ios_recovery': {
		num_event_loops: '0',
		prefer_ip: 'prefer-ipv4',
		idle_timeout: '5m',
		max_write_buffer_mb: '0',
		dd_downlink_chunk: '0',
		dd_downlink_delay: '0s',
		client_silence_close: '10s'
	}
};

function performanceProfileLabel(profile) {
	switch (profile) {
	case 'default':
		return _('Default');
	case 'mobile_dpi':
		return _('Mobile DPI');
	case 'ios_recovery':
		return _('iOS Recovery');
	default:
		return _('Custom');
	}
}

function detectPerformanceProfile(values) {
	for (const name of ['default', 'mobile_dpi', 'ios_recovery']) {
		const profile = PERFORMANCE_PROFILES[name];
		let match = true;

		for (const key of PERFORMANCE_PROFILE_KEYS) {
			if (String(values[key] == null ? '' : values[key]) !== profile[key]) {
				match = false;
				break;
			}
		}

		if (match)
			return name;
	}

	return 'custom';
}

function readPerformanceUci() {
	const defaults = PERFORMANCE_PROFILES.default;
	const values = {};

	for (const key of PERFORMANCE_PROFILE_KEYS) {
		const value = uci.get('telego', 'performance', key);
		values[key] = value == null || value === '' ? defaults[key] : String(value);
	}

	return values;
}

function readPerformanceUi(section, sectionId) {
	const fallback = readPerformanceUci();
	const values = {};

	for (const key of PERFORMANCE_PROFILE_KEYS) {
		const widget = section.getUIElement(sectionId, key);
		const value = widget && widget.getValue ? widget.getValue() : fallback[key];
		values[key] = value == null || value === '' ? fallback[key] : String(value);
	}

	return values;
}

function applyPerformanceProfile(section, sectionId, profileName) {
	const profile = PERFORMANCE_PROFILES[profileName];
	if (!profile)
		return false;

	const widgets = {};
	for (const key of PERFORMANCE_PROFILE_KEYS) {
		const widget = section.getUIElement(sectionId, key);
		if (!widget || !widget.setValue)
			continue;

		widgets[key] = widget;
		widget.setValue(profile[key]);
	}

	/* Validate only after every field has its new profile value. This avoids
	 * transient cross-field errors when disabling DD shaping (chunk/delay). */
	for (const key of Object.keys(widgets))
		if (widgets[key].triggerValidation)
			widgets[key].triggerValidation();

	return true;
}

function parseDDDownlinkDelayUs(value) {
	value = String(value || '');
	if (value === '0s')
		return 0;

	const match = /^([1-9][0-9]*)(us|ms|s)$/.exec(value);
	if (!match)
		return null;

	const number = Number(match[1]);
	if (!Number.isSafeInteger(number))
		return null;

	const multiplier = match[2] === 'us' ? 1 : (match[2] === 'ms' ? 1000 : 1000000);
	const microseconds = number * multiplier;
	return Number.isSafeInteger(microseconds) && microseconds <= maxDDDownlinkDelayUs
		? microseconds
		: null;
}

function siblingFormValue(option, name, sectionId, fallback) {
	const sibling = L.toArray(option.map.lookupOption(name, sectionId))[0];
	if (!sibling)
		return fallback;

	const value = sibling.formvalue(sectionId);
	return value == null || value === '' ? fallback : value;
}

function formatBytes(value) {
	value = Number(value) || 0;

	if (value < 1024)
		return Math.round(value) + ' ' + _('B');

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
		return uci.get('telego', 'general', 'enabled') === '1' ? _('Stopped') : _('Disabled');
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

function ingressProfileLabel(profile) {
	switch (profile) {
	case 'shared':
		return _('Native Shared-Port');
	case 'cloudflare':
		return _('Cloudflare Tunnel');
	case 'direct_https':
		return _('Direct HTTPS');
	case 'disabled':
	case 'none':
		return _('Disabled');
	default:
		return profile || _('Unavailable');
	}
}

function firewallStateText(state) {
	if (!state || !state.ok)
		return _('Unavailable');
	if (state.section_state === 'owned')
		return state.managed_match ? _('Owned and in sync') : _('Owned but drifted');
	if (state.section_state === 'foreign')
		return _('Foreign reserved section');
	return _('Absent');
}

function diagnosticCard(label, key) {
	return E('div', { 'class': 'telego-diagnostic-card' }, [
		E('div', { 'class': 'telego-diagnostic-label' }, label),
		E('div', { 'class': 'telego-diagnostic-value', 'id': 'telego-diagnostic-' + key }, _('—'))
	]);
}

function diagnosticGroup(title, cards, key) {
	const attrs = { 'class': 'telego-diagnostic-section' };
	if (key) {
		attrs.id = 'telego-diagnostic-group-' + key;
		attrs.hidden = true;
	}

	return E('section', attrs, [
		E('h3', {}, title),
		E('div', { 'class': 'telego-diagnostic-grid' }, cards)
	]);
}

function diagnosticLink(label, href, css) {
	return E('a', {
		'class': 'btn cbi-button ' + (css || 'cbi-button-action'),
		'href': href
	}, label);
}

function setDiagnosticGroupVisible(root, key, visible) {
	const node = root.querySelector('#telego-diagnostic-group-' + key);
	if (node)
		node.hidden = !visible;
}

function lifecycleRequestId() {
	if (window.crypto && typeof(window.crypto.randomUUID) === 'function')
		return window.crypto.randomUUID();

	const bytes = new Uint8Array(16);
	window.crypto.getRandomValues(bytes);
	bytes[6] = (bytes[6] & 0x0f) | 0x40;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;
	const hex = Array.from(bytes, function (value) {
		return value.toString(16).padStart(2, '0');
	}).join('');
	return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' +
		hex.slice(16, 20) + '-' + hex.slice(20);
}

function lifecycleMessage(code) {
	switch (code) {
	case 'service-started':
		return _('telEgo started.');
	case 'service-restarted':
		return _('telEgo restarted.');
	case 'service-stopped':
		return _('telEgo stopped.');
	case 'autostart-enabled':
		return _('Autostart enabled.');
	case 'autostart-disabled':
		return _('Autostart disabled.');
	case 'config-disabled':
		return _('Enable telEgo in MTProxy configuration before starting or restarting the service.');
	case 'revision-conflict':
		return _('Service state changed before the action could run. Refresh the status and try again.');
	case 'busy':
		return _('Another telEgo lifecycle operation is already running.');
	case 'start-failed':
		return _('telEgo could not be started.');
	case 'restart-failed':
		return _('telEgo could not be restarted.');
	case 'stop-failed':
		return _('telEgo could not be stopped.');
	case 'enable-autostart-failed':
		return _('Autostart could not be enabled.');
	case 'disable-autostart-failed':
		return _('Autostart could not be disabled.');
	case 'action-failed':
	case 'operation-failed':
		return _('The lifecycle operation failed.');
	default:
		return '';
	}
}

function lifecycleActionLabel(action) {
	switch (action) {
	case 'start':
		return _('Start');
	case 'restart':
		return _('Restart');
	case 'stop':
		return _('Stop');
	case 'enable_autostart':
		return _('Enable Autostart');
	case 'disable_autostart':
		return _('Disable Autostart');
	default:
		return _('Service Action');
	}
}

function lifecycleConfirmation(action, runtimeStatus, pendingChanges) {
	const lines = [
		_('Target: telEgo'),
		_('Action:') + ' ' + lifecycleActionLabel(action)
	];

	if (action === 'restart')
		lines.push(_('Restarting telEgo interrupts active proxy sessions.'));
	else if (action === 'stop')
		lines.push(_('Stopping telEgo interrupts active proxy sessions and leaves the proxy unavailable.'));
	else if (action === 'start')
		lines.push(_('Starting telEgo uses the currently saved configuration.'));
	else
		lines.push(_('Autostart changes boot-time behavior only; it does not start or stop telEgo now.'));

	if (action === 'restart' || action === 'stop') {
		const sessions = runtimeStatus && runtimeStatus.metrics_available
			? String(Number(runtimeStatus.connections) || 0)
			: _('unknown');
		lines.push(_('Active sessions:') + ' ' + sessions);
	}

	if (pendingChanges > 0)
		lines.push(_('There are saved telEgo changes waiting for Apply. This lifecycle action will not apply them.'));

	lines.push(_('Unsaved form edits are not saved or applied by lifecycle actions.'));
	return lines.join('\n\n');
}

function buildLifecyclePanel(context) {
	const panel = E('section', {
		'id': 'telego-lifecycle-panel',
		'class': 'telego-lifecycle-panel'
	}, [
		E('div', { 'class': 'telego-lifecycle-heading' }, [
			E('div', {}, [
				E('h3', {}, _('Service Lifecycle')),
				E('p', {}, _('Service state, boot autostart and explicit lifecycle controls. Configuration Enabled is independent from the running process and autostart.'))
			])
		]),
		E('dl', { 'class': 'telego-lifecycle-summary' }, [
			E('dt', {}, _('Process')),
			E('dd', { 'id': 'telego-lifecycle-running' }, _('Unavailable')),
			E('dt', {}, _('Autostart')),
			E('dd', { 'id': 'telego-lifecycle-autostart' }, _('Unavailable')),
			E('dt', {}, _('Configuration Enabled')),
			E('dd', { 'id': 'telego-lifecycle-config-enabled' }, _('Unavailable'))
		]),
		E('div', { 'class': 'telego-lifecycle-actions' }, [
			E('button', {
				'id': 'telego-lifecycle-start',
				'type': 'button',
				'class': 'btn cbi-button cbi-button-positive',
				'click': function () { return runLifecycleAction(context, 'start'); }
			}, _('Start')),
			E('button', {
				'id': 'telego-lifecycle-restart',
				'type': 'button',
				'class': 'btn cbi-button cbi-button-action',
				'click': function () { return runLifecycleAction(context, 'restart'); }
			}, _('Restart')),
			E('button', {
				'id': 'telego-lifecycle-stop',
				'type': 'button',
				'class': 'btn cbi-button cbi-button-negative',
				'click': function () { return runLifecycleAction(context, 'stop'); }
			}, _('Stop')),
			E('button', {
				'id': 'telego-lifecycle-autostart-action',
				'type': 'button',
				'class': 'btn cbi-button cbi-button-neutral',
				'click': function () {
					const status = context.serviceStatus;
					return runLifecycleAction(
						context,
						status && status.autostart ? 'disable_autostart' : 'enable_autostart'
					);
				}
			}, _('Enable Autostart'))
		]),
		E('a', {
			'id': 'telego-lifecycle-config-link',
			'class': 'telego-lifecycle-config-link',
			'href': L.url('admin/services/telego/configuration') + '#mtproxy',
			'hidden': true
		}, _('Open MTProxy configuration')),
		E('p', {
			'id': 'telego-lifecycle-status',
			'class': 'telego-lifecycle-status',
			'aria-live': 'polite'
		})
	]);
	return panel;
}

function updateLifecyclePanel(context) {
	const root = context.root;
	if (!root)
		return;

	const status = context.serviceStatus;
	const available = !!(context.capabilities && context.capabilities.ok &&
		context.capabilities.features && context.capabilities.features.serviceLifecycle);
	const canWrite = available && context.canWrite === true;
	const statusNode = root.querySelector('#telego-lifecycle-status');
	const start = root.querySelector('#telego-lifecycle-start');
	const restart = root.querySelector('#telego-lifecycle-restart');
	const stop = root.querySelector('#telego-lifecycle-stop');
	const autostart = root.querySelector('#telego-lifecycle-autostart-action');
	const configLink = root.querySelector('#telego-lifecycle-config-link');
	const buttons = [start, restart, stop, autostart];
	const pending = !!context.operationPending;

	if (!available || !status || !status.ok) {
		uiFoundation.setText(root.querySelector('#telego-lifecycle-running'), _('Unavailable'));
		uiFoundation.setText(root.querySelector('#telego-lifecycle-autostart'), _('Unavailable'));
		uiFoundation.setText(root.querySelector('#telego-lifecycle-config-enabled'), _('Unavailable'));
		for (const button of buttons)
			if (button)
				button.disabled = true;
		if (configLink)
			configLink.hidden = true;
		if (!context.operationMessage)
			uiFoundation.setText(statusNode, _('Service lifecycle controls are unavailable for this session.'));
		return;
	}

	uiFoundation.setText(root.querySelector('#telego-lifecycle-running'), status.running ? _('Running') : _('Stopped'));
	uiFoundation.setText(root.querySelector('#telego-lifecycle-autostart'), status.autostart ? _('Enabled') : _('Disabled'));
	uiFoundation.setText(root.querySelector('#telego-lifecycle-config-enabled'), status.config_enabled ? _('Enabled') : _('Disabled'));

	const blocked = pending || status.busy || !canWrite;
	start.disabled = blocked || status.running || !status.config_enabled;
	restart.disabled = blocked || !status.running || !status.config_enabled;
	stop.disabled = blocked || !status.running;
	autostart.disabled = blocked;
	uiFoundation.setText(autostart, status.autostart ? _('Disable Autostart') : _('Enable Autostart'));

	if (configLink)
		configLink.hidden = !!status.config_enabled;

	if (context.operationMessage)
		uiFoundation.setText(statusNode, context.operationMessage);
	else if (!canWrite)
		uiFoundation.setText(statusNode, _('This session has read-only lifecycle access. Service actions are disabled.'));
	else if (status.busy)
		uiFoundation.setText(statusNode, _('Another telEgo lifecycle operation is already running.'));
	else if (!status.config_enabled)
		uiFoundation.setText(statusNode, _('Configuration is disabled. Start and Restart are unavailable until telEgo is enabled in MTProxy configuration.'));
	else
		uiFoundation.setText(statusNode, '');
}

function refreshLifecycleStatus(context) {
	return L.resolveDefault(callServiceStatus(), null).then(function (status) {
		context.serviceStatus = status && status.ok ? status : null;
		updateLifecyclePanel(context);
		return context.serviceStatus;
	});
}

function finishLifecycleObservation(context, state, message) {
	uiFoundation.removePoll('telego', 'lifecycle-operation');
	context.operationPending = false;
	context.operationId = null;

	if (state === 'completed')
		context.operationMessage = lifecycleMessage(message) || _('Lifecycle operation completed.');
	else if (state === 'failed')
		context.operationMessage = lifecycleMessage(message) || _('The lifecycle operation failed.');
	else
		context.operationMessage = _('Lifecycle result is unknown. Refresh service status before issuing another action.');

	return refreshLifecycleStatus(context);
}

function observeLifecycleOperation(context, operationId) {
	context.operationId = operationId;
	context.operationPending = true;
	context.operationDeadline = Date.now() + 30000;
	context.operationMessage = _('Lifecycle operation in progress…');
	updateLifecyclePanel(context);

	function check(isCurrent) {
		return L.resolveDefault(callOperationStatus(operationId), null).then(function (result) {
			if (isCurrent && !isCurrent())
				return;
			if (!context.operationPending || context.operationId !== operationId)
				return;

			if (result && result.ok && (result.state === 'completed' || result.state === 'failed'))
				return finishLifecycleObservation(context, result.state, result.message);

			if (Date.now() >= context.operationDeadline)
				return finishLifecycleObservation(context, 'unknown', '');

			context.operationMessage = result && result.state === 'running'
				? _('Lifecycle operation in progress…')
				: _('Waiting for lifecycle operation status…');
			updateLifecyclePanel(context);
		});
	}

	check(function () { return true; });
	uiFoundation.addPoll('telego', 'lifecycle-operation', check, 5);
}

function runLifecycleAction(context, action) {
	return Promise.all([
		L.resolveDefault(callServiceStatus(), null),
		L.resolveDefault(callTelegoStatus(), null),
		uiFoundation.pendingChanges(['telego'])
	]).then(function (fresh) {
		const status = fresh[0];
		const runtimeStatus = fresh[1];
		const pendingChanges = Number(fresh[2]) || 0;

		if (!status || !status.ok) {
			context.operationMessage = _('Unable to read current service state.');
			updateLifecyclePanel(context);
			return;
		}
		context.serviceStatus = status;

		if (context.canWrite !== true) {
			context.operationMessage = _('This session has read-only lifecycle access. Service actions are disabled.');
			updateLifecyclePanel(context);
			return;
		}

		if ((action === 'start' || action === 'restart') && !status.config_enabled) {
			context.operationMessage = lifecycleMessage('config-disabled');
			updateLifecyclePanel(context);
			return;
		}
		if (status.busy) {
			context.operationMessage = lifecycleMessage('busy');
			updateLifecyclePanel(context);
			return;
		}

		if (!window.confirm(lifecycleConfirmation(action, runtimeStatus, pendingChanges)))
			return;

		const requestId = lifecycleRequestId();
		context.operationPending = true;
		context.operationId = requestId;
		context.operationMessage = _('Submitting lifecycle operation…');
		updateLifecyclePanel(context);

		return callServiceAction(action, requestId, status.state_revision).then(function (result) {
			if (result && result.error === 'busy') {
				context.operationPending = false;
				context.operationId = null;
				context.operationMessage = lifecycleMessage('busy');
				return refreshLifecycleStatus(context);
			}
			if (result && result.state === 'completed') {
				context.operationPending = false;
				context.operationId = null;
				context.operationMessage = _('Lifecycle operation completed.');
				return refreshLifecycleStatus(context);
			}
			if (result && result.state === 'failed') {
				context.operationPending = false;
				context.operationId = null;
				context.operationMessage = lifecycleMessage(result.error) || _('The lifecycle operation failed.');
				return refreshLifecycleStatus(context);
			}

			observeLifecycleOperation(context, (result && result.operation_id) || requestId);
		}, function () {
			/* Never retry the mutation after a transport error. The request ID is
			 * also the operation ID, so only observe the original intent. */
			observeLifecycleOperation(context, requestId);
		});
	});
}

function buildDiagnosticsView(context) {
	const service = diagnosticGroup(_('Service Runtime'), [
		diagnosticCard(_('Service State'), 'state'),
		diagnosticCard(_('PID'), 'pid'),
		diagnosticCard(_('Service Uptime'), 'uptime'),
		diagnosticCard(_('Metrics'), 'metrics')
	]);

	const listeners = diagnosticGroup(_('Configured Listeners'), [
		diagnosticCard(_('MTProxy Listener'), 'mtproxy-listener'),
		diagnosticCard(_('WEB Backend Listener'), 'web-listener'),
		diagnosticCard(_('Metrics Listener'), 'metrics-listener'),
		diagnosticCard(_('LuCI HTTPS Listener'), 'luci-listener')
	]);

	const mtproxy = diagnosticGroup(_('MTProxy Counters'), [
		diagnosticCard(_('Active Connections'), 'connections'),
		diagnosticCard(_('Active IPs'), 'ips'),
		diagnosticCard(_('Tracked IPs'), 'tracked'),
		diagnosticCard(_('Blocked IPs'), 'blocked'),
		diagnosticCard(_('Traffic Received'), 'rx'),
		diagnosticCard(_('Traffic Sent'), 'tx')
	]);

	const web = diagnosticGroup(_('WEB Proxy Runtime'), [
		diagnosticCard(_('WEB Proxy State'), 'web-state'),
		diagnosticCard(_('Carrier Mode'), 'web-carrier'),
		diagnosticCard(_('Active WEB Sessions'), 'web-sessions'),
		diagnosticCard(_('Active WEB Streams'), 'web-streams'),
		diagnosticCard(_('Active WebSockets'), 'web-websockets'),
		diagnosticCard(_('Backend Dials'), 'web-dials'),
		diagnosticCard(_('Pending WEB Bytes'), 'web-pending-bytes'),
		diagnosticCard(_('Pending WEB Items'), 'web-pending-items'),
		diagnosticCard(_('Carrier Retries'), 'web-retries'),
		diagnosticCard(_('Backpressure Events'), 'web-backpressure')
	], 'web');

	const middleEnd = diagnosticGroup(_('Middle-End Runtime'), [
		diagnosticCard(_('Middle-End State'), 'me-state'),
		diagnosticCard(_('Admitting New Bindings'), 'me-admitting'),
		diagnosticCard(_('Repair in Progress'), 'me-repairing'),
		diagnosticCard(_('Physical Links'), 'me-links'),
		diagnosticCard(_('Active Bindings'), 'me-bindings'),
		diagnosticCard(_('Active Slot Repairs'), 'me-repairs'),
		diagnosticCard(_('Slot Failures'), 'me-failures'),
		diagnosticCard(_('Artifact State'), 'me-artifact'),
		diagnosticCard(_('Artifact Refresh Failures'), 'me-artifact-failures')
	], 'middleend');

	const nginx = diagnosticGroup(_('Nginx & HTTPS'), [
		diagnosticCard(_('Ingress Profile'), 'nginx-profile'),
		diagnosticCard(_('Certificate State'), 'certificate-state'),
		diagnosticCard(_('Certificate Expires'), 'certificate-expiry'),
		diagnosticCard(_('Certificate Hostname'), 'certificate-hostname'),
		diagnosticCard(_('Certificate SHA-256'), 'certificate-fingerprint'),
		diagnosticCard(_('Firewall State'), 'firewall'),
		diagnosticCard(_('Nginx Files'), 'nginx-files'),
		diagnosticCard(_('Unsafe Nginx Entries'), 'nginx-unsafe')
	]);

	return E('div', { 'class': 'telego-diagnostics' }, [
		E('div', { 'class': 'telego-diagnostics-heading' }, [
			E('div', {}, [
				E('h2', {}, _('Diagnostics')),
				E('p', {}, _('Runtime status, listeners, counters, metrics health and Nginx/HTTPS diagnostics in one place.'))
			]),
			E('div', { 'class': 'telego-diagnostics-actions' }, [
				diagnosticLink(_('Nginx Configuration'), L.url('admin/services/telego/nginx-files')),
				diagnosticLink(_('WEB Ingress'), L.url('admin/services/telego/ingress'), 'cbi-button-neutral'),
				diagnosticLink(_('System Log'), L.url('admin/status/logs'), 'cbi-button-neutral')
			])
		]),
		service,
		buildLifecyclePanel(context),
		listeners,
		mtproxy,
		web,
		middleEnd,
		nginx,
		E('p', {
			'id': 'telego-diagnostic-error',
			'class': 'telego-status-error',
			'aria-live': 'polite'
		})
	]);
}

function updateDiagnostics(status, platform, firewall, certificate, inventory, root) {
	if (!root)
		return;

	const values = {};
	const metricsReady = !!(status && status.metrics_available);
	const metricsVisible = !!(status && status.running && metricsReady);

	if (status) {
		setDiagnosticGroupVisible(root, 'web', !!status.web_enabled);
		setDiagnosticGroupVisible(root, 'middleend', !!status.middleend_enabled);

		Object.assign(values, {
			state: serviceState(status),
			pid: status.pid ? status.pid : _('—'),
			uptime: formatUptime(status.uptime),
			metrics: status.running ? (metricsReady ? _('Running') : _('Error')) : _('—'),
			connections: metricsVisible ? status.connections : _('—'),
			ips: metricsVisible ? status.ips_active : _('—'),
			tracked: metricsVisible ? status.ips_tracked : _('—'),
			blocked: metricsVisible ? status.ips_blocked : _('—'),
			rx: metricsVisible ? formatBytes(status.rx_bytes) : _('—'),
			tx: metricsVisible ? formatBytes(status.tx_bytes) : _('—'),
			'web-state': onOff(status.web_enabled),
			'web-carrier': status.web_carrier || _('—'),
			'web-sessions': metricsVisible && status.web_enabled ? status.web_sessions_active : _('—'),
			'web-streams': metricsVisible && status.web_enabled ? status.web_streams_active : _('—'),
			'web-websockets': metricsVisible && status.web_enabled ? status.web_websockets_active : _('—'),
			'web-dials': metricsVisible && status.web_enabled ? status.web_backend_dials_active : _('—'),
			'web-pending-bytes': metricsVisible && status.web_enabled ? formatBytes(status.web_pending_bytes) : _('—'),
			'web-pending-items': metricsVisible && status.web_enabled ? status.web_pending_items : _('—'),
			'web-retries': metricsVisible && status.web_enabled ? status.web_carrier_retries_total : _('—'),
			'web-backpressure': metricsVisible && status.web_enabled ? status.web_backpressure_total : _('—'),
			'me-state': onOff(status.middleend_enabled),
			'me-admitting': metricsVisible && status.middleend_enabled ? yesNo(status.middleend_admitting) : _('—'),
			'me-repairing': metricsVisible && status.middleend_enabled ? yesNo(status.middleend_repairing) : _('—'),
			'me-links': metricsVisible && status.middleend_enabled ? status.middleend_links : _('—'),
			'me-bindings': metricsVisible && status.middleend_enabled ? status.middleend_bindings : _('—'),
			'me-repairs': metricsVisible && status.middleend_enabled ? status.middleend_repairs_active : _('—'),
			'me-failures': metricsVisible && status.middleend_enabled ? status.middleend_slot_failures_total : _('—'),
			'me-artifact': middleEndArtifactState(status),
			'me-artifact-failures': metricsVisible && status.middleend_enabled ? status.middleend_artifact_refresh_failures : _('—')
		});

		appShell.updateHeader(root, {
			serviceText: serviceState(status),
			serviceTone: status.running
				? 'success'
				: (uci.get('telego', 'general', 'enabled') === '1' ? 'error' : 'neutral'),
			updatedAt: Date.now(),
			stale: false
		});
	}
	else {
		const freshness = root.querySelector('#telego-app-freshness');
		const hadSuccessfulStatus = !!(freshness && freshness.getAttribute('data-updated-at'));
		if (!hadSuccessfulStatus) {
			appShell.updateHeader(root, {
				serviceText: _('Unavailable'),
				serviceTone: 'error'
			});
		}
		appShell.updateHeader(root, { stale: true });
	}

	const mtproxyListener = uci.get('telego', 'general', 'bind_to') || '0.0.0.0:443';
	const webListener = uci.get('telego', 'web_proxy', 'bind_to') || '127.0.0.1:8080';
	const metricsListener = uci.get('telego', 'metrics', 'bind_to') || '127.0.0.1:9090';
	const luciListener = platform && platform.ok && platform.luci_https_port
		? ':' + platform.luci_https_port
		: _('—');

	Object.assign(values, {
		'mtproxy-listener': mtproxyListener,
		'web-listener': webListener,
		'metrics-listener': metricsListener,
		'luci-listener': luciListener,
		'nginx-profile': certificate && certificate.ok ? ingressProfileLabel(certificate.profile) : _('Unavailable'),
		'certificate-state': certificate && certificate.ok
			? (certificate.managed_tls ? (certificate.certificate_state || _('Unknown')) : _('Not managed'))
			: _('Unavailable'),
		'certificate-expiry': certificate && certificate.ok && certificate.managed_tls
			? (certificate.not_after || certificate.expiry_state || _('—'))
			: _('—'),
		'certificate-hostname': certificate && certificate.ok ? (certificate.hostname || _('—')) : _('—'),
		'certificate-fingerprint': certificate && certificate.ok ? (certificate.fingerprint_sha256 || _('—')) : _('—'),
		firewall: firewallStateText(firewall),
		'nginx-files': inventory && inventory.ok ? String((inventory.files || []).length) : _('Unavailable'),
		'nginx-unsafe': inventory && inventory.ok ? String(Number(inventory.unsafe_count) || 0) : _('Unavailable')
	});

	Object.keys(values).forEach(function (key) {
		uiFoundation.setText(root.querySelector('#telego-diagnostic-' + key), values[key], _('—'));
	});

	const errors = [];
	if (!status)
		errors.push(_('Unable to read telEgo status.'));
	else if (status.running && !metricsReady)
		errors.push(_('Metrics') + ': ' + _('Error') + ' (' + String(status.metrics_error || 'unavailable') + ')');
	if (!platform || !platform.ok)
		errors.push(_('Platform status is unavailable.'));
	if (!certificate || !certificate.ok)
		errors.push(_('Certificate status is unavailable.'));
	if (!inventory || !inventory.ok)
		errors.push(_('Nginx inventory is unavailable.'));

	uiFoundation.setText(root.querySelector('#telego-diagnostic-error'), errors.join(' '));
}

return view.extend({
	load: function () {
		return uci.load('telego');
	},

	render: function () {
		const middleEndEnabled = uci.get('telego', 'middle_end', 'enabled') === '1';
		const m = new form.Map(
			'telego',
			_('Runtime Tuning'),
			_('Performance profiles and low-level runtime controls. Live status and infrastructure diagnostics are shown above.')
		);

		let s = m.section(
			form.TypedSection,
			'performance',
			_('Performance'),
			_('Use a profile as a safe starting point, then adjust individual controls when needed. Applying a profile only changes this form; Save & Apply is still required.')
		);
		s.anonymous = true;
		s.addremove = false;

		const performanceSection = s;
		const profileStateBySection = {};
		const profileButtonsBySection = {};

		function updateProfileState(sectionId) {
			const state = profileStateBySection[sectionId];
			const buttons = profileButtonsBySection[sectionId] || {};
			const profile = detectPerformanceProfile(readPerformanceUi(performanceSection, sectionId));

			if (state) {
				state.textContent = performanceProfileLabel(profile);
				state.setAttribute('data-profile', profile);
			}

			for (const name of Object.keys(buttons)) {
				const active = name === profile;
				buttons[name].classList.toggle('active', active);
				buttons[name].setAttribute('aria-pressed', active ? 'true' : 'false');
			}
		}

		let o = s.option(
			form.DummyValue,
			'_profile',
			_('Performance Profile'),
			_('Profiles stage known combinations of the supported performance controls. Manual changes are preserved and are shown as Custom.')
		);
		o.renderWidget = function (sectionId) {
			const currentProfile = detectPerformanceProfile(readPerformanceUci());
			const state = E('span', {
				'id': 'telego-performance-profile-state',
				'class': 'telego-performance-profile-state',
				'data-profile': currentProfile,
				'aria-live': 'polite'
			}, performanceProfileLabel(currentProfile));
			const buttons = {};

			function profileButton(name, description) {
				const unavailable = middleEndEnabled && name === 'mobile_dpi';
				const button = E('button', {
					'id': 'telego-performance-profile-' + name.replace(/_/g, '-'),
					'type': 'button',
					'class': 'telego-performance-profile' + (currentProfile === name ? ' active' : ''),
					'aria-pressed': currentProfile === name ? 'true' : 'false',
					'disabled': unavailable ? 'disabled' : null,
					'title': unavailable
						? _('Mobile DPI profile is unavailable while Middle-End is enabled.')
						: '',
					'click': function (event) {
						if (event && event.preventDefault)
							event.preventDefault();
						if (unavailable)
							return;
						if (applyPerformanceProfile(performanceSection, sectionId, name))
							updateProfileState(sectionId);
					}
				}, [
					E('strong', {}, performanceProfileLabel(name)),
					E('span', {}, description)
				]);
				buttons[name] = button;
				return button;
			}

			profileStateBySection[sectionId] = state;
			profileButtonsBySection[sectionId] = buttons;

			return E('div', { 'class': 'telego-performance-profile-picker' }, [
				E('div', { 'class': 'telego-performance-profile-summary' }, [
					E('span', {}, _('Current profile:')),
					state
				]),
				E('div', { 'class': 'telego-performance-profile-grid' }, [
					profileButton(
						'default',
						_('Package defaults: automatic event loops, IPv4 preference, no DD shaping and no silence recovery timer.')
					),
					profileButton(
						'mobile_dpi',
						_('For restrictive mobile networks: DD downlink chunk 1200 bytes with 2ms pacing. Requires Middle-End to be disabled.')
					),
					profileButton(
						'ios_recovery',
						_('For diagnosing the iOS Updating stall: default transport settings with Client Silence Close set to 10s.')
					)
				]),
				E('p', { 'class': 'telego-performance-profile-note' },
					_('Profiles do not add a new runtime setting. They only stage values in the existing Performance fields below.'))
			]);
		};

		function trackCustomPerformance(option) {
			option.onchange = function (event, sectionId) {
				updateProfileState(sectionId);
			};
			return option;
		}

		o = trackCustomPerformance(s.option(form.Value, 'num_event_loops', _('Event Loops')));
		o.datatype = 'uinteger';
		o.default = '0';

		o = trackCustomPerformance(s.option(form.ListValue, 'prefer_ip', _('IP Preference')));
		o.value('prefer-ipv4', _('Prefer IPv4'));
		o.value('prefer-ipv6', _('Prefer IPv6'));
		o.value('only-ipv4', _('IPv4 only'));
		o.value('only-ipv6', _('IPv6 only'));
		o.default = 'prefer-ipv4';

		o = trackCustomPerformance(s.option(form.Value, 'idle_timeout', _('Idle Timeout')));
		o.datatype = 'string';
		o.default = '5m';

		o = trackCustomPerformance(s.option(form.Value, 'max_write_buffer_mb', _('Max Write Buffer (MB)')));
		o.datatype = 'uinteger';
		o.default = '0';

		o = trackCustomPerformance(s.option(form.Value, 'dd_downlink_chunk', _('DD Downlink Chunk (bytes)')));
		o.datatype = 'uinteger';
		o.default = '0';
		o.description = _('0 keeps the upstream raw-DD batching. For restrictive mobile networks, start with 1200 bytes together with a small DD downlink delay.');
		o.validate = function (section_id, value) {
			const number = Number(value);
			if (!(value === '0' || (Number.isInteger(number) && number >= 256 && number <= 65536)))
				return _('Use 0 or a value from 256 to 65536 bytes.');
			if (middleEndEnabled && number > 0)
				return _('DD Downlink Shaping is unavailable while Middle-End is enabled.');

			const delay = siblingFormValue(this, 'dd_downlink_delay', section_id, '0s');
			const delayUs = parseDDDownlinkDelayUs(delay);
			if (number === 0 && delayUs != null && delayUs > 0)
				return _('Set DD Downlink Delay to 0s before setting DD Downlink Chunk to 0.');

			return true;
		};

		o = trackCustomPerformance(s.option(form.Value, 'dd_downlink_delay', _('DD Downlink Delay')));
		o.datatype = 'string';
		o.default = '0s';
		o.description = _('Paces raw-DD proxy-to-client writes without blocking the event loop. 0s disables pacing; start with 2ms when testing mobile DPI degradation.');
		o.validate = function (section_id, value) {
			const delayUs = parseDDDownlinkDelayUs(value);
			if (delayUs == null)
				return _('Use 0s or a positive integer duration no greater than 1s, such as 500us, 2ms, or 1s.');
			if (middleEndEnabled && delayUs > 0)
				return _('DD Downlink Shaping is unavailable while Middle-End is enabled.');

			const chunk = Number(siblingFormValue(this, 'dd_downlink_chunk', section_id, '0'));
			if (delayUs > 0 && chunk === 0)
				return _('DD Downlink Delay requires a non-zero DD Downlink Chunk.');

			return true;
		};

		o = trackCustomPerformance(s.option(form.Value, 'client_silence_close', _('Client Silence Close')));
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

		s = m.section(form.TypedSection, 'metrics', _('Metrics Configuration'));
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

		return Promise.all([
			m.render(),
			L.resolveDefault(callTelegoStatus(), null),
			L.resolveDefault(callPlatformStatus(), null),
			L.resolveDefault(callFirewallStatus(), null),
			L.resolveDefault(callCertificateStatus(), null),
			L.resolveDefault(callNginxInventory(), null),
			L.resolveDefault(callUiCapabilities(), null),
			L.resolveDefault(callServiceStatus(), null),
			L.resolveDefault(callSessionAccess('ubus', 'telego.admin', 'service_action'), false)
		]).then(function (data) {
			const lifecycleContext = {
				root: null,
				capabilities: data[6],
				serviceStatus: data[7] && data[7].ok ? data[7] : null,
				canWrite: data[8] === true,
				operationPending: false,
				operationId: null,
				operationMessage: ''
			};
			const dashboard = buildDiagnosticsView(lifecycleContext);
			const root = appShell.wrap('diagnostics', E('div', {}, [
				dashboard,
				E('div', { 'class': 'telego-diagnostics-runtime' }, data[0])
			]));
			lifecycleContext.root = root;

			updateDiagnostics(data[1], data[2], data[3], data[4], data[5], root);
			updateLifecyclePanel(lifecycleContext);

			uiFoundation.addPoll('telego', 'runtime-status', function (isCurrent) {
				return L.resolveDefault(callTelegoStatus(), null).then(function (status) {
					if (isCurrent())
						updateDiagnostics(status, data[2], data[3], data[4], data[5], root);
				});
			}, 5);

			uiFoundation.addPoll('telego', 'infrastructure-status', function (isCurrent) {
				return Promise.all([
					L.resolveDefault(callPlatformStatus(), null),
					L.resolveDefault(callFirewallStatus(), null),
					L.resolveDefault(callCertificateStatus(), null),
					L.resolveDefault(callNginxInventory(), null)
				]).then(function (fresh) {
					if (!isCurrent())
						return;

					data[2] = fresh[0];
					data[3] = fresh[1];
					data[4] = fresh[2];
					data[5] = fresh[3];
					return L.resolveDefault(callTelegoStatus(), null).then(function (status) {
						if (isCurrent())
							updateDiagnostics(status, data[2], data[3], data[4], data[5], root);
					});
				});
			}, 30);

			uiFoundation.addPoll('telego', 'service-state', function (isCurrent) {
				return L.resolveDefault(callServiceStatus(), null).then(function (status) {
					if (!isCurrent())
						return;
					lifecycleContext.serviceStatus = status && status.ok ? status : null;
					updateLifecyclePanel(lifecycleContext);
				});
			}, 30);

			return root;
		});
	}
});
