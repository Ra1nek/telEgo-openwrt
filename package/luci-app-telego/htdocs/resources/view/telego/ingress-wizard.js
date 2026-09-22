'use strict';

function stringValue(value) {
	return value == null ? '' : String(value).trim();
}

function validHostname(value) {
	value = stringValue(value).toLowerCase();
	if (!value || value.length > 253 || !/^[a-z0-9.-]+$/.test(value) || value.includes('..'))
		return false;
	for (const label of value.split('.')) {
		if (!label || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))
			return false;
	}
	return true;
}

function validPort(value) {
	const text = stringValue(value);
	if (!/^[0-9]+$/.test(text))
		return false;
	const number = Number(text);
	return Number.isInteger(number) && number >= 1 && number <= 65535;
}

function validPath(value) {
	return /^\/[A-Za-z0-9_./+\-]+$/.test(stringValue(value));
}

function trustedLoopback(value) {
	const list = Array.isArray(value)
		? value.map(String)
		: (value ? String(value).split(/\s+/).filter(Boolean) : []);
	if (!list.includes('127.0.0.1/32'))
		list.push('127.0.0.1/32');
	return list;
}

function acmePaths(hostname, certificate, certificateKey) {
	certificate = stringValue(certificate);
	certificateKey = stringValue(certificateKey);
	if (!certificate)
		certificate = '/etc/ssl/acme/' + hostname + '.fullchain.crt';
	if (!certificateKey)
		certificateKey = '/etc/ssl/acme/' + hostname + '.key';
	if (!validPath(certificate) || !validPath(certificateKey))
		throw new Error('invalid-certificate-path');
	return { certificate, certificate_key: certificateKey };
}

function buildCandidate(current, input) {
	current = current || {};
	input = input || {};
	const mode = stringValue(input.mode);
	if (!['direct_https', 'cloudflare', 'shared'].includes(mode))
		throw new Error('invalid-mode');

	const hostname = stringValue(input.hostname).toLowerCase();
	if (!validHostname(hostname))
		throw new Error('invalid-hostname');

	const candidate = {
		mode,
		hostname,
		telego: {
			general: { enabled: '1' },
			web_proxy: {
				enabled: '1',
				bind_to: '127.0.0.1:8080',
				hostname,
				trusted_proxy_cidrs: trustedLoopback(current.trusted_proxy_cidrs)
			}
		},
		nginx_telego: {
			direct_https: { enabled: mode === 'direct_https' ? '1' : '0' },
			cloudflare: { enabled: mode === 'cloudflare' ? '1' : '0' },
			shared: { enabled: mode === 'shared' ? '1' : '0' }
		}
	};

	if (mode === 'direct_https') {
		const mtproxyPort = stringValue(input.mtproxy_port || '2443');
		const luciPort = stringValue(input.luci_https_port || '10443');
		if (!validPort(mtproxyPort) || mtproxyPort === '443')
			throw new Error('invalid-mtproxy-port');
		if (!validPort(luciPort) || luciPort === '443' || luciPort === mtproxyPort)
			throw new Error('invalid-luci-port');

		const tls = acmePaths(hostname, input.certificate, input.certificate_key);
		candidate.telego.general.bind_to = '0.0.0.0:' + mtproxyPort;
		candidate.telego.general.public_port = mtproxyPort;
		candidate.nginx_telego.direct_https = {
			enabled: '1',
			hostname,
			certificate: tls.certificate,
			certificate_key: tls.certificate_key,
			luci_https_port: luciPort,
			split_dns_address: stringValue(input.split_dns_address) || null
		};
	}
	else if (mode === 'cloudflare') {
		candidate.nginx_telego.cloudflare.hostname = hostname;
	}
	else {
		const tls = acmePaths(hostname, input.certificate, input.certificate_key);
		candidate.telego.general.bind_to = '0.0.0.0:443';
		candidate.telego.general.public_port = '443';
		candidate.telego.tls_fronting = {
			enabled: '1',
			mask_host: stringValue(current.mask_host) || 'www.google.com',
			cert_host: '127.0.0.1',
			cert_port: '8444',
			splice_host: '127.0.0.1',
			splice_port: '8443',
			splice_proxy_protocol: '2'
		};
		candidate.nginx_telego.shared = {
			enabled: '1',
			hostname,
			certificate: tls.certificate,
			certificate_key: tls.certificate_key
		};
	}

	return candidate;
}

function applySection(uci, config, section, values) {
	for (const key in values) {
		const value = values[key];
		if (value === undefined)
			continue;
		if (value === null || value === '')
			uci.unset(config, section, key);
		else
			uci.set(config, section, key, value);
	}
}

function applyCandidate(uci, candidate) {
	for (const section in candidate.telego)
		applySection(uci, 'telego', section, candidate.telego[section]);
	for (const section in candidate.nginx_telego)
		applySection(uci, 'nginx_telego', section, candidate.nginx_telego[section]);
}

return { buildCandidate, applyCandidate, validHostname, validPort, validPath };
