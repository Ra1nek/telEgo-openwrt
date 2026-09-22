const assert = require('node:assert/strict');
const fs = require('node:fs');

class Element {
	constructor(tag, attrs = {}, children = []) {
		this.tag = tag;
		this.attrs = attrs || {};
		this.children = Array.isArray(children) ? children : [children];
		this.textContent = typeof children === 'string' ? children : '';
		this.hidden = attrs.hidden === true;
		this.disabled = attrs.disabled != null && attrs.disabled !== false;
		this.classList = {
			toggle: (name, enabled) => {
				const set = new Set(String(this.attrs.class || '').split(/\s+/).filter(Boolean));
				if (enabled) set.add(name); else set.delete(name);
				this.attrs.class = Array.from(set).join(' ');
			},
			add: name => {
				const set = new Set(String(this.attrs.class || '').split(/\s+/).filter(Boolean));
				set.add(name);
				this.attrs.class = Array.from(set).join(' ');
			},
			remove: name => {
				const set = new Set(String(this.attrs.class || '').split(/\s+/).filter(Boolean));
				set.delete(name);
				this.attrs.class = Array.from(set).join(' ');
			}
		};
	}
	setAttribute(name, value) { this.attrs[name] = value; }
	getAttribute(name) { return this.attrs[name]; }
	querySelector(selector) {
		const classes = String(this.attrs.class || '').split(/\s+/).filter(Boolean);
		if (selector === this.tag || selector === '#' + this.attrs.id || (selector.startsWith('.') && classes.includes(selector.slice(1))))
			return this;
		for (const child of this.children) {
			const found = child?.querySelector?.(selector);
			if (found) return found;
		}
		return null;
	}
}

const healthyStatus = {
	running: true,
	pid: 42,
	uptime: 3661,
	metrics_available: true,
	metrics_error: '',
	connections: 5,
	ips_active: 4,
	ips_tracked: 8,
	ips_blocked: 1,
	rx_bytes: 1250,
	tx_bytes: 2500,
	web_enabled: true,
	web_carrier: 'https-lanes',
	web_sessions_active: 2,
	web_streams_active: 5,
	web_websockets_active: 1,
	web_backend_dials_active: 0,
	web_pending_bytes: 4096,
	web_pending_items: 3,
	web_sessions_created_total: 10,
	web_sessions_closed_total: 6,
	web_carrier_retries_total: 3,
	web_backpressure_total: 1,
	middleend_enabled: true,
	middleend_admitting: 1,
	middleend_repairing: 0,
	middleend_links: 5,
	middleend_bindings: 9,
	middleend_repairs_active: 1,
	middleend_slot_failures_total: 2,
	middleend_artifact_applied: 1,
	middleend_artifact_pending: 0,
	middleend_artifact_refresh_failures: 1
};

