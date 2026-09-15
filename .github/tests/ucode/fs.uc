function open(path, mode) {
	let data = '';
	if (path == '/proc/uptime')
		data = '123.50 456.00';
	else if (path == '/proc/42/stat')
		data = '42 (telego worker) S 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 2350';
	return { read: function() { return data; }, close: function() {} };
}

function popen(command, mode) {
	global.fetched = command;

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
			'# metrics\n',
			'telego_connections_active{user="alice"} 2\n',
			'telego_connections_active{user="bob"} 3\n',
			'telego_ips_active{user="alice"} 4\n',
			'telego_ips_tracked{user="alice"} 8\n',
			'telego_ips_blocked{user="alice"} 1\n',
			'telego_traffic_in_bytes_total{user="alice"} 1.25e3\n',
			'telego_traffic_out_bytes_total{user="alice"} 2500\n',
			'telego_traffic_out_bytes_total{user="bad-negative"} -100\n',
			'telego_traffic_out_bytes_total{user="bad-infinity"} 1e999\n',
			'telego_web_sessions_active 2\n',
			'telego_web_streams_active 5\n',
			'telego_web_websocket_connections_active 1\n',
			'telego_web_backend_dials_active 3\n',
			'telego_web_pending_bytes 4096\n',
			'telego_web_pending_items 7\n',
			'telego_web_sessions_created_total 11\n',
			'telego_web_sessions_closed_total{reason="client"} 4\n',
			'telego_web_sessions_closed_total{reason="timeout"} 2\n',
			'telego_web_carrier_retries_total{operation="fetch"} 3\n',
			'telego_web_backpressure_total{operation="send"} 1\n',
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
export { open, popen };
