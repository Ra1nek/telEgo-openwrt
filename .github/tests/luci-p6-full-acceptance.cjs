const assert = require('node:assert/strict');
const fs = require('node:fs');

function read(path) {
	return fs.readFileSync(path, 'utf8');
}

const shell = read('package/luci-app-telego/htdocs/resources/view/telego/app-shell.js');
const foundation = read('package/luci-app-telego/htdocs/resources/view/telego/ui-foundation.js');
const config = read('package/luci-app-telego/htdocs/resources/view/telego/config.js');
const ingress = read('package/luci-app-telego/htdocs/resources/view/telego/ingress.js');
const wizard = read('package/luci-app-telego/htdocs/resources/view/telego/ingress-wizard.js');
const advanced = read('package/luci-app-telego/htdocs/resources/view/telego/advanced.js');
const nginxFiles = read('package/luci-app-telego/htdocs/resources/view/telego/nginx-files.js');
const css = read('package/luci-app-telego/htdocs/css/telego.css');
const menu = JSON.parse(read('package/luci-app-telego/root/usr/share/luci/menu.d/telego.menu.json'));
const acl = JSON.parse(read('package/luci-app-telego/root/usr/share/rpcd/acl.d/luci-app-telego.json'));
const uiBackend = read('package/luci-app-telego/root/usr/share/rpcd/ucode/telego-ui');
const nginxBackend = read('package/luci-app-telego/root/usr/share/rpcd/ucode/telego-nginx');
const renderer = read('package/nginx-telego/files/usr/libexec/nginx-telego-render');
const routerVerifier = read('scripts/verify-p6-router.sh');

