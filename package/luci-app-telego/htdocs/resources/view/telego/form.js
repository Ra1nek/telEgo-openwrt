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
				return _('Invalid secret format. Must be exactly 32 hexadecimal characters.');
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
		field.default = '127.0.0.0/8';
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
		field.min = 1;
		field.max = 65535;
		return field;
	},

	// === Proxy Link Generator ===

	generateProxyLinks: function(config) {
		const links = [];
		
		// MTProxy link format
		if (config.secrets && config.tls_fronting.enabled) {
			for (let username in config.secrets) {
				const secret = config.secrets[username];
				const maskHost = config.tls_fronting.mask_host;
				const maskPort = config.tls_fronting.mask_port || 443;
				
				// MTProxy link (ee protocol with TLS fronting)
				links.push({
					type: 'MTProxy',
					protocol: 'eetls',
					link: `mtproto://${maskHost}:${maskPort}?secret=${secret}`,
					username: username
				});
			}
		}
		
		// WEB Proxy link format (new 2026 standard)
		if (config.web_proxy && config.web_proxy.enabled) {
			for (let username in config.secrets) {
				const secret = config.secrets[username];
				const hostname = config.web_proxy.hostname || config.tls_fronting.mask_host;
				
				// WEB Proxy link
				links.push({
					type: 'WEB Proxy',
					protocol: config.web_proxy.carrier,
					link: `webproxy://${hostname}?secret=${secret}`,
					username: username
				});
			}
		}
		
		return links;
	},

	// === UI Components ===

	// Create a reusable secret row template
	createSecretRow: function(username, secret) {
		const E = L.ui.E;
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
		if (!bytes || bytes === 0) return '0 B';
		const units = ['B', 'KB', 'MB', 'GB', 'TB'];
		const unitIndex = Math.floor(Math.log(bytes) / Math.log(1024));
		return parseFloat((bytes / Math.pow(1024, unitIndex)).toFixed(2)) + ' ' + units[unitIndex];
	},

	// Parse duration string to seconds
	parseDuration: function(durationStr) {
		if (!durationStr) return 0;
		const match = durationStr.match(/^(\d+)([smhd])$/);
		if (!match) return 0;
		
		const value = parseInt(match[1], 10);
		const unit = match[2];
		
		switch(unit) {
			case 's': return value;
			case 'm': return value * 60;
			case 'h': return value * 3600;
			case 'd': return value * 86400;
			default: return 0;
		}
	},

	// Generate random hex secret (32 chars)
	generateSecret: function() {
		const chars = '0123456789abcdef';
		let result = '';
		for (let i = 0; i < 32; i++) {
			result += chars[Math.floor(Math.random() * chars.length)];
		}
		return result;
	},

	// Validate TLS certificate path
	validateCertPath: function(value) {
		if (!value) return false;
		// Basic path validation - must start with / or be a relative path
		const pathRegex = /^(\/ [\w\-.]+|[a-zA-Z0-9_\-\.]+)$/;
		return pathRegex.test(value);
	},

	// Validate carrier type for WEB Proxy
	validateCarrier: function(value) {
		const validCarriers = ['http', 'https', 'quic'];
		return validCarriers.includes(value.toLowerCase());
	}
};