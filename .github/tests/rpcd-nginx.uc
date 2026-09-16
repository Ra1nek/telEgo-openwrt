global.fixture = { mode: 'ok', content: 'canonical\n', editor_content: '# custom\nserver {}\n', editor_revision: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' };
const plugin = loadfile('package/luci-app-telego/root/usr/share/rpcd/ucode/telego-nginx', { raw_mode: true, module_search_path: [getenv('PWD') + '/.github/tests/ucode-nginx/*.uc'] })();
const nginx = plugin['telego.nginx'];

const inventory = nginx.inventory.call();
assert(inventory.ok && length(inventory.files) == 3, 'inventory rows');
assert(inventory.unsafe_count == 2, 'unsafe inventory warning');
assert(inventory.files[1].kind == 'foreign' && inventory.files[1].name == '50-custom.conf', 'foreign classification');

const content = nginx.managed_content.call({ args: { role: 'core', side: 'source' } });
assert(content.ok && content.content == 'canonical\n', 'managed content');
const invalidRole = nginx.managed_content.call({ args: { role: 'ingress', side: 'active' } });
assert(!invalidRole.ok && invalidRole.error == 'invalid-managed-role', 'generated roles cannot expose managed content');

const foreign = nginx.foreign_content.call({ args: { name: '50-custom.conf' } });
assert(foreign.ok && foreign.content == '# custom\nserver {}\n', 'foreign editor content');
assert(foreign.revision == global.fixture.editor_revision && foreign.size == 19, 'foreign editor revision metadata');
assert(join(global.editor_command, '|') == '/usr/libexec/nginx-telego-editor|inspect|50-custom.conf', 'foreign inspection uses argv-safe helper invocation');

const replaced = nginx.replace_active.call({ args: { name: '50-custom.conf', revision: global.fixture.editor_revision, content: '# edited\nserver {}\n' } });
assert(replaced.ok && replaced.changed, 'restricted editor write succeeds');
assert(global.editor_written == '# edited\nserver {}\n', 'editor content is streamed through stdin');
assert(join(global.editor_command, '|') == '/usr/libexec/nginx-telego-editor|replace|50-custom.conf|' + global.fixture.editor_revision, 'editor write uses argv-safe helper invocation');

nginx.replace_active.call({ args: { name: '50-custom+safe.conf', revision: global.fixture.editor_revision, content: 'safe\n' } });
assert(global.editor_command[2] == '50-custom+safe.conf', 'valid editor filename is passed literally');
const invalidName = nginx.replace_active.call({ args: { name: "a'b$(id).conf", revision: global.fixture.editor_revision, content: 'safe\n' } });
assert(!invalidName.ok && invalidName.error == 'invalid-name', 'unsafe editor filename rejected before process launch');

global.fixture.mode = 'editor-stale';
const stale = nginx.replace_active.call({ args: { name: '50-custom.conf', revision: global.fixture.editor_revision, content: 'x\n' } });
assert(!stale.ok && stale.error == 'stale-content', 'stale editor revision explicit');
global.fixture.mode = 'editor-too-large';
const tooLarge = nginx.replace_active.call({ args: { name: '50-custom.conf', revision: global.fixture.editor_revision, content: 'x\n' } });
assert(!tooLarge.ok && tooLarge.error == 'content-too-large', 'backend size rejection explicit');

global.fixture.mode = 'ok';
assert(nginx.quarantine.call({ args: { name: '50-custom.conf' } }).ok, 'quarantine RPC');
assert(nginx.restore.call({ args: { name: '50-custom.conf' } }).ok, 'restore RPC');
assert(nginx.delete_active.call({ args: { name: '50-custom.conf' } }).ok, 'active delete RPC');
assert(nginx.delete_quarantined.call({ args: { name: '50-custom.conf' } }).ok, 'quarantine delete RPC');
assert(nginx.repair.call().ok, 'repair RPC');

global.fixture.mode = 'failed';
const failed = nginx.quarantine.call({ args: { name: '50-custom.conf' } });
assert(!failed.ok && index(failed.error, 'rejected') >= 0, 'admin helper failures explicit');
global.fixture.mode = 'popen-failed';
const unavailable = nginx.inventory.call();
assert(!unavailable.ok && unavailable.error == 'admin-helper-unavailable', 'missing admin helper explicit');
const editorUnavailable = nginx.foreign_content.call({ args: { name: '50-custom.conf' } });
assert(!editorUnavailable.ok && editorUnavailable.error == 'editor-helper-unavailable', 'missing editor helper explicit');

print('rpcd Nginx P9 restricted editor tests passed\n');
