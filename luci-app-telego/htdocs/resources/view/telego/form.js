// telEgo Form Helpers for LuCI
// OpenWrt 25.12 Reusable Components and Validators
'use strict';

return {
	// === Custom Datatypes ===

	// Validate hex secret (exactly 32 characters)
	validateSecret: function(value) {
		if (!value || value.length !== 32) {
			return false;
		}
		const hexRegex = /^[0-9a-fA-F]{32}$/;
		return hexRegex.test(value);
	},

	// Validate bind address (IP:Port or unix://path)
	validateBindAddress: function(value) {
		if (!value) return false;
		
		// Unix socket format
		if (value.startsWith('unix://') || value.startsWith('/')) {
			return true;
		}
		
		// IP:Port format
		const parts = value.split(':');
		if (parts.length !== 2) return false;
		
		const ip = parts[0];
		const port = parseInt(parts[1], 10);
		
		// Validate IP
		const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
		const ipv6Regex = /^([0-9a-fA-F:]+)$/;
		
		if (!ipv4Regex.test(ip) && !ipv6Regex.test(ip)) {
			return false;
		}
		
		// Validate port range
		if (port < 1 || port > 65535) {
			return false;
		}
		
		return true;
	},

	// Validate duration string (e.g., "5s", "1m", "2h")
	validateDuration: function(value) {
		if (!value) return false;
		const durationRegex = /^(\d+)([smhd])$/;
		return durationRegex.test(value);
	},

	// Validate CIDR notation
	validateCIDR: function(value) {
		if (!value) return false;
		const parts = value.split('/');
		if (parts.length !== 2) return false;
		
		const ip = parts[0];
		const mask = parseInt(parts[1], 10);
		
		// Basic IP validation
		const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
		if (!ipv4Regex.test(ip)) return false;
		
		// Validate CIDR mask (0-32)
		return mask >= 0 && mask <= 32;
	},

	// Validate hostname
	validateHostname: function(value) {
		if (!value) return false;
		const hostnameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$/;
		return hostnameRegex.test(value);
	},

	// Validate port number
	validatePort: function(value) {
		const port = parseInt(value, 10);
		return !isNaN(port) && port >= 1 && port <= 65535;
	},

	// === Form Field Helpers ===

	// Create a secret input field with validation
	createSecretField: function(form, section, name, title, description) {
		const field = new form.Value(section, name, title, description);
		field.datatype = 'string';
		field.length = 32;
		field.validation = function(value) {
			if (!this.validateSecret(value)) {
				return _('Invalid secret value. Must be exactly 32 hexadecimal characters');
			}
			return true;
		};
		field.placeholder = '0123456789abcdef0123456789abcdef';
		return field;
	},

	// Create a bind address input with validation
	createBindAddressField: function(form, section, name, title) {
		const field = new form.Value(section, name, title);
		field.datatype = 'string';
		field.default = '0.0.0.0:443';
		field.placeholder = '0.0.0.0:443 or unix:///run/telego.sock';
		field.validation = function(value) {
			if (!this.validateBindAddress(value)) {
				return _('Invalid bind address. Use IP:Port format (e.g., 0.0.0.0:443) or unix://path');
			}
			return true;
		};
		return field;
	},

	// Create a duration input with validation
	createDurationField: function(form, section, name, title, defaultVal) {
		const field = new form.Value(section, name, title);
		field.datatype = 'string';
		field.default = defaultVal || '5m';
		field.placeholder = 'e.g., 5s, 1m, 2h';
		field.validation = function(value) {
			if (!this.validateDuration(value)) {
				return _('Invalid duration format. Use number + unit (s/m/h/d). Example: 5s, 1m, 2h');
			}
			return true;
		};
		return field;
	},

	// Create a CIDR input with validation
	createCIDRField: function(form, section, name, title) {
		const field = new form.Value(section, name, title);
		field.datatype = 'string';
		field.placeholder = 'e.g., 192.168.1.0/24';
		field.validation = function(value) {
			if (!this.validateCIDR(value)) {
				return _('Invalid CIDR format. Use IP/mask (e.g., 192.168.1.0/24)');
			}
			return true;
		};
		return field;
	},

	// Create a hostname input with validation
	createHostnameField: function(form, section, name, title) {
		const field = new form.Value(section, name, title);
		field.datatype = 'string';
		field.validation = function(value) {
			if (!this.validateHostname(value)) {
				return _('Invalid hostname format');
			}
			return true;
		};
		return field;
	},

	// Create a port input with validation
	createPortField: function(form, section, name, title, defaultVal) {
		const field = new form.Value(section, name, title);
		field.datatype = 'uinteger';
		field.default = defaultVal || 443;
		field.max = 65535;
		return field;
	},

	// === UI Helper Functions ===

	// Render a secret row with copy button
	renderSecretRow: function(username, secret) {
		return E('div', {'class': 'secret-row'}, [
			E('span', {'class': 'secret-username'}, [username]),
			E('code', {'class': 'secret-value'}, [secret]),
			E('button', {'class': 'btn btn-action copy-btn', 'onclick': `copyToClipboard('${secret}')`}, 
				[L.text_('Copy')])
		]);
	},

	// === Utility Functions ===

	// Copy text to clipboard
	copyToClipboard: function(text) {
		const textarea = document.createElement('textarea');
		textarea.value = text;
		document.body.appendChild(textarea);
		textarea.select();
		document.execCommand('copy');
		document.body.removeChild(textarea);
	},

	// Format bytes to human readable
	formatBytes: function(bytes) {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
	},

	// Format duration string
	formatDuration: function(durationStr) {
		const match = durationStr.match(/^(\d+)([smhd])$/);
		if (!match) return durationStr;
		const value = parseInt(match[1], 10);
		const unit = match[2];
		const units = { s: 'сек.', m: 'мин.', h: 'час.', d: 'дней' };
		return value + ' ' + units[unit];
	}
};
