const assert = require('node:assert/strict');
const fs = require('node:fs');

class Element {
	constructor(tag, attrs = {}, children = []) {
		this.tag = tag; this.attrs = attrs; this.style = {};
		this.children = Array.isArray(children) ? children : [children];
		this.classList = { add() {}, remove() {} };
	}
	querySelector(selector) {
		if (selector === '#' + this.attrs.id) return this;
		for (const child of this.children) {
			const found = child?.querySelector?.(selector);
			if (found) return found;
		}
		return null;
	}
}

async function check(initialStatus) {
	const options = [];
	let poll;
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
		GridSection: function() {},
		TypedSection: function() {}
	};
	form.Value.prototype = { renderWidget() { return new Element('input'); } };

	const view = new Function('form', 'rpc', 'uci', 'view', 'E', '_', 'L', 'document',
		fs.readFileSync('package/luci-app-telego/htdocs/resources/view/telego/config.js', 'utf8'))(
		form, { declare: () => () => reply ? Promise.resolve(reply) : Promise.reject(new Error('rpcd unavailable')) },
		{ load: async () => {}, get: () => '1' }, { extend: x => x },
		(tag, attrs, children) => new Element(tag, attrs, children), x => x,
		{ resolveDefault: (p, fallback) => p.catch(() => fallback), Poll: { add: fn => { poll = fn; } } },
		{ querySelector: () => null }
	);
	const root = await view.render();
	assert.ok(root.querySelector('#telego-config-pane'), 'configuration renders even without rpcd');

	const hostname = options.find(o => o.section === 'web_proxy' && o.name === 'hostname');
	assert.deepEqual(hostname.dependency, ['enabled', '1']);
	assert.equal(hostname.rmempty, false);
	assert.equal(hostname.retain, true);

	const certHost = options.find(o => o.section === 'tls_fronting' && o.name === 'cert_host');
	const spliceHost = options.find(o => o.section === 'tls_fronting' && o.name === 'splice_host');
	assert.equal(certHost.datatype, 'host', 'certificate source accepts loopback IP or hostname');
	assert.equal(spliceHost.datatype, 'host', 'splice target accepts loopback IP or hostname');

	for (const name of ['proxy_protocol', 'max_connections_per_ip', 'max_ips_per_user', 'ip_block_timeout', 'handshake_timeout', 'clock_sync_url'])
		assert.ok(options.find(o => o.section === 'general' && o.name === name), 'missing general option ' + name);

	const fakeCertSize = options.find(o => o.section === 'tls_fronting' && o.name === 'fake_cert_size');
	assert.equal(fakeCertSize.validate(null, '0'), true);
	assert.equal(fakeCertSize.validate(null, '256'), true);
	assert.equal(fakeCertSize.validate(null, '16384'), true);
	assert.notEqual(fakeCertSize.validate(null, '255'), true);
	assert.notEqual(fakeCertSize.validate(null, '16385'), true);

	assert.ok(options.find(o => o.section === 'web_proxy' && o.name === 'backend'));
	assert.ok(options.find(o => o.section === 'web_proxy' && o.name === 'num_event_loops'));

	const proxyTag = options.find(o => o.section === 'middle_end' && o.name === 'proxy_tag');
	assert.equal(proxyTag.validate(null, ''), true);
	assert.equal(proxyTag.validate(null, '0123456789abcdef0123456789abcdef'), true);
	assert.notEqual(proxyTag.validate(null, 'not-a-tag'), true);

	const maxConnections = options.find(o => o.section === 'middle_end' && o.name === 'max_connections');
	assert.equal(maxConnections.validate(null, '0'), true);
	assert.equal(maxConnections.validate(null, '1'), true);
	assert.equal(maxConnections.validate(null, '10000'), true);
	assert.notEqual(maxConnections.validate(null, '10001'), true);

	const queueBudget = options.find(o => o.section === 'middle_end' && o.name === 'queue_budget_mb');
	assert.equal(queueBudget.validate(null, '0'), true);
	assert.equal(queueBudget.validate(null, '2'), true);
	assert.equal(queueBudget.validate(null, '32'), true);
	assert.notEqual(queueBudget.validate(null, '1'), true);
	assert.notEqual(queueBudget.validate(null, '33'), true);

	if (initialStatus) {
		assert.equal(root.querySelector('#telego-status-pid').textContent, '42');
		if (initialStatus.metrics_available) {
			assert.equal(root.querySelector('#telego-status-metrics').textContent, 'Running');
			assert.equal(root.querySelector('#telego-status-web-sessions').textContent, '2');
			assert.equal(root.querySelector('#telego-status-web-streams').textContent, '5');
			assert.equal(root.querySelector('#telego-status-me-links').textContent, '4');
			assert.equal(root.querySelector('#telego-status-me-artifact').textContent, 'Applied');
			assert.equal(root.querySelector('#telego-status-error').textContent, '');
		} else {
			assert.equal(root.querySelector('#telego-status-metrics').textContent, 'Error');
			assert.equal(root.querySelector('#telego-status-web-sessions').textContent, '—');
			assert.equal(root.querySelector('#telego-status-me-links').textContent, '—');
			assert.equal(root.querySelector('#telego-status-me-artifact').textContent, '—');
			assert.equal(root.querySelector('#telego-status-error').textContent, 'Metrics: Error (fetch-failed)');
		}
	} else {
		assert.equal(root.querySelector('#telego-status-error').textContent, 'Unable to read telEgo status.');
	}
	assert.equal(typeof poll, 'function');
	await poll(); // RPC failures must not reject the polling callback.
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
	await check({ ...healthyStatus, metrics_available: false, metrics_error: 'fetch-failed' });
	console.log('LuCI configuration tests passed');
})().catch(error => { console.error(error); process.exit(1); });
