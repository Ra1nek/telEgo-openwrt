const assert = require('node:assert/strict');
const fs = require('node:fs');

const options = [];
const sections = [];
const notifications = [];
const rpcCalls = [];
const store = {
	nginx_telego: {
		shared: { enabled: '0', hostname: '', certificate: '', certificate_key: '' },
		cloudflare: { enabled: '0', hostname: '' },
		direct_https: { enabled: '0', hostname: '', certificate: '', certificate_key: '', luci_https_port: '10443', split_dns_address: '' },
		fallback: { manage: '1' }
	},
	telego: {
		general: { enabled: '1', bind_to: '0.0.0.0:443' },
		web_proxy: {
			enabled: '1', bind_to: '127.0.0.1:8080', hostname: 'web.example.com',
			trusted_proxy_cidrs: ['127.0.0.1/32']
		},
		tls_fronting: {
			mask_host: 'web.example.com', cert_host: '127.0.0.1', cert_port: '8444',
			splice_host: '127.0.0.1', splice_port: '8443', splice_proxy_protocol: '2'
		}
	}
};

const firewallStatus = {
	ok: true,
	profile_enabled: false,
	section_state: 'owned',
	managed_match: true,
	wan_zone_count: 1,
	wan_input: 'reject',
	foreign_wan443: '',
	pending_changes: false,
	error: ''
};

const certificateStatus = {
	ok: true,
	profile: 'direct_https',
	profile_error: '',
	managed_tls: true,
	hostname: 'web.example.com',
	certificate: '/etc/ssl/acme/web.example.com.fullchain.crt',
	certificate_key: '/etc/ssl/acme/web.example.com.key',
	certificate_state: 'valid',
	key_state: 'valid',
	key_match: '1',
	hostname_match: '1',
	expiry_state: 'ok',
	not_after: 'Oct 20 00:00:00 2026 GMT',
	fingerprint_sha256: 'AA:BB',
	acme_managed: true,
	openssl_available: true,
	error: ''
};

const uci = {
	load: async config => config,
	get: (config, section, option) => store[config]?.[section]?.[option],
	set: (config, section, option, value) => {
		store[config] ??= {};
		store[config][section] ??= {};
		store[config][section][option] = value;
	},
	unset: (config, section, option) => {
		if (store[config]?.[section]) delete store[config][section][option];
	}
};

const rpc = {
	declare: spec => {
		if (spec.method === 'firewall_status')
			return async () => {
				rpcCalls.push('firewall_status');
				return firewallStatus;
			};
		if (spec.method === 'firewall_preflight')
			return async () => {
				rpcCalls.push('firewall_preflight');
				return { ok: true, message: 'preflight passed', error: '' };
			};
		if (spec.method === 'certificate_status')
			return async () => {
				rpcCalls.push('certificate_status');
				return certificateStatus;
			};
		if (spec.method === 'certificate_preflight')
			return async () => {
				rpcCalls.push('certificate_preflight');
				return { ok: true, message: 'certificate preflight passed; nginx -t succeeded', error: '' };
			};
		throw new Error('unexpected RPC method ' + spec.method);
	}
};

const ui = {
	addNotification: (title, node, style) => notifications.push({ title, node, style })
};

class Map {
	constructor(config, title, description) {
		this.config = config; this.title = title; this.description = description;
	}
	section(kind, section, title) {
		sections.push({ section, title });
		return {
			section, title, anonymous: false, addremove: true,
			option(type, name) {
				const option = {
					section, name, type, values: [], dependencies: [],
					value(value, label) { this.values.push([value, label]); },
					depends(field, value) { this.dependencies.push([field, value]); }
				};
				options.push(option);
				return option;
			}
		};
	}
	render() { return Promise.resolve({ config: this.config }); }
}

const form = {
	Map,
	TypedSection: function() {},
	ListValue: function() {},
	DummyValue: function() {},
	Value: function() {},
	Flag: function() {},
	Button: function() {}
};

