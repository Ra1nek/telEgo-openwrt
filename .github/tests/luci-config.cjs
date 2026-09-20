const assert = require('node:assert/strict');
const fs = require('node:fs');

class Element {
	constructor(tag, attrs = {}, children = []) {
		this.tag = tag; this.attrs = attrs; this.style = {}; this.hidden = attrs.hidden === true;
		this.children = Array.isArray(children) ? children : [children];
		this.value = attrs.value || '';
		this.disabled = attrs.disabled === true;
		this.textContent = typeof children === 'string' ? children : '';
		this.classList = { add() {}, remove() {} };
	}
	addEventListener(name, handler) { this.attrs[name] = handler; }
	querySelector(selector) {
		if (selector === '#' + this.attrs.id) return this;
		for (const child of this.children) {
			const found = child?.querySelector?.(selector);
			if (found) return found;
		}
		return null;
	}
}

async function check(initialStatus, ingressMode = 'disabled', tlsFrontingEnabled = '1') {
	const options = [];
	let poll;
	let modal;
	let reply = initialStatus;
	class Map {
		section(kind, section) {
			return {
				anonymous: false, addremove: true, sortable: false,
				option(type, name) {
					const option = {
						section, name, value() {},
						depends(field, value) { this.dependency = [field, value]; }
					};
					options.push(option);
					return option;
				}
			};
		}
		render() { return Promise.resolve(new Element('form')); }
	}
	const form = {
		Map,
		Flag: function() {},
		Value: function() {},
		ListValue: function() {},
		DynamicList: function() {},
		Button: function() {},
		GridSection: function() {},
		TypedSection: function() {}
	};
	form.Value.prototype = { renderWidget() { return new Element('input'); } };

	const uci = {
		load: async () => {},
		get: (config, section, option) => {
			if (config === 'telego' && section === 'general' && option === 'enabled') return '1';
			if (config === 'telego' && section === 'general' && option === 'bind_to') return '0.0.0.0:2443';
			if (config === 'telego' && section === 'general' && option === 'public_host') return 'proxy.example.com';
			if (config === 'telego' && section === 'general' && option === 'public_port') return '';
			if (config === 'telego' && section === 'tls_fronting' && option === 'enabled') return tlsFrontingEnabled;
			if (config === 'telego' && section === 'tls_fronting' && option === 'mask_host') return 'ya.ru';
			if (config === 'telego' && section === 'user1' && option === 'name') return 'aiser';
			if (config === 'telego' && section === 'user1' && option === 'secret') return '0123456789abcdef0123456789abcdef';
			if (config === 'nginx_telego' && section === 'cloudflare' && option === 'enabled')
				return ingressMode === 'cloudflare' ? '1' : '0';
			if (config === 'nginx_telego' && section === 'direct_https' && option === 'enabled')
				return ingressMode === 'direct_https' ? '1' : '0';
			if (config === 'nginx_telego' && section === 'shared' && option === 'enabled')
				return ingressMode === 'shared' ? '1' : '0';
			return '1';
		}
	};

	const ui = {
		showModal: (title, children) => { modal = new Element('modal', { title }, children); },
		hideModal: () => {},
		addNotification: () => {}
	};
	const view = new Function('form', 'rpc', 'ui', 'uci', 'view', 'E', '_', 'L', 'document',
		fs.readFileSync('package/luci-app-telego/htdocs/resources/view/telego/config.js', 'utf8'))(
		form, { declare: () => () => reply ? Promise.resolve(reply) : Promise.reject(new Error('rpcd unavailable')) },
		ui, uci, { extend: x => x },
		(tag, attrs, children) => new Element(tag, attrs, children), x => x,
		{ resolveDefault: (p, fallback) => p.catch(() => fallback), Poll: { add: fn => { poll = fn; } } },
		{ querySelector: () => null }
	);
	await view.load();
	const root = await view.render();
	assert.ok(root.querySelector('#telego-config-pane'), 'configuration renders even without rpcd');

	const hostname = options.find(o => o.section === 'web_proxy' && o.name === 'hostname');
	assert.deepEqual(hostname.dependency, ['enabled', '1']);
	assert.equal(hostname.rmempty, false);
	assert.equal(hostname.retain, true);

	for (const name of ['public_host', 'public_port'])
		assert.ok(options.find(o => o.section === 'general' && o.name === name), 'missing basic general option ' + name);

	for (const name of ['proxy_protocol', 'max_connections_per_ip', 'max_ips_per_user', 'ip_block_timeout', 'handshake_timeout', 'clock_sync_url'])
		assert.equal(options.find(o => o.section === 'general' && o.name === name), undefined, 'advanced general option leaked into Configuration: ' + name);

	const publicHost = options.find(o => o.section === 'general' && o.name === 'public_host');
	const publicPort = options.find(o => o.section === 'general' && o.name === 'public_port');
	assert.equal(publicHost.datatype, 'host');
	assert.equal(publicPort.datatype, 'port');

	const links = options.find(o => o.section === 'secret' && o.name === '_links');
	assert.ok(links, 'missing per-user link generator');
	links.onclick('user1');
	assert.ok(modal, 'link generator opens a modal');

	const ddSecretOutput = modal.querySelector('#telego-proxy-dd-secret');
	const ddLinkOutput = modal.querySelector('#telego-proxy-dd-link');
	const eeSecretOutput = modal.querySelector('#telego-proxy-ee-secret');
	const eeLinkOutput = modal.querySelector('#telego-proxy-ee-link');
	assert.equal(ddSecretOutput.value, 'dd0123456789abcdef0123456789abcdef');
	assert.equal(ddLinkOutput.value, 'tg://proxy?server=proxy.example.com&port=2443&secret=dd0123456789abcdef0123456789abcdef');
	if (tlsFrontingEnabled === '1') {
		assert.equal(eeSecretOutput.value, 'ee0123456789abcdef0123456789abcdef79612e7275');
		assert.equal(eeLinkOutput.value, 'tg://proxy?server=proxy.example.com&port=2443&secret=ee0123456789abcdef0123456789abcdef79612e7275');
	} else {
		assert.equal(eeSecretOutput.value, '');
		assert.equal(eeLinkOutput.value, '');
		assert.equal(modal.querySelector('#telego-proxy-tab-ee').disabled, true);
	}

	const ddPanel = modal.querySelector('#telego-proxy-panel-dd');
	const eePanel = modal.querySelector('#telego-proxy-panel-ee');
	assert.equal(ddPanel.hidden, false);
	assert.equal(eePanel.hidden, true);
	modal.querySelector('#telego-proxy-tab-ee').attrs.click();
	assert.equal(ddPanel.hidden, tlsFrontingEnabled === '1' ? true : false);
	assert.equal(eePanel.hidden, tlsFrontingEnabled === '1' ? false : true);

	const serverInput = modal.querySelector('#telego-proxy-public-server');
	const portInput = modal.querySelector('#telego-proxy-public-port');
	serverInput.value = '203.0.113.10';
	portInput.value = '443';
	serverInput.attrs.input();
	assert.equal(ddLinkOutput.value, 'tg://proxy?server=203.0.113.10&port=443&secret=dd0123456789abcdef0123456789abcdef');

	const tlsEnabled = options.find(o => o.section === 'tls_fronting' && o.name === 'enabled');
	assert.ok(tlsEnabled, 'TLS Fronting enable toggle exists');
	assert.equal(tlsEnabled.default, '1');
	assert.equal(tlsEnabled.validate(null, '1'), true);
	ingressMode === 'shared'
		? assert.notEqual(tlsEnabled.validate(null, '0'), true)
		: assert.equal(tlsEnabled.validate(null, '0'), true);

	for (const name of ['mask_host', 'mask_port']) {
		const option = options.find(o => o.section === 'tls_fronting' && o.name === name);
		assert.deepEqual(option.dependency, ['enabled', '1'], 'basic TLS option visibility must follow enabled: ' + name);
	}
	for (const name of ['cert_host', 'cert_port', 'fake_cert_size', 'mask_sni_safelist', 'splice_host', 'splice_port', 'splice_proxy_protocol', 'splice_idle_timeout', 'enable_drs', 'enable_split_tls'])
		assert.equal(options.find(o => o.section === 'tls_fronting' && o.name === name), undefined, 'advanced TLS option leaked into Configuration: ' + name);

	for (const name of ['trusted_proxy_cidrs', 'backend', 'num_event_loops'])
		assert.equal(options.find(o => o.section === 'web_proxy' && o.name === name), undefined, 'advanced WEB option leaked into Configuration: ' + name);

	const proxyTag = options.find(o => o.section === 'middle_end' && o.name === 'proxy_tag');
	assert.equal(proxyTag.validate(null, ''), true);
	assert.equal(proxyTag.validate(null, '0123456789abcdef0123456789abcdef'), true);
	assert.notEqual(proxyTag.validate(null, 'not-a-tag'), true);
	for (const name of ['socks5', 'socks5_username', 'socks5_password', 'artifact_proxy', 'nat_ip', 'max_connections', 'queue_budget_mb'])
		assert.equal(options.find(o => o.section === 'middle_end' && o.name === name), undefined, 'advanced Middle-End option leaked into Configuration: ' + name);

	assert.equal(options.find(o => o.section === 'performance'), undefined, 'Performance section belongs on Advanced Settings');
	assert.equal(options.find(o => o.section === 'upstream'), undefined, 'Upstream section belongs on Advanced Settings');
	assert.equal(options.find(o => o.section === 'metrics'), undefined, 'Metrics section belongs on Advanced Settings');

	const webGroup = root.querySelector('#telego-status-group-web');
	const middleEndGroup = root.querySelector('#telego-status-group-middleend');
	assert.ok(webGroup, 'WEB runtime status group exists');
	assert.ok(middleEndGroup, 'Middle-End runtime status group exists');

	if (initialStatus) {
		assert.equal(webGroup.hidden, !initialStatus.web_enabled, 'WEB runtime visibility follows backend status');
		assert.equal(middleEndGroup.hidden, !initialStatus.middleend_enabled, 'Middle-End runtime visibility follows backend status');
		assert.equal(root.querySelector('#telego-status-pid').textContent, '42');
		if (initialStatus.metrics_available) {
			assert.equal(root.querySelector('#telego-status-metrics').textContent, 'Running');
			assert.equal(root.querySelector('#telego-status-web-sessions').textContent, initialStatus.web_enabled ? '2' : '—');
			assert.equal(root.querySelector('#telego-status-web-streams').textContent, initialStatus.web_enabled ? '5' : '—');
			assert.equal(root.querySelector('#telego-status-me-links').textContent, initialStatus.middleend_enabled ? '4' : '—');
			assert.equal(root.querySelector('#telego-status-me-artifact').textContent, initialStatus.middleend_enabled ? 'Applied' : 'Disabled');
			assert.equal(root.querySelector('#telego-status-error').textContent, '');
		} else {
			assert.equal(root.querySelector('#telego-status-metrics').textContent, 'Error');
			assert.equal(root.querySelector('#telego-status-web-sessions').textContent, '—');
			assert.equal(root.querySelector('#telego-status-me-links').textContent, '—');
			assert.equal(root.querySelector('#telego-status-me-artifact').textContent, '—');
			assert.equal(root.querySelector('#telego-status-error').textContent, 'Metrics: Error (fetch-failed)');
		}
	} else {
		assert.equal(webGroup.hidden, true, 'WEB runtime stays hidden until backend status is available');
		assert.equal(middleEndGroup.hidden, true, 'Middle-End runtime stays hidden until backend status is available');
		assert.equal(root.querySelector('#telego-status-error').textContent, 'Unable to read telEgo status.');
	}
	assert.equal(typeof poll, 'function');

	if (initialStatus) {
		reply = { ...initialStatus, web_enabled: false, middleend_enabled: false };
		await poll();
		assert.equal(webGroup.hidden, true, 'poll hides WEB runtime when it becomes disabled');
		assert.equal(middleEndGroup.hidden, true, 'poll hides Middle-End runtime when it becomes disabled');

		reply = { ...initialStatus, web_enabled: true, middleend_enabled: true };
		await poll();
		assert.equal(webGroup.hidden, false, 'poll restores WEB runtime when it becomes enabled');
		assert.equal(middleEndGroup.hidden, false, 'poll restores Middle-End runtime when it becomes enabled');
	} else {
		await poll(); // RPC failures must not reject the polling callback.
	}
}

