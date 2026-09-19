'use strict';

'require form';
'require rpc';
'require ui';
'require uci';
'require view';

const callPlatformStatus = rpc.declare({
	object: 'telego.nginx',
	method: 'platform_status',
	expect: { '': {} }
});

const callPlatformPreflight = rpc.declare({
	object: 'telego.nginx',
	method: 'platform_preflight',
	expect: { '': {} }
});

const callFirewallStatus = rpc.declare({
	object: 'telego.nginx',
	method: 'firewall_status',
	expect: { '': {} }
});

const callFirewallPreflight = rpc.declare({
	object: 'telego.nginx',
	method: 'firewall_preflight',
	expect: { '': {} }
});

const callCertificateStatus = rpc.declare({
	object: 'telego.nginx',
	method: 'certificate_status',
	expect: { '': {} }
});

const callCertificatePreflight = rpc.declare({
	object: 'telego.nginx',
	method: 'certificate_preflight',
	expect: { '': {} }
});

let platformState = null;
let firewallState = null;
let certificateState = null;

function isEnabled(config, section, option) {
	return uci.get(config, section, option || 'enabled') === '1';
}

function profileFlags() {
	return {
		shared: isEnabled('nginx_telego', 'shared'),
		cloudflare: isEnabled('nginx_telego', 'cloudflare'),
		direct_https: isEnabled('nginx_telego', 'direct_https')
	};
}

function profileConflict() {
	const flags = profileFlags();
	return (flags.shared ? 1 : 0) + (flags.cloudflare ? 1 : 0) + (flags.direct_https ? 1 : 0) > 1;
}

function managedWebContractError() {
	const serviceEnabled = isEnabled('telego', 'general');
	const webEnabled = isEnabled('telego', 'web_proxy');
	const webBind = uci.get('telego', 'web_proxy', 'bind_to') || '127.0.0.1:8080';
	const webHostname = uci.get('telego', 'web_proxy', 'hostname') || '';

	if (!serviceEnabled || !webEnabled || webBind !== '127.0.0.1:8080' || !webHostname || !hasTrustedLoopback())
		return _('Managed WEB ingress requires enabled telEgo and WEB Proxy, bind 127.0.0.1:8080, a WEB hostname, and trusted 127.0.0.1/32. Fix Services → telEgo → Configuration first.');

	return null;
}

function directHttpsPortError() {
	const bind = uci.get('telego', 'general', 'bind_to') || '0.0.0.0:443';
	return /:443$/.test(bind)
		? _('Direct HTTPS reserves TCP/443 for WEB/Nginx on LAN and WAN. Move the telEgo MTProxy listener to another port, or use Native Shared-Port to share public TCP/443.')
		: null;
}

function profileMode() {
	const flags = profileFlags();
	const enabled = (flags.shared ? 1 : 0) + (flags.cloudflare ? 1 : 0) + (flags.direct_https ? 1 : 0);

	if (enabled !== 1)
		return 'disabled';
	if (flags.direct_https)
		return 'direct_https';
	if (flags.cloudflare)
		return 'cloudflare';
	return 'shared';
}

function setOrUnset(config, section, option, value) {
	if (value == null || value === '')
		uci.unset(config, section, option);
	else
		uci.set(config, section, option, value);
}

function hasTrustedLoopback() {
	const value = uci.get('telego', 'web_proxy', 'trusted_proxy_cidrs');
	const list = Array.isArray(value) ? value : (value ? String(value).split(/\s+/) : []);
	return list.includes('127.0.0.1/32');
}

function validateAbsolutePath(sectionId, value) {
	if (!value)
		return _('An absolute path is required.');

	return /^\/[A-Za-z0-9_./+\-]+$/.test(value)
		? true
		: _('Use an absolute path containing only letters, digits, underscore, dot, slash, plus or hyphen.');
}

