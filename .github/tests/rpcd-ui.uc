// P6.3 diagnostics backend tests with native ucode and deterministic fs fixtures.
const secret_canary = '0123456789abcdef0123456789abcdef';
const proxy_tag_canary = 'fedcba9876543210fedcba9876543210';
const password_canary = 'diagnostics-password-canary';

global.fixture = {
	openwrt_release: "DISTRIB_RELEASE='25.12.4'\nDISTRIB_DESCRIPTION='OpenWrt 25.12.4 r-test'\nDISTRIB_ARCH='x86_64'\n",
	packages: {
		'telego-pkg': '0.6.5-r13',
		'luci-app-telego': '0.6.5-r33',
		'nginx-telego': '0.6.5-r11',
		'nginx-ssl': '1.27.5-r1',
		'luci-lib-uqr': '1.0-r1'
	},
	core_version_output: 'INF telego version=v0.6.5 commit=secret-commit-canary date=2026-09-22 description="Production-grade Telegram MTProxy"\n',
	logs_output:
		'Mon Sep 22 01:00:00 2026 daemon.info telego[42]: INF telego proxy started bind=0.0.0.0:443 secret=' + secret_canary + '\n' +
		'Mon Sep 22 01:00:01 2026 daemon.info telego[42]: INF WEB proxy started hostname=private.example.test backend=http://user:' + password_canary + '@127.0.0.1:8080\n' +
		'Mon Sep 22 01:00:02 2026 daemon.warn telego[42]: WRN unknown free-form ' + secret_canary + '\n',
	runtime_config:
		'# Generated from /etc/config/telego. Do not edit.\n\n' +
		'[general]\n' +
		'bind-to = "0.0.0.0:443"\n' +
		'log-level = "info"\n' +
		'clock-sync-url = "https://clock-user:' + password_canary + '@clock.example/"\n' +
		'future-option = "' + password_canary + '"\n\n' +
		'[tls-fronting]\n' +
		'enabled = true\n' +
		'mask-host = "www.google.com"\n\n' +
		'[performance]\n' +
		'tcp-buffer-kb = 128\n\n' +
		'[upstream]\n' +
		'socks5 = "socks5://u:' + password_canary + '@127.0.0.1:1080"\n\n' +
		'[metrics]\n' +
		'bind-to = "127.0.0.1:9090"\n' +
		'path = "/metrics"\n' +
		'diagnostics = false\n\n' +
		'[web-proxy]\n' +
		'enabled = true\n' +
		'carrier = "https-lanes"\n' +
		'bind-to = "127.0.0.1:8080"\n' +
		'hostname = "web.example.test"\n' +
		'backend = "http://user:' + password_canary + '@127.0.0.1:9000"\n' +
		'num-event-loops = 0\n' +
		'trusted-proxy-cidrs = ["127.0.0.1/32"]\n\n' +
		'[middle-end]\n' +
		'enabled = true\n' +
		'proxy-tag = "' + proxy_tag_canary + '"\n' +
		'socks5 = "socks5://user:' + password_canary + '@127.0.0.1:1080"\n' +
		'socks5-username = "middle-user-canary"\n' +
		'socks5-password = "' + password_canary + '"\n' +
		'artifact-proxy = "http://user:' + password_canary + '@proxy.example/"\n' +
		'nat-ip = "203.0.113.10"\n' +
		'max-connections = 400\n' +
		'queue-budget-mb = 64\n\n' +
		'[unknown-future]\n' +
		'secret-looking = "' + secret_canary + '"\n\n' +
		'[secrets]\n' +
		'"alice-private-name" = "' + secret_canary + '"\n'
};

const plugin = loadfile('package/luci-app-telego/root/usr/share/rpcd/ucode/telego-ui', {
	raw_mode: true,
	module_search_path: [getenv('PWD') + '/.github/tests/ucode/*.uc']
})();
const ui = plugin['telego.ui'];
const admin = plugin['telego.admin'];

const caps = ui.capabilities.call();
assert(caps.ok && caps.error == '' && caps.api_version == 2, 'capability API version');
assert(caps.features.serviceLifecycle, 'P6.4 lifecycle capability advertised');
assert(caps.features.redactedLogs && caps.features.redactedRuntimeConfig, 'diagnostic viewers advertised');
assert(caps.features.componentVersions, 'version discovery advertised');
assert(caps.features.candidateIngressPreflight && caps.features.candidateNginxValidation, 'P6.6 candidate ingress preflight and P6.7 candidate Nginx validation are advertised');

