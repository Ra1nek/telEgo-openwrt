function open(path, mode) {
	let data = '';
	if (path == '/proc/uptime')
		data = '123.50 456.00';
	else if (path == '/proc/42/stat')
		data = '42 (telego worker) S 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 2350';
	else if (path == '/etc/openwrt_release')
		data = global.fixture?.openwrt_release || "DISTRIB_RELEASE='25.12.4'\nDISTRIB_DESCRIPTION='OpenWrt 25.12.4 r-test'\nDISTRIB_ARCH='x86_64'\n";
	else if (path == '/var/etc/telego.toml') {
		if (global.fixture?.runtime_missing)
			return null;
		data = global.fixture?.runtime_config || '';
	}

	let offset = 0;
	return {
		read: function(mode) {
			if (type(mode) == 'int') {
				const chunk = substr(data, offset, mode);
				offset += length(chunk);
				return chunk;
			}
			const chunk = substr(data, offset);
			offset = length(data);
			return chunk;
		},
		close: function() {}
	};
}

function lstat(path) {
	if (path == '/var/etc/telego.toml') {
		if (global.fixture?.runtime_missing)
			return null;
		if (global.fixture?.runtime_symlink)
			return { type: 'link', size: 0 };
		return {
			type: 'file',
			size: global.fixture?.runtime_size != null ? global.fixture.runtime_size : length(global.fixture?.runtime_config || '')
		};
	}
	if (path == '/etc/openwrt_release')
		return { type: 'file', size: length(global.fixture?.openwrt_release || '') };
	return { type: 'file', size: 0 };
}

function buffered_proc(content, exit_code) {
	let offset = 0;
	content = content || '';
	return {
		read: function(mode) {
			if (mode == 'line') {
				if (offset >= length(content))
					return '';
				const rest = substr(content, offset);
				const newline = index(rest, '\n');
				const chunk = newline < 0 ? rest : substr(rest, 0, newline + 1);
				offset += length(chunk);
				return chunk;
			}
			if (type(mode) == 'int') {
				const chunk = substr(content, offset, mode);
				offset += length(chunk);
				return chunk;
			}
			const rest = substr(content, offset);
			offset = length(content);
			return rest;
		},
		close: function() { return exit_code || 0; }
	};
}

