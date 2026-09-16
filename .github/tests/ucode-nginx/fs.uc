function popen(command, mode) {
	if (type(command) == 'string' && index(command, '/usr/libexec/nginx-telego-editor ') == 0) {
		global.editor_command = command;
		if (global.fixture?.mode == 'popen-failed') return null;
		if (mode == 'r') {
			let output = '';
			let exit_code = global.fixture?.mode == 'editor-failed' ? 1 : (global.fixture?.mode == 'editor-too-large' ? 4 : 0);
			if (index(command, " 'inspect' ") >= 0) {
				const content = global.fixture?.editor_content || '# custom\n';
				const revision = global.fixture?.editor_revision || 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
				output = revision + '\t' + length(content) + '\n' + content;
			}
			return { read: function(kind) { return output; }, close: function() { return exit_code; } };
		}
		let written = '';
		return {
			write: function(data) { written += data; global.editor_written = written; return length(data); },
			close: function() {
				if (global.fixture?.mode == 'editor-stale') return 3;
				if (global.fixture?.mode == 'editor-too-large') return 4;
				if (global.fixture?.mode == 'editor-failed') return 1;
				return 0;
			}
		};
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
