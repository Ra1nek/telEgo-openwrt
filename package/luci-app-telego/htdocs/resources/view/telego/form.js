'use strict';

return {
	validateSecret: function(value) {
		return /^[0-9a-fA-F]{32}$/.test(value || '');
	},

	validateBindAddress: function(value) {
		if (!value)
			return false;
		if (value.startsWith('unix://') || value.startsWith('/'))
			return true;

		const ipv6 = value.match(/^\[([0-9a-fA-F:]+)\]:(\d+)$/);
		const ipv4 = value.match(/^([^:]+):(\d+)$/);
		const port = Number((ipv6 || ipv4 || [])[2]);
		if (!Number.isInteger(port) || port < 1 || port > 65535)
			return false;
		if (ipv6)
			return /^[0-9a-fA-F:]+$/.test(ipv6[1]);
		if (!ipv4)
			return false;
		return ipv4[1].split('.').length === 4 && ipv4[1].split('.').every(function(octet) {
			const n = Number(octet);
			return /^\d{1,3}$/.test(octet) && n >= 0 && n <= 255;
		});
	},

	validateDuration: function(value) {
		return /^(\d+)(ms|s|m|h|d)$/.test(value || '');
	},

	validateCIDR: function(value) {
		if (!value)
			return false;
		const parts = value.split('/');
		if (parts.length !== 2)
			return false;
		const mask = Number(parts[1]);
		if (!Number.isInteger(mask))
			return false;
		if (parts[0].indexOf(':') !== -1)
			return /^[0-9a-fA-F:]+$/.test(parts[0]) && mask >= 0 && mask <= 128;
		return parts[0].split('.').length === 4 && parts[0].split('.').every(function(octet) {
			const n = Number(octet);
			return /^\d{1,3}$/.test(octet) && n >= 0 && n <= 255;
		}) && mask >= 0 && mask <= 32;
	},

	validateHostname: function(value) {
		return /^(?=.{1,253}$)([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(value || '');
	},

	validatePort: function(value) {
		const port = Number(value);
		return Number.isInteger(port) && port >= 1 && port <= 65535;
	},

	createSecretField: function(form, section, name, title, description) {
		const field = new form.Value(section, name, title, description);
		field.datatype = 'string';
		field.validate = function(value) {
			return this.validateSecret(value) ? true : _('Invalid secret format. Use exactly 32 hexadecimal characters.');
		}.bind(this);
		return field;
	},

	createBindAddressField: function(form, section, name, title) {
		const field = new form.Value(section, name, title);
		field.datatype = 'string';
		field.validate = function(value) {
			return this.validateBindAddress(value) ? true : _('Invalid bind address. Use IP:port, [IPv6]:port, or unix://path.');
		}.bind(this);
		return field;
	},

	createDurationField: function(form, section, name, title, defaultValue) {
		const field = new form.Value(section, name, title);
		field.datatype = 'string';
		field.default = defaultValue || '5m';
		field.validate = function(value) {
			return this.validateDuration(value) ? true : _('Invalid duration. Example: 5s, 1m, 2h.');
		}.bind(this);
		return field;
	},

	createCIDRField: function(form, section, name, title) {
		const field = new form.Value(section, name, title);
		field.datatype = 'string';
		field.validate = function(value) {
			return this.validateCIDR(value) ? true : _('Invalid CIDR notation.');
		}.bind(this);
		return field;
	},

	createHostnameField: function(form, section, name, title) {
		const field = new form.Value(section, name, title);
		field.datatype = 'string';
		field.validate = function(value) {
			return this.validateHostname(value) ? true : _('Invalid hostname.');
		}.bind(this);
		return field;
	},

	createPortField: function(form, section, name, title, defaultValue) {
		const field = new form.Value(section, name, title);
		field.datatype = 'port';
		field.default = defaultValue || 443;
		return field;
	},

	formatBytes: function(bytes) {
		if (!Number.isFinite(Number(bytes)) || Number(bytes) <= 0)
			return _('0 B');
		const units = ['B', 'KB', 'MB', 'GB', 'TB'];
		const index = Math.min(Math.floor(Math.log(Number(bytes)) / Math.log(1024)), units.length - 1);
		return (Number(bytes) / Math.pow(1024, index)).toFixed(index ? 2 : 0) + ' ' + _(units[index]);
	},

	parseDuration: function(value) {
	const match = String(value || '').match(/^(\d+)(ms|s|m|h|d)$/);
		if (!match)
			return 0;
		const multipliers = { ms: 0.001, s: 1, m: 60, h: 3600, d: 86400 };
		return Number(match[1]) * multipliers[match[2]];
	},

	generateSecret: function() {
		const bytes = new Uint8Array(16);
		crypto.getRandomValues(bytes);
		return Array.from(bytes, function(byte) {
			return byte.toString(16).padStart(2, '0');
		}).join('');
	},

	validateCertPath: function(value) {
		return /^(?:\/[^\0]+|[A-Za-z0-9_.-]+)$/.test(value || '');
	},

	validateCarrier: function(value) {
		return ['https', 'http2', 'websocket', 'https-lanes', 'websocket-lanes'].includes(String(value || '').toLowerCase());
	}
};
