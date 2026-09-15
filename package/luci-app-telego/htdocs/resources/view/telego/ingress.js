'use strict';

'require form';
'require uci';
'require view';

function isEnabled(config, section, option) {
	return uci.get(config, section, option || 'enabled') === '1';
}

function profileConflict() {
	return isEnabled('nginx_telego', 'shared') && isEnabled('nginx_telego', 'cloudflare');
}

function profileMode() {
	const shared = isEnabled('nginx_telego', 'shared');
	const cloudflare = isEnabled('nginx_telego', 'cloudflare');

	if (shared && !cloudflare)
		return 'shared';
	if (cloudflare && !shared)
		return 'cloudflare';

	return 'disabled';
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
		return _('An absolute path is required for Native Shared-Port mode.');

	return /^\/[A-Za-z0-9_./+\-]+$/.test(value)
		? true
		: _('Use an absolute path containing only letters, digits, underscore, dot, slash, plus or hyphen.');
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

return view.extend({
	load: function () {
		return Promise.all([
			uci.load('nginx_telego'),
			uci.load('telego')
		]);
	},

	render: function () {
		const m = new form.Map(
			'nginx_telego',
			_('WEB Ingress / Nginx Integration'),
			_('Choose one managed WEB ingress profile. Disabled leaves hand-written Nginx configuration untouched; managed profiles are mutually exclusive and are validated by nginx-telego before Nginx is reloaded.')
		);

		let s = m.section(form.TypedSection, 'shared', _('Ingress Profile'));
		s.anonymous = true;
		s.addremove = false;

		let o = s.option(
			form.ListValue,
			'_mode',
			_('Mode'),
			_('Selecting a mode updates the existing shared.enabled and cloudflare.enabled UCI flags. Save & Apply invokes the nginx-telego renderer through the OpenWrt reload trigger.')
		);
		o.value('disabled', _('Disabled'));
		o.value('cloudflare', 'Cloudflare Tunnel');
		o.value('shared', 'Native Shared-Port');
		o.default = 'disabled';
		o.cfgvalue = function () {
			return profileMode();
		};
		o.write = function (sectionId, value) {
			uci.set('nginx_telego', 'shared', 'enabled', value === 'shared' ? '1' : '0');
			uci.set('nginx_telego', 'cloudflare', 'enabled', value === 'cloudflare' ? '1' : '0');
		};

		o = s.option(form.DummyValue, '_profile_state', _('Status'));
		o.cfgvalue = function () {
			return profileConflict() ? _('Error') : _('Enabled');
		};

		o = s.option(form.DummyValue, '_managed_output', _('Managed Nginx File'));
		o.cfgvalue = function () { return '/etc/nginx/conf.d/zz-telego-managed.conf'; };

		o = s.option(form.DummyValue, '_web_contract', _('Current telEgo WEB Contract'));
		o.cfgvalue = webContractText;
		o.depends('_mode', 'cloudflare');
		o.depends('_mode', 'shared');

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
		o.validate = function (sectionId, value) {
			const webHostname = uci.get('telego', 'web_proxy', 'hostname') || '';
			return !value || !webHostname || value === webHostname
				? true
				: _('The ingress hostname must match the telEgo WEB Proxy hostname.');
		};

		o = s.option(form.DummyValue, '_cloudflare_origin', _('Cloudflare Tunnel Service URL'));
		o.depends('_mode', 'cloudflare');
		o.cfgvalue = function () { return 'http://127.0.0.1:18080'; };
		o.description = _('Configure the Cloudflare Published Application to use this local HTTP origin. Public TLS terminates at Cloudflare.');

		o = s.option(
			form.Value,
			'hostname',
			_('Hostname'),
			_('Leave empty to reuse telego.web_proxy.hostname. Native Shared-Port requires the WEB hostname, FakeTLS mask hostname and TLS certificate hostname to agree.')
		);
		o.depends('_mode', 'shared');
		o.datatype = 'hostname';
		o.rmempty = true;
		o.validate = function (sectionId, value) {
			const webHostname = uci.get('telego', 'web_proxy', 'hostname') || '';
			return !value || !webHostname || value === webHostname
				? true
				: _('The ingress hostname must match the telEgo WEB Proxy hostname.');
		};

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
		o.cfgvalue = function () { return 'https://127.0.0.1:8444'; };

		o = s.option(form.DummyValue, '_shared_contract', _('Current Native Shared-Port Contract'));
		o.depends('_mode', 'shared');
		o.cfgvalue = sharedContractText;
		o.description = _('Required values are public TCP/443, certificate source 127.0.0.1:8444, fallback 127.0.0.1:8443 and PROXY Protocol v2. The renderer refuses to change Nginx if this contract is not satisfied.');

		o = s.option(
			form.Flag,
			'fallback_manage',
			_('Manage Local Fallback'),
			_('Provide the minimal loopback-only ordinary-site fallback on 127.0.0.1:8090. Disable this only when another local Nginx server already owns that listener.')
		);
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
			return _('Conflict detection · nginx -t · atomic rollback · administrator-owned files are never overwritten');
		};

		return m.render();
	}
});