// Every user-facing P6 route must use the same application shell. This catches
// regressions where a page works on desktop but loses navigation/status/mobile
// containment because it bypasses app-shell.
for (const [name, source] of Object.entries({ config, ingress, advanced, nginxFiles })) {
	assert.match(source, /'require view\.telego\.app-shell as appShell';/, `${name} must load app-shell`);
	assert.match(source, /appShell\.wrap\(/, `${name} must render inside app-shell`);
}

// Top-level navigation is mixed page navigation + in-page switching, not an
// ARIA tab widget. Native button/link semantics remain keyboard-operable.
assert.doesNotMatch(shell, /'role': 'tablist'/);
assert.doesNotMatch(shell, /'role': 'tab'/);
assert.match(shell, /'aria-controls'/);
assert.match(shell, /'aria-pressed'/);
assert.match(shell, /'aria-current'/);
assert.match(shell, /E\('nav',[\s\S]*'aria-label': 'telEgo'/);

// P6.5 must remain a valid LuCI module constructor. This is the regression gate
// for the real "factory yields invalid constructor" failure found on-router.
assert.match(wizard, /'require baseclass';/);
assert.match(wizard, /return baseclass\.extend\(\{/);
assert.match(ingress, /'require view\.telego\.ingress-wizard as ingressWizard';/);

// P6.5 -> P6.7 guided path must be present in one screen and stage current form
// values before read-only validation.
for (const marker of [
	'_wizard_prepare',
	'_wizard_nginx_validate',
	'_wizard_apply_preflight',
	'callCandidateNginxValidate',
	'callApplyPreflight',
	'stageWizardCandidate'
])
	assert.ok(ingress.includes(marker), `missing ingress acceptance marker: ${marker}`);
assert.match(ingress, /typeof window !== 'undefined'/, 'Node/test and non-browser evaluation must not dereference window blindly');

// P6.6/P6.7 are read-only UBUS capabilities. They must never drift into the
// write ACL while the actual Nginx editor/lifecycle mutations stay separate.
const nginxRead = acl['luci-app-telego'].read.ubus['telego.nginx'];
const nginxWrite = acl['luci-app-telego'].write.ubus['telego.nginx'];
for (const method of ['apply_preflight', 'candidate_nginx_validate']) {
	assert.ok(nginxRead.includes(method), `${method} must be readable`);
	assert.ok(!nginxWrite.includes(method), `${method} must not require write ACL`);
}
assert.match(uiBackend, /candidateIngressPreflight: true/);
assert.match(uiBackend, /candidateNginxValidation: true/);
assert.match(nginxBackend, /candidate_nginx_validate/);
assert.match(nginxBackend, /apply_preflight/);

// Candidate Nginx validation must target a temporary tree, not mutate/reload
// the active one. The shell integration test exercises behavior; these markers
// protect the architectural boundary from accidental simplification.
assert.match(renderer, /MODE=validate/);
assert.match(renderer, /candidate_root="\$work\/nginx-root"/);
assert.match(renderer, /"\$NGINX_BIN" -t -p "\$candidate_root\/" -c "\$candidate_main"/);
assert.doesNotMatch(
	renderer.match(/candidate_nginx_test\(\)[\s\S]*?\n\}/)?.[0] || '',
	/NGINX_INIT|reload_nginx/,
	'candidate validation function must not reload Nginx'
);

// Mobile acceptance: app shell collapses 2 -> 1 columns, standard telEgo CBI
// buttons have >=44px touch targets, form/error text can wrap, and controls are
// bounded to their container instead of forcing page-level horizontal scroll.
assert.match(css, /\.telego-app \.cbi-button,[\s\S]*\.telego-app \.btn[\s\S]*min-height:\s*44px/);
assert.match(css, /@media screen and \(max-width: 640px\)[\s\S]*\.telego-app-tabs[\s\S]*grid-template-columns:\s*repeat\(2,/);
assert.match(css, /@media screen and \(max-width: 420px\)[\s\S]*\.telego-app-tabs[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/);
assert.match(css, /\.telego-app-content \.cbi-value-description,[\s\S]*overflow-wrap:\s*anywhere/);
assert.match(css, /\.telego-app input,[\s\S]*max-width:\s*100%/);
assert.match(css, /\.telego-responsive-table\s*\{[\s\S]*overflow-x:\s*auto/);

// Accessibility acceptance: visible keyboard focus, reduced motion and Windows
// forced-colors/high-contrast fallbacks remain explicit contracts.
assert.match(css, /\.telego-app a:focus-visible,[\s\S]*outline:\s*2px solid/);
assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
assert.match(css, /@media \(forced-colors: active\)/);
assert.match(config, /'aria-live': 'polite'/);
assert.match(advanced, /'aria-live': 'polite'/);
assert.match(nginxFiles, /'role': 'region'/);
assert.match(nginxFiles, /'tabindex': '0'/);
assert.match(nginxFiles, /'scope': 'col'/);

// Menu acceptance: all four product-level destinations stay under the single
// telEgo app entry; hidden supporting routes must not become duplicate menu
// entries while still being reachable from the shell.
assert.equal(menu['admin/services/telego'].action.preferred, 'configuration');
assert.equal(menu['admin/services/telego/configuration'].title, 'Overview');
for (const route of ['ingress', 'advanced', 'nginx-files']) {
	const item = menu['admin/services/telego/' + route];
	assert.ok(item, `missing route: ${route}`);
	assert.equal(item.title, undefined, `${route} must remain shell-owned rather than a duplicate LuCI menu label`);
}

// The real-router verifier is intentionally read-only and covers runtime
// capabilities plus checksum/fingerprint invariance around P6.7 validation.
assert.match(routerVerifier, /Read-only verifier/);
assert.match(routerVerifier, /ubus call telego\.nginx candidate_nginx_validate/);
assert.match(routerVerifier, /ubus call telego\.nginx apply_preflight/);
assert.match(routerVerifier, /before_ingress=.*fingerprint/);
assert.match(routerVerifier, /after_ingress=.*fingerprint/);
assert.doesNotMatch(routerVerifier, /uci commit|\/etc\/init\.d\/[^\s]+ (reload|restart|stop|start)/);

assert.match(foundation, /document\.hidden/);
assert.match(foundation, /resetPolls/);

console.log('P6.8 full router/mobile/accessibility acceptance contracts passed');
