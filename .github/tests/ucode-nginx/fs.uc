function editor_exit_code() {
	if (global.fixture?.mode == 'editor-stale') return 3;
	if (global.fixture?.mode == 'editor-too-large') return 4;
	if (global.fixture?.mode == 'editor-target-exists') return 5;
	if (global.fixture?.mode == 'editor-managed-target') return 6;
	if (global.fixture?.mode == 'editor-failed') return 1;
	return 0;
}

function popen(command, mode) {
	if (type(command) == 'string' && index(command, '/usr/libexec/nginx-telego-editor ') == 0) {
		global.editor_command = command;
		if (global.fixture?.mode == 'popen-failed') return null;
		if (mode == 'r') {
			let output = '';
			const exit_code = editor_exit_code();
			const revision = global.fixture?.editor_revision || 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
			if (index(command, " 'inspect' ") >= 0) {
				const content = global.fixture?.editor_content || '# custom\n';
				output = revision + '\t' + length(content) + '\n' + content;
			}
			else if (index(command, " 'revision' ") >= 0 && exit_code == 0) output = revision + '\n';
			else if (index(command, " 'rename' ") >= 0 && exit_code == 0) output = 'renamed\n';
			return { read: function(kind) { return output; }, close: function() { return exit_code; } };
		}
		let written = '';
		return {
			write: function(data) { written += data; global.editor_written = written; return length(data); },
			close: function() { return editor_exit_code(); }
		};
	}
	if (type(command) == 'string' && index(command, '/usr/libexec/nginx-telego-platform ') == 0) {
		global.platform_command = command;
		if (global.fixture?.mode == 'popen-failed') return null;
		if (global.fixture?.mode == 'platform-failed')
			return { read: function(kind) { return 'nginx-telego-platform: preflight rejected\n'; }, close: function() { return 1; } };

		let output = '';
		if (index(command, " 'status'") >= 0)
			output = 'profile_enabled\t1\nstate_file\t1\nluci_https_port\t10443\nuhttpd_has_443\t0\nuhttpd_has_luci_port\t1\nsplit_dns_address\t192.168.88.1\nsplit_dns_state\towned\npending_uhttpd\t0\npending_dhcp\t0\n';
		else if (index(command, " 'preflight'") >= 0)
			output = 'nginx-telego-platform: Direct HTTPS platform preflight passed\n';
		return { read: function(kind) { return output; }, close: function() { return 0; } };
	}
	if (type(command) == 'string' && index(command, '/usr/libexec/nginx-telego-firewall ') == 0) {
		global.firewall_command = command;
		if (global.fixture?.mode == 'popen-failed') return null;
		if (global.fixture?.mode == 'firewall-failed')
			return { read: function(kind) { return 'nginx-telego-firewall: preflight rejected\n'; }, close: function() { return 1; } };

		let output = '';
		if (index(command, " 'status'") >= 0)
			output = 'profile_enabled\t1\nsection_state\towned\nmanaged_match\t1\nwan_zone_count\t1\nwan_input\treject\nforeign_wan443\t-\npending_changes\t0\n';
		else if (index(command, " 'preflight'") >= 0)
			output = 'nginx-telego-firewall: Direct HTTPS firewall preflight passed for dedicated WAN TCP/443\n';
		return { read: function(kind) { return output; }, close: function() { return 0; } };
	}
	if (type(command) == 'string' && index(command, '/usr/libexec/nginx-telego-cert ') == 0) {
		global.certificate_command = command;
		if (global.fixture?.mode == 'popen-failed') return null;
		if (global.fixture?.mode == 'certificate-failed')
			return { read: function(kind) { return 'nginx-telego-cert: certificate preflight rejected\n'; }, close: function() { return 1; } };

		let output = '';
		if (index(command, " 'status'") >= 0)
			output = 'profile\tdirect_https\nprofile_error\t-\nmanaged_tls\t1\nhostname\tweb.example.com\ncertificate\t/etc/ssl/acme/web.example.com.fullchain.crt\ncertificate_key\t/etc/ssl/acme/web.example.com.key\ncertificate_state\tvalid\nkey_state\tvalid\nkey_match\t1\nhostname_match\t1\nexpiry_state\tok\nnot_after\tOct 20 00:00:00 2026 GMT\nfingerprint_sha256\tAA:BB\nacme_managed\t1\nopenssl_available\t1\n';
		else if (index(command, " 'preflight'") >= 0)
			output = 'nginx-telego-cert: direct_https certificate preflight passed; nginx -t succeeded\n';
		return { read: function(kind) { return output; }, close: function() { return 0; } };
	}
	global.admin_command = command;
	if (global.fixture?.mode == 'popen-failed') return null;
	let output = '';
	let exit_code = global.fixture?.mode == 'failed' ? 1 : 0;
	if (global.fixture?.mode == 'failed') output = 'nginx-telego-admin: rejected\n';
	else if (index(command, " 'inventory'") >= 0) output = 'managed\t20-telego-core.conf\t/etc/nginx/conf.d/20-telego-core.conf\tcore\tpackage\tmodified\t/usr/share/nginx-telego/templates/20-telego-core.conf\n' + 'foreign\t50-custom.conf\t/etc/nginx/conf.d/50-custom.conf\t-\tforeign\tactive\t-\n' + 'quarantined\t60-old.conf\t/etc/nginx-telego/quarantine/60-old.conf.disabled\t-\tforeign\tquarantined\t-\n' + 'meta\t-\t-\t-\t-\tunsafe-name\t2\n';
	else if (index(command, " 'inspect-managed'") >= 0) output = global.fixture?.content || 'managed content\n';
	else output = 'operation complete\n';
	return { read: function(kind) { return output; }, close: function() { return exit_code; } };
}

export { popen };
