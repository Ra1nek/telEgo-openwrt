// Run with native ucode and fixture modules for the router-only services.
global.fixture = { bind_to: '127.0.0.1:9090', path: '/metrics' };
const plugin = loadfile('package/luci-app-telego/root/usr/share/rpcd/ucode/telego', {
	raw_mode: true,
	module_search_path: [getenv('PWD') + '/.github/tests/ucode/*.uc']
})();
const status = plugin.telego.status.call();
assert(status.running && status.pid == 42, 'service status');
assert(global.disconnected, 'ubus connection must be closed');
assert(status.uptime == 100, 'process uptime');
assert(status.connections == 5 && status.ips_active == 4, 'label aggregation');
assert(status.rx_bytes == 1250 && status.tx_bytes == 2500, 'traffic parsing');
assert(global.fetched == "/usr/bin/uclient-fetch -q -T 2 -O - 'http://127.0.0.1:9090/metrics'", 'bounded shell command');

for (let endpoint in ['0.0.0.0:9090', 'example.com:9090', '127.0.0.1:65536']) {
	global.fixture.bind_to = endpoint;
	global.fetched = null;
	assert(plugin.telego.status.call().connections == 0, 'reject non-loopback/invalid endpoint');
	assert(global.fetched == null, 'invalid endpoint must not be fetched');
}
global.fixture.bind_to = '[::1]:9090';
global.fixture.path = '/custom';
plugin.telego.status.call();
assert(index(global.fetched, "'http://[::1]:9090/custom'") >= 0, 'IPv6 loopback');
global.fixture.path = "/a'b$(id)";
plugin.telego.status.call();
assert(global.fetched == "/usr/bin/uclient-fetch -q -T 2 -O - 'http://[::1]:9090/a'\\''b$(id)'", 'shell metacharacters stay quoted');
global.fixture.path = '/metrics\ninjected';
global.fetched = null;
plugin.telego.status.call();
assert(global.fetched == null, 'invalid path must not be fetched');
global.fixture.no_ubus = true;
assert(!plugin.telego.status.call().running, 'unavailable service manager');
print('rpcd status tests passed\n');