function validateIngressHostname(sectionId, value) {
	const webHostname = uci.get('telego', 'web_proxy', 'hostname') || '';
	return !value || !webHostname || value === webHostname
		? true
		: _('The ingress hostname must match the telEgo WEB Proxy hostname.');
}

function webContractText() {
	const enabled = isEnabled('telego', 'web_proxy');
	const bind = uci.get('telego', 'web_proxy', 'bind_to') || '127.0.0.1:8080';
	const hostname = uci.get('telego', 'web_proxy', 'hostname') || _('not set');
	const trusted = hasTrustedLoopback();

	return [
		enabled ? _('WEB Proxy enabled') : _('WEB Proxy disabled'),
		'bind=' + bind,
		'hostname=' + hostname,
		trusted ? _('loopback proxy trusted') : _('loopback proxy is not trusted')
	].join(' · ');
}

function sharedContractText() {
	const publicBind = uci.get('telego', 'general', 'bind_to') || '0.0.0.0:443';
	const maskHost = uci.get('telego', 'tls_fronting', 'mask_host') || _('not set');
	const certHost = uci.get('telego', 'tls_fronting', 'cert_host') || _('not set');
	const certPort = uci.get('telego', 'tls_fronting', 'cert_port') || _('not set');
	const spliceHost = uci.get('telego', 'tls_fronting', 'splice_host') || _('not set');
	const splicePort = uci.get('telego', 'tls_fronting', 'splice_port') || _('not set');
	const spliceProxy = uci.get('telego', 'tls_fronting', 'splice_proxy_protocol') || '0';

	return [
		'public=' + publicBind,
		'mask=' + maskHost,
		'cert=' + certHost + ':' + certPort,
		'fallback=' + spliceHost + ':' + splicePort,
		'PROXY=' + spliceProxy
	].join(' · ');
}

function platformStatusText() {
	if (!platformState || !platformState.ok)
		return _('Unavailable');

	let splitDns;
	if (platformState.split_dns_state === 'owned')
		splitDns = _('Owned and in sync');
	else if (platformState.split_dns_state === 'external')
		splitDns = _('Administrator-owned');
	else if (platformState.split_dns_state === 'absent')
		splitDns = _('Configured but absent');
	else
		splitDns = _('Disabled');

	return [
		_('LuCI HTTPS') + ': :' + (platformState.luci_https_port || '10443'),
		_('uhttpd owns TCP/443') + ': ' + (platformState.uhttpd_has_443 ? _('Yes') : _('No')),
		_('uhttpd management listener') + ': ' + (platformState.uhttpd_has_luci_port ? _('present') : _('not detected')),
		_('Split DNS') + ': ' + splitDns,
		platformState.split_dns_address ? _('LAN address') + ': ' + platformState.split_dns_address : null,
		_('Pending platform changes') + ': ' +
			((platformState.pending_uhttpd || platformState.pending_dhcp) ? _('Yes') : _('No'))
	].filter(Boolean).join(' · ');
}

function notifyPlatformPreflight(result) {
	if (result && result.ok) {
		ui.addNotification(
			null,
			E('p', {}, result.message || _('Platform preflight passed.')),
			'info'
		);
		return;
	}

	const error = result && result.error ? String(result.error) : _('unknown error');
	ui.addNotification(
		null,
		E('p', {}, _('Platform preflight failed:') + ' ' + error),
		'danger'
	);
}

function firewallStatusText() {
	if (!firewallState || !firewallState.ok)
		return _('Unavailable');

	let state;
	if (firewallState.section_state === 'owned')
		state = firewallState.managed_match ? _('Owned and in sync') : _('Owned but drifted');
	else if (firewallState.section_state === 'foreign')
		state = _('Foreign reserved section');
	else
		state = _('Absent');

	const conflict = firewallState.foreign_wan443 && firewallState.foreign_wan443 !== '-'
		? firewallState.foreign_wan443
		: _('none');
	return [
		_('Managed rule') + ': ' + state,
		_('WAN input') + ': ' + (firewallState.wan_input || _('unknown')),
		_('Foreign WAN TCP/443') + ': ' + conflict,
		_('Pending firewall changes') + ': ' + (firewallState.pending_changes ? _('Yes') : _('No'))
	].join(' · ');
}