global.L = {
	resolveDefault: (promise, fallback) => Promise.resolve(promise).catch(() => fallback)
};
global.E = (tag, attrs, children) => ({ tag, attrs: attrs || {}, children });

const ingress = new Function('form', 'rpc', 'ui', 'uci', 'view', '_',
	fs.readFileSync('package/luci-app-telego/htdocs/resources/view/telego/ingress.js', 'utf8'))(
	form, rpc, ui, uci, { extend: x => x }, x => x
);

(async () => {
	const loaded = await ingress.load();
	assert.equal(loaded[2], firewallStatus);
	assert.equal(loaded[3], certificateStatus);
	const rendered = await ingress.render(loaded);
	assert.equal(rendered.config, 'nginx_telego');
	assert.ok(rpcCalls.includes('firewall_status'));
	assert.ok(rpcCalls.includes('certificate_status'));
	assert.deepEqual(sections, [{ section: 'shared', title: 'Ingress Profile' }],
		'Native Shared-Port options must not render as a separate always-visible card');

	const mode = options.find(o => o.name === '_mode');
	assert.ok(mode, 'ingress mode selector exists');
	assert.deepEqual(mode.values.map(v => v[0]), ['disabled', 'direct_https', 'cloudflare', 'shared']);
	assert.equal(mode.cfgvalue(), 'disabled');
	assert.notEqual(mode.validate(null, 'direct_https'), true, 'Direct HTTPS rejects MTProxy on public TCP/443');
	store.telego.general.bind_to = '0.0.0.0:9443';
	assert.equal(mode.validate(null, 'direct_https'), true, 'Direct HTTPS accepts MTProxy on another port');
	store.telego.web_proxy.enabled = '0';
	assert.notEqual(mode.validate(null, 'cloudflare'), true, 'managed ingress rejects a broken telEgo WEB contract');
	store.telego.web_proxy.enabled = '1';

	store.nginx_telego.direct_https.enabled = '1';
	assert.equal(mode.cfgvalue(), 'direct_https');
	store.nginx_telego.cloudflare.enabled = '1';
	assert.equal(mode.cfgvalue(), 'disabled', 'conflicting state is never presented as an active profile');
	store.nginx_telego.direct_https.enabled = '0';
	store.nginx_telego.cloudflare.enabled = '0';

	mode.write(null, 'direct_https');
	assert.equal(store.nginx_telego.direct_https.enabled, '1');
	assert.equal(store.nginx_telego.cloudflare.enabled, '0');
	assert.equal(store.nginx_telego.shared.enabled, '0');
	mode.write(null, 'shared');
	assert.equal(store.nginx_telego.direct_https.enabled, '0');
	assert.equal(store.nginx_telego.cloudflare.enabled, '0');
	assert.equal(store.nginx_telego.shared.enabled, '1');
	mode.write(null, 'cloudflare');
	assert.equal(store.nginx_telego.direct_https.enabled, '0');
	assert.equal(store.nginx_telego.cloudflare.enabled, '1');
	assert.equal(store.nginx_telego.shared.enabled, '0');
	mode.write(null, 'disabled');
	assert.equal(store.nginx_telego.direct_https.enabled, '0');
	assert.equal(store.nginx_telego.cloudflare.enabled, '0');
	assert.equal(store.nginx_telego.shared.enabled, '0');

	const managed = options.find(o => o.name === '_managed_output');
	assert.ok(managed.cfgvalue().includes('/etc/nginx/conf.d/20-telego-core.conf'));
	assert.ok(managed.cfgvalue().includes('/etc/nginx/conf.d/80-telego-ingress.conf'));
	assert.ok(managed.cfgvalue().includes('/etc/nginx/conf.d/85-telego-fallback.conf'));

	const directHost = options.find(o => o.name === 'direct_https_hostname');
	assert.deepEqual(directHost.dependencies, [['_mode', 'direct_https']]);
	assert.equal(directHost.validate(null, ''), true);
	assert.equal(directHost.validate(null, 'web.example.com'), true);
	assert.notEqual(directHost.validate(null, 'other.example.com'), true);
	directHost.write(null, 'web.example.com');
	assert.equal(store.nginx_telego.direct_https.hostname, 'web.example.com');
	directHost.remove();
	assert.equal(store.nginx_telego.direct_https.hostname, undefined);

	for (const name of ['direct_https_certificate', 'direct_https_certificate_key']) {
		const option = options.find(o => o.name === name);
		assert.deepEqual(option.dependencies, [['_mode', 'direct_https']]);
		assert.equal(option.validate(null, '/etc/ssl/telego.pem'), true);
		assert.notEqual(option.validate(null, ''), true);
		assert.notEqual(option.validate(null, 'relative.pem'), true);
		assert.notEqual(option.validate(null, '/etc/ssl/bad path.pem'), true);
	}

	const directCert = options.find(o => o.name === 'direct_https_certificate');
	directCert.write(null, '/etc/ssl/direct.pem');
	assert.equal(store.nginx_telego.direct_https.certificate, '/etc/ssl/direct.pem');
	directCert.remove();
	assert.equal(store.nginx_telego.direct_https.certificate, undefined);

	const luciPort = options.find(o => o.name === 'direct_https_luci_port');
	assert.deepEqual(luciPort.dependencies, [['_mode', 'direct_https']]);
	assert.equal(luciPort.cfgvalue(), '10443');
	assert.notEqual(luciPort.validate(null, '443'), true);
	assert.equal(luciPort.validate(null, '10443'), true);
	luciPort.write(null, '11443');
	assert.equal(store.nginx_telego.direct_https.luci_https_port, '11443');
	store.nginx_telego.direct_https.luci_https_port = '10443';

	const splitDns = options.find(o => o.name === 'direct_https_split_dns_address');
	assert.deepEqual(splitDns.dependencies, [['_mode', 'direct_https']]);
	assert.equal(splitDns.cfgvalue(), '');
	splitDns.write(null, '192.168.88.1');
	assert.equal(store.nginx_telego.direct_https.split_dns_address, '192.168.88.1');
	splitDns.remove();
	assert.equal(store.nginx_telego.direct_https.split_dns_address, undefined);

	const portOwnership = options.find(o => o.name === '_direct_https_ports');
	assert.deepEqual(portOwnership.dependencies, [['_mode', 'direct_https']]);
	assert.ok(portOwnership.cfgvalue().includes('WEB/Nginx: :443'));
	assert.ok(portOwnership.cfgvalue().includes('LuCI/uhttpd: :10443'));
	assert.ok(portOwnership.cfgvalue().includes('MTProxy: 0.0.0.0:9443'));

	const firewall = options.find(o => o.name === '_firewall_status');
	assert.deepEqual(firewall.dependencies, [['_mode', 'direct_https']]);
	assert.ok(firewall.cfgvalue().includes('Owned and in sync'));
	assert.ok(firewall.cfgvalue().includes('WAN input: reject'));
	assert.ok(firewall.cfgvalue().includes('Foreign WAN TCP/443: none'));

	const preflight = options.find(o => o.name === '_firewall_preflight');
	assert.deepEqual(preflight.dependencies, [['_mode', 'direct_https']]);
	const preflightResult = await preflight.onclick();
	assert.equal(preflightResult.ok, true);
	assert.ok(rpcCalls.includes('firewall_preflight'));
	assert.equal(notifications.at(-1).style, 'info');

	const certificate = options.find(o => o.name === '_certificate_status');
	assert.deepEqual(certificate.dependencies, [['_mode', 'direct_https'], ['_mode', 'shared']]);
	assert.ok(certificate.cfgvalue().includes('Certificate, key and hostname match'));
	assert.ok(certificate.cfgvalue().includes('Valid for more than 30 days'));
	assert.ok(certificate.cfgvalue().includes('OpenWrt ACME path detected'));

	const paths = options.find(o => o.name === '_certificate_paths');
	assert.ok(paths.cfgvalue().includes('/etc/ssl/acme/web.example.com.fullchain.crt'));
	assert.ok(paths.cfgvalue().includes('/etc/ssl/acme/web.example.com.key'));

	const fingerprint = options.find(o => o.name === '_certificate_fingerprint');
	assert.equal(fingerprint.cfgvalue(), 'AA:BB');

	const certPreflight = options.find(o => o.name === '_certificate_preflight');
	assert.deepEqual(certPreflight.dependencies, [['_mode', 'direct_https'], ['_mode', 'shared']]);
	const certPreflightResult = await certPreflight.onclick();
	assert.equal(certPreflightResult.ok, true);
	assert.ok(rpcCalls.includes('certificate_preflight'));
	assert.equal(notifications.at(-1).style, 'info');

	const acmeDns01 = options.find(o => o.name === '_acme_dns01');
	assert.deepEqual(acmeDns01.dependencies, [['_mode', 'direct_https']]);
	assert.equal(acmeDns01.cfgvalue(), 'OpenWrt ACME path detected');

	const cfHost = options.find(o => o.name === 'cloudflare_hostname');
	assert.deepEqual(cfHost.dependencies, [['_mode', 'cloudflare']]);
	assert.equal(cfHost.validate(null, ''), true);
	assert.equal(cfHost.validate(null, 'web.example.com'), true);
	assert.notEqual(cfHost.validate(null, 'other.example.com'), true);

	for (const name of ['hostname', 'certificate', 'certificate_key']) {
		const option = options.find(o => o.name === name);
		assert.equal(option.section, 'shared');
		assert.deepEqual(option.dependencies, [['_mode', 'shared']]);
	}

	const sharedCert = options.find(o => o.name === 'certificate');
	assert.equal(sharedCert.validate(null, '/etc/ssl/telego.pem'), true);
	assert.notEqual(sharedCert.validate(null, ''), true);

	const advanced = options.find(o => o.name === '_native_advanced_note');
	assert.deepEqual(advanced.dependencies, [['_mode', 'shared']]);

	const fallback = options.find(o => o.name === 'fallback_manage');
	assert.deepEqual(fallback.dependencies, [['_mode', 'direct_https'], ['_mode', 'cloudflare'], ['_mode', 'shared']]);
	fallback.write(null, '0');
	assert.equal(store.nginx_telego.fallback.manage, '0');

	const menu = JSON.parse(fs.readFileSync('package/luci-app-telego/root/usr/share/luci/menu.d/telego.menu.json', 'utf8'));
	assert.equal(menu['admin/services/telego'].action.type, 'firstchild');
	assert.equal(menu['admin/services/telego'].action.preferred, 'configuration');
	assert.equal(menu['admin/services/telego/ingress'].action.path, 'telego/ingress');
	assert.equal(menu['admin/services/telego/ingress'].depends.fs['/etc/config/nginx_telego'], 'file');
	assert.equal(menu['admin/services/telego/ingress'].depends.fs['/usr/libexec/nginx-telego-reconcile'], 'executable');
	assert.equal(menu['admin/services/telego/ingress'].depends.fs['/usr/libexec/nginx-telego-firewall'], 'executable');
	assert.equal(menu['admin/services/telego/ingress'].depends.fs['/usr/libexec/nginx-telego-cert'], 'executable');

	const acl = JSON.parse(fs.readFileSync('package/luci-app-telego/root/usr/share/rpcd/acl.d/luci-app-telego.json', 'utf8'))['luci-app-telego'];
	assert.ok(acl.read.uci.includes('nginx_telego'));
	assert.ok(acl.write.uci.includes('nginx_telego'));
	assert.ok(acl.read.ubus['telego.nginx'].includes('firewall_status'));
	assert.ok(acl.read.ubus['telego.nginx'].includes('firewall_preflight'));
	assert.ok(acl.read.ubus['telego.nginx'].includes('certificate_status'));
	assert.ok(acl.read.ubus['telego.nginx'].includes('certificate_preflight'));

	console.log('LuCI P12.6 dedicated Direct HTTPS ingress tests passed');
})().catch(error => { console.error(error); process.exit(1); });