const info = ui.system_info.call();
assert(info.ok && info.error == '', 'system_info success');
assert(info.openwrt_release == 'OpenWrt 25.12.4 r-test', 'OpenWrt release parsing');
assert(info.architecture == 'x86_64', 'architecture parsing');
assert(info.packages['telego-pkg'] == '0.6.5-r13', 'telego package version');
assert(info.packages['luci-app-telego'] == '0.6.5-r33', 'LuCI package version');
assert(info.packages['nginx-telego'] == '0.6.5-r11', 'nginx package version');
assert(info.packages['acme-acmesh'] == null, 'missing optional package is reported as null');
assert(info.core_version == 'v0.6.5', 'core version parser');
assert(info.build_go_version == null, 'missing Go build metadata is allowed');
assert(index(sprintf('%.J', info), 'secret-commit-canary') < 0, 'system_info never forwards raw version command metadata');

const service = admin.service_status.call();
assert(service.ok && service.error == '', 'service_status success');
assert(service.running && service.autostart && service.config_enabled, 'service status keeps running/autostart/config separate');
assert(!service.busy, 'service status reports lifecycle lock state');
assert(service.state_revision == 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'state revision passthrough');

global.lifecycle_calls = [];
const bad_action = admin.service_action.call({
	args: {
		action: 'reload',
		request_id: 'request-1234',
		expected_revision: service.state_revision
	}
});
assert(!bad_action.ok && bad_action.error == 'invalid-action', 'unknown lifecycle action rejected before helper');
assert(length(global.lifecycle_calls) == 0, 'invalid action never reaches helper');

const bad_request = admin.service_action.call({
	args: {
		action: 'restart',
		request_id: '../../etc/passwd',
		expected_revision: service.state_revision
	}
});
assert(!bad_request.ok && bad_request.error == 'invalid-request-id', 'unsafe request ID rejected before helper');
assert(length(global.lifecycle_calls) == 0, 'unsafe request ID never reaches helper');

const bad_revision = admin.service_action.call({
	args: {
		action: 'restart',
		request_id: 'request-1234',
		expected_revision: 'abcd'
	}
});
assert(!bad_revision.ok && bad_revision.error == 'invalid-revision', 'invalid revision rejected before helper');
assert(length(global.lifecycle_calls) == 0, 'invalid revision never reaches helper');

global.fixture.lifecycle_action_output =
	'ok=1\nerror=\noperation_id=request-1234\nstate=completed\n';
const action = admin.service_action.call({
	args: {
		action: 'restart',
		request_id: 'request-1234',
		expected_revision: service.state_revision
	}
});
assert(action.ok && action.error == '' && action.state == 'completed', 'valid lifecycle action accepted');
assert(action.operation_id == 'request-1234', 'operation ID is stable across transport ambiguity');
assert(global.lifecycle_calls[length(global.lifecycle_calls) - 1] ==
	'/usr/libexec/telego-ui-lifecycle action restart request-1234 ' +
	service.state_revision + ' 2>/dev/null', 'RPC invokes only the fixed lifecycle helper');

global.fixture.lifecycle_operation_output =
	'ok=1\nerror=\nstate=completed\nmessage=service-restarted\n';
const operation = admin.operation_status.call({ args: { operation_id: 'request-1234' } });
assert(operation.ok && operation.state == 'completed' && operation.message == 'service-restarted', 'operation status response');

const invalid_operation = admin.operation_status.call({ args: { operation_id: '../request' } });
assert(!invalid_operation.ok && invalid_operation.error == 'invalid-operation-id', 'unsafe operation ID rejected');

global.fixture.lifecycle_status_output =
	'ok=1\nerror=\nrunning=0\nautostart=0\nconfig_enabled=1\n' +
	'state_revision=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n' +
	'busy=1\n';
const busy = admin.service_status.call();
assert(busy.ok && !busy.running && !busy.autostart && busy.config_enabled && busy.busy, 'service_status exposes busy independently');

global.fixture.lifecycle_popen_failed = true;
const unavailable_status = admin.service_status.call();
assert(!unavailable_status.ok && unavailable_status.error == 'service-status-unavailable', 'helper failure is stable and non-reflective');
const unavailable_action = admin.service_action.call({
	args: {
		action: 'stop',
		request_id: 'request-5678',
		expected_revision: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
	}
});
assert(!unavailable_action.ok && unavailable_action.error == 'lifecycle-helper-unavailable', 'mutation helper failure is stable');
assert(unavailable_action.operation_id == 'request-5678' && unavailable_action.state == 'unknown', 'timeout ambiguity retains observable operation ID');
global.fixture.lifecycle_popen_failed = false;
global.fixture.lifecycle_status_output = null;

