'use strict';
const view = require('ui').view;
return view.extend({
	render: function() {
		const form = new L.ui.Form(this, 'telego_config', _('telEgo Configuration'));
		form.title = _('Telegram MTProxy + WEB Proxy Settings');
		form.description = _('Configure your Telegram proxy server settings. Changes take effect after service reload.');

		// === General Settings Section ===
		const generalSection = form.section(form.TypedSection, 'general', _('General Settings'));
		generalSection.addremove = false;

		// Bind Address
		generalSection.tab('main', _('Main'));
		generalSection.tab('advanced', _('Advanced'));

		const bindTo = new form.Value(generalSection, 'bind_to', _('Bind Address'),
			_('Address and port to listen on. Example: 0.0.0.0:443 or unix:///run/telego.sock'));
		bindTo.datatype = 'string';
		bindTo.default = '0.0.0.0:443';
		generalSection.tab('main', bindTo);

		// Log Level
		const logLevel = new form.Value(generalSection, 'log_level', _('Log Level'));
		logLevel.datatype = "list('trace', 'debug', 'info', 'warn', 'error')";
		logLevel.default = 'info';
		generalSection.tab('main', logLevel);

		// Proxy Protocol Support
		const proxyProtocol = new form.Flag(generalSection, 'proxy_protocol', _('Enable PROXY Protocol'));
		proxyProtocol.description = _('Accept incoming PROXY protocol headers (for reverse proxy setups)');
		generalSection.tab('main', proxyProtocol);

		// Max Connections Per IP
		const maxConnPerIP = new form.Value(generalSection, 'max_connections_per_ip', 
			_('Max Connections Per IP'), _('Maximum concurrent connections per client IP'));
		maxConnPerIP.datatype = 'uinteger';
		maxConnPerIP.default = 100;
		generalSection.tab('advanced', maxConnPerIP);

		// Max IPs Per User
		const maxIPsPerUser = new form.Value(generalSection, 'max_ips_per_user', 
			_('Max Unique IPs Per User'), _('Maximum unique client IPs per authenticated user'));
		maxIPsPerUser.datatype = 'uinteger';
		maxIPsPerUser.default = 10;
		generalSection.tab('advanced', maxIPsPerUser);

		// IP Block Timeout
		const ipBlockTimeout = new form.Value(generalSection, 'ip_block_timeout', 
			_('IP Block Timeout'), _('Duration blocked IPs remain blocked (e.g., 1h, 30m)'));
		ipBlockTimeout.datatype = 'string';
		ipBlockTimeout.default = '1h';
		generalSection.tab('advanced', ipBlockTimeout);

		// Handshake Timeout
		const handshakeTimeout = new form.Value(generalSection, 'handshake_timeout', 
			_('Handshake Timeout'), _('Maximum time for MTProto handshake (e.g., 5s)'));
		handshakeTimeout.datatype = 'string';
		handshakeTimeout.default = '5s';
		generalSection.tab('advanced', handshakeTimeout);

		// === Secrets Section ===
		const secretsSection = form.section(form.TypedSection, 'secrets', _('User Secrets'));
		secretsSection.addremove = true;
		secretsSection.anonymous = true;
		secretsSection.sortable = true;

		// Secret Name
		const secretName = new form.Value(secretsSection, '.name', _('Username'),
			_('Identifier for this user (used in proxy links)'));
		secretName.rmplaceholder = _('username');
		secretsSection.tab('main', secretName);

		// Secret Value
		const secretValue = new form.Value(secretsSection, 'secret', _('Secret'),
			_('32-character hex secret. Generate with: telego generate <hostname>'));
		secretValue.datatype = 'hexstring';
		secretValue.length = 16; // 16 bytes = 32 hex chars
		secretsSection.tab('main', secretValue);

		// Secret Description
		const secretDesc = new form.Value(secretsSection, 'description', _('Description'),
			_('Optional description for this user'));
		secretDesc.rmplaceholder = _('User description');
		secretsSection.tab('main', secretDesc);

		// === TLS Fronting Section ===
		const tlsFrontingSection = form.section(form.TypedSection, 'tls_fronting', 
			_('TLS Fronting'), _('Traffic obfuscation settings'));
		tlsFrontingSection.addremove = false;

		// Enable TLS Fronting
		const tlsEnabled = new form.Flag(tlsFrontingSection, 'enabled', _('Enable TLS Fronting'));
		tlsEnabled.description = _('Mimic legitimate HTTPS traffic to bypass censorship');
		tlsFrontingSection.tab('main', tlsEnabled);

		// Mask Host
		const maskHost = new form.Value(tlsFrontingSection, 'mask_host', 
			_('Mask Host'), _('Domain to mimic (SNI validation, proxy links)'));
		maskHost.datatype = 'hostname';
		tlsFrontingSection.tab('main', maskHost);

		// Mask Port
		const maskPort = new form.Value(tlsFrontingSection, 'mask_port', 
			_('Mask Port'), _('Port for TLS fronting'));
		maskPort.datatype = 'port';
		maskPort.default = 443;
		tlsFrontingSection.tab('advanced', maskPort);

		// Certificate Host (Optional)
		const certHost = new form.Value(tlsFrontingSection, 'cert_host', 
			_('Certificate Host'), _('Override certificate fetch host'));
		certHost.datatype = 'hostname';
		tlsFrontingSection.tab('advanced', certHost);

		// Cert Port (Optional)
		const certPort = new form.Value(tlsFrontingSection, 'cert_port', 
			_('Certificate Port'), _('Override certificate fetch port'));
		certPort.datatype = 'port';
		tlsFrontingSection.tab('advanced', certPort);

		// === WEB Proxy Section ===
		const webProxySection = form.section(form.TypedSection, 'web_proxy', 
			_('WEB Proxy'), _('New Telegram proxy standard (August 2026)'));
		webProxySection.addremove = false;

		// Enable WEB Proxy
		const webEnabled = new form.Flag(webProxySection, 'enabled', _('Enable WEB Proxy'));
		webEnabled.description = _('WEB proxy with HTTPS/HTTP2/WebSocket carriers');
		webProxySection.tab('main', webEnabled);

		// Carrier Mode
		const carrierMode = new form.Value(webProxySection, 'carrier', 
			_('Carrier Mode'), _('Transport protocol for WEB proxy'));
		carrierMode.datatype = "list('https', 'http2', 'websocket', 'https-lanes', 'websocket-lanes')";
		carrierMode.default = 'https-lanes';
		webProxySection.tab('main', carrierMode);

		// WEB Proxy Bind Address
		const webBindTo = new form.Value(webProxySection, 'bind_to', 
			_('WEB Proxy Bind'), _('Address for WEB proxy listener'));
		webBindTo.datatype = 'string';
		webBindTo.default = '127.0.0.1:8443';
		webProxySection.tab('main', webBindTo);

		// WEB Proxy Hostname
		const webHostname = new form.Value(webProxySection, 'hostname', 
			_('WEB Proxy Hostname'), _('Override hostname for WEB proxy'));
		webHostname.datatype = 'hostname';
		webProxySection.tab('main', webHostname);

		// WEB Proxy Backend
		const webBackend = new form.Value(webProxySection, 'backend', 
			_('WEB Proxy Backend'), _('Backend address for WEB proxy'));
		webBackend.datatype = 'string';
		webProxySection.tab('main', webBackend);

		// Trusted Proxy CIDRs
		const trustedCIDRs = new form.Value(webProxySection, 'trusted_proxy_cidrs', 
			_('Trusted Proxy CIDRs'), _('CIDR ranges for X-Forwarded-For validation'));
		trustedCIDRs.datatype = 'string';
		trustedCIDRs.default = '127.0.0.0/8';
		webProxySection.tab('advanced', trustedCIDRs);

		// === Middle-End Section (v0.6.0) ===
		const middleEndSection = form.section(form.TypedSection, 'middle_end', 
			_('Telegram Middle-End'), _('Middle-End relay configuration'));
		middleEndSection.addremove = false;

		// Enable Middle-End
		const meEnabled = new form.Flag(middleEndSection, 'enabled', _('Enable Middle-End'));
		meEnabled.description = _('Telegram Middle-End relay for improved performance and NAT traversal');
		middleEndSection.tab('main', meEnabled);

		// Proxy Tag (Promo Code)
		const proxyTag = new form.Value(middleEndSection, 'proxy_tag', 
			_('Proxy Tag'), _('Telegram promo tag for Middle-End identification'));
		proxyTag.datatype = 'string';
		middleEndSection.tab('main', proxyTag);

		// SOCKS5 Proxy for ME Traffic
		const socks5Proxy = new form.Value(middleEndSection, 'socks5', 
			_('SOCKS5 Proxy'), _('Route Middle-End traffic through SOCKS5 proxy'));
		socks5Proxy.datatype = 'string';
		middleEndSection.tab('advanced', socks5Proxy);

		// NAT IP for STUN Discovery
		const natIP = new form.Value(middleEndSection, 'nat_ip', 
			_('NAT IP'), _('Custom external IP for STUN discovery (NAT networks)'));
		natIP.datatype = 'ipaddr';
		middleEndSection.tab('advanced', natIP);

		// === Performance Section ===
		const perfSection = form.section(form.TypedSection, 'performance', 
			_('Performance'), _('Tuning parameters'));
		perfSection.addremove = false;

		// TCP Buffer Size
		const tcpBufferKB = new form.Value(perfSection, 'tcp_buffer_kb', 
			_('TCP Buffer (KB)'), _('Socket buffer size in kilobytes'));
		tcpBufferKB.datatype = 'uinteger';
		tcpBufferKB.default = 128;
		perfSection.tab('main', tcpBufferKB);

		// Prefer IP Version
		const preferIP = new form.Value(perfSection, 'prefer_ip', 
			_('Prefer IP Version'), _('DC connection preference'));
		preferIP.datatype = "list('prefer-ipv4', 'prefer-ipv6', 'only-ipv4', 'only-ipv6')";
		preferIP.default = 'prefer-ipv4';
		perfSection.tab('main', preferIP);

		// Idle Timeout
		const idleTimeout = new form.Value(perfSection, 'idle_timeout', 
			_('Idle Timeout'), _('Connection idle timeout (e.g., 5m)'));
		idleTimeout.datatype = 'string';
		idleTimeout.default = '5m';
		perfSection.tab('main', idleTimeout);

		// Num Event Loops
		const numEventLoops = new form.Value(perfSection, 'num_event_loops', 
			_('Event Loops'), _('Number of event loops (0 = auto)'));
		numEventLoops.datatype = 'uinteger';
		numEventLoops.default = 0;
		perfSection.tab('advanced', numEventLoops);

		// === Metrics Section ===
		const metricsSection = form.section(form.TypedSection, 'metrics', 
			_('Metrics'), _('Prometheus metrics configuration'));
		metricsSection.addremove = false;

		// Enable Metrics
		const metricsEnabled = new form.Flag(metricsSection, 'enabled', _('Enable Prometheus Metrics'));
		metricsSection.tab('main', metricsEnabled);

		// Metrics Bind Address
		const metricsBindTo = new form.Value(metricsSection, 'bind_to', 
			_('Metrics Address'), _('Prometheus metrics listener address'));
		metricsBindTo.datatype = 'string';
		metricsBindTo.default = '127.0.0.1:9090';
		metricsSection.tab('main', metricsBindTo);

		return form.render();
	}
});