const assert = require('node:assert/strict');
const fs = require('node:fs');

const baseclass = {
	extend(proto) {
		function Module() {}
		Object.assign(Module.prototype, proto);
		return Module;
	}
};

const WizardModule = new Function(
	'baseclass',
	fs.readFileSync('package/luci-app-telego/htdocs/resources/view/telego/ingress-wizard.js', 'utf8')
)(baseclass);
assert.equal(typeof WizardModule, 'function', 'LuCI helper factory must yield a constructor');
const wizard = new WizardModule();

const current = {
	trusted_proxy_cidrs: ['10.0.0.0/8'],
	mask_host: 'www.google.com'
};

let candidate = wizard.buildCandidate(current, {
	mode: 'direct_https',
	hostname: 'web.example.com',
	mtproxy_port: '2443',
	luci_https_port: '10443',
	split_dns_address: '192.168.88.1'
});
assert.equal(candidate.telego.general.bind_to, '0.0.0.0:2443');
assert.equal(candidate.telego.general.public_port, '2443');
assert.equal(candidate.telego.web_proxy.bind_to, '127.0.0.1:8080');
assert.deepEqual(candidate.telego.web_proxy.trusted_proxy_cidrs, ['10.0.0.0/8', '127.0.0.1/32']);
assert.equal(candidate.nginx_telego.direct_https.enabled, '1');
assert.equal(candidate.nginx_telego.cloudflare.enabled, '0');
assert.equal(candidate.nginx_telego.shared.enabled, '0');
assert.equal(candidate.nginx_telego.direct_https.certificate, '/etc/ssl/acme/web.example.com.fullchain.crt');
assert.equal(candidate.nginx_telego.direct_https.certificate_key, '/etc/ssl/acme/web.example.com.key');

candidate = wizard.buildCandidate(current, {
	mode: 'cloudflare',
	hostname: 'web.example.com'
});
assert.equal(candidate.nginx_telego.cloudflare.enabled, '1');
assert.equal(candidate.telego.general.bind_to, undefined);

candidate = wizard.buildCandidate(current, {
	mode: 'shared',
	hostname: 'web.example.com'
});
assert.equal(candidate.telego.general.bind_to, '0.0.0.0:443');
assert.equal(candidate.telego.general.public_port, '443');
assert.equal(candidate.telego.tls_fronting.enabled, '1');
assert.equal(candidate.telego.tls_fronting.mask_host, 'web.example.com');
assert.equal(candidate.telego.tls_fronting.cert_host, '127.0.0.1');
assert.equal(candidate.telego.tls_fronting.cert_port, '8444');
assert.equal(candidate.telego.tls_fronting.splice_host, '127.0.0.1');
assert.equal(candidate.telego.tls_fronting.splice_port, '8443');
assert.equal(candidate.telego.tls_fronting.splice_proxy_protocol, '2');

assert.throws(() => wizard.buildCandidate(current, {
	mode: 'direct_https', hostname: 'web.example.com', mtproxy_port: '443', luci_https_port: '10443'
}), /invalid-mtproxy-port/);
assert.throws(() => wizard.buildCandidate(current, {
	mode: 'direct_https', hostname: 'web.example.com', mtproxy_port: '2443', luci_https_port: '2443'
}), /invalid-luci-port/);
assert.throws(() => wizard.buildCandidate(current, {
	mode: 'direct_https', hostname: 'bad host', mtproxy_port: '2443', luci_https_port: '10443'
}), /invalid-hostname/);

const store = {};
const fakeUci = {
	set(config, section, option, value) {
		store[config] ??= {};
		store[config][section] ??= {};
		store[config][section][option] = value;
	},
	unset(config, section, option) {
		if (store[config]?.[section]) delete store[config][section][option];
	}
};
wizard.applyCandidate(fakeUci, candidate);
assert.equal(store.nginx_telego.shared.enabled, '1');
assert.equal(store.telego.web_proxy.hostname, 'web.example.com');

console.log('LuCI P6.5 ingress wizard coordinator tests passed');
