const assert = require('node:assert/strict');
const fs = require('node:fs');

class Element {
	constructor(tag, attrs = {}, children = []) {
		this.tag = tag;
		this.attrs = attrs || {};
		this.children = Array.isArray(children) ? children : [children];
		this.textContent = typeof children === 'string' ? children : '';
		this.disabled = attrs.disabled != null && attrs.disabled !== false;
		this.classList = {
			add: (...names) => {
				const set = new Set(String(this.attrs.class || '').split(/\s+/).filter(Boolean));
				for (const name of names) set.add(name);
				this.attrs.class = Array.from(set).join(' ');
			},
			remove: (...names) => {
				const set = new Set(String(this.attrs.class || '').split(/\s+/).filter(Boolean));
				for (const name of names) set.delete(name);
				this.attrs.class = Array.from(set).join(' ');
			},
			toggle: (name, enabled) => {
				const set = new Set(String(this.attrs.class || '').split(/\s+/).filter(Boolean));
				if (enabled) set.add(name); else set.delete(name);
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
	let shellActive = null;
	let diagnosticsActive = null;

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
						section, name, type, values: [], map, sectionObject: instance,
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
			if (config === 'telego' && section === 'performance') {
				if (Object.prototype.hasOwnProperty.call(state.performance || {}, option))
					return state.performance[option];
				return performanceDefaults[option] ?? null;
			}
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
	const view = new Function('form', 'uci', 'view', '_', 'L', 'appShell', 'E', source)(
		form, uci, { extend: x => x }, x => x,
		{
			resolveDefault: (p, fallback) => Promise.resolve(p).catch(() => fallback),
			toArray: value => value == null ? [] : (Array.isArray(value) ? value : [value])
		},
		appShell,
		(tag, attrs, children) => new Element(tag, attrs, children)
	);

	const loaded = await view.load();
	assert.equal(loaded, 'telego', 'Runtime route only needs the telEgo UCI package');

	const rendered = await view.render();
	return { options, sections, rendered, shellActive, diagnosticsActive, source };
}

function option(options, section, name) {
	return options.find(o => o.section === section && o.name === name);
}

(async () => {
	let result = await renderAdvanced({ middleEnd: '0' });
	let options = result.options;

	assert.equal(result.shellActive, 'diagnostics');
	assert.equal(result.diagnosticsActive, 'runtime');
	assert.ok(result.source.includes("_('Runtime & Diagnostics')"));
	assert.ok(!result.source.includes("uci.load('nginx_telego')"), 'Runtime route must not depend on ingress UCI after P5.4');

	for (const section of ['general', 'tls_fronting', 'web_proxy', 'middle_end'])
		assert.equal(result.sections.some(entry => entry.section === section), false,
			'feature-specific advanced section must stay out of global Runtime: ' + section);

	const performance = result.sections.find(entry => entry.section === 'performance');
	assert.ok(performance, 'Performance section exists');
	assert.match(performance.description, /profile/i, 'Performance explains the profile workflow');

	const profile = option(options, 'performance', '_profile');
	assert.ok(profile, 'Performance Profile control exists');
	assert.equal(typeof profile.write, 'undefined', 'profile is UI-only and must not write a synthetic UCI option');

	const profileWidget = profile.renderWidget('performance');
	const stateNode = profileWidget.querySelector('#telego-performance-profile-state');
	const defaultButton = profileWidget.querySelector('#telego-performance-profile-default');
	const mobileButton = profileWidget.querySelector('#telego-performance-profile-mobile-dpi');
	const iosButton = profileWidget.querySelector('#telego-performance-profile-ios-recovery');

	assert.equal(stateNode.attrs['data-profile'], 'default', 'package defaults are detected as Default profile');
	assert.equal(stateNode.textContent, 'Default');
	assert.equal(defaultButton.attrs['aria-pressed'], 'true');
	assert.equal(mobileButton.disabled, false);
	assert.equal(iosButton.disabled, false);

	mobileButton.attrs.click({ preventDefault() {} });
	assert.equal(option(options, 'performance', 'num_event_loops').formvalue('performance'), '0');
	assert.equal(option(options, 'performance', 'prefer_ip').formvalue('performance'), 'prefer-ipv4');
	assert.equal(option(options, 'performance', 'idle_timeout').formvalue('performance'), '5m');
	assert.equal(option(options, 'performance', 'max_write_buffer_mb').formvalue('performance'), '0');
	assert.equal(option(options, 'performance', 'dd_downlink_chunk').formvalue('performance'), '1200');
	assert.equal(option(options, 'performance', 'dd_downlink_delay').formvalue('performance'), '2ms');
	assert.equal(option(options, 'performance', 'client_silence_close').formvalue('performance'), '0s');
	assert.equal(stateNode.attrs['data-profile'], 'mobile_dpi');
	assert.equal(mobileButton.attrs['aria-pressed'], 'true');
	assert.ok(option(options, 'performance', 'dd_downlink_chunk').getUIElement('performance').validationCount > 0);

	const silence = option(options, 'performance', 'client_silence_close');
	silence.getUIElement('performance').setValue('7s');
	silence.onchange(null, 'performance', '7s');
	assert.equal(stateNode.attrs['data-profile'], 'custom', 'manual tuning changes the profile indicator to Custom');
	assert.equal(stateNode.textContent, 'Custom');

	iosButton.attrs.click({ preventDefault() {} });
	assert.equal(option(options, 'performance', 'dd_downlink_chunk').formvalue('performance'), '0');
	assert.equal(option(options, 'performance', 'dd_downlink_delay').formvalue('performance'), '0s');
	assert.equal(option(options, 'performance', 'client_silence_close').formvalue('performance'), '10s');
	assert.equal(stateNode.attrs['data-profile'], 'ios_recovery');

	defaultButton.attrs.click({ preventDefault() {} });
	assert.equal(option(options, 'performance', 'client_silence_close').formvalue('performance'), '0s');
	assert.equal(stateNode.attrs['data-profile'], 'default');

	assert.equal(option(options, 'performance', 'tcp_buffer_kb'), undefined, 'unsupported TCP buffer control must not be exposed');
	for (const name of ['num_event_loops', 'prefer_ip', 'idle_timeout', 'max_write_buffer_mb', 'dd_downlink_chunk', 'dd_downlink_delay', 'client_silence_close'])
		assert.ok(option(options, 'performance', name), 'missing Performance option ' + name);
	assert.ok(option(options, 'upstream', 'socks5'));
	for (const name of ['bind_to', 'path', 'diagnostics'])
		assert.ok(option(options, 'metrics', name), 'missing Metrics option ' + name);

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

	const middleEndProfile = option(options, 'performance', '_profile').renderWidget('performance');
	const blockedMobile = middleEndProfile.querySelector('#telego-performance-profile-mobile-dpi');
	assert.equal(blockedMobile.disabled, true, 'Mobile DPI preset is disabled while Middle-End is enabled');
	const beforeChunk = ddChunk.formvalue('performance');
	blockedMobile.attrs.click({ preventDefault() {} });
	assert.equal(ddChunk.formvalue('performance'), beforeChunk, 'blocked Mobile DPI click must not stage incompatible values');

	result = await renderAdvanced({
		middleEnd: '1',
		formValues: { performance: { dd_downlink_chunk: '0', dd_downlink_delay: '0s' } }
	});
	options = result.options;
	ddChunk = option(options, 'performance', 'dd_downlink_chunk');
	ddDelay = option(options, 'performance', 'dd_downlink_delay');
	assert.equal(ddChunk.validate('performance', '0'), true, 'Middle-End permits disabled DD shaping');
	assert.equal(ddDelay.validate('performance', '0s'), true, 'Middle-End permits disabled DD pacing');

	result = await renderAdvanced({
		middleEnd: '0',
		performance: {
			num_event_loops: '4',
			prefer_ip: 'prefer-ipv6',
			idle_timeout: '3m',
			max_write_buffer_mb: '8',
			dd_downlink_chunk: '0',
			dd_downlink_delay: '0s',
			client_silence_close: '0s'
		}
	});
	const customWidget = option(result.options, 'performance', '_profile').renderWidget('performance');
	assert.equal(customWidget.querySelector('#telego-performance-profile-state').attrs['data-profile'], 'custom',
		'non-profile UCI values are detected as Custom and are not rewritten');

	const css = fs.readFileSync('package/luci-app-telego/htdocs/css/telego.css', 'utf8');
	assert.match(css, /\.telego-performance-profile-grid\s*\{/);
	assert.match(css, /\.telego-performance-profile\.active/);
	assert.match(css, /#telego-performance-profile-state/);

	console.log('LuCI P5.5 Performance Profiles tests passed');
})().catch(error => { console.error(error); process.exit(1); });