function notifyPreflight(result) {
	if (result && result.ok) {
		ui.addNotification(
			null,
			E('p', {}, result.message || _('Firewall preflight passed.')),
			'info'
		);
		return;
	}

	const error = result && result.error ? String(result.error) : _('unknown error');
	ui.addNotification(
		null,
		E('p', {}, _('Firewall preflight failed:') + ' ' + error),
		'danger'
	);
}

function certificateStatusText() {
	if (!certificateState || !certificateState.ok)
		return _('Unavailable');
	if (!certificateState.managed_tls)
		return _('No local managed TLS certificate is active.');

	const certState = certificateState.certificate_state || _('unknown');
	const keyState = certificateState.key_state || _('unknown');
	let matchState = _('unknown');
	if (certificateState.key_match === '1' && certificateState.hostname_match === '1')
		matchState = _('Certificate, key and hostname match');
	else if (certificateState.key_match === '0')
		matchState = _('Certificate and private key do not match');
	else if (certificateState.hostname_match === '0')
		matchState = _('Certificate does not cover the configured hostname');

	let expiry = certificateState.expiry_state || _('unknown');
	if (expiry === 'ok')
		expiry = _('Valid for more than 30 days');
	else if (expiry === 'warning')
		expiry = _('Expires within 30 days');
	else if (expiry === 'critical')
		expiry = _('Expires within 7 days');
	else if (expiry === 'expired')
		expiry = _('Expired');

	return [
		_('Certificate') + ': ' + certState,
		_('Private key') + ': ' + keyState,
		matchState,
		_('Expiry') + ': ' + expiry,
		certificateState.not_after ? _('Not after') + ': ' + certificateState.not_after : null,
		certificateState.acme_managed ? _('OpenWrt ACME path detected') : _('External certificate path')
	].filter(Boolean).join(' · ');
}

function certificatePathText() {
	if (!certificateState || !certificateState.ok || !certificateState.managed_tls)
		return _('No local managed TLS certificate is active.');

	return [
		certificateState.certificate || _('not set'),
		certificateState.certificate_key || _('not set')
	].join(' · ');
}

function notifyCertificatePreflight(result) {
	if (result && result.ok) {
		ui.addNotification(
			null,
			E('p', {}, result.message || _('Certificate preflight passed.')),
			'info'
		);
		return;
	}

	const error = result && result.error ? String(result.error) : _('unknown error');
	ui.addNotification(
		null,
		E('p', {}, _('Certificate preflight failed:') + ' ' + error),
		'danger'
	);
}

