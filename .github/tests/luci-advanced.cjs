const assert = require('node:assert/strict');
const fs = require('node:fs');

async function renderAdvanced(state = {}) {
	const options = [];
	const sections = [];
	const formValues = state.formValues || {};
	let shellActive = null;
	let diagnosticsActive = null;

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
		load: async config => config,
		get: (config, section, option) => {
			if (config === 'telego' && section === 'middle_end' && option === 'enabled')
				return state.middleEnd ?? '1';
			return null;
		}
	};

	const source = fs.readFileSync('package/luci-app-telego/htdocs/resources/view/telego/advanced.js', 'utf8');
	const appShell = {
		wrap: (active, content, options) => {
			shellActive = active;
			return { content, options };
		},
		diagnosticsNav: active => {
			diagnosticsActive = active;
			return { active };
		}
	};
	const view = new Function('form', 'uci', 'view', '_', 'L', 'appShell', source)(
		form, uci, { extend: x => x }, x => x,
		{
			resolveDefault: (p, fallback) => Promise.resolve(p).catch(() => fallback),
			toArray: value => value == null ? [] : (Array.isArray(value) ? value : [value])
		},
		appShell
	);

	const loaded = await view.load();
	assert.equal(loaded, 'telego', 'legacy Runtime route only needs the telEgo UCI package');

	const rendered = await view.render();
	return { options, sections, rendered, shellActive, diagnosticsActive, source };
}

function option(options, section, name) {
	return options.find(o => o.section === section && o.name === name);
}

(async () => {
	let result = await renderAdvanced();
	let options = result.options;

	assert.equal(result.shellActive, 'diagnostics');
	assert.equal(result.diagnosticsActive, 'runtime');
	assert.ok(result.source.includes("_('Runtime & Diagnostics')"));
	assert.ok(!result.source.includes("uci.load('nginx_telego')"), 'Runtime route must not depend on ingress UCI after P5.4');

	for (const section of ['general', 'tls_fronting', 'web_proxy', 'middle_end'])
		assert.equal(result.sections.some(entry => entry.section === section), false,
			'feature-specific advanced section must move out of global Runtime: ' + section);

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

	result = await renderAdvanced({
		middleEnd: '0',
		formValues: { performance: { dd_downlink_chunk: '1200', dd_downlink_delay: '2ms' } }
	});
	options = result.options;
	ddChunk = option(options, 'performance', 'dd_downlink_chunk');
	ddDelay = option(options, 'performance', 'dd_downlink_delay');
	assert.equal(ddDelay.validate('performance', '2ms'), true);
	assert.equal(ddDelay.validate('performance', '1s'), true);
	assert.notEqual(ddChunk.validate('performance', '0'), true);

	result = await renderAdvanced({
		middleEnd: '0',
		formValues: { performance: { dd_downlink_chunk: '0', dd_downlink_delay: '0s' } }
	});
	options = result.options;
	ddChunk = option(options, 'performance', 'dd_downlink_chunk');
	ddDelay = option(options, 'performance', 'dd_downlink_delay');
	assert.equal(ddChunk.validate('performance', '0'), true);
	assert.equal(ddDelay.validate('performance', '0s'), true);

	result = await renderAdvanced({
		middleEnd: '1',
		formValues: { performance: { dd_downlink_chunk: '1200', dd_downlink_delay: '2ms' } }
	});
	options = result.options;
	ddChunk = option(options, 'performance', 'dd_downlink_chunk');
	ddDelay = option(options, 'performance', 'dd_downlink_delay');
	assert.notEqual(ddChunk.validate('performance', '1200'), true, 'Middle-End rejects DD chunk shaping');
	assert.notEqual(ddDelay.validate('performance', '2ms'), true, 'Middle-End rejects DD delay shaping');

	result = await renderAdvanced({
		middleEnd: '1',
		formValues: { performance: { dd_downlink_chunk: '0', dd_downlink_delay: '0s' } }
	});
	options = result.options;
	ddChunk = option(options, 'performance', 'dd_downlink_chunk');
	ddDelay = option(options, 'performance', 'dd_downlink_delay');
	assert.equal(ddChunk.validate('performance', '0'), true, 'Middle-End permits disabled DD shaping');
	assert.equal(ddDelay.validate('performance', '0s'), true, 'Middle-End permits disabled DD pacing');

	console.log('LuCI P5.4 Runtime and contextual Advanced tests passed');
})().catch(error => { console.error(error); process.exit(1); });