const invalid_low = ui.logs.call({ args: { limit: 0 } });
const invalid_high = ui.logs.call({ args: { limit: 201 } });
const invalid_type = ui.logs.call({ args: { limit: '20' } });
assert(!invalid_low.ok && invalid_low.error == 'invalid-limit', 'reject low log limit');
assert(!invalid_high.ok && invalid_high.error == 'invalid-limit', 'reject high log limit');
assert(!invalid_type.ok && invalid_type.error == 'invalid-limit', 'reject non-integer log limit');

const logs = ui.logs.call({ args: { limit: 200 } });
assert(logs.ok && logs.redacted && logs.error == '', 'redacted logs success');
assert(index(global.logread_command, '/sbin/logread -e telego -l 200') == 0, 'logs use fixed bounded logread source');
assert(index(logs.content, 'telego proxy started') >= 0, 'known core event retained');
assert(index(logs.content, 'WEB proxy started') >= 0, 'known WEB event retained');
assert(logs.omitted_entries == 1, 'unknown/free-form event omitted');
assert(index(logs.content, secret_canary) < 0, 'base secret absent from logs RPC');
assert(index(logs.content, password_canary) < 0, 'credential absent from logs RPC');
assert(index(logs.content, 'private.example.test') < 0, 'untrusted dynamic log fields omitted');

const runtime = ui.runtime_config.call();
assert(runtime.ok && runtime.redacted && !runtime.truncated && runtime.error == '', 'runtime viewer success');
assert(index(runtime.content, 'bind-to = "0.0.0.0:443"') >= 0, 'safe runtime field retained');
assert(index(runtime.content, 'mask-host = "www.google.com"') >= 0, 'safe TLS field retained');
assert(index(runtime.content, 'clock-sync-url = "[REDACTED]"') >= 0, 'credential-capable clock URL redacted');
assert(index(runtime.content, 'socks5 = "[REDACTED]"') >= 0, 'proxy credentials redacted');
assert(index(runtime.content, 'socks5-password = "[REDACTED]"') >= 0, 'password redacted');
assert(index(runtime.content, '"secret-1" = "[REDACTED]"') >= 0, 'secret value and name replaced');
assert(index(runtime.content, secret_canary) < 0, 'secret canary absent from runtime RPC');
assert(index(runtime.content, proxy_tag_canary) < 0, 'proxy-tag canary absent from runtime RPC');
assert(index(runtime.content, password_canary) < 0, 'password canary absent from runtime RPC');
assert(index(runtime.content, 'alice-private-name') < 0, 'secret name absent from runtime RPC');
assert(index(runtime.content, 'unknown-future') < 0, 'unknown section omitted');
assert(index(runtime.content, 'future-option') < 0, 'unknown assignment in a supported section is omitted');
assert(runtime.omitted_entries >= 3, 'omitted runtime material is counted');

global.fixture.runtime_config =
	'# Generated from /etc/config/telego. Do not edit.\n' +
	'[general]\n' +
	'bind-to = "0.0.0.0:443"\n' +
	'this is not generated TOML\n' +
	'[secrets]\n' +
	'"canary" = "' + secret_canary + '"\n';
const malformed = ui.runtime_config.call();
assert(!malformed.ok && malformed.error == 'runtime-config-parse-failed', 'malformed supported section fails closed');
assert(malformed.content == '', 'parser failure returns no TOML');
assert(index(sprintf('%.J', malformed), secret_canary) < 0, 'parser error does not disclose source content');

global.fixture.runtime_symlink = true;
const symlinked = ui.runtime_config.call();
assert(!symlinked.ok && symlinked.error == 'runtime-config-unsafe' && symlinked.content == '', 'runtime symlink is refused');
global.fixture.runtime_symlink = false;

global.fixture.runtime_size = 131073;
const too_large = ui.runtime_config.call();
assert(!too_large.ok && too_large.error == 'runtime-config-too-large' && too_large.truncated, 'oversized runtime config fails closed');
global.fixture.runtime_size = null;

global.fixture.logs_mode = 'failed';
global.fixture.logs_output = secret_canary;
const failed_logs = ui.logs.call({ args: { limit: 20 } });
assert(!failed_logs.ok && failed_logs.error == 'logread-failed' && failed_logs.content == '', 'logread failure is stable and empty');
assert(index(sprintf('%.J', failed_logs), secret_canary) < 0, 'logread error never forwards captured output');

print('rpcd P6.3-P6.7 UI backend tests passed\n');
