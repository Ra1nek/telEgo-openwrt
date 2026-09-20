'use strict';

'require form';
'require uci';
'require view';

const maxDDDownlinkDelayUs = 1000000;

function featureNote(section, text) {
	const o = section.option(form.DummyValue, '_feature_note', _('Status'));
	o.cfgvalue = function () { return text; };
	return o;
}

function parseDDDownlinkDelayUs(value) {
	value = String(value || '');
	if (value === '0s')
		return 0;

	const match = /^([1-9][0-9]*)(us|ms|s)$/.exec(value);
	if (!match)
		return null;

	const number = Number(match[1]);
	if (!Number.isSafeInteger(number))
		return null;

	const multiplier = match[2] === 'us' ? 1 : (match[2] === 'ms' ? 1000 : 1000000);
	const microseconds = number * multiplier;
	return Number.isSafeInteger(microseconds) && microseconds <= maxDDDownlinkDelayUs
		? microseconds
		: null;
}

function siblingFormValue(option, name, sectionId, fallback) {
	const sibling = L.toArray(option.map.lookupOption(name, sectionId))[0];
	if (!sibling)
		return fallback;

	const value = sibling.formvalue(sectionId);
	return value == null || value === '' ? fallback : value;
}

return view.extend({
	load: function () {
		return Promise.all([
			uci.load('telego'),
			L.resolveDefault(uci.load('nginx_telego'), null)
		]);
	},

	render: function () {
		const tlsEnabled = uci.get('telego', 'tls_fronting', 'enabled') !== '0';
		const webEnabled = uci.get('telego', 'web_proxy', 'enabled') === '1';
		const middleEndEnabled = uci.get('telego', 'middle_end', 'enabled') === '1';
		const sharedWeb = uci.get('nginx_telego', 'shared', 'enabled') === '1';
		const externalTlsWeb =
			!sharedWeb &&
			(
				uci.get('nginx_telego', 'cloudflare', 'enabled') === '1' ||
				uci.get('nginx_telego', 'direct_https', 'enabled') === '1'
			);

		const m = new form.Map(
			'telego',
			_('Advanced Settings'),
			_('Rare transport, security and runtime controls. Defaults are recommended unless you are diagnosing a specific problem or using an advanced ingress topology.')
		);

		let s = m.section(form.TypedSection, 'general', _('MTProxy Advanced'));
		s.anonymous = true;
		s.addremove = false;

		let o = s.option(
			form.Flag,
			'proxy_protocol',
			_('Accept Incoming PROXY Protocol'),
			_('Enable only when a trusted TCP proxy is directly in front of the public MTProxy listener.')
		);
		o.default = '0';

		o = s.option(form.Value, 'max_connections_per_ip', _('Max Connections per IP'));
		o.datatype = 'uinteger';
		o.default = '100';
		o.description = _('0 disables this connection-flood limit.');

		o = s.option(form.Value, 'max_ips_per_user', _('Max IPs per User'));
		o.datatype = 'uinteger';
		o.default = '10';
		o.description = _('0 disables per-secret IP limiting.');

		o = s.option(form.Value, 'ip_block_timeout', _('IP Block Timeout'));
		o.datatype = 'string';
		o.default = '5m';

		o = s.option(form.Value, 'handshake_timeout', _('Handshake Timeout'));
		o.datatype = 'string';
		o.default = '5s';

		o = s.option(
			form.Value,
			'clock_sync_url',
			_('Clock Sync URL'),
			_('Optional HTTP(S) URL whose Date header corrects startup clock skew for FakeTLS validation.')
		);
		o.datatype = 'string';
		o.rmempty = true;

		s = m.section(form.TypedSection, 'tls_fronting', _('TLS Fronting Advanced'));
		s.anonymous = true;
		s.addremove = false;

		if (!tlsEnabled) {
			featureNote(s, _('TLS Fronting is disabled. Enable it on the Configuration page to edit EE / FakeTLS advanced settings.'));
		}
		else {
			if (!externalTlsWeb) {
				o = s.option(
					form.Value,
					'cert_host',
					_('Certificate Host'),
					_('Optional certificate source. Native shared-port Nginx on this router uses 127.0.0.1.')
				);
				o.datatype = 'host';
				o.rmempty = true;

				o = s.option(
					form.Value,
					'cert_port',
					_('Certificate Port'),
					_('Native shared-port Nginx uses port 8444 for certificate collection.')
				);
				o.datatype = 'port';
				o.rmempty = true;
				o.default = '';
			}

			o = s.option(form.Value, 'fake_cert_size', _('Fake Certificate Size'));
			o.datatype = 'uinteger';
			o.default = '0';
			o.description = _('0 selects automatic matching; an explicit override must be from 256 to 16384 bytes.');
			o.validate = function (section_id, value) {
				const number = Number(value);
				return value === '0' || (Number.isInteger(number) && number >= 256 && number <= 16384)
					? true
					: _('Use 0 for automatic mode or a value from 256 to 16384.');
			};

			o = s.option(form.DynamicList, 'mask_sni_safelist', _('Mask SNI Safelist'));
			o.datatype = 'hostname';

			if (!externalTlsWeb) {
				o = s.option(
					form.Value,
					'splice_host',
					_('Fallback Host'),
					_('Where unrecognized TLS is spliced. Native shared-port Nginx on this router uses 127.0.0.1.')
				);
				o.datatype = 'host';
				o.rmempty = true;

				o = s.option(
					form.Value,
					'splice_port',
					_('Fallback Port'),
					_('Native shared-port Nginx uses port 8443 and PROXY protocol v2.')
				);
				o.datatype = 'port';
				o.rmempty = true;
				o.default = '';
			}

			o = s.option(form.ListValue, 'splice_proxy_protocol', _('Fallback PROXY Protocol'));
			o.value('0', _('Disabled'));
			o.value('1', _('PROXY Protocol v1'));
			o.value('2', _('PROXY Protocol v2'));
			o.default = '0';

			o = s.option(form.Value, 'splice_idle_timeout', _('Fallback Idle Timeout'));
			o.datatype = 'string';
			o.default = '30s';

			o = s.option(form.Flag, 'enable_drs', _('Enable DRS'));
			o.default = '1';

			o = s.option(form.Flag, 'enable_split_tls', _('Enable Split TLS'));
			o.default = '1';
		}

		s = m.section(form.TypedSection, 'web_proxy', _('WEB Proxy Advanced'));
		s.anonymous = true;
		s.addremove = false;
		if (!webEnabled) {
			featureNote(s, _('WEB Proxy is disabled. Enable it on the Configuration page to edit advanced WEB transport settings.'));
		}
		else {
			o = s.option(
				form.DynamicList,
				'trusted_proxy_cidrs',
				_('Trusted Proxy CIDRs'),
				_('Only these proxy addresses may supply forwarded client addresses.')
			);
			o.datatype = 'cidr';
			o.default = ['127.0.0.1/32'];

			o = s.option(
				form.Value,
				'backend',
				_('Compatibility Backend'),
				_('Optional local TCP or Unix backend. Leave empty to use the faster shared MTProxy core directly.')
			);
			o.datatype = 'string';
			o.rmempty = true;

			o = s.option(
				form.Value,
				'num_event_loops',
				_('WEB Event Loops'),
				_('0 selects the automatic gnet event-loop count.')
			);
			o.datatype = 'uinteger';
			o.default = '0';
		}

		s = m.section(form.TypedSection, 'middle_end', _('Middle-End Advanced'));
		s.anonymous = true;
		s.addremove = false;
		if (!middleEndEnabled) {
			featureNote(s, _('Middle-End is disabled. Enable it on the Configuration page to edit advanced Middle-End transport settings.'));
		}
		else {
			o = s.option(form.Value, 'socks5', _('SOCKS5 Proxy'));
			o.datatype = 'string';
			o.rmempty = true;

			o = s.option(form.Value, 'socks5_username', _('SOCKS5 Username'));
			o.datatype = 'string';
			o.rmempty = true;

			o = s.option(form.Value, 'socks5_password', _('SOCKS5 Password'));
			o.password = true;
			o.datatype = 'string';
			o.rmempty = true;

			o = s.option(form.Value, 'artifact_proxy', _('Artifact Proxy'));
			o.datatype = 'string';
			o.rmempty = true;

			o = s.option(form.Value, 'nat_ip', _('STUN NAT IP'));
			o.datatype = 'ipaddr';
			o.rmempty = true;

			o = s.option(form.Value, 'max_connections', _('Middle-End Max Connections'));
			o.datatype = 'uinteger';
			o.default = '0';
			o.description = _('0 uses the upstream default of 10000; an override may only reduce it.');
			o.validate = function (section_id, value) {
				const number = Number(value);
				return value === '0' || (Number.isInteger(number) && number >= 1 && number <= 10000)
					? true
					: _('Use 0 or a value from 1 to 10000.');
			};

			o = s.option(form.Value, 'queue_budget_mb', _('Middle-End Queue Budget (MB)'));
			o.datatype = 'uinteger';
			o.default = '0';
			o.description = _('0 keeps upstream defaults: about 32 MiB request/input and 66 MiB shared response/output on 64-bit; 2 to 32 sets N MiB request/input and 2xN MiB shared response/output.');
			o.validate = function (section_id, value) {
				const number = Number(value);
				return value === '0' || (Number.isInteger(number) && number >= 2 && number <= 32)
					? true
					: _('Use 0 or a value from 2 to 32.');
			};
		}

		s = m.section(form.TypedSection, 'performance', _('Performance'));
		s.anonymous = true;
		s.addremove = false;

		o = s.option(form.Value, 'num_event_loops', _('Event Loops'));
		o.datatype = 'uinteger';
		o.default = '0';

		o = s.option(form.ListValue, 'prefer_ip', _('IP Preference'));
		o.value('prefer-ipv4', _('Prefer IPv4'));
		o.value('prefer-ipv6', _('Prefer IPv6'));
		o.value('only-ipv4', _('IPv4 only'));
		o.value('only-ipv6', _('IPv6 only'));
		o.default = 'prefer-ipv4';

		o = s.option(form.Value, 'idle_timeout', _('Idle Timeout'));
		o.datatype = 'string';
		o.default = '5m';

		o = s.option(form.Value, 'max_write_buffer_mb', _('Max Write Buffer (MB)'));
		o.datatype = 'uinteger';
		o.default = '0';

		o = s.option(form.Value, 'dd_downlink_chunk', _('DD Downlink Chunk (bytes)'));
		o.datatype = 'uinteger';
		o.default = '0';
		o.description = _('0 keeps the upstream raw-DD batching. For restrictive mobile networks, start with 1200 bytes together with a small DD downlink delay.');
		o.validate = function (section_id, value) {
			const number = Number(value);
			if (!(value === '0' || (Number.isInteger(number) && number >= 256 && number <= 65536)))
				return _('Use 0 or a value from 256 to 65536 bytes.');
			if (middleEndEnabled && number > 0)
				return _('DD Downlink Shaping is unavailable while Middle-End is enabled.');

			const delay = siblingFormValue(this, 'dd_downlink_delay', section_id, '0s');
			const delayUs = parseDDDownlinkDelayUs(delay);
			if (number === 0 && delayUs != null && delayUs > 0)
				return _('Set DD Downlink Delay to 0s before setting DD Downlink Chunk to 0.');

			return true;
		};

		o = s.option(form.Value, 'dd_downlink_delay', _('DD Downlink Delay'));
		o.datatype = 'string';
		o.default = '0s';
		o.description = _('Paces raw-DD proxy-to-client writes without blocking the event loop. 0s disables pacing; start with 2ms when testing mobile DPI degradation.');
		o.validate = function (section_id, value) {
			const delayUs = parseDDDownlinkDelayUs(value);
			if (delayUs == null)
				return _('Use 0s or a positive integer duration no greater than 1s, such as 500us, 2ms, or 1s.');
			if (middleEndEnabled && delayUs > 0)
				return _('DD Downlink Shaping is unavailable while Middle-End is enabled.');

			const chunk = Number(siblingFormValue(this, 'dd_downlink_chunk', section_id, '0'));
			if (delayUs > 0 && chunk === 0)
				return _('DD Downlink Delay requires a non-zero DD Downlink Chunk.');

			return true;
		};

		o = s.option(form.Value, 'client_silence_close', _('Client Silence Close'));
		o.datatype = 'string';
		o.default = '0s';
		o.description = _('0 disables this recovery timer; upstream suggests roughly 10–15s only when diagnosing the iOS Updating stall.');

		s = m.section(form.TypedSection, 'upstream', _('Upstream'));
		s.anonymous = true;
		s.addremove = false;
		o = s.option(
			form.Value,
			'socks5',
			_('SOCKS5 Proxy'),
			_('Optional SOCKS5 route for Telegram DC connections. Leave empty for direct routing.')
		);
		o.datatype = 'string';
		o.rmempty = true;

		s = m.section(form.TypedSection, 'metrics', _('Metrics'));
		s.anonymous = true;
		s.addremove = false;
		o = s.option(form.Value, 'bind_to', _('Metrics Address'));
		o.datatype = 'string';
		o.default = '127.0.0.1:9090';
		o.description = _('Keep metrics on a literal loopback address.');
		o = s.option(form.Value, 'path', _('Metrics Path'));
		o.datatype = 'string';
		o.default = '/metrics';
		o = s.option(form.Flag, 'diagnostics', _('Enable Diagnostics'));
		o.description = _('Private runtime diagnostics require a literal loopback metrics address.');
		o.default = '0';

		return m.render();
	}
});