return view.extend({
	load: function () {
		return Promise.all([
			uci.load('nginx_telego'),
			uci.load('telego'),
			L.resolveDefault(callPlatformStatus(), null),
			L.resolveDefault(callFirewallStatus(), null),
			L.resolveDefault(callCertificateStatus(), null)
		]);
	},

	render: function (data) {
		platformState = data && data[2] ? data[2] : null;
		firewallState = data && data[3] ? data[3] : null;
		certificateState = data && data[4] ? data[4] : null;

		const m = new form.Map(
			'nginx_telego',
			_('WEB Ingress / Nginx Integration'),
			_('Choose one managed WEB ingress profile. Disabled leaves hand-written Nginx configuration untouched; managed profiles are mutually exclusive and are validated before public traffic is changed.')
		);

		let s = m.section(form.TypedSection, 'shared', _('Ingress Profile'));
		s.anonymous = true;
		s.addremove = false;

		let o = s.option(
			form.ListValue,
			'_mode',
			_('Mode'),
			_('Direct HTTPS and Cloudflare are normal ingress modes. Direct HTTPS reserves TCP/443 for WEB/Nginx on LAN and WAN and moves LuCI HTTPS to a separate management port; MTProxy must use another public port. Native Shared-Port remains available when WEB and MTProxy must share public TCP/443.')
		);
		o.value('disabled', _('Disabled'));
		o.value('direct_https', 'Direct HTTPS');
		o.value('cloudflare', 'Cloudflare Tunnel');
		o.value('shared', _('Native Shared-Port (Advanced)'));
		o.default = 'disabled';
		o.cfgvalue = profileMode;
		o.validate = function (sectionId, value) {
			if (value !== 'disabled') {
				const webError = managedWebContractError();
				if (webError)
					return webError;
			}
			if (value === 'direct_https') {
				const error = directHttpsPortError();
				if (error)
					return error;
			}
			return true;
		};
		o.write = function (sectionId, value) {
			uci.set('nginx_telego', 'direct_https', 'enabled', value === 'direct_https' ? '1' : '0');
			uci.set('nginx_telego', 'cloudflare', 'enabled', value === 'cloudflare' ? '1' : '0');
			uci.set('nginx_telego', 'shared', 'enabled', value === 'shared' ? '1' : '0');
		};

		o = s.option(form.DummyValue, '_profile_state', _('Status'));
		o.cfgvalue = function () {
			if (profileConflict())
				return _('Error');
			return profileMode() === 'disabled' ? _('Disabled') : _('Enabled');
		};

		o = s.option(form.DummyValue, '_managed_output', _('Managed Nginx Files'));
		o.cfgvalue = function () {
			return '/etc/nginx/conf.d/20-telego-core.conf · /etc/nginx/conf.d/80-telego-ingress.conf · /etc/nginx/conf.d/85-telego-fallback.conf';
		};

		o = s.option(form.DummyValue, '_web_contract', _('Current telEgo WEB Contract'));
		o.cfgvalue = webContractText;
		o.depends('_mode', 'direct_https');
		o.depends('_mode', 'cloudflare');
		o.depends('_mode', 'shared');

		o = s.option(
			form.DummyValue,
			'_certificate_status',
			_('Certificate Status'),
			_('Read-only X.509 status for the active local TLS profile, including key match, hostname coverage and expiry.')
		);
		o.depends('_mode', 'direct_https');
		o.depends('_mode', 'shared');
		o.cfgvalue = certificateStatusText;

		o = s.option(form.DummyValue, '_certificate_paths', _('Active Certificate Paths'));
		o.depends('_mode', 'direct_https');
		o.depends('_mode', 'shared');
		o.cfgvalue = certificatePathText;

		o = s.option(form.DummyValue, '_certificate_fingerprint', _('Certificate SHA-256'));
		o.depends('_mode', 'direct_https');
		o.depends('_mode', 'shared');
		o.cfgvalue = function () {
			return certificateState && certificateState.fingerprint_sha256
				? certificateState.fingerprint_sha256
				: _('Unavailable');
		};

		o = s.option(
			form.Button,
			'_certificate_preflight',
			_('Certificate Preflight'),
			_('Validates X.509 parsing, private key parsing, certificate/key match, hostname coverage, expiry and the complete Nginx configuration with nginx -t. No files or services are changed.')
		);
		o.depends('_mode', 'direct_https');
		o.depends('_mode', 'shared');
		o.inputtitle = _('Run Certificate Preflight');
		o.inputstyle = 'apply';
		o.onclick = function () {
			return L.resolveDefault(callCertificatePreflight(), {
				ok: false,
				error: 'rpc-failed'
			}).then(function (result) {
				notifyCertificatePreflight(result);
				return result;
			});
		};

		o = s.option(
			form.Value,
			'direct_https_hostname',
			_('Hostname'),
			_('Leave empty to reuse telego.web_proxy.hostname. When set, it must match that hostname exactly.')
		);
		o.depends('_mode', 'direct_https');
		o.datatype = 'hostname';
		o.rmempty = true;
		o.cfgvalue = function () {
			return uci.get('nginx_telego', 'direct_https', 'hostname') || '';
		};
		o.write = function (sectionId, value) {
			setOrUnset('nginx_telego', 'direct_https', 'hostname', value);
		};
		o.remove = function () {
			uci.unset('nginx_telego', 'direct_https', 'hostname');
		};
		o.validate = validateIngressHostname;

		o = s.option(
			form.Value,
			'direct_https_certificate',
			_('TLS Certificate'),
			_('Absolute path to the certificate chain used by the dedicated Direct HTTPS Nginx listener on TCP/443.')
		);
		o.depends('_mode', 'direct_https');
		o.rmempty = false;
		o.cfgvalue = function () {
			return uci.get('nginx_telego', 'direct_https', 'certificate') || '';
		};
		o.write = function (sectionId, value) {
			setOrUnset('nginx_telego', 'direct_https', 'certificate', value);
		};
		o.remove = function () {
			uci.unset('nginx_telego', 'direct_https', 'certificate');
		};
		o.validate = validateAbsolutePath;

		o = s.option(
			form.Value,
			'direct_https_certificate_key',
			_('TLS Private Key'),
			_('Absolute path to the matching private key. nginx-telego never creates or renews certificates.')
		);
		o.depends('_mode', 'direct_https');
		o.rmempty = false;
		o.cfgvalue = function () {
			return uci.get('nginx_telego', 'direct_https', 'certificate_key') || '';
		};
		o.write = function (sectionId, value) {
			setOrUnset('nginx_telego', 'direct_https', 'certificate_key', value);
		};
		o.remove = function () {
			uci.unset('nginx_telego', 'direct_https', 'certificate_key');
		};
		o.validate = validateAbsolutePath;

		o = s.option(
		form.Value,
		'direct_https_luci_port',
		_('LuCI HTTPS Management Port'),
		_('When uhttpd still owns HTTPS TCP/443, nginx-telego moves only those LuCI listeners to this management port before Nginx claims TCP/443. Existing administrator-managed non-443 LuCI listeners are preserved.')
	);
	o.depends('_mode', 'direct_https');
	o.datatype = 'port';
	o.rmempty = false;
	o.default = '10443';
	o.cfgvalue = function () {
		return uci.get('nginx_telego', 'direct_https', 'luci_https_port') || '10443';
	};
	o.write = function (sectionId, value) {
		uci.set('nginx_telego', 'direct_https', 'luci_https_port', value || '10443');
	};
	o.validate = function (sectionId, value) {
		return value === '443'
			? _('LuCI management port must differ from Direct HTTPS TCP/443.')
			: true;
	};

	o = s.option(
		form.Value,
		'direct_https_split_dns_address',
		_('LAN Split-DNS Address'),
		_('Optional router LAN IPv4 address returned for the WEB hostname to LAN clients. This avoids public-IP hairpin NAT. Leave empty to keep administrator-managed DNS unchanged.')
	);
	o.depends('_mode', 'direct_https');
	o.datatype = 'ip4addr';
	o.rmempty = true;
	o.cfgvalue = function () {
		return uci.get('nginx_telego', 'direct_https', 'split_dns_address') || '';
	};
	o.write = function (sectionId, value) {
		setOrUnset('nginx_telego', 'direct_https', 'split_dns_address', value);
	};
	o.remove = function () {
		uci.unset('nginx_telego', 'direct_https', 'split_dns_address');
	};

	o = s.option(form.DummyValue, '_direct_https_flow', _('Direct HTTPS Flow'));
		o.depends('_mode', 'direct_https');
		o.cfgvalue = function () {
			return 'LAN/WAN TCP/443 → Nginx :443 → telEgo WEB 127.0.0.1:8080';
		};

		o = s.option(
			form.DummyValue,
			'_direct_https_ports',
			_('Port Ownership'),
			_('Direct HTTPS dedicates TCP/443 to WEB/Nginx on both LAN and WAN. LuCI/uhttpd uses the configured management port; MTProxy must use another public port.')
		);
		o.depends('_mode', 'direct_https');
		o.cfgvalue = function () {
			const bind = uci.get('telego', 'general', 'bind_to') || '0.0.0.0:443';
			const luciPort = uci.get('nginx_telego', 'direct_https', 'luci_https_port') || '10443';
			return 'WEB/Nginx: :443 · LuCI/uhttpd: :' + luciPort + ' · MTProxy: ' + bind;
		};

		o = s.option(
			form.DummyValue,
			'_platform_status',
			_('Platform Status'),
			_('Read-only Direct HTTPS ownership status for LuCI/uhttpd and optional dnsmasq split DNS.')
		);
		o.depends('_mode', 'direct_https');
		o.cfgvalue = platformStatusText;

		o = s.option(
			form.Button,
			'_platform_preflight',
			_('Platform Preflight'),
			_('Checks LuCI TCP/443 migration safety, the configured management port, optional split DNS, pending UCI changes and ownership drift without changing services or configuration.')
		);
		o.depends('_mode', 'direct_https');
		o.inputtitle = _('Run Platform Preflight');
		o.inputstyle = 'apply';
		o.onclick = function () {
			return L.resolveDefault(callPlatformPreflight(), {
				ok: false,
				error: 'rpc-failed'
			}).then(function (result) {
				notifyPlatformPreflight(result);
				return result;
			});
		};

		o = s.option(
			form.DummyValue,
			'_acme_dns01',
			_('ACME DNS-01'),
			_('OpenWrt ACME can issue and renew the certificate without taking over WAN ports 80 or 443. For an ACME-managed hostname, use /etc/ssl/acme/<hostname>.fullchain.crt and /etc/ssl/acme/<hostname>.key. The nginx-telego hotplug hook preflights renewed material before OpenWrt emits acme.renew; the stock Nginx service then performs nginx -t and reloads safely.')
		);
		o.depends('_mode', 'direct_https');
		o.cfgvalue = function () {
			return certificateState && certificateState.acme_managed
				? _('OpenWrt ACME path detected')
				: _('See docs/TLS_CERTIFICATE.md for the DNS-01 runbook.');
		};

		o = s.option(
			form.DummyValue,
			'_firewall_status',
			_('Firewall Status'),
			_('Status is read without changing firewall configuration. Direct HTTPS owns only firewall.telego_direct_https.')
		);
		o.depends('_mode', 'direct_https');
		o.cfgvalue = firewallStatusText;

		o = s.option(
			form.Button,
			'_firewall_preflight',
			_('Firewall Preflight'),
			_('Checks dedicated WAN TCP/443 ownership, WAN zone safety, pending UCI changes and fw4 syntax without changing firewall rules.')
		);
		o.depends('_mode', 'direct_https');
		o.inputtitle = _('Run Preflight');
		o.inputstyle = 'apply';
		o.onclick = function () {
			return L.resolveDefault(callFirewallPreflight(), {
				ok: false,
				error: 'rpc-failed'
			}).then(function (result) {
				notifyPreflight(result);
				return result;
			});
		};

		o = s.option(
			form.Value,
			'cloudflare_hostname',
			_('Hostname'),
			_('Leave empty to reuse telego.web_proxy.hostname. When set, it must match that hostname exactly.')
		);
		o.depends('_mode', 'cloudflare');
		o.datatype = 'hostname';
		o.rmempty = true;
		o.cfgvalue = function () {
			return uci.get('nginx_telego', 'cloudflare', 'hostname') || '';
		};
		o.write = function (sectionId, value) {
			setOrUnset('nginx_telego', 'cloudflare', 'hostname', value);
		};
		o.remove = function () {
			uci.unset('nginx_telego', 'cloudflare', 'hostname');
		};
		o.validate = validateIngressHostname;

		o = s.option(form.DummyValue, '_cloudflare_origin', _('Cloudflare Tunnel Service URL'));
		o.depends('_mode', 'cloudflare');
		o.cfgvalue = function () { return 'http://127.0.0.1:18080'; };
		o.description = _('Configure the Cloudflare Published Application to use this local HTTP origin. Public TLS terminates at Cloudflare.');

		o = s.option(
			form.Flag,
			'fallback_manage',
			_('Manage Local Fallback'),
			_('Provide the minimal loopback-only ordinary-site fallback on 127.0.0.1:8090. Disable this only when another local Nginx server already owns that listener.')
		);
		o.depends('_mode', 'direct_https');
		o.depends('_mode', 'cloudflare');
		o.depends('_mode', 'shared');
		o.default = '1';
		o.cfgvalue = function () {
			return uci.get('nginx_telego', 'fallback', 'manage') || '1';
		};
		o.write = function (sectionId, value) {
			uci.set('nginx_telego', 'fallback', 'manage', value === '1' ? '1' : '0');
		};

		o = s.option(form.DummyValue, '_safety', _('Apply Safety'));
		o.cfgvalue = function () {
			return _('Conflict detection · nginx -t · fw4 check · transactional rollback · administrator-owned files and firewall rules are never overwritten');
		};


		o = s.option(
			form.DummyValue,
			'_native_advanced_note',
			_('Advanced Compatibility Mode'),
			_('Native Shared-Port keeps telEgo on public TCP/443 and splices WEB TLS to private Nginx listeners. Use it only when you intentionally need the legacy shared-port topology.')
		);
		o.depends('_mode', 'shared');
		o.cfgvalue = function () { return _('Enabled'); };

		o = s.option(
			form.Value,
			'hostname',
			_('Hostname'),
			_('Leave empty to reuse telego.web_proxy.hostname. Native Shared-Port requires the WEB hostname, FakeTLS mask hostname and TLS certificate hostname to agree.')
		);
		o.depends('_mode', 'shared');
		o.datatype = 'hostname';
		o.rmempty = true;
		o.validate = validateIngressHostname;

		o = s.option(
			form.Value,
			'certificate',
			_('TLS Certificate'),
			_('Absolute path to the existing certificate chain used by the private Nginx TLS listeners.')
		);
		o.depends('_mode', 'shared');
		o.rmempty = false;
		o.validate = validateAbsolutePath;

		o = s.option(
			form.Value,
			'certificate_key',
			_('TLS Private Key'),
			_('Absolute path to the matching private key. nginx-telego never creates or renews certificates.')
		);
		o.depends('_mode', 'shared');
		o.rmempty = false;
		o.validate = validateAbsolutePath;

		o = s.option(form.DummyValue, '_shared_flow', _('Native Shared-Port Flow'));
		o.depends('_mode', 'shared');
		o.cfgvalue = function () {
			return 'telEgo :443 → Nginx 127.0.0.1:8443 → telEgo WEB 127.0.0.1:8080';
		};

		o = s.option(form.DummyValue, '_certificate_source', _('FakeTLS Certificate Source'));
		o.depends('_mode', 'shared');
		o.cfgvalue = function () { return '127.0.0.1:8444'; };

		o = s.option(form.DummyValue, '_shared_contract', _('Current Native Shared-Port Contract'));
		o.depends('_mode', 'shared');
		o.cfgvalue = sharedContractText;
		o.description = _('Required values are public TCP/443, certificate source 127.0.0.1:8444, fallback 127.0.0.1:8443 and PROXY Protocol v2. nginx-telego refuses to apply the managed Nginx state if this contract is not satisfied.');

		return m.render();
	}
});
