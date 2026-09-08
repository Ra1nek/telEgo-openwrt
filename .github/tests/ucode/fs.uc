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
	let lines = [
		'# metrics\n',
		'telego_connections_active{kind="raw"} 2\n',
		'telego_connections_active{kind="tls"} 3\n',
		'telego_ips_active 4\n',
		'telego_ips_tracked 8\n',
		'telego_ips_blocked 1\n',
		'telego_traffic_in_bytes_total 1.25e3\n',
		'telego_traffic_out_bytes_total 2500\n',
		'telego_traffic_out_bytes_total -100\n',
		'telego_traffic_out_bytes_total 1e999\n',
		''
	];
	return { read: function() { return shift(lines); }, close: function() {} };
}
export { open, popen };
