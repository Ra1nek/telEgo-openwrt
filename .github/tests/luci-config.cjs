const assert = require('node:assert/strict');
const fs = require('node:fs');

class Element {
	constructor(tag, attrs = {}, children = []) {
		this.tag = tag; this.attrs = attrs; this.style = {}; this.hidden = attrs.hidden === true;
		this.children = Array.isArray(children) ? children : [children];
		this.value = attrs.value || '';
		this.disabled = attrs.disabled != null;
		this.textContent = typeof children === 'string' ? children : '';
		this.innerHTML = '';
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
			contains: name => String(this.attrs.class || '').split(/\s+/).includes(name)
		};
		for (const child of this.children)
			if (child instanceof Element) child.parentNode = this;
	}
	get lastElementChild() {
		for (let i = this.children.length - 1; i >= 0; i--)
			if (this.children[i] instanceof Element) return this.children[i];
		return null;
	}
	appendChild(child) {
		if (child instanceof Element) child.parentNode = this;
		this.children.push(child);
		return child;
	}
	insertBefore(child, reference) {
		if (child instanceof Element) child.parentNode = this;
		const index = reference ? this.children.indexOf(reference) : -1;
		if (index < 0) this.children.push(child);
		else this.children.splice(index, 0, child);
		return child;
	}
	replaceChild(child, oldChild) {
		const index = this.children.indexOf(oldChild);
		if (index >= 0) {
			if (child instanceof Element) child.parentNode = this;
			oldChild.parentNode = null;
			this.children[index] = child;
		}
		return oldChild;
	}
	addEventListener(name, handler) { this.attrs[name] = handler; }
	setAttribute(name, value) { this.attrs[name] = value; }
	getAttribute(name) { return this.attrs[name]; }
	removeAttribute(name) { delete this.attrs[name]; }
	dispatchEvent() {}
	querySelector(selector) {
		const classes = String(this.attrs.class || '').split(/\s+/).filter(Boolean);
		if (selector === this.tag || selector === '#' + this.attrs.id || (selector.startsWith('.') && classes.includes(selector.slice(1)))) return this;
		for (const child of this.children) {
			const found = child?.querySelector?.(selector);
			if (found) return found;
		}
		return null;
	}
}

