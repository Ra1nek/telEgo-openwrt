function popen(command, mode) {
	global.admin_command = command;
	if (global.fixture?.mode == 'popen-failed')
		return null;

	let output = '';
	let exit_code = global.fixture?.mode == 'failed' ? 1 : 0;

	if (global.fixture?.mode == 'failed')
		output = 'nginx-telego-admin: rejected\n';
	else if (index(command, " 'inventory'") >= 0)
		output = 'managed\t20-telego-core.conf\t/etc/nginx/conf.d/20-telego-core.conf\tcore\tpackage\tmodified\t/usr/share/nginx-telego/templates/20-telego-core.conf\n' +
			'foreign\t50-custom.conf\t/etc/nginx/conf.d/50-custom.conf\t-\tforeign\tactive\t-\n' +
			'quarantined\t60-old.conf\t/etc/nginx-telego/quarantine/60-old.conf.disabled\t-\tforeign\tquarantined\t-\n' +
			'meta\t-\t-\t-\t-\tunsafe-name\t2\n';
	else if (index(command, " 'inspect-managed'") >= 0)
		output = global.fixture?.content || 'managed content\n';
	else
		output = 'operation complete\n';

	return {
		read: function(kind) { return output; },
		close: function() { return exit_code; }
	};
}

export { popen };
