const assert = require('node:assert/strict');
const fs = require('node:fs');

const view = fs.readFileSync('package/luci-app-telego/htdocs/resources/view/telego/nginx-files.js', 'utf8');
const menu = JSON.parse(fs.readFileSync('package/luci-app-telego/root/usr/share/luci/menu.d/telego.menu.json', 'utf8'));
const acl = JSON.parse(fs.readFileSync('package/luci-app-telego/root/usr/share/rpcd/acl.d/luci-app-telego.json', 'utf8'))['luci-app-telego'];
const makefile = fs.readFileSync('package/luci-app-telego/Makefile', 'utf8');
const rpc = fs.readFileSync('package/luci-app-telego/root/usr/share/rpcd/ucode/telego-nginx', 'utf8');

const page = menu['admin/services/telego/nginx-files'];
assert.ok(page, 'Nginx Files menu entry exists');
assert.equal(page.action.type, 'view');
assert.equal(page.action.path, 'telego/nginx-files');
assert.equal(page.depends.fs['/usr/libexec/nginx-telego-admin'], 'executable');
assert.equal(page.depends.fs['/usr/share/nginx-telego/ownership.tsv'], 'file');

assert.deepEqual(acl.read.ubus['telego.nginx'], ['inventory', 'managed_content']);
assert.deepEqual(acl.write.ubus['telego.nginx'], [
  'quarantine', 'restore', 'delete_active', 'delete_quarantined', 'repair'
]);

assert.match(makefile, /PKG_RELEASE:=6/);
assert.match(makefile, /root\/usr\/share\/rpcd\/ucode\/telego-nginx/);
assert.match(makefile, /www\/luci-static\/resources\/view\/telego/);

for (const method of ['inventory', 'managed_content', 'quarantine', 'restore', 'delete_active', 'delete_quarantined', 'repair'])
  assert.match(rpc, new RegExp('\\b' + method.replace('_', '\\_') + '\\s*:'), `RPC exposes ${method}`);

assert.match(rpc, /const ADMIN = '\/usr\/libexec\/nginx-telego-admin'/);
assert.ok(!rpc.includes('/etc/nginx/conf.d/'), 'RPC backend does not manipulate arbitrary Nginx paths directly');
assert.ok(!rpc.includes("import { open"), 'P8 RPC delegates filesystem access to the guarded helper');

for (const method of ['inventory', 'managed_content', 'quarantine', 'restore', 'delete_active', 'delete_quarantined', 'repair'])
  assert.ok(view.includes(`method: '${method}'`), `view declares ${method}`);

assert.ok(view.includes("file.ownership === 'package' && file.state === 'modified'"), 'diff is limited to modified package-owned files');
assert.ok(view.includes("file.ownership === 'generated' && file.state === 'foreign'"), 'foreign occupants on generated reserved paths are actionable');
assert.ok(view.includes("file.kind === 'quarantined' && file.state === 'quarantined'"), 'quarantined files have their own action set');
assert.ok(!view.includes('textarea'), 'restricted arbitrary Nginx editor is not part of this P8 slice');
assert.ok(!view.includes('form.Value'), 'P8 inventory is not an arbitrary config editor');

console.log('LuCI P8 Nginx inventory contract tests passed');
