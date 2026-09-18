global.fixture = { mode: 'ok', content: 'canonical\n', editor_content: '# custom\nserver {}\n', editor_revision: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' };
const plugin = loadfile('package/luci-app-telego/root/usr/share/rpcd/ucode/telego-nginx', { raw_mode: true, module_search_path: [getenv('PWD') + '/.github/tests/ucode-nginx/*.uc'] })();
const nginx = plugin['telego.nginx'];

const firewallStatus = nginx.firewall_status.call();
assert(firewallStatus.ok && firewallStatus.profile_enabled, 'firewall status profile enabled');
assert(firewallStatus.section_state == 'owned' && firewallStatus.managed_match, 'firewall managed state');
assert(firewallStatus.wan_zone_count == 1 && firewallStatus.wan_input == 'reject', 'firewall WAN status');
assert(firewallStatus.foreign_wan443 == '' && firewallStatus.foreign_wan18443 == '' && !firewallStatus.pending_changes, 'firewall conflict status');
assert(global.firewall_command == "/usr/libexec/nginx-telego-firewall 'status' 2>&1", 'firewall status uses dedicated helper');

const firewallPreflight = nginx.firewall_preflight.call();
assert(firewallPreflight.ok && index(firewallPreflight.message, 'preflight passed') >= 0, 'firewall preflight RPC');
assert(global.firewall_command == "/usr/libexec/nginx-telego-firewall 'preflight' 2>&1", 'firewall preflight uses dedicated helper');

const certificateStatus = nginx.certificate_status.call();
assert(certificateStatus.ok && certificateStatus.managed_tls, 'certificate status managed TLS');
assert(certificateStatus.profile == 'direct_https', 'certificate status profile');
assert(certificateStatus.certificate_state == 'valid' && certificateStatus.key_state == 'valid', 'certificate material state');
assert(certificateStatus.key_match == '1' && certificateStatus.hostname_match == '1', 'certificate relationship state');
assert(certificateStatus.expiry_state == 'ok' && certificateStatus.acme_managed, 'certificate expiry and ACME state');
assert(certificateStatus.certificate == '/etc/ssl/acme/web.example.com.fullchain.crt', 'certificate path');
assert(certificateStatus.certificate_key == '/etc/ssl/acme/web.example.com.key', 'certificate key path');
assert(global.certificate_command == "/usr/libexec/nginx-telego-cert 'status' 2>&1", 'certificate status uses dedicated helper');

const certificatePreflight = nginx.certificate_preflight.call();
assert(certificatePreflight.ok && index(certificatePreflight.message, 'nginx -t succeeded') >= 0, 'certificate preflight RPC');
assert(global.certificate_command == "/usr/libexec/nginx-telego-cert 'preflight' 2>&1", 'certificate preflight uses dedicated helper');

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
assert(global.editor_command == "/usr/libexec/nginx-telego-editor 'inspect' '50-custom.conf'", 'foreign inspection uses OpenWrt-compatible quoted helper invocation');

const revisionOnly = nginx.foreign_revision.call({ args: { name: '50-custom.conf' } });
assert(revisionOnly.ok && revisionOnly.revision == global.fixture.editor_revision, 'foreign revision read succeeds without content');
assert(global.editor_command == "/usr/libexec/nginx-telego-editor 'revision' '50-custom.conf'", 'foreign revision uses dedicated quoted helper invocation');

const replaced = nginx.replace_active.call({ args: { name: '50-custom.conf', revision: global.fixture.editor_revision, content: '# edited\nserver {}\n' } });
assert(replaced.ok && replaced.changed, 'restricted editor write succeeds');
assert(global.editor_written == '# edited\nserver {}\n', 'editor content is streamed through stdin');
assert(global.editor_command == "/usr/libexec/nginx-telego-editor 'replace' '50-custom.conf' '" + global.fixture.editor_revision + "'", 'editor write uses OpenWrt-compatible quoted helper invocation');

const created = nginx.create_foreign.call({ args: { name: '55-created.conf', content: '# created\n' } });
assert(created.ok && created.created, 'foreign create succeeds');
assert(global.editor_written == '# created\n', 'create content is streamed through stdin');
assert(global.editor_command == "/usr/libexec/nginx-telego-editor 'create' '55-created.conf'", 'create uses quoted helper invocation');

const renamed = nginx.rename_active.call({ args: { name: '50-custom.conf', new_name: '56-renamed.conf', revision: global.fixture.editor_revision } });
assert(renamed.ok && renamed.renamed, 'foreign rename succeeds');
assert(global.editor_command == "/usr/libexec/nginx-telego-editor 'rename' '50-custom.conf' '56-renamed.conf' '" + global.fixture.editor_revision + "'", 'rename uses quoted helper invocation');

nginx.replace_active.call({ args: { name: '50-custom+safe.conf', revision: global.fixture.editor_revision, content: 'safe\n' } });
assert(index(global.editor_command, " '50-custom+safe.conf' ") >= 0, 'valid editor filename is shell-quoted literally');
const invalidName = nginx.replace_active.call({ args: { name: "a'b$(id).conf", revision: global.fixture.editor_revision, content: 'safe\n' } });
assert(!invalidName.ok && invalidName.error == 'invalid-name', 'unsafe editor filename rejected before process launch');
const invalidRevisionName = nginx.foreign_revision.call({ args: { name: '../bad.conf' } });
assert(!invalidRevisionName.ok && invalidRevisionName.error == 'invalid-name', 'unsafe revision filename rejected before process launch');
const invalidCreate = nginx.create_foreign.call({ args: { name: '../bad.conf', content: 'x\n' } });
assert(!invalidCreate.ok && invalidCreate.error == 'invalid-name', 'unsafe create filename rejected before process launch');
const invalidRename = nginx.rename_active.call({ args: { name: '50-custom.conf', new_name: '50-custom.conf', revision: global.fixture.editor_revision } });
assert(!invalidRename.ok && invalidRename.error == 'invalid-name', 'rename requires a distinct safe target');

global.fixture.mode = 'editor-stale';
const stale = nginx.replace_active.call({ args: { name: '50-custom.conf', revision: global.fixture.editor_revision, content: 'x\n' } });
assert(!stale.ok && stale.error == 'stale-content', 'stale editor revision explicit');
const staleRename = nginx.rename_active.call({ args: { name: '50-custom.conf', new_name: '57-stale.conf', revision: global.fixture.editor_revision } });
assert(!staleRename.ok && staleRename.error == 'stale-content', 'stale rename revision explicit');

global.fixture.mode = 'editor-too-large';
const tooLarge = nginx.replace_active.call({ args: { name: '50-custom.conf', revision: global.fixture.editor_revision, content: 'x\n' } });
assert(!tooLarge.ok && tooLarge.error == 'content-too-large', 'backend size rejection explicit');

global.fixture.mode = 'editor-target-exists';
const targetExists = nginx.create_foreign.call({ args: { name: '55-created.conf', content: 'x\n' } });
assert(!targetExists.ok && targetExists.error == 'target-exists', 'existing create target explicit');

global.fixture.mode = 'editor-managed-target';
const managedTarget = nginx.rename_active.call({ args: { name: '50-custom.conf', new_name: '20-telego-core.conf', revision: global.fixture.editor_revision } });
assert(!managedTarget.ok && managedTarget.error == 'managed-target', 'managed rename target explicit');

global.fixture.mode = 'ok';
assert(nginx.quarantine.call({ args: { name: '50-custom.conf' } }).ok, 'quarantine RPC');
assert(nginx.restore.call({ args: { name: '50-custom.conf' } }).ok, 'restore RPC');
assert(nginx.delete_active.call({ args: { name: '50-custom.conf' } }).ok, 'active delete RPC');
assert(nginx.delete_quarantined.call({ args: { name: '50-custom.conf' } }).ok, 'quarantine delete RPC');
assert(nginx.repair.call().ok, 'repair RPC');

global.fixture.mode = 'firewall-failed';
const firewallFailed = nginx.firewall_preflight.call();
assert(!firewallFailed.ok && index(firewallFailed.error, 'preflight rejected') >= 0, 'firewall preflight failure explicit');

global.fixture.mode = 'certificate-failed';
const certificateFailed = nginx.certificate_preflight.call();
assert(!certificateFailed.ok && index(certificateFailed.error, 'preflight rejected') >= 0, 'certificate preflight failure explicit');

global.fixture.mode = 'failed';
const failed = nginx.quarantine.call({ args: { name: '50-custom.conf' } });
assert(!failed.ok && index(failed.error, 'rejected') >= 0, 'admin helper failures explicit');
global.fixture.mode = 'popen-failed';
const firewallUnavailable = nginx.firewall_status.call();
assert(!firewallUnavailable.ok && firewallUnavailable.error == 'firewall-helper-unavailable', 'missing firewall helper explicit');
const certificateUnavailable = nginx.certificate_status.call();
assert(!certificateUnavailable.ok && certificateUnavailable.error == 'certificate-helper-unavailable', 'missing certificate helper explicit');
const unavailable = nginx.inventory.call();
assert(!unavailable.ok && unavailable.error == 'admin-helper-unavailable', 'missing admin helper explicit');
const editorUnavailable = nginx.foreign_content.call({ args: { name: '50-custom.conf' } });
assert(!editorUnavailable.ok && editorUnavailable.error == 'editor-helper-unavailable', 'missing editor helper explicit');
const revisionUnavailable = nginx.foreign_revision.call({ args: { name: '50-custom.conf' } });
assert(!revisionUnavailable.ok && revisionUnavailable.error == 'editor-helper-unavailable', 'missing revision helper explicit');
const createUnavailable = nginx.create_foreign.call({ args: { name: '55-created.conf', content: 'x\n' } });
assert(!createUnavailable.ok && createUnavailable.error == 'editor-helper-unavailable', 'missing create helper explicit');

print('rpcd Nginx P12 ACME ingress and foreign lifecycle tests passed\n');
