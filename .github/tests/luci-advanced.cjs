const assert = require('node:assert/strict');
const fs = require('node:fs');

async function renderAdvanced(state = {}) {
	const options = [];
	const sections = [];
	const formValues = state.formValues || {};
	class Map {
		lookupOption(name, section) {
			return options.filter(option => option.name === name && option.section === section);
		}
		section(kind, section, title) {
			sections.push({ section, title });
			const map = this;
			return {
				section,
				option(type, name) {
					const option = {
						section, name, type, values: [], map,
						value(value, label) { this.values.push([value, label]); },
						formvalue(sectionId) {
							const values = formValues[sectionId] || formValues[section] || {};
							return Object.prototype.hasOwnProperty.call(values, name) ? values[name] : this.default;
						}
					};
					options.push(option);
					return option;
				}
			};
		}
		render() { return Promise.resolve({ options, sections }); }
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
		load: async () => {},
		get: (config, section, option) => {
			if (config === 'telego' && section === 'tls_fronting' && option === 'enabled')
				return state.tls ?? '1';
			if (config === 'telego' && section === 'web_proxy' && option === 'enabled')
				return state.web ?? '1';
			if (config === 'telego' && section === 'middle_end' && option === 'enabled')
				return state.middleEnd ?? '1';
			if (config === 'nginx_telego' && section === 'shared' && option === 'enabled')
				return state.ingress === 'shared' ? '1' : '0';
			if (config === 'nginx_telego' && section === 'cloudflare' && option === 'enabled')
				return state.ingress === 'cloudflare' ? '1' : '0';
			if (config === 'nginx_telego' && section === 'direct_https' && option === 'enabled')
				return state.ingress === 'direct_https' ? '1' : '0';
			return null;
		}
	};
	const source = fs.readFileSync('package/luci-app-telego/htdocs/resources/view/telego/advanced.js', 'utf8');
	const view = new Function('form', 'uci', 'view', '_', 'L', source)(
		form, uci, { extend: x => x }, x => x,
		{
			resolveDefault: (p, fallback) => Promise.resolve(p).catch(() => fallback),
			toArray: value => value == null ? [] : (Array.isArray(value) ? value : [value])
		}
	);
	await view.load();
	const rendered = await view.render();
	return { options, sections, rendered };
}

function option(options, section, name) {
	return options.find(o => o.section === section && o.name === name);
}