async function renderAdvanced(state = {}) {
	const options = [];
	const sections = [];
	const formValues = state.formValues || {};
	const performanceDefaults = {
		num_event_loops: '0',
		prefer_ip: 'prefer-ipv4',
		idle_timeout: '5m',
		max_write_buffer_mb: '0',
		dd_downlink_chunk: '0',
		dd_downlink_delay: '0s',
		client_silence_close: '0s'
	};
	const pollers = [];
	const removedPolls = [];
	const rpcCalls = [];
	const confirmations = [];
	let requestSequence = 0;
	let shellActive = null;

	class Map {
		lookupOption(name, section) {
			return options.filter(option => option.name === name && option.section === section);
		}
		section(kind, section, title, description) {
			const map = this;
			const instance = {
				section,
				title,
				description,
				option(type, name) {
					let uiValue;
					let validationCount = 0;
					const option = {
						section, name, type, values: [], map,
						value(value, label) { this.values.push([value, label]); },
						formvalue(sectionId) {
							return this.getUIElement(sectionId).getValue();
						},
						getUIElement(sectionId) {
							return {
								getValue: () => {
									if (uiValue !== undefined) return uiValue;
									const values = formValues[sectionId] || formValues[section] || {};
									if (Object.prototype.hasOwnProperty.call(values, name)) return values[name];
									if (section === 'performance' && Object.prototype.hasOwnProperty.call(state.performance || {}, name))
										return state.performance[name];
									return this.default;
								},
								setValue: value => { uiValue = String(value); },
								triggerValidation: () => { validationCount++; },
								get validationCount() { return validationCount; }
							};
						}
					};
					options.push(option);
					return option;
				},
				getUIElement(sectionId, name) {
					const option = options.find(entry => entry.section === section && entry.name === name);
					return option ? option.getUIElement(sectionId) : null;
				}
			};
			sections.push(instance);
			return instance;
		}
		render() { return Promise.resolve(new Element('form', { id: 'runtime-form' })); }
	}

	const form = {
		Map,
		TypedSection: function() {},
		Flag: function() {},
		Value: function() {},
		ListValue: function() {},
		DynamicList: function() {},
		DummyValue: function() {}
	};

	const uci = {
		load: async config => config,
		get: (config, section, option) => {
			if (config !== 'telego') return null;
			if (section === 'general' && option === 'enabled') return '1';
			if (section === 'general' && option === 'bind_to') return '0.0.0.0:2443';
			if (section === 'web_proxy' && option === 'bind_to') return '127.0.0.1:8080';
			if (section === 'metrics' && option === 'bind_to') return '127.0.0.1:9090';
			if (section === 'middle_end' && option === 'enabled') return state.middleEnd ?? '0';
			if (section === 'performance') {
				if (Object.prototype.hasOwnProperty.call(state.performance || {}, option))
					return state.performance[option];
				return performanceDefaults[option] ?? null;
			}
			return null;
		}
	};

	const rpcState = {
		status: state.status === undefined ? healthyStatus : state.status,
		platform_status: state.platform === undefined ? {
			ok: true,
			luci_https_port: '10443'
		} : state.platform,
		firewall_status: state.firewall === undefined ? {
			ok: true,
			section_state: 'owned',
			managed_match: true
		} : state.firewall,
		certificate_status: state.certificate === undefined ? {
			ok: true,
			profile: 'direct_https',
			managed_tls: true,
			certificate_state: 'valid',
			not_after: '2030-01-01',
			hostname: 'web.example.com',
			fingerprint_sha256: 'AA:BB'
		} : state.certificate,
		inventory: state.inventory === undefined ? {
			ok: true,
			unsafe_count: 1,
			files: [{ name: '20-telego-core.conf' }, { name: '80-telego-ingress.conf' }]
		} : state.inventory,
		capabilities: state.capabilities === undefined ? {
			ok: true,
			features: { serviceLifecycle: true }
		} : state.capabilities,
		service_status: state.serviceStatus === undefined ? {
			ok: true,
			error: '',
			running: true,
			autostart: true,
			config_enabled: true,
			state_revision: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
			busy: false
		} : state.serviceStatus,
		service_action: state.serviceAction === undefined ? {
			ok: true,
			error: '',
			operation_id: 'request-0001',
			state: 'completed'
		} : state.serviceAction,
		operation_status: state.operationStatus === undefined ? {
			ok: true,
			error: '',
			state: 'completed',
			message: 'service-restarted'
		} : state.operationStatus
	};
	const rpc = {
		declare: spec => (...args) => {
			rpcCalls.push({ method: spec.method, args });
			if (spec.method === 'access')
				return Promise.resolve(state.canWrite !== false);
			if (spec.method === 'service_action' && state.serviceActionReject)
				return Promise.reject(new Error('transport failure'));
			return Promise.resolve(rpcState[spec.method] ?? null);
		}
	};

	const source = fs.readFileSync('package/luci-app-telego/htdocs/resources/view/telego/advanced.js', 'utf8');
	const appShell = {
		wrap: (active, content) => {
			shellActive = active;
			return new Element('div', { 'data-active': active }, [
				new Element('span', { id: 'telego-app-service', hidden: true }, [
					new Element('strong', { id: 'telego-app-service-value' }, '')
				]),
				new Element('time', { id: 'telego-app-freshness', hidden: true }, ''),
				content
			]);
		},
		updateHeader: (root, stateValue) => {
			if (Object.prototype.hasOwnProperty.call(stateValue, 'serviceText')) {
				const service = root.querySelector('#telego-app-service');
				const value = root.querySelector('#telego-app-service-value');
				service.hidden = false;
				service.attrs['data-tone'] = stateValue.serviceTone || 'neutral';
				value.textContent = String(stateValue.serviceText);
			}
			const freshness = root.querySelector('#telego-app-freshness');
			if (stateValue.updatedAt) {
				freshness.attrs['data-updated-at'] = String(Number(stateValue.updatedAt));
				freshness.hidden = false;
			}
			if (Object.prototype.hasOwnProperty.call(stateValue, 'stale'))
				freshness.attrs['data-stale'] = stateValue.stale ? 'true' : 'false';
		}
	};
	const uiFoundation = {
		setText: (node, value, fallback) => {
			if (node)
				node.textContent = value === null || value === undefined || value === ''
					? (fallback === undefined ? '' : String(fallback))
					: String(value);
			return node;
		},
		addPoll: (namespace, key, fn, interval) => {
			assert.equal(namespace, 'telego');
			const wrapped = () => fn(() => true);
			pollers.push({ key, fn: wrapped, interval });
			return wrapped;
		},
		removePoll: (namespace, key) => {
			assert.equal(namespace, 'telego');
			removedPolls.push(key);
			return true;
		},
		pendingChanges: () => Promise.resolve(state.pendingChanges || 0)
	};
	const L = {
		url: path => '/cgi-bin/luci/' + path,
		resolveDefault: (promise, fallback) => Promise.resolve(promise).catch(() => fallback),
		toArray: value => value == null ? [] : (Array.isArray(value) ? value : [value])
	};

	const windowObject = {
		crypto: {
			randomUUID: () => 'request-' + String(++requestSequence).padStart(4, '0'),
			getRandomValues: bytes => bytes
		},
		confirm: message => {
			confirmations.push(message);
			return state.confirmResult !== false;
		}
	};
	const view = new Function('form', 'rpc', 'uci', 'view', '_', 'L', 'appShell', 'uiFoundation', 'E', 'window', source)(
		form, rpc, uci, { extend: x => x }, x => x, L, appShell, uiFoundation,
		(tag, attrs, children) => new Element(tag, attrs, children), windowObject
	);

	assert.equal(await view.load(), 'telego');
	const root = await view.render();
	return { options, sections, root, shellActive, source, pollers, removedPolls, rpcState, rpcCalls, confirmations };
}

