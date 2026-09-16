global.fixture = { mode: 'ok', content: 'canonical\n' };
const plugin = loadfile('package/luci-app-telego/root/usr/share/rpcd/ucode/telego-nginx', {
	raw_mode: true,
	module_search_path: [getenv('PWD') + '/.github/tests/ucode-nginx/*.uc']
})();
const nginx = plugin['telego.nginx'];

const inventory = nginx.inventory.call();
assert(inventory.ok && length(inventory.files) == 3, 'inventory rows');
assert(inventory.unsafe_count == 2, 'unsafe inventory warning');
assert(inventory.files[0].ownership == 'package' && inventory.files[0].state == 'modified', 'managed classification');
assert(inventory.files[1].kind == 'foreign' && inventory.files[1].name == '50-custom.conf', 'foreign classification');
assert(inventory.files[2].kind == 'quarantined' && inventory.files[2].state == 'quarantined', 'quarantine classification');
assert(global.admin_command == "/usr/libexec/nginx-telego-admin 'inventory' 2>&1", 'fixed inventory helper command');

const content = nginx.managed_content.call({ args: { role: 'core', side: 'source' } });
assert(content.ok && content.content == 'canonical\n', 'managed content');
assert(global.admin_command == "/usr/libexec/nginx-telego-admin 'inspect-managed' 'core' 'source' 2>&1", 'role-scoped inspection');
const invalidRole = nginx.managed_content.call({ args: { role: 'ingress', side: 'active' } });
assert(!invalidRole.ok && invalidRole.error == 'invalid-managed-role', 'generated roles cannot expose content');

const quarantined = nginx.quarantine.call({ args: { name: '50-custom.conf' } });
assert(quarantined.ok, 'quarantine RPC');
assert(global.admin_command == "/usr/libexec/nginx-telego-admin 'quarantine' '50-custom.conf' 2>&1", 'quarantine helper command');
assert(nginx.restore.call({ args: { name: '50-custom.conf' } }).ok, 'restore RPC');
assert(nginx.delete_active.call({ args: { name: '50-custom.conf' } }).ok, 'active delete RPC');
assert(nginx.delete_quarantined.call({ args: { name: '50-custom.conf' } }).ok, 'quarantine delete RPC');
assert(nginx.repair.call().ok, 'repair RPC');

nginx.quarantine.call({ args: { name: "a'b$(id).conf" } });
assert(global.admin_command == "/usr/libexec/nginx-telego-admin 'quarantine' 'a'\\''b$(id).conf' 2>&1", 'RPC arguments remain shell quoted');

global.fixture.mode = 'failed';
const failed = nginx.quarantine.call({ args: { name: '50-custom.conf' } });
assert(!failed.ok && index(failed.error, 'rejected') >= 0, 'helper failures are explicit');
global.fixture.mode = 'popen-failed';
const unavailable = nginx.inventory.call();
assert(!unavailable.ok && unavailable.error == 'admin-helper-unavailable', 'missing helper process is explicit');

print('rpcd Nginx inventory tests passed\n');