(async () => {
	let result = await renderAdvanced();
	let options = result.options;

	for (const name of ['proxy_protocol', 'max_connections_per_ip', 'max_ips_per_user', 'ip_block_timeout', 'handshake_timeout', 'clock_sync_url'])
		assert.ok(option(options, 'general', name), 'missing advanced MTProxy option ' + name);

	for (const name of ['cert_host', 'cert_port', 'fake_cert_size', 'mask_sni_safelist', 'splice_host', 'splice_port', 'splice_proxy_protocol', 'splice_idle_timeout', 'enable_drs', 'enable_split_tls'])
		assert.ok(option(options, 'tls_fronting', name), 'missing advanced TLS option ' + name);

	const fakeCertSize = option(options, 'tls_fronting', 'fake_cert_size');
	assert.equal(fakeCertSize.validate(null, '0'), true);
	assert.equal(fakeCertSize.validate(null, '256'), true);
	assert.equal(fakeCertSize.validate(null, '16384'), true);
	assert.notEqual(fakeCertSize.validate(null, '255'), true);
	assert.notEqual(fakeCertSize.validate(null, '16385'), true);

	for (const name of ['trusted_proxy_cidrs', 'backend', 'num_event_loops'])
		assert.ok(option(options, 'web_proxy', name), 'missing advanced WEB option ' + name);

	for (const name of ['socks5', 'socks5_username', 'socks5_password', 'artifact_proxy', 'nat_ip', 'max_connections', 'queue_budget_mb'])
		assert.ok(option(options, 'middle_end', name), 'missing advanced Middle-End option ' + name);

	const maxConnections = option(options, 'middle_end', 'max_connections');
	assert.equal(maxConnections.validate(null, '0'), true);
	assert.equal(maxConnections.validate(null, '1'), true);
	assert.equal(maxConnections.validate(null, '10000'), true);
	assert.notEqual(maxConnections.validate(null, '10001'), true);

	const queueBudget = option(options, 'middle_end', 'queue_budget_mb');
	assert.equal(queueBudget.validate(null, '0'), true);
	assert.equal(queueBudget.validate(null, '2'), true);
	assert.equal(queueBudget.validate(null, '32'), true);
	assert.notEqual(queueBudget.validate(null, '1'), true);
	assert.notEqual(queueBudget.validate(null, '33'), true);

	assert.equal(option(options, 'performance', 'tcp_buffer_kb'), undefined, 'unsupported TCP buffer control must not be exposed');
	for (const name of ['num_event_loops', 'prefer_ip', 'idle_timeout', 'max_write_buffer_mb', 'dd_downlink_chunk', 'dd_downlink_delay', 'client_silence_close'])
		assert.ok(option(options, 'performance', name), 'missing Performance option ' + name);
	assert.ok(option(options, 'upstream', 'socks5'));
	for (const name of ['bind_to', 'path', 'diagnostics'])
		assert.ok(option(options, 'metrics', name), 'missing Metrics option ' + name);

	result = await renderAdvanced({ middleEnd: '0' });
	options = result.options;
	let ddChunk = option(options, 'performance', 'dd_downlink_chunk');
	let ddDelay = option(options, 'performance', 'dd_downlink_delay');
	assert.equal(ddChunk.validate('performance', '0'), true);
	assert.equal(ddChunk.validate('performance', '1200'), true);
	assert.equal(ddChunk.validate('performance', '65536'), true);
	assert.notEqual(ddChunk.validate('performance', '255'), true);
	assert.notEqual(ddChunk.validate('performance', '65537'), true);
	assert.equal(ddDelay.validate('performance', '0s'), true);
	assert.notEqual(ddDelay.validate('performance', '500us'), true);
	assert.notEqual(ddDelay.validate('performance', '2ms'), true);
	assert.notEqual(ddDelay.validate('performance', '-1ms'), true);
	assert.notEqual(ddDelay.validate('performance', '2.5ms'), true);
	assert.notEqual(ddDelay.validate('performance', '2s'), true);
	assert.notEqual(ddDelay.validate('performance', '999999999999999999999999ms'), true);

	result = await renderAdvanced({ middleEnd: '0', formValues: { performance: { dd_downlink_chunk: '1200', dd_downlink_delay: '2ms' } } });
	options = result.options;
	ddChunk = option(options, 'performance', 'dd_downlink_chunk');
	ddDelay = option(options, 'performance', 'dd_downlink_delay');
	assert.equal(ddDelay.validate('performance', '2ms'), true);
	assert.equal(ddDelay.validate('performance', '1s'), true);
	assert.notEqual(ddChunk.validate('performance', '0'), true);

	result = await renderAdvanced({ middleEnd: '0', formValues: { performance: { dd_downlink_chunk: '0', dd_downlink_delay: '0s' } } });
	options = result.options;
	ddChunk = option(options, 'performance', 'dd_downlink_chunk');
	ddDelay = option(options, 'performance', 'dd_downlink_delay');
	assert.equal(ddChunk.validate('performance', '0'), true);
	assert.equal(ddDelay.validate('performance', '0s'), true);

	result = await renderAdvanced({ middleEnd: '1', formValues: { performance: { dd_downlink_chunk: '1200', dd_downlink_delay: '2ms' } } });
	options = result.options;
	ddChunk = option(options, 'performance', 'dd_downlink_chunk');
	ddDelay = option(options, 'performance', 'dd_downlink_delay');
	assert.notEqual(ddChunk.validate('performance', '1200'), true, 'Middle-End rejects DD chunk shaping');
	assert.notEqual(ddDelay.validate('performance', '2ms'), true, 'Middle-End rejects DD delay shaping');

	result = await renderAdvanced({ middleEnd: '1', formValues: { performance: { dd_downlink_chunk: '0', dd_downlink_delay: '0s' } } });
	options = result.options;
	ddChunk = option(options, 'performance', 'dd_downlink_chunk');
	ddDelay = option(options, 'performance', 'dd_downlink_delay');
	assert.equal(ddChunk.validate('performance', '0'), true, 'Middle-End permits disabled DD shaping');
	assert.equal(ddDelay.validate('performance', '0s'), true, 'Middle-End permits disabled DD pacing');

	result = await renderAdvanced({ ingress: 'direct_https' });
	options = result.options;
	for (const name of ['cert_host', 'cert_port', 'splice_host', 'splice_port'])
		assert.equal(option(options, 'tls_fronting', name), undefined, 'external TLS ingress must hide local TLS endpoint ' + name);
	assert.ok(option(options, 'tls_fronting', 'fake_cert_size'));

	result = await renderAdvanced({ tls: '0', web: '0', middleEnd: '0' });
	options = result.options;
	assert.ok(option(options, 'tls_fronting', '_feature_note'));
	assert.equal(option(options, 'tls_fronting', 'fake_cert_size'), undefined);
	assert.ok(option(options, 'web_proxy', '_feature_note'));
	assert.equal(option(options, 'web_proxy', 'backend'), undefined);
	assert.ok(option(options, 'middle_end', '_feature_note'));
	assert.equal(option(options, 'middle_end', 'max_connections'), undefined);
	assert.ok(option(options, 'performance', 'dd_downlink_chunk'), 'global advanced runtime controls remain available');

	for (const section of ['general', 'tls_fronting', 'web_proxy', 'middle_end'])
		assert.equal(option(result.options, section, 'enabled'), undefined, 'feature toggles stay on Configuration: ' + section);

	console.log('LuCI Advanced Settings tests passed');
})().catch(error => { console.error(error); process.exit(1); });
