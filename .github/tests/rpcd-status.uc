// Run with native ucode and fixture modules for the router-only services.
global.fixture = {
	bind_to: '127.0.0.1:9090',
	path: '/metrics',
	web_enabled: '1',
	web_carrier: 'https-lanes',
	middleend_enabled: '1',
	metrics_mode: 'ok'
};
const plugin = loadfile('package/luci-app-telego/root/usr/share/rpcd/ucode/telego', {
	raw_mode: true,
	module_search_path: [getenv('PWD') + '/.github/tests/ucode/*.uc']
})();
const status = plugin.telego.status.call();
assert(status.running && status.pid == 42, 'service status');
assert(global.disconnected, 'ubus connection must be closed');
assert(status.uptime == 100, 'process uptime');
assert(status.metrics_available && status.metrics_error == '', 'metrics health');
assert(status.connections == 5 && status.ips_active == 4 && status.ips_tracked == 8, 'label aggregation');
assert(status.rx_bytes == 1250 && status.tx_bytes == 2500, 'traffic parsing');
assert(status.web_enabled && status.web_carrier == 'https-lanes', 'WEB config state');
assert(status.web_sessions_active == 2 && status.web_streams_active == 5, 'WEB active metrics');
assert(status.web_sessions_closed_total == 6 && status.web_carrier_retries_total == 3, 'WEB counters');
assert(status.web_pending_bytes == 4096 && status.web_backpressure_total == 1, 'WEB pressure metrics');
assert(status.middleend_enabled && status.middleend_admitting == 1, 'Middle-End config/readiness');
assert(status.middleend_links == 5 && status.middleend_bindings == 9, 'Middle-End topology metrics');
assert(status.middleend_repairs_active == 1 && status.middleend_slot_failures_total == 2, 'Middle-End repair metrics');
assert(status.middleend_artifact_applied == 1 && status.middleend_artifact_pending == 0, 'Middle-End artifact state');
assert(status.middleend_artifact_refresh_failures == 1, 'Middle-End artifact refresh failures');
assert(global.fetched == "/bin/uclient-fetch -q -T 2 -O - 'http://127.0.0.1:9090/metrics'", 'OpenWrt uclient-fetch runtime path');

for (let endpoint in ['0.0.0.0:9090', 'example.com:9090', '127.0.0.1:65536']) {
	global.fixture.bind_to = endpoint;
	global.fetched = null;
	const invalid = plugin.telego.status.call();
	assert(!invalid.metrics_available && invalid.metrics_error == 'invalid-endpoint', 'reject non-loopback/invalid endpoint');
	assert(global.fetched == null, 'invalid endpoint must not be fetched');
}

global.fixture.bind_to = '127.0.0.1:9090';
global.fixture.path = '/metrics';
for (let mode in ['popen-failed', 'fetch-failed']) {
	global.fixture.metrics_mode = mode;
	const failed = plugin.telego.status.call();
	assert(!failed.metrics_available && failed.metrics_error == 'fetch-failed', 'fetch failures are explicit');
}

global.fixture.metrics_mode = 'unrecognized';
const unrecognized = plugin.telego.status.call();
assert(!unrecognized.metrics_available && unrecognized.metrics_error == 'unrecognized-response', 'unrecognized exporter response');

global.fixture.metrics_mode = 'ok';
global.fixture.bind_to = '[::1]:9090';
global.fixture.path = '/custom';
assert(plugin.telego.status.call().metrics_available, 'IPv6 endpoint metrics health');
assert(index(global.fetched, "'http://[::1]:9090/custom'") >= 0, 'IPv6 loopback');
global.fixture.path = "/a'b$(id)";
plugin.telego.status.call();
assert(global.fetched == "/bin/uclient-fetch -q -T 2 -O - 'http://[::1]:9090/a'\\''b$(id)'", 'shell metacharacters stay quoted');
global.fixture.path = '/metrics\ninjected';
global.fetched = null;
const invalidPath = plugin.telego.status.call();
assert(!invalidPath.metrics_available && invalidPath.metrics_error == 'invalid-endpoint', 'invalid metrics path');
assert(global.fetched == null, 'invalid path must not be fetched');

global.fixture.bind_to = '127.0.0.1:9090';
global.fixture.path = '/metrics';
global.fixture.no_ubus = true;
const noServiceManager = plugin.telego.status.call();
assert(!noServiceManager.running, 'unavailable service manager');
assert(noServiceManager.metrics_available, 'metrics health is independent from service-manager health');
print('rpcd status tests passed\n');