function popen(command, mode) {
	global.fetched = command;

	const apk_prefixes = ['/usr/bin/apk info -e -v ', '/sbin/apk info -e -v '];
	for (let apk_prefix in apk_prefixes) {
		if (substr(command, 0, length(apk_prefix)) == apk_prefix) {
			const package_name = substr(command, length(apk_prefix));
			const packages = global.fixture?.packages || {};
			const version = packages[package_name];
			return buffered_proc(version ? package_name + '-' + version + '\n' : '', version ? 0 : 1);
		}
	}

	if (command == '/usr/bin/telego version 2>&1')
		return buffered_proc(global.fixture?.core_version_output || '', global.fixture?.core_version_exit || 0);

	if (command == '/bin/uname -m')
		return buffered_proc((global.fixture?.uname || 'x86_64') + '\n', 0);

	if (substr(command, 0, length('/usr/libexec/telego-ui-lifecycle ')) == '/usr/libexec/telego-ui-lifecycle ') {
		if (!global.lifecycle_calls)
			global.lifecycle_calls = [];
		push(global.lifecycle_calls, command);

		if (global.fixture?.lifecycle_popen_failed)
			return null;

		if (command == '/usr/libexec/telego-ui-lifecycle status 2>/dev/null') {
			return buffered_proc(
				global.fixture?.lifecycle_status_output ||
				'ok=1\nerror=\nrunning=1\nautostart=1\nconfig_enabled=1\n' +
				'state_revision=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n' +
				'busy=0\n',
				global.fixture?.lifecycle_exit || 0
			);
		}

		const action_prefix = '/usr/libexec/telego-ui-lifecycle action ';
		if (substr(command, 0, length(action_prefix)) == action_prefix) {
			return buffered_proc(
				global.fixture?.lifecycle_action_output ||
				'ok=1\nerror=\noperation_id=request-1234\nstate=completed\n',
				global.fixture?.lifecycle_exit || 0
			);
		}

		const operation_prefix = '/usr/libexec/telego-ui-lifecycle operation-status ';
		if (substr(command, 0, length(operation_prefix)) == operation_prefix) {
			return buffered_proc(
				global.fixture?.lifecycle_operation_output ||
				'ok=1\nerror=\nstate=completed\nmessage=service-restarted\n',
				global.fixture?.lifecycle_exit || 0
			);
		}

		return buffered_proc('', 1);
	}

	const log_prefix = '/sbin/logread -e telego -l ';
	if (substr(command, 0, length(log_prefix)) == log_prefix) {
		global.logread_command = command;
		if (global.fixture?.logs_mode == 'popen-failed')
			return null;
		return buffered_proc(global.fixture?.logs_output || '', global.fixture?.logs_mode == 'failed' ? 1 : 0);
	}

	if (global.fixture?.metrics_mode == 'popen-failed')
		return null;

	let lines;
	if (global.fixture?.metrics_mode == 'unrecognized') {
		lines = [
			'# unrelated exporter\n',
			'go_goroutines 12\n',
			''
		];
	}
	else {
		lines = [
			'# realistic OpenTelemetry/Prometheus payload\n',
			'telego_connections_active{otel_scope_name="telego",otel_scope_schema_url="",otel_scope_version="",user="alice"} 2\n',
			'telego_connections_active{otel_scope_name="telego",otel_scope_schema_url="",otel_scope_version="",user="bob"} 3\n',
			'telego_ips_active{otel_scope_name="telego",otel_scope_schema_url="",otel_scope_version="",user="alice"} 4\n',
			'telego_ips_tracked{otel_scope_name="telego",otel_scope_schema_url="",otel_scope_version="",user="alice"} 8\n',
			'telego_ips_blocked{otel_scope_name="telego",otel_scope_schema_url="",otel_scope_version="",user="alice"} 1\n',
			'telego_traffic_in_bytes_total{otel_scope_name="telego",otel_scope_schema_url="",otel_scope_version="",user="alice"} 1.25e3\n',
			'telego_traffic_out_bytes_total{otel_scope_name="telego",otel_scope_schema_url="",otel_scope_version="",user="alice"} 2500\n',
			'telego_traffic_out_bytes_total{user="bad-negative"} -100\n',
			'telego_traffic_out_bytes_total{user="bad-infinity"} 1e999\n',
			'telego_web_sessions_active{otel_scope_name="telego",otel_scope_schema_url="",otel_scope_version=""} 2\n',
			'telego_web_streams_active{otel_scope_name="telego",otel_scope_schema_url="",otel_scope_version=""} 5\n',
			'telego_web_websocket_connections_active{otel_scope_name="telego",otel_scope_schema_url="",otel_scope_version=""} 1\n',
			'telego_web_backend_dials_active{otel_scope_name="telego",otel_scope_schema_url="",otel_scope_version=""} 3\n',
			'telego_web_pending_bytes{otel_scope_name="telego",otel_scope_schema_url="",otel_scope_version=""} 4096\n',
			'telego_web_pending_items{otel_scope_name="telego",otel_scope_schema_url="",otel_scope_version=""} 7\n',
			'telego_web_sessions_created_total{otel_scope_name="telego",otel_scope_schema_url="",otel_scope_version=""} 11\n',
			'telego_web_sessions_closed_total{otel_scope_name="telego",otel_scope_schema_url="",otel_scope_version="",reason="client"} 4\n',
			'telego_web_sessions_closed_total{otel_scope_name="telego",otel_scope_schema_url="",otel_scope_version="",reason="timeout"} 2\n',
			'telego_web_carrier_retries_total{otel_scope_name="telego",otel_scope_schema_url="",otel_scope_version="",operation="fetch"} 3\n',
			'telego_web_backpressure_total{otel_scope_name="telego",otel_scope_schema_url="",otel_scope_version="",operation="send"} 1\n',
			'telego_middleend_admitting 1\n',
			'telego_middleend_repairing 0\n',
			'telego_middleend_links{role="active",dc="2",state="ready"} 4\n',
			'telego_middleend_links{role="active",dc="4",state="repairing"} 1\n',
			'telego_middleend_bindings_active{role="active",dc="2"} 9\n',
			'telego_middleend_slot_repairs_active{role="active"} 1\n',
			'telego_middleend_slot_failure_total 2\n',
			'telego_middleend_artifact_state{state="applied"} 1\n',
			'telego_middleend_artifact_state{state="pending"} 0\n',
			'telego_middleend_artifact_refresh_total{result="success"} 5\n',
			'telego_middleend_artifact_refresh_total{result="failure"} 1\n',
			''
		];
	}

	return {
		read: function() { return shift(lines); },
		close: function() {
			return global.fixture?.metrics_mode == 'fetch-failed' ? 1 : 0;
		}
	};
}
export { open, popen, lstat };
