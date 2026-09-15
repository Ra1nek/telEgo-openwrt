const assert = require('node:assert/strict');
const fs = require('node:fs');

const options = [];
const store = {
	nginx_telego: {
		shared: { enabled: '0', hostname: '', certificate: '', certificate_key: '' },
		cloudflare: { enabled: '0', hostname: '' },
		fallback: { manage: '1' }
	},
	telego: {
		general: { bind_to: '0.0.0.0:443' },
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

class Map {
	constructor(config, title, description) {
		this.config = config; this.title = title; this.description = description;
	}
	section(kind, section) {
		return {
			anonymous: false, addremove: true,
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
	Flag: function() {}
};

const ingress = new Function('form', 'uci', 'view', '_',
	fs.readFileSync('package/luci-app-telego/htdocs/resources/view/telego/ingress.js', 'utf8'))(
	form, uci, { extend: x => x }, x => x
);

(async () => {
	await ingress.load();
	const rendered = await ingress.render();
	assert.equal(rendered.config, 'nginx_telego');

	const mode = options.find(o => o.name === '_mode');
	assert.ok(mode, 'ingress mode selector exists');
	assert.deepEqual(mode.values.map(v => v[0]), ['disabled', 'cloudflare', 'shared']);
	assert.equal(mode.cfgvalue(), 'disabled');

	store.nginx_telego.cloudflare.enabled = '1';
	assert.equal(mode.cfgvalue(), 'cloudflare');
	store.nginx_telego.shared.enabled = '1';
	assert.equal(mode.cfgvalue(), 'disabled', 'conflicting external state is never presented as an active profile');

	mode.write(null, 'shared');
	assert.equal(store.nginx_telego.shared.enabled, '1');
	assert.equal(store.nginx_telego.cloudflare.enabled, '0');
	mode.write(null, 'cloudflare');
	assert.equal(store.nginx_telego.shared.enabled, '0');
	assert.equal(store.nginx_telego.cloudflare.enabled, '1');
	mode.write(null, 'disabled');
	assert.equal(store.nginx_telego.shared.enabled, '0');
	assert.equal(store.nginx_telego.cloudflare.enabled, '0');

	const cfHost = options.find(o => o.name === 'cloudflare_hostname');
	assert.deepEqual(cfHost.dependencies, [['_mode', 'cloudflare']]);
	assert.equal(cfHost.validate(null, ''), true);
	assert.equal(cfHost.validate(null, 'web.example.com'), true);
	assert.notEqual(cfHost.validate(null, 'other.example.com'), true);
	cfHost.write(null, 'web.example.com');
	assert.equal(store.nginx_telego.cloudflare.hostname, 'web.example.com');
	cfHost.remove();
	assert.equal(store.nginx_telego.cloudflare.hostname, undefined);

	for (const name of ['certificate', 'certificate_key']) {
		const option = options.find(o => o.name === name);
		assert.deepEqual(option.dependencies, [['_mode', 'shared']]);
		assert.equal(option.validate(null, '/etc/ssl/telego.pem'), true);
		assert.notEqual(option.validate(null, ''), true);
		assert.notEqual(option.validate(null, 'relative.pem'), true);
		assert.notEqual(option.validate(null, '/etc/ssl/bad path.pem'), true);
	}

	const fallback = options.find(o => o.name === 'fallback_manage');
	assert.deepEqual(fallback.dependencies, [['_mode', 'cloudflare'], ['_mode', 'shared']]);
	fallback.write(null, '0');
	assert.equal(store.nginx_telego.fallback.manage, '0');

	const menu = JSON.parse(fs.readFileSync('package/luci-app-telego/root/usr/share/luci/menu.d/telego.menu.json', 'utf8'));
	assert.equal(menu['admin/services/telego'].action.type, 'firstchild');
	assert.equal(menu['admin/services/telego'].action.preferred, 'configuration');
	assert.equal(menu['admin/services/telego/ingress'].action.path, 'telego/ingress');
	assert.equal(menu['admin/services/telego/ingress'].depends.fs['/etc/config/nginx_telego'], 'file');
	assert.equal(menu['admin/services/telego/ingress'].depends.fs['/usr/libexec/nginx-telego-render'], 'executable');

	const acl = JSON.parse(fs.readFileSync('package/luci-app-telego/root/usr/share/rpcd/acl.d/luci-app-telego.json', 'utf8'))['luci-app-telego'];
	assert.ok(acl.read.uci.includes('nginx_telego'));
	assert.ok(acl.write.uci.includes('nginx_telego'));

	console.log('LuCI managed ingress tests passed');
})().catch(error => { console.error(error); process.exit(1); });