async function check(initialStatus, ingressMode = 'disabled', tlsFrontingEnabled = '1', ddChunkValue = '0', ddDelayValue = '0s') {
	const options = [];
	const sections = [];
	let removedSection = null;
	let removedContext = null;
	let poll;
	let modal;
	let reply = initialStatus;
	const qrPayloads = [];
	class Map {
		section(kind, section) {
			const instance = {
				anonymous: false, addremove: true, sortable: false,
				map: { readonly: false },
				tabs: [],
				tab(name, title) {
					this.tabs.push([name, title]);
				},
				option(type, name) {
					const option = {
						section, name, value() {},
						depends(field, value) { this.dependency = [field, value]; }
					};
					options.push(option);
					return option;
				},
				taboption(tab, type, name) {
					const option = this.option(type, name);
					option.tab = tab;
					return option;
				},
				super(method) {
					if (method !== 'renderRowActions')
						throw new Error('unexpected super call: ' + method);
					const actionBox = new Element('div', {}, [
						new Element('button', { 'class': 'cbi-button drag-handle' }, '☰'),
						new Element('button', { 'class': 'btn cbi-button cbi-button-edit' }, 'Edit'),
						new Element('button', { 'class': 'btn cbi-button cbi-button-remove' }, 'Delete')
					]);
					return new Element('td', { 'class': 'td cbi-section-actions' }, actionBox);
				}
			};
			sections.push({ section, instance });
			return instance;
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
		DummyValue: function() {},
		GridSection: function() {},
		TypedSection: function() {}
	};
	form.Value.prototype = { renderWidget() { return new Element('input'); } };
	form.GridSection.prototype.handleRemove = function(section_id) {
		removedSection = section_id;
		removedContext = this;
		return Promise.resolve();
	};

	const uci = {
		load: async () => {},
		get: (config, section, option) => {
			if (config === 'telego' && section === 'general' && option === 'enabled') return '1';
			if (config === 'telego' && section === 'general' && option === 'bind_to') return '0.0.0.0:2443';
			if (config === 'telego' && section === 'general' && option === 'public_host') return 'proxy.example.com';
			if (config === 'telego' && section === 'general' && option === 'public_port') return '';
			if (config === 'telego' && section === 'tls_fronting' && option === 'enabled') return tlsFrontingEnabled;
			if (config === 'telego' && section === 'tls_fronting' && option === 'mask_host') return 'ya.ru';
			if (config === 'telego' && section === 'performance' && option === 'dd_downlink_chunk') return ddChunkValue;
			if (config === 'telego' && section === 'performance' && option === 'dd_downlink_delay') return ddDelayValue;
			if (config === 'telego' && section === 'user1' && option === 'name') return 'aiser';
			if (config === 'telego' && section === 'user1' && option === 'secret') return '0123456789abcdef0123456789abcdef';
			if (config === 'telego' && section === 'new-user' && option === 'name') return '';
			if (config === 'telego' && section === 'new-user' && option === 'secret') return '';
			if (config === 'telego' && section === 'bad-user' && option === 'name') return 'broken';
			if (config === 'telego' && section === 'bad-user' && option === 'secret') return 'bad';
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
		addNotification: () => {},
		createHandlerFn: (ctx, method, ...bound) => function(ev) {
			return typeof method === 'function'
				? method.apply(ctx, [...bound, ev])
				: ctx[method](...bound, ev);
		}
	};
	const appShell = {
		wrap: (active, content, options) => {
			const root = new Element('div', { 'data-telego-section': active }, content);
			root.shellOptions = options || {};
			return root;
		},
		activate: (root, active) => { root.attrs['data-telego-section'] = active; }
	};
	const windowObject = {
		location: { hash: '' },
		history: { replaceState: (state, title, hash) => { windowObject.location.hash = hash; } }
	};
	const uqr = {
		renderSVG: (value, options) => {
			qrPayloads.push({ value, options });
			return '<svg data-test="telego-qr"></svg>';
		}
	};
	const view = new Function('form', 'rpc', 'ui', 'uci', 'view', 'E', '_', 'L', 'uqr', 'appShell', 'window', 'document',
		fs.readFileSync('package/luci-app-telego/htdocs/resources/view/telego/config.js', 'utf8'))(
		form, { declare: () => () => reply ? Promise.resolve(reply) : Promise.reject(new Error('rpcd unavailable')) },
		ui, uci, { extend: x => x },
		(tag, attrs, children) => new Element(tag, attrs, children), x => x,
		{ resolveDefault: (p, fallback) => p.catch(() => fallback), Poll: { add: fn => { poll = fn; } } },
		uqr, appShell, windowObject, { querySelector: () => null }
	);
	await view.load();
	const root = await view.render();
	assert.ok(root.querySelector('#telego-config-pane'), 'configuration renders even without rpcd');
	assert.equal(root.attrs['data-telego-section'], 'overview', 'unified shell opens on Overview by default');

	const hostname = options.find(o => o.section === 'web_proxy' && o.name === 'hostname');
	assert.deepEqual(hostname.dependency, ['enabled', '1']);
	assert.equal(hostname.rmempty, false);
	assert.equal(hostname.retain, true);

	const generalSection = sections.find(entry => entry.section === 'general').instance;
	assert.deepEqual(generalSection.tabs, [['basic', 'Basic'], ['advanced', 'Advanced']], 'MTProxy exposes contextual Basic and Advanced tabs');

	for (const name of ['public_host', 'public_port']) {
		const basic = options.find(o => o.section === 'general' && o.name === name);
		assert.ok(basic, 'missing basic general option ' + name);
		assert.equal(basic.tab, 'basic', 'basic MTProxy option must stay in the Basic tab: ' + name);
	}

	for (const name of ['proxy_protocol', 'max_connections_per_ip', 'max_ips_per_user', 'ip_block_timeout', 'handshake_timeout', 'clock_sync_url']) {
		const advanced = options.find(o => o.section === 'general' && o.name === name);
		assert.ok(advanced, 'missing contextual advanced MTProxy option ' + name);
		assert.equal(advanced.tab, 'advanced', 'MTProxy advanced option must be contextual: ' + name);
	}

	const publicHost = options.find(o => o.section === 'general' && o.name === 'public_host');
	const publicPort = options.find(o => o.section === 'general' && o.name === 'public_port');
	assert.equal(publicHost.datatype, 'host');
	assert.equal(publicPort.datatype, 'port');

	const secretOption = options.find(o => o.section === 'secret' && o.name === 'secret');
	assert.equal(secretOption.modalonly, true, 'base secret must not be rendered in the users grid');
	assert.equal(secretOption.password, true, 'base secret editor defaults to masked input');
	const secretEditor = secretOption.renderWidget('user1', 0, '0123456789abcdef0123456789abcdef');
	const secretInput = secretEditor.querySelector('input');
	assert.equal(secretInput.type, 'password', 'secret stays masked until explicit reveal');
	const revealButton = secretEditor.querySelector('#telego-secret-reveal-user1');
	revealButton.attrs.click.call(revealButton);
	assert.equal(secretInput.type, 'text', 'explicit reveal shows the secret');
	revealButton.attrs.click.call(revealButton);
	assert.equal(secretInput.type, 'password', 'second reveal action masks the secret again');

	const users = sections.find(entry => entry.section === 'secret').instance;
	assert.equal(users.addbtntitle, 'Add user');
	assert.equal(users.actionstitle, 'Actions');
	assert.equal(users.sortable, true, 'users remain reorderable');
	assert.equal(users.modaltitle('user1'), 'Edit user — aiser');
	assert.equal(users.modaltitle('new-user'), 'Add user');

	const secretStatus = options.find(o => o.section === 'secret' && o.name === '_secret_status');
	assert.ok(secretStatus, 'users grid exposes a non-sensitive secret status column');
	assert.equal(secretStatus.modalonly, false);
	const configuredBadge = secretStatus.textvalue('user1');
	const missingBadge = secretStatus.textvalue('new-user');
	const invalidBadge = secretStatus.textvalue('bad-user');
	assert.equal(configuredBadge.attrs['data-state'], 'configured');
	assert.equal(configuredBadge.children[0], 'Configured');
	assert.equal(missingBadge.attrs['data-state'], 'missing');
	assert.equal(missingBadge.children[0], 'Not configured');
	assert.equal(invalidBadge.attrs['data-state'], 'invalid');
	assert.ok(!JSON.stringify(configuredBadge).includes('0123456789abcdef0123456789abcdef'), 'users grid must never render the secret itself');
	assert.equal(options.find(o => o.section === 'secret' && o.name === '_links'), undefined, 'Connect belongs in row actions, not a table data column');

	const rowActions = users.renderRowActions('user1');
	const connectButton = rowActions.querySelector('.telego-user-connect');
	const editButton = rowActions.querySelector('.telego-user-edit');
	const deleteButton = rowActions.querySelector('.telego-user-delete');
	const reorderButton = rowActions.querySelector('.telego-user-reorder');
	assert.ok(connectButton, 'users grid has a Connect action');
	assert.ok(editButton, 'users grid keeps an Edit action');
	assert.ok(deleteButton, 'users grid has a guarded Delete action');
	assert.ok(reorderButton, 'users grid keeps the reorder handle');
	assert.equal(editButton.attrs.title, 'Edit user');
	connectButton.attrs.click({ preventDefault() {} });
	assert.ok(modal, 'Connect opens the connection modal');
	assert.deepEqual(modal.attrs.title, ['Connection Links — aiser'], 'connection modal uses the selected UCI section');

	const ddSecretOutput = modal.querySelector('#telego-proxy-dd-secret');
	const ddLinkOutput = modal.querySelector('#telego-proxy-dd-link');
	const eeSecretOutput = modal.querySelector('#telego-proxy-ee-secret');
	const eeLinkOutput = modal.querySelector('#telego-proxy-ee-link');
	const ddQr = modal.querySelector('#telego-proxy-dd-qr');
	const eeQr = modal.querySelector('#telego-proxy-ee-qr');
	const ddOpen = modal.querySelector('#telego-proxy-dd-open');
	const eeOpen = modal.querySelector('#telego-proxy-ee-open');
	assert.ok(modal.querySelector('#telego-proxy-session-note'), 'modal explains that endpoint edits are session-only');
	assert.equal(ddSecretOutput.value, 'dd0123456789abcdef0123456789abcdef');
	assert.equal(ddLinkOutput.value, 'tg://proxy?server=proxy.example.com&port=2443&secret=dd0123456789abcdef0123456789abcdef');
	assert.equal(ddOpen.attrs.href, ddLinkOutput.value);
	assert.equal(ddOpen.attrs['aria-disabled'], 'false');
	assert.equal(ddQr.attrs['data-state'], 'ready');
	assert.ok(qrPayloads.some(call => call.value === ddLinkOutput.value), 'DD QR payload is the complete Telegram link');
	assert.equal(qrPayloads.find(call => call.value === ddLinkOutput.value).options.ecLevel, 'M');
	if (tlsFrontingEnabled === '1') {
		assert.equal(modal.querySelector('#telego-proxy-tab-ee').disabled, false, 'EE tab must remain clickable when TLS Fronting is enabled');
		assert.equal(eeSecretOutput.value, 'ee0123456789abcdef0123456789abcdef79612e7275');
		assert.equal(eeLinkOutput.value, 'tg://proxy?server=proxy.example.com&port=2443&secret=ee0123456789abcdef0123456789abcdef79612e7275');
		assert.equal(eeOpen.attrs.href, eeLinkOutput.value);
		assert.equal(eeOpen.attrs['aria-disabled'], 'false');
		assert.equal(eeQr.attrs['data-state'], 'ready');
		assert.ok(qrPayloads.some(call => call.value === eeLinkOutput.value), 'EE QR payload is the complete Telegram link');
	} else {
		assert.equal(eeSecretOutput.value, '');
		assert.equal(eeLinkOutput.value, '');
		assert.equal(modal.querySelector('#telego-proxy-tab-ee').disabled, true);
		assert.equal(eeOpen.attrs['aria-disabled'], 'true');
		assert.equal(eeQr.attrs['data-state'], 'empty');
	}

	const ddPanel = modal.querySelector('#telego-proxy-panel-dd');
	const eePanel = modal.querySelector('#telego-proxy-panel-ee');
	assert.equal(ddPanel.hidden, false);
	assert.equal(eePanel.hidden, true);
	assert.equal(modal.querySelector('#telego-proxy-tab-dd').attrs['aria-selected'], 'true');
	assert.equal(modal.querySelector('#telego-proxy-tab-ee').attrs['aria-selected'], 'false');
	modal.querySelector('#telego-proxy-tab-ee').attrs.click();
	assert.equal(ddPanel.hidden, tlsFrontingEnabled === '1' ? true : false);
	assert.equal(eePanel.hidden, tlsFrontingEnabled === '1' ? false : true);
	assert.equal(modal.querySelector('#telego-proxy-tab-dd').attrs['aria-selected'], tlsFrontingEnabled === '1' ? 'false' : 'true');
	assert.equal(modal.querySelector('#telego-proxy-tab-ee').attrs['aria-selected'], tlsFrontingEnabled === '1' ? 'true' : 'false');

	const serverInput = modal.querySelector('#telego-proxy-public-server');
	const portInput = modal.querySelector('#telego-proxy-public-port');
	serverInput.value = '203.0.113.10';
	portInput.value = '443';
	serverInput.attrs.input();
	assert.equal(ddLinkOutput.value, 'tg://proxy?server=203.0.113.10&port=443&secret=dd0123456789abcdef0123456789abcdef');
	assert.equal(ddOpen.attrs.href, ddLinkOutput.value, 'Open Telegram follows session-only endpoint edits');
	assert.ok(qrPayloads.some(call => call.value === ddLinkOutput.value), 'QR refreshes after session-only endpoint edit');

	serverInput.value = '2001:db8::1';
	serverInput.attrs.input();
	assert.equal(ddLinkOutput.value, 'tg://proxy?server=2001%3Adb8%3A%3A1&port=443&secret=dd0123456789abcdef0123456789abcdef');

	serverInput.value = '[2001:db8::1]';
	serverInput.attrs.input();
	assert.equal(ddLinkOutput.value, 'tg://proxy?server=2001%3Adb8%3A%3A1&port=443&secret=dd0123456789abcdef0123456789abcdef');

	serverInput.value = 'пример.рф';
	serverInput.attrs.input();
	assert.equal(ddLinkOutput.value, 'tg://proxy?server=xn--e1afmkfd.xn--p1ai&port=443&secret=dd0123456789abcdef0123456789abcdef');

	for (const invalidServer of ['https://proxy.example.com', 'proxy.example.com/path', 'bad host', 'user@proxy.example.com']) {
		serverInput.value = invalidServer;
		serverInput.attrs.input();
		assert.equal(ddLinkOutput.value, '', 'invalid public server must not generate a DD link: ' + invalidServer);
		assert.equal(modal.querySelector('#telego-proxy-endpoint-error').hidden, false);
		assert.equal(ddOpen.attrs['aria-disabled'], 'true', 'invalid endpoint disables Open Telegram');
		assert.equal(ddQr.attrs['data-state'], 'empty', 'invalid endpoint clears the QR payload');
	}

	deleteButton.attrs.click({ preventDefault() {} });
	assert.deepEqual(modal.attrs.title, ['Delete user — aiser'], 'Delete requires an explicit confirmation dialog');
	const confirmDelete = modal.querySelector('#telego-user-delete-confirm');
	assert.ok(confirmDelete, 'delete confirmation has an explicit destructive action');
	await confirmDelete.attrs.click({ preventDefault() {} });
	assert.equal(removedSection, 'user1', 'confirmed deletion targets the selected UCI section');
	assert.equal(removedContext, users, 'confirmed deletion executes against the users GridSection, not a later form section');

	const tlsEnabled = options.find(o => o.section === 'tls_fronting' && o.name === 'enabled');
	assert.ok(tlsEnabled, 'TLS Fronting enable toggle exists');
	assert.equal(tlsEnabled.default, '1');
	assert.equal(tlsEnabled.validate(null, '1'), true);
	ingressMode === 'shared'
		? assert.notEqual(tlsEnabled.validate(null, '0'), true)
		: assert.equal(tlsEnabled.validate(null, '0'), true);

	const tlsSection = sections.find(entry => entry.section === 'tls_fronting').instance;
	const webSection = sections.find(entry => entry.section === 'web_proxy').instance;
	const middleEndSection = sections.find(entry => entry.section === 'middle_end').instance;
	for (const section of [tlsSection, webSection, middleEndSection])
		assert.deepEqual(section.tabs, [['basic', 'Basic'], ['advanced', 'Advanced']], 'feature section exposes contextual Basic and Advanced tabs');

	for (const name of ['mask_host', 'mask_port']) {
		const option = options.find(o => o.section === 'tls_fronting' && o.name === name);
		assert.equal(option.tab, 'basic');
		assert.deepEqual(option.dependency, ['enabled', '1'], 'basic TLS option visibility must follow enabled: ' + name);
		assert.equal(option.retain, true, 'hidden TLS value must survive disabled Save & Apply: ' + name);
	}

	for (const name of ['fake_cert_size', 'mask_sni_safelist', 'splice_proxy_protocol', 'splice_idle_timeout', 'enable_drs', 'enable_split_tls']) {
		const option = options.find(o => o.section === 'tls_fronting' && o.name === name);
		assert.ok(option, 'missing contextual TLS advanced option ' + name);
		assert.equal(option.tab, 'advanced');
		assert.deepEqual(option.dependency, ['enabled', '1']);
		assert.equal(option.retain, true);
	}
	for (const name of ['cert_host', 'cert_port', 'splice_host', 'splice_port']) {
		const option = options.find(o => o.section === 'tls_fronting' && o.name === name);
		if (ingressMode === 'cloudflare' || ingressMode === 'direct_https')
			assert.equal(option, undefined, 'external TLS ingress must hide local TLS endpoint ' + name);
		else {
			assert.ok(option, 'local TLS topology must expose contextual TLS endpoint ' + name);
			assert.equal(option.tab, 'advanced');
		}
	}
	const fakeCertSize = options.find(o => o.section === 'tls_fronting' && o.name === 'fake_cert_size');
	assert.equal(fakeCertSize.validate(null, '0'), true);
	assert.equal(fakeCertSize.validate(null, '256'), true);
	assert.equal(fakeCertSize.validate(null, '16384'), true);
	assert.notEqual(fakeCertSize.validate(null, '255'), true);

	for (const name of ['trusted_proxy_cidrs', 'backend', 'num_event_loops']) {
		const option = options.find(o => o.section === 'web_proxy' && o.name === name);
		assert.ok(option, 'missing contextual WEB advanced option ' + name);
		assert.equal(option.tab, 'advanced');
		assert.deepEqual(option.dependency, ['enabled', '1']);
		assert.equal(option.retain, true);
	}

	const middleEndEnabledOption = options.find(o => o.section === 'middle_end' && o.name === 'enabled');
	if (ddChunkValue === '0' && ddDelayValue === '0s')
		assert.equal(middleEndEnabledOption.validate(null, '1'), true);
	else
		assert.notEqual(middleEndEnabledOption.validate(null, '1'), true);

	const proxyTag = options.find(o => o.section === 'middle_end' && o.name === 'proxy_tag');
	assert.equal(proxyTag.retain, true, 'hidden Middle-End proxy tag must survive disabled Save & Apply');
	assert.equal(proxyTag.validate(null, ''), true);
	assert.equal(proxyTag.validate(null, '0123456789abcdef0123456789abcdef'), true);
	assert.notEqual(proxyTag.validate(null, 'not-a-tag'), true);
	for (const name of ['socks5', 'socks5_username', 'socks5_password', 'artifact_proxy', 'nat_ip', 'max_connections', 'queue_budget_mb']) {
		const option = options.find(o => o.section === 'middle_end' && o.name === name);
		assert.ok(option, 'missing contextual Middle-End advanced option ' + name);
		assert.equal(option.tab, 'advanced');
		assert.deepEqual(option.dependency, ['enabled', '1']);
		assert.equal(option.retain, true);
	}
	const maxConnections = options.find(o => o.section === 'middle_end' && o.name === 'max_connections');
	assert.equal(maxConnections.validate(null, '0'), true);
	assert.equal(maxConnections.validate(null, '10000'), true);
	assert.notEqual(maxConnections.validate(null, '10001'), true);
	const queueBudget = options.find(o => o.section === 'middle_end' && o.name === 'queue_budget_mb');
	assert.equal(queueBudget.validate(null, '0'), true);
	assert.equal(queueBudget.validate(null, '32'), true);
	assert.notEqual(queueBudget.validate(null, '33'), true);

	assert.equal(options.find(o => o.section === 'performance'), undefined, 'Performance tuning stays on Diagnostics, not MTProxy configuration');
	assert.equal(options.find(o => o.section === 'upstream'), undefined, 'Upstream tuning stays on Diagnostics');
	assert.equal(options.find(o => o.section === 'metrics'), undefined, 'Metrics configuration stays on Diagnostics');

	assert.equal(root.querySelector('#telego-status-group-web'), null, 'detailed WEB runtime moved to Diagnostics');
	assert.equal(root.querySelector('#telego-status-group-middleend'), null, 'detailed Middle-End runtime moved to Diagnostics');
	assert.ok(root.querySelector('#telego-status-state'), 'Overview keeps the service health summary');
	assert.ok(root.querySelector('#telego-status-connections'), 'Overview keeps the active connection summary');

	if (initialStatus) {
		assert.equal(root.querySelector('#telego-status-state').textContent, 'Running');
		if (initialStatus.metrics_available) {
			assert.equal(root.querySelector('#telego-status-metrics').textContent, 'Running');
			assert.equal(root.querySelector('#telego-status-connections').textContent, String(initialStatus.connections));
			assert.equal(root.querySelector('#telego-status-error').textContent, '');
		} else {
			assert.equal(root.querySelector('#telego-status-metrics').textContent, 'Error');
			assert.equal(root.querySelector('#telego-status-connections').textContent, '—');
			assert.equal(root.querySelector('#telego-status-error').textContent, 'Metrics: Error (fetch-failed)');
		}
	} else {
		assert.equal(root.querySelector('#telego-status-error').textContent, 'Unable to read telEgo status.');
	}
	assert.equal(typeof poll, 'function');

	if (initialStatus) {
		reply = null;
		await poll();
		assert.equal(root.querySelector('#telego-status-state').textContent, 'Unavailable', 'RPC failure marks Overview unavailable');
		assert.equal(root.querySelector('#telego-status-connections').textContent, '—', 'RPC failure clears stale counters');
		assert.equal(root.querySelector('#telego-status-error').textContent, 'Unable to read telEgo status.');

		reply = initialStatus;
		await poll();
		assert.equal(root.querySelector('#telego-status-state').textContent, 'Running', 'Overview recovers after RPC returns');
		assert.equal(
			root.querySelector('#telego-status-error').textContent,
			initialStatus.metrics_available ? '' : 'Metrics: Error (' + String(initialStatus.metrics_error || 'unavailable') + ')',
			'RPC recovery restores the current metrics state'
		);
	} else {
		await poll();
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
	await check(healthyStatus, 'disabled', '1', '1200', '5ms');
	const connectionCss = fs.readFileSync('package/luci-app-telego/htdocs/css/telego.css', 'utf8');
assert.match(connectionCss, /\.telego-connection-layout\s*\{/);
assert.match(connectionCss, /@media screen and \(max-width: 640px\)/);
assert.match(connectionCss, /\.telego-connection-qr svg/);
assert.match(connectionCss, /#cbi-telego-secret \.cbi-section-actions > div/);
assert.match(connectionCss, /\.telego-user-secret-status\.is-configured/);
assert.match(connectionCss, /#cbi-telego-secret \.cbi-section-table-row:not\(\.placeholder\)/);
assert.match(connectionCss, /\.telego-overview-heading/);
assert.match(connectionCss, /\.telego-status-grid/);
console.log('LuCI configuration tests passed');
})().catch(error => { console.error(error); process.exit(1); });
