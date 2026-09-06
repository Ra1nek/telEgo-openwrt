'use strict';

'require view';
'require form';

return view.extend({
	render: function() {
		const m = new form.Map(
			'telego',
			_('telEgo Configuration'),
			_('Configure Telegram MTProxy, WEB Proxy, TLS fronting and Middle-End settings.')
		);

		let s = m.section(form.TypedSection, 'general', _('General Settings'));
		s.anonymous = true;
		s.addremove = false;

		let o = s.option(form.Flag, 'enabled', _('Enable telEgo'));
		o.default = '0';

		o = s.option(form.Value, 'bind_to', _('Bind Address'), _('Address and port to listen on.'));
		o.datatype = 'string';
		o.default = '0.0.0.0:443';

		o = s.option(form.ListValue, 'log_level', _('Log Level'));
		o.value('trace', _('Trace'));
		o.value('debug', _('Debug'));
		o.value('info', _('Info'));
		o.value('warn', _('Warning'));
		o.value('error', _('Error'));
		o.default = 'info';

		o = s.option(form.Flag, 'proxy_protocol', _('Enable PROXY Protocol'));
		o.description = _('Accept incoming PROXY protocol headers from a trusted reverse proxy.');

		o = s.option(form.Value, 'max_connections_per_ip', _('Max Connections Per IP'));
		o.datatype = 'uinteger';
		o.default = '100';

		o = s.option(form.Value, 'max_ips_per_user', _('Max Unique IPs Per User'));
		o.datatype = 'uinteger';
		o.default = '10';

		o = s.option(form.Value, 'ip_block_timeout', _('IP Block Timeout'));
		o.datatype = 'string';
		o.default = '5m';

		o = s.option(form.Value, 'handshake_timeout', _('Handshake Timeout'));
		o.datatype = 'string';
		o.default = '5s';

		s = m.section(form.TypedSection, 'secret', _('User Secrets'));
		s.anonymous = true;
		s.addremove = true;
		s.sortable = true;

		o = s.option(form.Value, 'name', _('Username'), _('Identifier used in generated proxy links.'));
		o.datatype = 'uciname';
		o.rmempty = false;

		o = s.option(form.Value, 'secret', _('Secret'), _('Exactly 32 hexadecimal characters.'));
		o.datatype = 'string';
		o.rmempty = false;
		o.validate = function(section_id, value) {
			return /^[0-9a-fA-F]{32}$/.test(value) ? true : _('Secret must contain exactly 32 hexadecimal characters.');
		};

		o = s.option(form.Value, 'description', _('Description'));
		o.datatype = 'string';

		s = m.section(form.TypedSection, 'tls_fronting', _('TLS Fronting'));
		s.anonymous = true;
		s.addremove = false;

		o = s.option(form.Value, 'mask_host', _('Mask Host'), _('Domain to mimic for TLS fronting.'));
		o.datatype = 'hostname';
		o.default = 'www.google.com';

		o = s.option(form.Value, 'mask_port', _('Mask Port'));
		o.datatype = 'port';
		o.default = '443';

		o = s.option(form.Value, 'cert_host', _('Certificate Host'), _('Optional certificate fetch override.'));
		o.datatype = 'hostname';

		o = s.option(form.Value, 'cert_port', _('Certificate Port'));
		o.datatype = 'port';

		o = s.option(form.Value, 'fake_cert_size', _('Fake Certificate Size'));
		o.datatype = 'uinteger';

		o = s.option(form.DynamicList, 'mask_sni_safelist', _('Mask SNI Safelist'));
		o.datatype = 'hostname';

		o = s.option(form.Value, 'splice_host', _('Splice Host'));
		o.datatype = 'hostname';

		o = s.option(form.Value, 'splice_port', _('Splice Port'));
		o.datatype = 'port';

		o = s.option(form.ListValue, 'splice_proxy_protocol', _('Splice PROXY Protocol'));
		o.value('0', _('Disabled'));
		o.value('1', _('PROXY protocol v1'));
		o.value('2', _('PROXY protocol v2'));

		o = s.option(form.Value, 'splice_idle_timeout', _('Splice Idle Timeout'));
		o.datatype = 'string';
		o.default = '30s';

		o = s.option(form.Flag, 'enable_drs', _('Enable DRS'));
		o.default = '1';

		o = s.option(form.Flag, 'enable_split_tls', _('Enable Split TLS'));
		o.default = '1';

		s = m.section(form.TypedSection, 'web_proxy', _('WEB Proxy'));
		s.anonymous = true;
		s.addremove = false;

		o = s.option(form.Flag, 'enabled', _('Enable WEB Proxy'));
		o.description = _('Expose the native WEB proxy through the configured local listener.');

		o = s.option(form.ListValue, 'carrier', _('Carrier Mode'));
		['https', 'http2', 'websocket', 'https-lanes', 'websocket-lanes'].forEach(function(value) {
			o.value(value, value);
		});
		o.default = 'https-lanes';

		o = s.option(form.Value, 'bind_to', _('WEB Proxy Bind'));
		o.datatype = 'string';
		o.default = '127.0.0.1:8443';

		o = s.option(form.Value, 'hostname', _('WEB Proxy Hostname'));
		o.datatype = 'hostname';

		o = s.option(form.Value, 'backend', _('WEB Proxy Backend'));
		o.datatype = 'string';

		o = s.option(form.DynamicList, 'trusted_proxy_cidrs', _('Trusted Proxy CIDRs'));
		o.datatype = 'cidr';
		o.default = ['127.0.0.0/8'];

		o = s.option(form.Value, 'num_event_loops', _('WEB Event Loops'));
		o.datatype = 'uinteger';
		o.default = '0';

		s = m.section(form.TypedSection, 'middle_end', _('Telegram Middle-End'));
		s.anonymous = true;
		s.addremove = false;

		o = s.option(form.Flag, 'enabled', _('Enable Middle-End'));
		o.description = _('Use Telegram Middle-End relay transport.');

		o = s.option(form.Value, 'proxy_tag', _('Proxy Tag'), _('Telegram promo tag for Middle-End identification.'));
		o.datatype = 'string';

		o = s.option(form.Value, 'socks5', _('SOCKS5 Proxy'), _('Route Middle-End traffic through SOCKS5.'));
		o.datatype = 'string';

		o = s.option(form.Value, 'socks5_username', _('SOCKS5 Username'));
		o.datatype = 'string';

		o = s.option(form.Value, 'socks5_password', _('SOCKS5 Password'));
		o.password = true;
		o.datatype = 'string';

		o = s.option(form.Value, 'artifact_proxy', _('Artifact Proxy'));
		o.datatype = 'string';

		o = s.option(form.Value, 'nat_ip', _('STUN NAT IP'), _('Custom external IP used for STUN discovery behind NAT.'));
		o.datatype = 'ipaddr';

		o = s.option(form.Value, 'max_connections', _('Middle-End Max Connections'));
		o.datatype = 'uinteger';

		o = s.option(form.Value, 'queue_budget_mb', _('Middle-End Queue Budget (MB)'));
		o.datatype = 'uinteger';

		s = m.section(form.TypedSection, 'performance', _('Performance'));
		s.anonymous = true;
		s.addremove = false;

		o = s.option(form.Value, 'tcp_buffer_kb', _('TCP Buffer (KB)'));
		o.datatype = 'uinteger';
		o.default = '128';

		o = s.option(form.Value, 'num_event_loops', _('Event Loops'));
		o.datatype = 'uinteger';
		o.default = '0';

		o = s.option(form.ListValue, 'prefer_ip', _('Prefer IP Version'));
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

		o = s.option(form.Value, 'client_silence_close', _('Client Silence Close'));
		o.datatype = 'string';
		o.default = '0s';

		s = m.section(form.TypedSection, 'upstream', _('Upstream'));
		s.anonymous = true;
		s.addremove = false;
		o = s.option(form.Value, 'socks5', _('SOCKS5 Proxy'));
		o.datatype = 'string';

		s = m.section(form.TypedSection, 'metrics', _('Metrics'));
		s.anonymous = true;
		s.addremove = false;
		o = s.option(form.Value, 'bind_to', _('Metrics Address'));
		o.datatype = 'string';
		o.default = '127.0.0.1:9090';
		o.description = _('Keep metrics bound to localhost unless you explicitly need remote Prometheus access.');
		o = s.option(form.Value, 'path', _('Metrics Path'));
		o.datatype = 'string';
		o.default = '/metrics';

		return m.render();
	}
});