function option(options, section, name) {
	return options.find(o => o.section === section && o.name === name);
}

(async () => {
	let result = await renderAdvanced();
	let options = result.options;
	assert.equal(result.shellActive, 'diagnostics');
	assert.ok(result.root.querySelector('#telego-diagnostic-state'), 'Diagnostics renders service runtime');
	assert.equal(result.root.querySelector('#telego-diagnostic-state').textContent, 'Running');
	assert.equal(result.root.querySelector('#telego-diagnostic-pid').textContent, '42');
	assert.equal(result.root.querySelector('#telego-diagnostic-mtproxy-listener').textContent, '0.0.0.0:2443');
	assert.equal(result.root.querySelector('#telego-diagnostic-web-listener').textContent, '127.0.0.1:8080');
	assert.equal(result.root.querySelector('#telego-diagnostic-metrics-listener').textContent, '127.0.0.1:9090');
	assert.equal(result.root.querySelector('#telego-diagnostic-luci-listener').textContent, ':10443');
	assert.equal(result.root.querySelector('#telego-diagnostic-connections').textContent, '5');
	assert.equal(result.root.querySelector('#telego-diagnostic-web-sessions').textContent, '2');
	assert.equal(result.root.querySelector('#telego-diagnostic-me-links').textContent, '5');
	assert.equal(result.root.querySelector('#telego-diagnostic-nginx-profile').textContent, 'Direct HTTPS');
	assert.equal(result.root.querySelector('#telego-diagnostic-certificate-state').textContent, 'valid');
	assert.equal(result.root.querySelector('#telego-diagnostic-certificate-hostname').textContent, 'web.example.com');
	assert.equal(result.root.querySelector('#telego-diagnostic-nginx-files').textContent, '2');
	assert.equal(result.root.querySelector('#telego-diagnostic-nginx-unsafe').textContent, '1');
	assert.equal(result.root.querySelector('#telego-diagnostic-firewall').textContent, 'Owned and in sync');
	assert.equal(result.root.querySelector('#telego-diagnostic-error').textContent, '');
	assert.equal(result.root.querySelector('#telego-diagnostic-group-web').hidden, false);
	assert.equal(result.root.querySelector('#telego-diagnostic-group-middleend').hidden, false);
	assert.match(result.source, /admin\/services\/telego\/nginx-files/);
	assert.match(result.source, /admin\/status\/logs/);
	assert.equal(result.pollers.length, 3, 'Diagnostics uses runtime, infrastructure and service-state polling');
	assert.deepEqual(result.pollers.map(p => p.interval), [5, 30, 30]);
	assert.deepEqual(result.pollers.map(p => p.key), ['runtime-status', 'infrastructure-status', 'service-state']);
	assert.equal(result.root.querySelector('#telego-app-service-value').textContent, 'Running');
	assert.equal(result.root.querySelector('#telego-app-freshness').attrs['data-stale'], 'false');

	const lifecycle = result.root.querySelector('#telego-lifecycle-panel');
	assert.ok(lifecycle, 'P6.4 renders lifecycle controls in Diagnostics');
	assert.equal(result.root.querySelector('#telego-lifecycle-running').textContent, 'Running');
	assert.equal(result.root.querySelector('#telego-lifecycle-autostart').textContent, 'Enabled');
	assert.equal(result.root.querySelector('#telego-lifecycle-config-enabled').textContent, 'Enabled');
	assert.equal(result.root.querySelector('#telego-lifecycle-start').disabled, true, 'Start disabled while already running');
	assert.equal(result.root.querySelector('#telego-lifecycle-restart').disabled, false);
	assert.equal(result.root.querySelector('#telego-lifecycle-stop').disabled, false);
	assert.equal(result.root.querySelector('#telego-lifecycle-autostart-action').textContent, 'Disable Autostart');

	await result.root.querySelector('#telego-lifecycle-restart').attrs.click();
	const lifecycleRpc = result.rpcCalls.find(call => call.method === 'service_action');
	assert.deepEqual(
		lifecycleRpc.args,
		['restart', 'request-0001', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
		'lifecycle action uses fixed action, fresh request ID and service state revision'
	);
	assert.equal(result.confirmations.length, 1, 'restart requires explicit confirmation');
	assert.match(result.confirmations[0], /Target: telEgo/);
	assert.match(result.confirmations[0], /Active sessions: 5/);
	assert.match(result.confirmations[0], /Unsaved form edits are not saved or applied/);
	assert.equal(result.root.querySelector('#telego-lifecycle-status').textContent, 'Lifecycle operation completed.');

	for (const section of ['general', 'tls_fronting', 'web_proxy', 'middle_end'])
		assert.equal(result.sections.some(entry => entry.section === section), false,
			'feature-specific advanced controls stay contextual: ' + section);
	assert.ok(result.sections.some(entry => entry.section === 'performance'));
	assert.ok(result.sections.some(entry => entry.section === 'upstream'));
	assert.ok(result.sections.some(entry => entry.section === 'metrics'));
	for (const name of ['bind_to', 'path', 'diagnostics'])
		assert.ok(option(options, 'metrics', name), 'missing Metrics Configuration option ' + name);

	const profile = option(options, 'performance', '_profile');
	const profileWidget = profile.renderWidget('performance');
	const stateNode = profileWidget.querySelector('#telego-performance-profile-state');
	const defaultButton = profileWidget.querySelector('#telego-performance-profile-default');
	const mobileButton = profileWidget.querySelector('#telego-performance-profile-mobile-dpi');
	const iosButton = profileWidget.querySelector('#telego-performance-profile-ios-recovery');
	assert.equal(stateNode.attrs['data-profile'], 'default');
	assert.equal(defaultButton.attrs['aria-pressed'], 'true');
	assert.equal(mobileButton.disabled, false);

	mobileButton.attrs.click({ preventDefault() {} });
	assert.equal(option(options, 'performance', 'dd_downlink_chunk').formvalue('performance'), '1200');
	assert.equal(option(options, 'performance', 'dd_downlink_delay').formvalue('performance'), '2ms');
	assert.equal(stateNode.attrs['data-profile'], 'mobile_dpi');

	const silence = option(options, 'performance', 'client_silence_close');
	silence.getUIElement('performance').setValue('7s');
	silence.onchange(null, 'performance', '7s');
	assert.equal(stateNode.attrs['data-profile'], 'custom');

	iosButton.attrs.click({ preventDefault() {} });
	assert.equal(option(options, 'performance', 'client_silence_close').formvalue('performance'), '10s');
	assert.equal(stateNode.attrs['data-profile'], 'ios_recovery');

	defaultButton.attrs.click({ preventDefault() {} });
	assert.equal(option(options, 'performance', 'client_silence_close').formvalue('performance'), '0s');
	assert.equal(stateNode.attrs['data-profile'], 'default');

	let ddChunk = option(options, 'performance', 'dd_downlink_chunk');
	let ddDelay = option(options, 'performance', 'dd_downlink_delay');
	assert.equal(ddChunk.validate('performance', '0'), true);
	assert.equal(ddChunk.validate('performance', '1200'), true);
	assert.notEqual(ddChunk.validate('performance', '255'), true);

	result = await renderAdvanced({
		formValues: { performance: { dd_downlink_chunk: '1200', dd_downlink_delay: '2ms' } }
	});
	options = result.options;
	ddDelay = option(options, 'performance', 'dd_downlink_delay');
	assert.equal(ddDelay.validate('performance', '2ms'), true);

	result = await renderAdvanced({
		middleEnd: '1',
		formValues: { performance: { dd_downlink_chunk: '1200', dd_downlink_delay: '2ms' } }
	});
	options = result.options;
	ddChunk = option(options, 'performance', 'dd_downlink_chunk');
	ddDelay = option(options, 'performance', 'dd_downlink_delay');
	assert.notEqual(ddChunk.validate('performance', '1200'), true);
	assert.notEqual(ddDelay.validate('performance', '2ms'), true);
	const blockedWidget = option(options, 'performance', '_profile').renderWidget('performance');
	assert.equal(blockedWidget.querySelector('#telego-performance-profile-mobile-dpi').disabled, true);

	result = await renderAdvanced({ status: { ...healthyStatus, web_enabled: false, middleend_enabled: false } });
	assert.equal(result.root.querySelector('#telego-diagnostic-group-web').hidden, true);
	assert.equal(result.root.querySelector('#telego-diagnostic-group-middleend').hidden, true);

	result = await renderAdvanced({ status: { ...healthyStatus, metrics_available: false, metrics_error: 'fetch-failed' } });
	assert.equal(result.root.querySelector('#telego-diagnostic-metrics').textContent, 'Error');
	assert.match(result.root.querySelector('#telego-diagnostic-error').textContent, /fetch-failed/);

	result = await renderAdvanced({
		status: { ...healthyStatus, running: false, pid: 0, connections: 0 },
		serviceStatus: {
			ok: true,
			error: '',
			running: false,
			autostart: false,
			config_enabled: false,
			state_revision: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
			busy: false
		}
	});
	assert.equal(result.root.querySelector('#telego-lifecycle-start').disabled, true, 'config disabled blocks Start');
	assert.equal(result.root.querySelector('#telego-lifecycle-restart').disabled, true, 'config disabled blocks Restart');
	assert.equal(result.root.querySelector('#telego-lifecycle-stop').disabled, true, 'stopped service blocks Stop');
	assert.equal(result.root.querySelector('#telego-lifecycle-config-link').hidden, false, 'disabled config links back to MTProxy settings');
	assert.match(result.root.querySelector('#telego-lifecycle-status').textContent, /Configuration is disabled/);

	result = await renderAdvanced({
		capabilities: { ok: true, features: { serviceLifecycle: false } }
	});
	assert.equal(result.root.querySelector('#telego-lifecycle-restart').disabled, true, 'capability gate disables lifecycle mutations');
	assert.match(result.root.querySelector('#telego-lifecycle-status').textContent, /unavailable for this session/);

	result = await renderAdvanced({ canWrite: false });
	assert.equal(result.root.querySelector('#telego-lifecycle-restart').disabled, true, 'read-only ACL disables lifecycle mutations');
	assert.equal(result.root.querySelector('#telego-lifecycle-stop').disabled, true, 'read-only ACL disables Stop');
	assert.equal(result.root.querySelector('#telego-lifecycle-autostart-action').disabled, true, 'read-only ACL disables autostart mutation');
	assert.match(result.root.querySelector('#telego-lifecycle-status').textContent, /read-only lifecycle access/);
	assert.ok(result.rpcCalls.some(call => call.method === 'access' &&
		call.args.join('|') === 'ubus|telego.admin|service_action'), 'UI checks exact session write ACL');

	result = await renderAdvanced({
		pendingChanges: 2
	});
	await result.root.querySelector('#telego-lifecycle-restart').attrs.click();
	assert.match(result.confirmations[0], /saved telEgo changes waiting for Apply/);
	assert.match(result.confirmations[0], /will not apply them/);

	result = await renderAdvanced({ serviceActionReject: true });
	await result.root.querySelector('#telego-lifecycle-restart').attrs.click();
	await Promise.resolve();
	const mutationCalls = result.rpcCalls.filter(call => call.method === 'service_action');
	const observeCalls = result.rpcCalls.filter(call => call.method === 'operation_status');
	assert.equal(mutationCalls.length, 1, 'transport failure never retries the lifecycle mutation');
	assert.ok(observeCalls.length >= 1, 'transport failure observes operation status by request ID');
	assert.equal(observeCalls[0].args[0], 'request-0001');

	const css = fs.readFileSync('package/luci-app-telego/htdocs/css/telego.css', 'utf8');
	assert.match(css, /\.telego-diagnostic-grid\s*\{/);
	assert.match(css, /\.telego-diagnostics-actions\s*\{/);
	assert.match(css, /\.telego-performance-profile-grid\s*\{/);
	assert.match(css, /var\(--background-color-high, Canvas\)/);
	assert.match(css, /\.telego-app-meta-item\s*\{/);
	assert.match(css, /\.telego-lifecycle-panel\s*\{/);
	assert.match(css, /\.telego-lifecycle-actions \.btn\s*\{[\s\S]*min-height:\s*44px/);

	console.log('LuCI P5.6/P6.4 Diagnostics lifecycle tests passed');
})().catch(error => { console.error(error); process.exit(1); });