const healthyStatus = {
	running: true, pid: 42, uptime: 100,
	metrics_available: true, metrics_error: '',
	connections: 3, ips_active: 2, ips_tracked: 4, ips_blocked: 0,
	rx_bytes: 100, tx_bytes: 200,
	web_enabled: true, web_carrier: 'https-lanes', web_sessions_active: 2,
	web_streams_active: 5, web_websockets_active: 1, web_backend_dials_active: 0,
	web_pending_bytes: 1024, web_pending_items: 1, web_sessions_created_total: 10,
	web_sessions_closed_total: 8, web_carrier_retries_total: 1, web_backpressure_total: 0,
	middleend_enabled: true, middleend_admitting: 1, middleend_repairing: 0,
	middleend_links: 4, middleend_bindings: 3, middleend_repairs_active: 0,
	middleend_slot_failures_total: 0, middleend_artifact_applied: 1,
	middleend_artifact_pending: 0, middleend_artifact_refresh_failures: 0
};

(async () => {
	await check(null);
	await check(healthyStatus);
	await check(healthyStatus, 'cloudflare');
	await check(healthyStatus, 'direct_https');
	await check(healthyStatus, 'shared');
	await check({ ...healthyStatus, web_enabled: false });
	await check({ ...healthyStatus, middleend_enabled: false });
	await check({ ...healthyStatus, web_enabled: false, middleend_enabled: false });
	await check({ ...healthyStatus, metrics_available: false, metrics_error: 'fetch-failed' });
	await check(healthyStatus, 'disabled', '0');
	console.log('LuCI configuration tests passed');
})().catch(error => { console.error(error); process.exit(1); });
